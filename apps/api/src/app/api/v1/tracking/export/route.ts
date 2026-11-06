import { prisma } from '@toantrung/database';
import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { buildStandardXlsxBuffer } from '../../../../../core/export/xlsx-builder';
import { getTrackingDashboardData } from '../../../../../modules/02-tracking-sync/service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const periodDays = Number(url.searchParams.get('periodDays') || 30);
    const safePeriod = Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 30;
    const dateStamp = new Date().toISOString().slice(0, 10);

    const data = await getTrackingDashboardData(safePeriod);

    const totalL1 = data.totals.rawLeadsL1;
    const totalL2 = data.totals.validLeadsL2;
    const totalL3 = data.totals.effectiveLeadsL3;
    const validRate = totalL1 > 0 ? Number((totalL2 / totalL1).toFixed(4)) : 0;

    const buffer = buildStandardXlsxBuffer([
      {
        name: '01_PhanBo_NguonTracking',
        title: `BÁO CÁO TRACKING ĐA KÊNH & PHỄU CHẤT LƯỢNG LEAD (L1/L2/L3) — ${safePeriod} NGÀY`,
        metadata: [
          { label: 'Đơn vị', value: 'CÔNG TY TNHH ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG' },
          { label: 'Kỳ dữ liệu', value: `${safePeriod} ngày gần nhất` },
          { label: 'Người kết xuất', value: `${auth.user.fullName} (${auth.user.roleName})` },
          { label: 'Thời gian kết xuất', value: new Date().toLocaleString('vi-VN') },
          { label: 'Múi giờ chuẩn', value: 'Asia/Ho_Chi_Minh (GMT+7)' },
        ],
        kpiSummary: [
          { label: 'Tổng Lead thu nhận (L1)', value: totalL1 },
          { label: 'Lead hợp lệ (L2)', value: totalL2 },
          { label: 'Lead hiệu quả tính CPL (L3)', value: totalL3 },
          { label: 'Tỷ lệ Lead hợp lệ', value: `${(validRate * 100).toFixed(1)}%` },
          { label: 'Lead quay lại', value: data.totals.repeatLeads },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Nguồn / Kênh Marketing', key: 'source', width: 28, type: 'string' },
          { header: 'Tổng Lead Thu Nhận (L1)', key: 'l1Count', width: 22, type: 'number' },
          { header: 'Lead Hợp Lệ (L2)', key: 'l2Count', width: 20, type: 'number' },
          { header: 'Lead Hiệu Quả Ads (L3)', key: 'l3Count', width: 22, type: 'number' },
          { header: 'Lead Quay Lại', key: 'repeatCount', width: 16, type: 'number' },
          { header: 'Đã Gửi Báo Giá', key: 'quoteSentCount', width: 18, type: 'number' },
          { header: 'Thành Công (Won)', key: 'wonCount', width: 18, type: 'number' },
          { header: 'Tỷ Lệ Hợp Lệ (L2/L1)', key: 'validRatio', width: 20, type: 'percent' },
        ],
        rows: data.bySource.map((s, idx) => ({
          stt: idx + 1,
          source: s.dimensionLabel,
          l1Count: s.rawLeadsL1,
          l2Count: s.validLeadsL2,
          l3Count: s.effectiveLeadsL3,
          repeatCount: s.repeatLeads,
          quoteSentCount: s.quoteSentCount,
          wonCount: s.wonCount,
          validRatio: s.rawLeadsL1 > 0 ? Number((s.validLeadsL2 / s.rawLeadsL1).toFixed(4)) : 0,
        })),
        summaryRow: {
          stt: '',
          source: 'TỔNG CỘNG TOÀN HỆ THỐNG',
          l1Count: totalL1,
          l2Count: totalL2,
          l3Count: totalL3,
          repeatCount: data.totals.repeatLeads,
          quoteSentCount: data.bySource.reduce((acc, s) => acc + s.quoteSentCount, 0),
          wonCount: data.bySource.reduce((acc, s) => acc + s.wonCount, 0),
          validRatio: validRate,
        },
        footerNotes: [
          'Định nghĩa BA (UC02 & UC03): L1 = Tổng Lead thu nhận; L2 = Lead hợp lệ (!isSpam); L3 = Lead hiệu quả truyền về Ads & tính CPL (trừ Spam tự động & Spam đã xác nhận).',
        ],
      },
      {
        name: '02_LichSu_DongBo_Worker',
        title: 'NHẬT KÝ ĐỒNG BỘ DỮ LIỆU ĐA NỀN TẢNG & TÁC VỤ WORKER',
        metadata: [
          { label: 'Tổng số phiên chạy gần nhất', value: String(data.syncLogs.length) },
          { label: 'Thời gian kết xuất', value: new Date().toLocaleString('vi-VN') },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Phiên (#ID)', key: 'execId', width: 16, type: 'string' },
          { header: 'Khung Lịch (Slot)', key: 'scheduleSlot', width: 20, type: 'string' },
          { header: 'Nền Tảng', key: 'platform', width: 20, type: 'string' },
          { header: 'Tài Khoản / Property', key: 'accountPropertyId', width: 24, type: 'string' },
          { header: 'Số Ngày Quét Lùi', key: 'windowDays', width: 18, type: 'number' },
          { header: 'Số Bản Ghi Xử Lý', key: 'recordsUpserted', width: 18, type: 'number' },
          { header: 'Trạng Thái', key: 'status', width: 18, type: 'string' },
          { header: 'Thời Gian Bắt Đầu', key: 'startedAt', width: 20, type: 'string' },
          { header: 'Chi Tiết / Lỗi', key: 'errorMessage', width: 38, type: 'string' },
        ],
        rows: data.syncLogs.map((w, idx) => ({
          stt: idx + 1,
          execId: `EXEC-${w.id}`,
          scheduleSlot: w.scheduleSlot,
          platform: w.platform,
          accountPropertyId: w.accountPropertyId,
          windowDays: w.windowDays,
          recordsUpserted: w.recordsUpserted,
          status: w.status === 'SUCCESS' ? 'Thành công' : 'Thất bại',
          startedAt: w.startedAt.slice(0, 19).replace('T', ' '),
          errorMessage: w.errorMessage || 'Đồng bộ ổn định, khớp chữ ký dimensionFingerprint',
        })),
      },
      {
        name: '03_DoiSoat_ChenhLech',
        title: 'DANH SÁCH CẢNH BÁO ĐỐI SOÁT CHÊNH LỆCH LEAD QUẢNG CÁO VÀ CRM',
        metadata: [
          { label: 'Tổng số bản ghi đối soát', value: String(data.reconciliations.length) },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Ngày Đối Soát', key: 'reconcileDate', width: 16, type: 'string' },
          { header: 'Nền Tảng', key: 'platform', width: 18, type: 'string' },
          { header: 'Chuyển Đổi Nền Tảng Báo Cáo', key: 'platformReportedCount', width: 26, type: 'number' },
          { header: 'Lead CRM Thực Nhận', key: 'crmLeadCount', width: 22, type: 'number' },
          { header: 'Chênh Lệch', key: 'discrepancyCount', width: 16, type: 'number' },
          { header: 'Trạng Thái Xử Lý', key: 'status', width: 20, type: 'string' },
          { header: 'Ghi Chú Đối Soát', key: 'resolutionNote', width: 38, type: 'string' },
        ],
        rows: data.reconciliations.map((a, idx) => ({
          stt: idx + 1,
          reconcileDate: a.reconcileDate,
          platform: a.platform,
          platformReportedCount: a.platformReportedCount,
          crmLeadCount: a.crmLeadCount,
          discrepancyCount: a.discrepancyCount,
          status: a.status === 'RESOLVED' ? 'Đã xử lý' : a.status === 'MATCHED' ? 'Khớp 100%' : 'Cảnh báo lệch',
          resolutionNote: a.resolutionNote || 'Đang theo dõi hàng đợi Webhook Retry',
        })),
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'TRACKING_DATA_EXPORTED',
        targetType: 'TrackingExport',
        targetId: `xlsx_${safePeriod}d`,
        detailsJson: JSON.stringify({ periodDays: safePeriod, totalL1, totalL2, totalL3 }),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="02_Tracking_DongBo_${dateStamp}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'TRACKING_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xuất báo cáo Tracking & Đồng bộ.',
      400
    );
  }
}
