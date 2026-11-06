import { prisma } from '@toantrung/database';
import { hasBaPermission } from '@toantrung/contracts';
import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { buildStandardXlsxBuffer } from '../../../../../core/export/xlsx-builder';

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  if (
    !hasBaPermission(auth.user.roleCode, 'AI_MARKETING_SEO') &&
    !hasBaPermission(auth.user.roleCode, 'TRACKING_ADS_OPTIMIZE')
  ) {
    return jsonError(
      'FORBIDDEN',
      'Bạn không có quyền xuất dữ liệu Từ khóa SEO & Chiến dịch Quảng cáo.',
      403,
    );
  }

  try {
    const [keywords, campaigns, dailyMetrics] = await Promise.all([
      prisma.seoKeyword.findMany({
        orderBy: { cachedSearchVolume: 'desc' },
      }),
      prisma.campaign.findMany({
        orderBy: { id: 'asc' },
      }),
      prisma.platformDailyMetric.findMany({
        where: {
          platform: { in: ['google_ads', 'facebook', 'facebook_ads', 'search_console'] },
        },
      }),
    ]);

    const dateStamp = new Date().toISOString().slice(0, 10);

    const buffer = buildStandardXlsxBuffer([
      {
        name: 'TuKhoaSEO',
        title: `DANH SÁCH TỪ KHÓA SEO & ADS — TOÀN TRUNG`,
        metadata: [
          { label: 'Thời gian xuất file', value: new Date().toLocaleString('vi-VN') },
          { label: 'Tổng số từ khóa', value: String(keywords.length) },
          { label: 'Người xuất', value: `${auth.user.fullName} (${auth.user.roleName})` },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Từ khóa', key: 'keyword', width: 32, type: 'string' },
          { header: 'Lượt tìm kiếm/tháng', key: 'volume', width: 22, type: 'number' },
          { header: 'Thứ hạng TB (GSC)', key: 'position', width: 20, type: 'number' },
          { header: 'Click tự nhiên', key: 'organicClicks', width: 18, type: 'number' },
          { header: 'Click quảng cáo', key: 'adsClicks', width: 18, type: 'number' },
          { header: 'Xu hướng', key: 'trend', width: 16, type: 'string' },
          { header: 'Thời điểm xuất bản', key: 'publishWindow', width: 24, type: 'string' },
        ],
        rows: keywords.map((k, idx) => ({
          stt: idx + 1,
          keyword: k.keyword,
          volume: k.cachedSearchVolume || 0,
          position: k.cachedAvgPosition ? Number(k.cachedAvgPosition.toFixed(1)) : 0,
          organicClicks: k.cachedOrganicClicks || 0,
          adsClicks: k.cachedAdsClicks || 0,
          trend: k.trendDirection === 'rising' ? 'Tăng trưởng' : k.trendDirection === 'declining' ? 'Giảm' : 'Ổn định',
          publishWindow: k.recommendedPublishWindow || 'Quanh năm',
        })),
      },
      {
        name: 'ChienDichAds',
        title: `CHIẾN DỊCH QUẢNG CÁO TOÀN TRUNG`,
        metadata: [
          { label: 'Thời gian xuất file', value: new Date().toLocaleString('vi-VN') },
          { label: 'Tổng số chiến dịch', value: String(campaigns.length) },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã chiến dịch', key: 'code', width: 20, type: 'string' },
          { header: 'Tên chiến dịch', key: 'name', width: 36, type: 'string' },
          { header: 'Nền tảng', key: 'platform', width: 18, type: 'string' },
          { header: 'Trạng thái', key: 'status', width: 16, type: 'string' },
          { header: 'Lượt hiển thị', key: 'impressions', width: 16, type: 'number' },
          { header: 'Lượt nhấp', key: 'clicks', width: 14, type: 'number' },
          { header: 'Chi phí (VND)', key: 'spend', width: 20, type: 'currency' },
          { header: 'Lượt chuyển đổi', key: 'conversions', width: 18, type: 'number' },
        ],
        rows: campaigns.map((c, idx) => {
          const campMetrics = dailyMetrics.filter(
            (m) =>
              m.grain === 'campaign' &&
              (m.campaignId === c.id || m.campaignExternalId === c.campaignCode),
          );
          const impressions = campMetrics.reduce((s, m) => s + m.impressions, 0);
          const clicks = campMetrics.reduce((s, m) => s + m.clicks, 0);
          const spendVnd = Number(campMetrics.reduce((s, m) => s + m.spendMicros, 0n) / 1_000_000n);
          const conversions = campMetrics.reduce((s, m) => s + Number(m.conversionsMicros / 1_000_000n), 0);

          return {
            stt: idx + 1,
            code: c.campaignCode,
            name: c.campaignName,
            platform: c.platform === 'google_ads' ? 'Google Ads' : c.platform === 'facebook' ? 'Facebook' : c.platform,
            status: c.isActive ? 'Đang chạy' : 'Tạm dừng',
            impressions,
            clicks,
            spend: spendVnd,
            conversions,
          };
        }),
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'ADS_DATA_EXPORTED',
        targetType: 'AdsExport',
        targetId: `xlsx_${keywords.length}_${campaigns.length}`,
        detailsJson: JSON.stringify({ keywords: keywords.length, campaigns: campaigns.length }),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="TuKhoa_ChienDich_ToanTrung_${dateStamp}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'ADS_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xuất báo cáo Từ khóa & Ads.',
      400
    );
  }
}
