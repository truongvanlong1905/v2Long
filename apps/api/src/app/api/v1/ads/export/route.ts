import { prisma } from '@toantrung/database';
import { hasBaPermission, isL2Valid, isL3Effective } from '@toantrung/contracts';
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
      403
    );
  }

  try {
    const keywords: any[] = await prisma.seoKeyword.findMany({
      orderBy: { cachedSearchVolume: 'desc' },
    });

    const campaigns: any[] = await prisma.campaign.findMany({
      include: {
        trackings: {
          include: { lead: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const dailyMetrics: any[] = await prisma.platformDailyMetric.findMany({
      where: {
        platform: { in: ['google_ads', 'facebook', 'facebook_ads', 'search_console'] },
      },
    });

    const articles: any[] = await prisma.seoArticle.findMany({
      include: {
        keyword: true,
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const dateStamp = new Date().toISOString().slice(0, 10);

    const campaignRows = (campaigns || []).map((c: any, idx: number) => {
      const campMetrics = (dailyMetrics || []).filter(
        (m: any) =>
          m.grain === 'campaign' &&
          (m.campaignId === c.id || m.campaignExternalId === c.campaignCode)
      );
      const impressions = campMetrics.reduce((s: number, m: any) => s + (m.impressions || 0), 0);
      const clicks = campMetrics.reduce((s: number, m: any) => s + (m.clicks || 0), 0);
      const spendVnd = Number(
        campMetrics.reduce((s: bigint, m: any) => s + BigInt(m.spendMicros || 0), 0n) / 1_000_000n
      );
      const platformConversions = campMetrics.reduce(
        (s: number, m: any) => s + Number(BigInt(m.conversionsMicros || 0) / 1_000_000n),
        0
      );
      const dailyBudgetVnd = c.dailyBudgetMicros ? Number(BigInt(c.dailyBudgetMicros) / 1_000_000n) : 0;

      const campLeads = Array.isArray(c.trackings)
        ? c.trackings.map((t: any) => t.lead).filter(Boolean)
        : [];
      const crmLeadsL2 = campLeads.filter(isL2Valid).length;
      const crmLeadsL3 = campLeads.filter(isL3Effective).length;
      const wonCount = campLeads.filter(
        (l: any) => isL3Effective(l) && l.pipelineStatus === 'won'
      ).length;

      const ctrRatio = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0;
      const cplVnd = crmLeadsL3 > 0 && spendVnd > 0 ? Math.round(spendVnd / crmLeadsL3) : 0;

      return {
        stt: idx + 1,
        code: c.campaignCode,
        name: c.campaignName,
        platform:
          c.platform === 'google_ads'
            ? 'Google Ads'
            : c.platform === 'facebook' || c.platform === 'facebook_ads'
              ? 'Facebook Ads'
              : c.platform,
        status: c.isActive ? 'Đang chạy' : 'Tạm dừng',
        dailyBudget: dailyBudgetVnd,
        impressions,
        clicks,
        ctr: ctrRatio,
        spend: spendVnd,
        platformConversions,
        crmLeadsL2,
        crmLeadsL3,
        cplEffective: cplVnd,
        wonCount,
      };
    });

    const totalImpressions = campaignRows.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = campaignRows.reduce((s, r) => s + r.clicks, 0);
    const totalSpend = campaignRows.reduce((s, r) => s + r.spend, 0);
    const totalPlatformConv = campaignRows.reduce((s, r) => s + r.platformConversions, 0);
    const totalCrmL2 = campaignRows.reduce((s, r) => s + r.crmLeadsL2, 0);
    const totalCrmL3 = campaignRows.reduce((s, r) => s + r.crmLeadsL3, 0);
    const totalWon = campaignRows.reduce((s, r) => s + r.wonCount, 0);
    const aggregateCtr =
      totalImpressions > 0 ? Number((totalClicks / totalImpressions).toFixed(4)) : 0;
    const aggregateCpl = totalCrmL3 > 0 && totalSpend > 0 ? Math.round(totalSpend / totalCrmL3) : 0;

    const buffer = buildStandardXlsxBuffer([
      {
        name: '01_ChienDich_QuangCao',
        title: `BÁO CÁO HIỆU QUẢ CHIẾN DỊCH QUẢNG CÁO & ĐỐI CHIẾU LEAD CRM — TOÀN TRUNG`,
        metadata: [
          { label: 'Đơn vị', value: 'CÔNG TY TNHH ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG' },
          { label: 'Thời gian xuất file', value: new Date().toLocaleString('vi-VN') },
          { label: 'Người xuất', value: `${auth.user.fullName} (${auth.user.roleName})` },
          { label: 'Múi giờ', value: 'Asia/Ho_Chi_Minh (GMT+7)' },
        ],
        kpiSummary: [
          { label: 'Tổng Chi Phí Ads (VNĐ)', value: totalSpend.toLocaleString('vi-VN') },
          { label: 'Chuyển Đổi Nền Tảng', value: totalPlatformConv },
          { label: 'Lead CRM Thực Tế (L3)', value: totalCrmL3 },
          { label: 'CPL Thực Tế (VNĐ/Lead)', value: aggregateCpl.toLocaleString('vi-VN') },
          { label: 'Hợp Đồng Thành Công (Won)', value: totalWon },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Chiến Dịch', key: 'code', width: 20, type: 'string' },
          { header: 'Tên Chiến Dịch', key: 'name', width: 34, type: 'string' },
          { header: 'Nền Tảng', key: 'platform', width: 16, type: 'string' },
          { header: 'Trạng Thái', key: 'status', width: 14, type: 'string' },
          { header: 'Ngân Sách Ngày (VNĐ)', key: 'dailyBudget', width: 20, type: 'currency' },
          { header: 'Hiển Thị (Impressions)', key: 'impressions', width: 20, type: 'number' },
          { header: 'Lượt Nhấp (Clicks)', key: 'clicks', width: 18, type: 'number' },
          { header: 'CTR (%)', key: 'ctr', width: 14, type: 'percent' },
          { header: 'Chi Phí Thực Chi (VNĐ)', key: 'spend', width: 22, type: 'currency' },
          { header: 'Chuyển Đổi Nền Tảng (Platform Conv.)', key: 'platformConversions', width: 26, type: 'number' },
          { header: 'Lead CRM Hợp Lệ (L2)', key: 'crmLeadsL2', width: 20, type: 'number' },
          { header: 'Lead CRM Tính CPL (L3)', key: 'crmLeadsL3', width: 22, type: 'number' },
          { header: 'CPL Thực Tế (VNĐ/L3)', key: 'cplEffective', width: 22, type: 'currency' },
          { header: 'Chốt Won', key: 'wonCount', width: 14, type: 'number' },
        ],
        rows: campaignRows,
        summaryRow: {
          stt: '',
          code: 'TỔNG / TỶ LỆ GỘP',
          name: `${campaignRows.length} chiến dịch`,
          platform: '',
          status: '',
          dailyBudget: campaignRows.reduce((s, r) => s + r.dailyBudget, 0),
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr: aggregateCtr,
          spend: totalSpend,
          platformConversions: totalPlatformConv,
          crmLeadsL2: totalCrmL2,
          crmLeadsL3: totalCrmL3,
          cplEffective: aggregateCpl,
          wonCount: totalWon,
        },
        footerNotes: [
          'Nguyên tắc đối chiếu (UC03 & M03): "Chuyển đổi nền tảng (Platform Conversions)" là số sự kiện do Google/Facebook ghi nhận; "Lead CRM tính CPL (L3)" là hồ sơ khách hàng thực tế trong CRM đã trừ Spam.',
          'Công thức tỷ lệ gộp: CTR tổng = Tổng Clicks / Tổng Impressions; CPL thực tế = Tổng Chi Phí / Tổng Lead CRM (L3). Tuyệt đối không tính trung bình cộng của các tỷ lệ.',
        ],
      },
      {
        name: '02_TuKhoa_SEO_Ads',
        title: `DANH SÁCH TỪ KHÓA SEO & QUẢNG CÁO TÌM KIẾM — TOÀN TRUNG`,
        metadata: [
          { label: 'Tổng số từ khóa theo dõi', value: String(keywords.length) },
          { label: 'Thời gian kết xuất', value: new Date().toLocaleString('vi-VN') },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Từ Khóa Mục Tiêu', key: 'keyword', width: 32, type: 'string' },
          { header: 'Lượt Tìm Kiếm/Tháng', key: 'volume', width: 22, type: 'number' },
          { header: 'Thứ Hạng TB (GSC)', key: 'position', width: 20, type: 'number' },
          { header: 'Click Tự Nhiên (Organic)', key: 'organicClicks', width: 22, type: 'number' },
          { header: 'Click Quảng Cáo (Ads)', key: 'adsClicks', width: 20, type: 'number' },
          { header: 'Xu Hướng', key: 'trend', width: 16, type: 'string' },
          { header: 'Khung Thời Điểm Đẩy Mạnh', key: 'publishWindow', width: 24, type: 'string' },
        ],
        rows: keywords.map((k, idx) => ({
          stt: idx + 1,
          keyword: k.keyword,
          volume: k.cachedSearchVolume || 0,
          position: k.cachedAvgPosition ? Number(k.cachedAvgPosition.toFixed(1)) : 0,
          organicClicks: k.cachedOrganicClicks || 0,
          adsClicks: k.cachedAdsClicks || 0,
          trend:
            k.trendDirection === 'rising'
              ? 'Tăng trưởng'
              : k.trendDirection === 'declining'
                ? 'Giảm'
                : 'Ổn định',
          publishWindow: k.recommendedPublishWindow || 'Quanh năm',
        })),
        summaryRow: {
          stt: '',
          keyword: 'TỔNG CỘNG',
          volume: keywords.reduce((s, k) => s + (k.cachedSearchVolume || 0), 0),
          position: '',
          organicClicks: keywords.reduce((s, k) => s + (k.cachedOrganicClicks || 0), 0),
          adsClicks: keywords.reduce((s, k) => s + (k.cachedAdsClicks || 0), 0),
          trend: '',
          publishWindow: '',
        },
      },
      {
        name: '03_BaiViet_SEO',
        title: 'DANH SÁCH BÀI VIẾT CHUẨN SEO & TRẠNG THÁI XUẤT BẢN WEBSITE VỆ TINH',
        metadata: [
          { label: 'Tổng số bài viết SEO', value: String(articles.length) },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Tiêu Đề Bài Viết', key: 'title', width: 38, type: 'string' },
          { header: 'Từ Khóa Chính', key: 'keyword', width: 26, type: 'string' },
          { header: 'Website Đích', key: 'targetSite', width: 24, type: 'string' },
          { header: 'Điểm Chuẩn SEO (/100)', key: 'seoScore', width: 20, type: 'number' },
          { header: 'Trạng Thái Xuất Bản', key: 'status', width: 22, type: 'string' },
          { header: 'Tác Giả / Phụ Trách', key: 'author', width: 22, type: 'string' },
          { header: 'Ngày Tạo', key: 'createdAt', width: 18, type: 'string' },
        ],
        rows: articles.map((a, idx) => ({
          stt: idx + 1,
          title: a.title,
          keyword: a.keyword?.keyword || a.topic || '—',
          targetSite: a.targetWebsite || 'toantrung.vn',
          seoScore: a.needsOptimization ? 72 : 90,
          status:
            a.status === 'published'
              ? 'Đã đăng (Mô phỏng/CMS)'
              : a.status === 'approved_scheduled'
                ? a.lastPublishError
                  ? 'Lỗi xuất bản'
                  : 'Đã duyệt & hẹn giờ đăng'
                : 'Bản nháp',
          author: a.createdBy?.fullName || 'Chuyên viên Marketing',
          createdAt: a.createdAt.toISOString().slice(0, 16).replace('T', ' '),
        })),
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'ADS_DATA_EXPORTED',
        targetType: 'AdsExport',
        targetId: `xlsx_${keywords.length}_${campaigns.length}`,
        detailsJson: JSON.stringify({
          keywords: keywords.length,
          campaigns: campaigns.length,
          articles: articles.length,
        }),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="03_QuangCao_SEO_${dateStamp}.xlsx"`,
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
