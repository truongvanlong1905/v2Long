import { prisma } from '@toantrung/database';
import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { buildStandardXlsxBuffer } from '../../../../../core/export/xlsx-builder';
import { shouldAnonymizeLeadForRole } from '../../../../../modules/01-leads/service';
import { CONTACT_CHANNEL_LABELS, PIPELINE_STATUS_LABELS } from '@toantrung/contracts';

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const isAnonymized = shouldAnonymizeLeadForRole(auth.user.roleCode);

    const leads = await prisma.lead.findMany({
      where:
        auth.user.roleCode === 'SALES'
          ? { assignedSalesId: auth.user.id }
          : undefined,
      include: {
        assignedSales: true,
        tracking: true,
        leadProducts: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    const dateStamp = new Date().toISOString().slice(0, 10);

    const buffer = buildStandardXlsxBuffer([
      {
        name: 'DanhSachLead',
        title: `DANH SÁCH LEAD TOÀN TRUNG — ${auth.user.fullName} (${auth.user.roleName})`,
        metadata: [
          { label: 'Thời gian xuất file', value: new Date().toLocaleString('vi-VN') },
          { label: 'Tổng số bản ghi', value: String(leads.length) },
          { label: 'Quyền xem', value: isAnonymized ? 'Ẩn danh PII' : 'Xem đầy đủ' },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Lead', key: 'leadCode', width: 15, type: 'string' },
          { header: 'Khách hàng / Công ty', key: 'customerName', width: 30, type: 'string' },
          { header: 'Số điện thoại', key: 'phone', width: 16, type: 'string' },
          { header: 'Kênh liên hệ', key: 'channel', width: 16, type: 'string' },
          { header: 'Nguồn Marketing', key: 'source', width: 18, type: 'string' },
          { header: 'Sản phẩm LED', key: 'products', width: 28, type: 'string' },
          { header: 'Sales phụ trách', key: 'salesName', width: 22, type: 'string' },
          { header: 'Trạng thái', key: 'status', width: 20, type: 'string' },
          { header: 'Ngày tạo', key: 'createdAt', width: 20, type: 'string' },
        ],
        rows: leads.map((l, idx) => ({
          stt: idx + 1,
          leadCode: l.leadCode,
          customerName: isAnonymized ? 'Khách hàng ẩn danh' : l.companyName || l.contactName || 'Chưa cập nhật',
          phone: isAnonymized ? '***' : l.phone,
          channel: (CONTACT_CHANNEL_LABELS as Record<string, string>)[l.contactChannel] || l.contactChannel,
          source: l.tracking?.marketingSource || l.selfReportedSource || 'Trực tiếp',
          products: l.leadProducts.map((p) => p.product.productName).join(', ') || 'Chưa chọn',
          salesName: l.assignedSales?.fullName || 'Chưa phân bổ',
          status: l.isSpam ? 'Spam' : (PIPELINE_STATUS_LABELS as Record<string, string>)[l.pipelineStatus] || l.pipelineStatus,
          createdAt: l.createdAt.toISOString().slice(0, 16).replace('T', ' '),
        })),
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'LEADS_EXPORTED',
        targetType: 'LeadExport',
        targetId: `xlsx_${leads.length}`,
        detailsJson: JSON.stringify({ count: leads.length }),
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
      400
    );
  }
}
