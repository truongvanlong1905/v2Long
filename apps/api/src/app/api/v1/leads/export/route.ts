import { prisma } from '@toantrung/database';
import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { buildStandardXlsxBuffer } from '../../../../../core/export/xlsx-builder';
import {
  exportAllLeadsForUser,
  shouldAnonymizeLeadForRole,
} from '../../../../../modules/01-leads/service';
import {
  CONTACT_CHANNEL_LABELS,
  PIPELINE_STATUS_LABELS,
  type PipelineStatus,
} from '@toantrung/contracts';

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status') || undefined;
    const searchParam = url.searchParams.get('search') || undefined;
    const includeSpam = url.searchParams.get('includeSpam') === 'true';
    const overdueOnly = url.searchParams.get('overdueOnly') === 'true';
    const unreceivedOnly =
      url.searchParams.get('unreceived') === '1' ||
      url.searchParams.get('unreceivedOnly') === 'true';

    const isAnonymized = shouldAnonymizeLeadForRole(auth.user.roleCode);

    const { leads } = await exportAllLeadsForUser(auth.user, {
      status: statusParam as PipelineStatus | 'all' | undefined,
      search: searchParam,
      includeSpam,
      overdueOnly,
      unreceivedOnly,
    });

    const dateStamp = new Date().toISOString().slice(0, 10);

    const workingCount = leads.filter(
      (l) => l.pipelineStatus === 'new_lead' || l.pipelineStatus === 'quoting',
    ).length;
    const quoteSentCount = leads.filter((l) => l.pipelineStatus === 'quote_sent').length;
    const wonCount = leads.filter((l) => l.pipelineStatus === 'won').length;
    const lostCount = leads.filter((l) => l.pipelineStatus === 'lost').length;

    const buffer = buildStandardXlsxBuffer([
      {
        name: '01_Lead_Pipeline',
        title: `DANH SÁCH LEAD & PIPELINE TOÀN TRUNG — ${auth.user.fullName} (${auth.user.roleName})`,
        metadata: [
          { label: 'Thời gian xuất file', value: new Date().toLocaleString('vi-VN') },
          { label: 'Tổng số bản ghi', value: String(leads.length) },
          { label: 'Quyền xem', value: isAnonymized ? 'Ẩn danh PII (UC01 / Q03)' : 'Xem theo phạm vi phân quyền' },
        ],
        kpiSummary: [
          { label: 'Tổng Lead (L1/L2)', value: leads.length },
          { label: 'Đang làm việc', value: workingCount },
          { label: 'Đã gửi báo giá', value: quoteSentCount },
          { label: 'Thành công (Won)', value: wonCount },
          { label: 'Thất bại / Dừng', value: lostCount },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Lead', key: 'leadCode', width: 15, type: 'string' },
          { header: 'Tên Khách Hàng / Công Ty', key: 'customerName', width: 30, type: 'string' },
          { header: 'Nguồn', key: 'source', width: 18, type: 'string' },
          { header: 'Người Liên Hệ & SĐT', key: 'contactAndPhone', width: 26, type: 'string' },
          { header: 'Ngày', key: 'createdAt', width: 18, type: 'string' },
          { header: 'Khu Vực', key: 'region', width: 22, type: 'string' },
          { header: 'Sản Phẩm', key: 'products', width: 28, type: 'string' },
          { header: 'Tag Phân Loại (Indoor/Outdoor/BĐT)', key: 'productTags', width: 24, type: 'string' },
          { header: 'Trạng Thái', key: 'status', width: 20, type: 'string' },
          { header: 'Ghi chú / Nguyên nhân', key: 'noteOrReason', width: 32, type: 'string' },
          { header: 'Sales Phụ Trách', key: 'salesName', width: 22, type: 'string' },
        ],
        rows: leads.map((l, idx) => {
          const tags = Array.from(
            new Set(
              l.products.map((p) => {
                const lower = p.productName.toLowerCase();
                if (p.category === 'BANG_DIEN_TU') return 'BĐT';
                if (lower.includes('outdoor') || lower.includes('ngoài trời')) return 'Outdoor';
                return 'Indoor';
              }),
            ),
          ).join(', ');

          return {
            stt: idx + 1,
            leadCode: l.leadCode,
            customerName: isAnonymized
              ? 'Khách hàng ẩn danh (UC01)'
              : l.companyName || l.contactName || 'Chưa cập nhật',
            source:
              l.tracking?.marketingSource ||
              l.selfReportedSource ||
              (CONTACT_CHANNEL_LABELS as Record<string, string>)[l.contactChannel] ||
              l.contactChannel,
            contactAndPhone: isAnonymized
              ? l.phone
              : `${l.contactName || 'Khách hàng'} - ${l.phone}`,
            createdAt: l.createdAt.slice(0, 16).replace('T', ' '),
            region:
              l.areaType === 'hcm'
                ? `TP.HCM - ${l.hcmDistrict || ''}`
                : l.province || 'Chưa chọn tỉnh',
            products: l.products.map((p) => p.productName).join(', ') || 'Chưa chọn',
            productTags: tags || 'Indoor',
            status:
              l.spamStatus !== 'NONE'
                ? `Spam (${l.spamReason || ''})`
                : (PIPELINE_STATUS_LABELS as Record<string, string>)[l.pipelineStatus] ||
                  l.pipelineStatus,
            noteOrReason:
              l.lostReason ||
              l.reopenReason ||
              l.spamReason ||
              l.customProductNote ||
              l.initialNote ||
              '—',
            salesName: l.assignedSalesName || 'Chưa phân bổ',
          };
        }),
        summaryRow: {
          stt: '',
          leadCode: 'TỔNG CỘNG',
          customerName: `${leads.length} hồ sơ Lead`,
          source: '—',
          contactAndPhone: isAnonymized ? 'Đã ẩn danh PII' : 'Đầy đủ theo phân quyền',
          createdAt: dateStamp,
          region: 'Toàn quốc',
          products: `Đang xử lý: ${workingCount} | Đã báo giá: ${quoteSentCount}`,
          productTags: '—',
          status: `Won: ${wonCount} | Lost: ${lostCount}`,
          noteOrReason: `Win rate: ${leads.length > 0 ? ((wonCount / leads.length) * 100).toFixed(1) : '0.0'}%`,
          salesName: '—',
        },
        footerNotes: [
          'Ghi chú phân quyền: Vai trò Marketing/Content/Designer tự động nhận bản xuất ẩn danh SĐT và thông tin cá nhân khách hàng (UC01/Q03).',
          'Định nghĩa tỷ lệ chốt: Win rate tính từ Tổng số Lead chốt thành công (Won) chia cho Tổng số Lead hợp lệ trong phạm vi lọc.',
        ],
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'LEADS_EXPORTED',
        targetType: 'LeadExport',
        targetId: `xlsx_${leads.length}`,
        detailsJson: JSON.stringify({
          count: leads.length,
          status: statusParam || 'all',
          includeSpam,
          overdueOnly,
        }),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="DanhSachLead_ToanTrung_${dateStamp}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'LEAD_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xuất danh sách Lead.',
      400,
    );
  }
}
