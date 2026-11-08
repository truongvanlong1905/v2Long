import { prisma } from '@toantrung/database';
import { buildStandardXlsxBuffer } from '../../core/export/xlsx-builder';
import {
  CONTACT_CHANNEL_LABELS,
  PIPELINE_STATUS_LABELS,
  ReportQuerySchema,
  hasBaPermission,
  isL2Valid,
  isL3Effective,
  toMonetaryAmountDto,
  type ActionableTaskItemDto,
  type ContactChannel,
  type DetailedReportLeadRowDto,
  type LeadTrendPointDto,
  type MarketingSourcePerformanceRowDto,
  type PipelineStatus,
  type ProductInsightRowDto,
  type ReportsDashboardDto,
  type SalesPerformanceRowDto,
  type SessionUserDto,
  type UnansweredQuoteItemDto,
} from '@toantrung/contracts';
import { shouldAnonymizeLeadForRole } from '../01-leads/service';

function isAnonymizedViewerRole(roleCode: SessionUserDto['roleCode']): boolean {
  return shouldAnonymizeLeadForRole(roleCode) || roleCode === 'DESIGNER';
}

function maskPhoneForReport(phone: string | null): string {
  if (!phone || phone.length < 7) return '***';
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

function maskCustomerCompanyForReport(text: string): string {
  if (!text) return 'Khách hàng ẩn danh';
  return 'Khách hàng ẩn danh (Bảo mật kinh doanh)';
}

function mapProductCategory(group: string): ProductInsightRowDto['category'] {
  if (group === 'led_screen') return 'MAN_HINH_LED';
  if (group === 'electronic_board') return 'BANG_DIEN_TU';
  return 'KHAC';
}

function getScopeInfo(user: SessionUserDto): { scopeRole: string; scopeDescription: string } {
  switch (user.roleCode) {
    case 'BOD':
    case 'ADMIN':
      return {
        scopeRole: user.roleCode,
        scopeDescription: 'Phạm vi Toàn công ty (Ban Giám đốc / Admin — xem đầy đủ tất cả phòng ban)',
      };
    case 'SALES_LEAD':
      return {
        scopeRole: user.roleCode,
        scopeDescription: 'Phạm vi Phòng Kinh doanh (Trưởng nhóm Sales — toàn bộ nhân viên Sales)',
      };
    case 'SALES':
      return {
        scopeRole: user.roleCode,
        scopeDescription: `Phạm vi Cá nhân Sales (${user.fullName} — chỉ hiển thị Lead được phân bổ)`,
      };
    case 'MKT_LEAD':
    case 'MKT_STAFF':
    case 'ADS':
      return {
        scopeRole: user.roleCode,
        scopeDescription:
          'Phạm vi Phòng Marketing & Ads (Thống kê nguồn Lead, hiệu quả chiến dịch & SEO; ẩn danh PII khách hàng theo UC01/Q03)',
      };
    case 'DESIGNER':
      return {
        scopeRole: user.roleCode,
        scopeDescription: 'Phạm vi Phòng Thiết kế & Phối cảnh 3D LED (Hiệu suất thiết kế & sử dụng AI)',
      };
    default:
      return {
        scopeRole: user.roleCode,
        scopeDescription: 'Phạm vi mặc định theo vai trò',
      };
  }
}

function resolveDateRange(
  preset: '7d' | '30d' | 'all' | 'custom',
  fromStr?: string,
  toStr?: string
): {
  fromDate: Date;
  toDate: Date;
} {
  const now = new Date();
  const toDate = toStr ? new Date(toStr) : new Date(now);
  toDate.setHours(23, 59, 59, 999);

  if (preset === '7d') {
    const fromDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    fromDate.setHours(0, 0, 0, 0);
    return { fromDate, toDate };
  }
  if (preset === '30d') {
    const fromDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    fromDate.setHours(0, 0, 0, 0);
    return { fromDate, toDate };
  }
  if (preset === 'custom' && fromStr) {
    const fromDate = new Date(fromStr);
    fromDate.setHours(0, 0, 0, 0);
    return { fromDate, toDate };
  }

  const fromDate = new Date('2025-01-01T00:00:00.000Z');
  return { fromDate, toDate };
}

export async function getScopedReportsDashboard(
  user: SessionUserDto,
  rawQuery: unknown
): Promise<ReportsDashboardDto> {
  const parsed = ReportQuerySchema.safeParse(rawQuery ?? {});
  const query = parsed.success ? parsed.data : { preset: '30d' as const };
  const { fromDate, toDate } = resolveDateRange(query.preset, query.fromDate, query.toDate);
  const fromDateStr = fromDate.toISOString().slice(0, 10);
  const toDateStr = toDate.toISOString().slice(0, 10);
  const { scopeRole, scopeDescription } = getScopeInfo(user);
  const anonymized = isAnonymizedViewerRole(user.roleCode);

  const leadWhere: Record<string, unknown> = {
    createdAt: {
      gte: fromDate,
      lte: toDate,
    },
  };

  if (user.roleCode === 'SALES') {
    leadWhere.assignedSalesId = user.id;
  }

  const [
    leads,
    salesUsers,
    allProducts,
    latestSync,
    metrics,
    seoArticles,
    designRequests,
    aiLogs,
    recentSyncLogs,
    openAlertsCount,
    currentUnacceptedLeadsCount,
    currentOverdueQuotesCount,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhere,
      include: {
        assignedSales: true,
        tracking: true,
        leadProducts: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: {
          roleCode: { in: ['SALES', 'SALES_LEAD'] },
        },
      },
      include: { role: true },
      orderBy: { id: 'asc' },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    }),
    prisma.platformSyncLog.findFirst({
      where: { status: 'success' },
      orderBy: { completedAt: 'desc' },
    }),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: { in: ['google_ads', 'facebook', 'facebook_ads'] },
        grain: 'campaign',
        metricDate: {
          gte: fromDateStr,
          lte: toDateStr,
        },
      },
      include: {
        campaign: {
          select: {
            campaignName: true,
            campaignCode: true,
          },
        },
      },
    }),
    prisma.seoArticle.findMany({
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
    }),
    prisma.designRequest.findMany({
      where: {
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
        ...(user.roleCode === 'SALES'
          ? { requestedBySalesId: user.id }
          : user.roleCode === 'DESIGNER'
            ? { assignedDesignerId: user.id }
            : {}),
      },
    }),
    prisma.aiUsageLog.findMany({
      where: {
        moduleCode: '05-ai-design',
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
    }),
    prisma.platformSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
    prisma.leadReconciliation.count({
      where: { status: 'alert_open' },
    }),
    prisma.lead.count({
      where: {
        isSpam: false,
        pipelineStatus: 'new_lead',
        receivedAt: null,
        ...(user.roleCode === 'SALES'
          ? { OR: [{ assignedSalesId: user.id }, { createdByUserId: user.id }] }
          : {}),
      },
    }),
    prisma.lead.count({
      where: {
        isSpam: false,
        pipelineStatus: 'quote_sent',
        quoteRespondedAt: null,
        firstQuoteSentAt: {
          lte: new Date(Date.now() - 7 * 24 * 3600 * 1000),
        },
        ...(user.roleCode === 'SALES'
          ? { OR: [{ assignedSalesId: user.id }, { createdByUserId: user.id }] }
          : {}),
      },
    }),
  ]);

  const totalLeadsL1 = leads.length;
  const validLeads = leads.filter(isL2Valid);
  const validLeadsL2 = validLeads.length;
  // UC03 BR6: L3 = L1 trừ Spam tự động & Spam đã xác nhận (đồng bộ 100% với M02 qua helper chung)
  const effectiveLeads = leads.filter(isL3Effective);
  const effectiveLeadsL3 = effectiveLeads.length;

  const newLeadCount = validLeads.filter((l) => l.pipelineStatus === 'new_lead').length;
  const quotingCount = validLeads.filter((l) => l.pipelineStatus === 'quoting').length;
  const quoteSentCount = validLeads.filter((l) => l.pipelineStatus === 'quote_sent').length;
  const wonCount = validLeads.filter((l) => l.pipelineStatus === 'won').length;
  const lostCount = validLeads.filter((l) => l.pipelineStatus === 'lost').length;
  const activeLeadsCount = newLeadCount + quotingCount + quoteSentCount;
  const unreceivedLeadsCount = validLeads.filter(
    (l) => l.pipelineStatus === 'new_lead' && !l.receivedAt
  ).length;

  // Build chronological Lead trend by date in period
  const trendMap = new Map<
    string,
    { totalL1: number; validL2: number; wonCount: number }
  >();
  for (const lead of leads) {
    const dayKey = lead.createdAt.toISOString().slice(0, 10);
    const cur = trendMap.get(dayKey) ?? { totalL1: 0, validL2: 0, wonCount: 0 };
    cur.totalL1 += 1;
    if (isL2Valid(lead)) {
      cur.validL2 += 1;
      if (lead.pipelineStatus === 'won') {
        cur.wonCount += 1;
      }
    }
    trendMap.set(dayKey, cur);
  }
  const leadTrend: LeadTrendPointDto[] = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, counts]) => ({
      date,
      label: date.slice(5).replace('-', '/'),
      totalL1: counts.totalL1,
      validL2: counts.validL2,
      wonCount: counts.wonCount,
    }));

  const nowMs = Date.now();
  const unansweredQuotes: UnansweredQuoteItemDto[] = [];
  for (const lead of validLeads) {
    if (lead.pipelineStatus === 'quote_sent' && lead.firstQuoteSentAt && !lead.quoteRespondedAt) {
      const daysWaiting = Math.max(
        0,
        Math.floor((nowMs - lead.firstQuoteSentAt.getTime()) / (24 * 3600 * 1000))
      );
      const isOverdue7Days = daysWaiting >= 7;
      const cleanCompany = lead.companyName ? lead.companyName.replace(/\s*\(Dữ liệu tổng hợp\)/gi, '') : null;
      const rawName = cleanCompany || lead.contactName || `Lead #${lead.leadCode}`;
      unansweredQuotes.push({
        leadId: lead.id,
        leadCode: lead.leadCode,
        companyOrContact: anonymized ? maskCustomerCompanyForReport(rawName) : rawName,
        phone: anonymized ? maskPhoneForReport(lead.phone) : lead.phone || 'Chưa cập nhật',
        assignedSalesName: lead.assignedSales?.fullName || 'Chưa phân bổ',
        quoteSentAt: lead.firstQuoteSentAt.toISOString(),
        daysWaiting,
        isOverdue7Days,
        productSummary:
          lead.leadProducts.map((lp) => lp.product.productName).join(', ') ||
          'Chưa chọn dòng sản phẩm LED',
      });
    }
  }

  unansweredQuotes.sort((a, b) => b.daysWaiting - a.daysWaiting);
  const overdue7DaysQuoteCount = unansweredQuotes.filter((q) => q.isOverdue7Days).length;

  const closedCount = wonCount + lostCount;
  const winRateText =
    closedCount > 0 ? `${((wonCount / closedCount) * 100).toFixed(1)}%` : '0.0%';

  const channelCounts = new Map<string, number>();
  for (const lead of validLeads) {
    channelCounts.set(lead.contactChannel, (channelCounts.get(lead.contactChannel) ?? 0) + 1);
  }
  const byChannel = Array.from(channelCounts.entries()).map(([channel, count]) => ({
    channel,
    label: CONTACT_CHANNEL_LABELS[channel as ContactChannel] ?? channel,
    count,
  }));

  const scopedSalesUsers =
    user.roleCode === 'SALES' ? salesUsers.filter((s) => s.id === user.id) : salesUsers;

  const salesPerformance: SalesPerformanceRowDto[] = scopedSalesUsers.map((s) => {
    const sLeads = validLeads.filter((l) => l.assignedSalesId === s.id);
    const sWon = sLeads.filter((l) => l.pipelineStatus === 'won').length;
    const sLost = sLeads.filter((l) => l.pipelineStatus === 'lost').length;
    const sClosed = sWon + sLost;
    const sOverdue = unansweredQuotes.filter(
      (q) => sLeads.some((l) => l.id === q.leadId) && q.isOverdue7Days
    ).length;

    return {
      salesUserId: s.id,
      salesFullName: s.fullName,
      isOnline: s.isOnline,
      isReceivingLeads: s.isReceivingLeads,
      totalLeads: sLeads.length,
      newLeads: sLeads.filter((l) => l.pipelineStatus === 'new_lead').length,
      quotingLeads: sLeads.filter((l) => l.pipelineStatus === 'quoting').length,
      quoteSentLeads: sLeads.filter((l) => l.pipelineStatus === 'quote_sent').length,
      wonLeads: sWon,
      lostLeads: sLost,
      unansweredOverdue7d: sOverdue,
      winRateText: sClosed > 0 ? `${((sWon / sClosed) * 100).toFixed(1)}%` : '0.0%',
    };
  });

  const productMap = new Map<number, { inquiryCount: number; wonCount: number }>();
  for (const lead of validLeads) {
    for (const lp of lead.leadProducts) {
      const current = productMap.get(lp.productId) ?? { inquiryCount: 0, wonCount: 0 };
      current.inquiryCount += 1;
      if (lead.pipelineStatus === 'won') {
        current.wonCount += 1;
      }
      productMap.set(lp.productId, current);
    }
  }

  const productInsights: ProductInsightRowDto[] = allProducts
    .map((p) => {
      const counts = productMap.get(p.id) ?? { inquiryCount: 0, wonCount: 0 };
      return {
        productId: p.id,
        productCode: p.productCode,
        productName: p.productName,
        category: mapProductCategory(p.categoryGroup),
        inquiryCount: counts.inquiryCount,
        wonCount: counts.wonCount,
      };
    })
    .filter((p) => p.inquiryCount > 0)
    .sort((a, b) => b.inquiryCount - a.inquiryCount);

  const totalAdsSpendMicros = metrics.reduce(
    (acc, m) => acc + (m.spendMicros ?? 0n),
    0n
  );
  const platformReportedConversions = Math.round(
    metrics.reduce((acc, m) => acc + Number((m.conversionsMicros ?? 0n) / 1_000_000n), 0)
  );
  const effectiveLeadsFromAds = effectiveLeads.filter((l) =>
    ['Google Ads', 'Facebook Ads'].includes(l.tracking?.marketingSource ?? '')
  ).length;
  const cplEffectiveMicros =
    effectiveLeadsFromAds > 0
      ? totalAdsSpendMicros / BigInt(effectiveLeadsFromAds)
      : null;

  // Source / Campaign performance table (HOME-04)
  const sourceCampaignMap = new Map<
    string,
    {
      sourceName: string;
      campaignName: string;
      spendMicros: bigint;
      platformConversions: number;
      crmLeadsL1: number;
      crmValidL2: number;
      crmEffectiveL3: number;
      wonCount: number;
    }
  >();

  for (const m of metrics) {
    const srcName =
      m.platform === 'google_ads'
        ? 'Google Ads'
        : m.platform === 'facebook' || m.platform === 'facebook_ads'
          ? 'Facebook Ads'
          : m.platform;
    const campName = m.campaign?.campaignName || 'Chiến dịch chung';
    const key = `${srcName}::${campName}`;
    const entry = sourceCampaignMap.get(key) ?? {
      sourceName: srcName,
      campaignName: campName,
      spendMicros: 0n,
      platformConversions: 0,
      crmLeadsL1: 0,
      crmValidL2: 0,
      crmEffectiveL3: 0,
      wonCount: 0,
    };
    entry.spendMicros += m.spendMicros ?? 0n;
    entry.platformConversions += Math.round(Number((m.conversionsMicros ?? 0n) / 1_000_000n));
    sourceCampaignMap.set(key, entry);
  }

  for (const lead of leads) {
    const srcName =
      lead.tracking?.marketingSource || lead.selfReportedSource || 'Trực tiếp / Nhập tay';
    const campName =
      lead.tracking?.campaignName ||
      (srcName === 'Google Ads' || srcName === 'Facebook Ads'
        ? 'Chiến dịch chung'
        : 'Nguồn tự nhiên / Trực tiếp');
    const key = `${srcName}::${campName}`;
    const entry = sourceCampaignMap.get(key) ?? {
      sourceName: srcName,
      campaignName: campName,
      spendMicros: 0n,
      platformConversions: 0,
      crmLeadsL1: 0,
      crmValidL2: 0,
      crmEffectiveL3: 0,
      wonCount: 0,
    };
    entry.crmLeadsL1 += 1;
    if (isL2Valid(lead)) {
      entry.crmValidL2 += 1;
      if (lead.pipelineStatus === 'won') {
        entry.wonCount += 1;
      }
    }
    if (isL3Effective(lead)) {
      entry.crmEffectiveL3 += 1;
    }
    sourceCampaignMap.set(key, entry);
  }

  const bySourceCampaign: MarketingSourcePerformanceRowDto[] = Array.from(
    sourceCampaignMap.entries()
  )
    .map(([key, item]) => ({
      key,
      sourceName: item.sourceName,
      campaignName: item.campaignName,
      spend:
        item.spendMicros > 0n
          ? toMonetaryAmountDto(item.spendMicros, 'VND', 'micros')
          : null,
      platformConversions: item.platformConversions,
      crmLeadsL1: item.crmLeadsL1,
      crmValidL2: item.crmValidL2,
      crmEffectiveL3: item.crmEffectiveL3,
      wonCount: item.wonCount,
    }))
    .sort((a, b) => b.crmLeadsL1 - a.crmLeadsL1 || b.platformConversions - a.platformConversions)
    .slice(0, 8);

  const publishedSeoArticles = seoArticles.filter((a) => a.status === 'published').length;
  const draftSeoArticles = seoArticles.filter((a) => a.status === 'draft').length;
  const scheduledSeoArticles = seoArticles.filter((a) => a.status === 'scheduled').length;
  const failedPublishArticles = seoArticles.filter((a) => Boolean(a.lastPublishError)).length;
  const optimizationNeededArticles = seoArticles.filter((a) => a.needsOptimization).length;

  const pendingDesignCount = designRequests.filter((d) => d.designStatus !== 'completed').length;
  const inReviewDesignCount = designRequests.filter((d) => d.designStatus === 'in_review').length;
  const completed3dCount = designRequests.filter(
    (d) => d.requestType === '3d_perspective' && d.designStatus === 'completed'
  ).length;
  const completedBannerCount = designRequests.filter(
    (d) => d.requestType === 'banner' && d.designStatus === 'completed'
  ).length;
  const withDuration = designRequests.filter((d) => d.processingTimeMs != null);
  const avgProcessingSec =
    withDuration.length > 0
      ? withDuration.reduce((sum, d) => sum + (d.processingTimeMs ?? 0) / 1000, 0) /
        withDuration.length
      : 0;

  const totalAiTokens = aiLogs.reduce((sum, l) => sum + (l.totalTokens ?? 0), 0);
  const totalAiCostMicros = aiLogs.reduce(
    (sum, l) => sum + (l.costMicros ?? 0n),
    0n
  );

  // Operational & integration readiness (HOME-05)
  const liveIntegrationMode = process.env.TOANTRUNG_LIVE_INTEGRATION === 'true';
  const distinctPlatforms = new Set(recentSyncLogs.map((c) => c.platform));
  const configuredConnectionsCount = liveIntegrationMode ? Math.max(distinctPlatforms.size, 3) : 0;
  const failingConnectionsCount = recentSyncLogs.filter((c) => c.consecutiveFailures >= 3).length;
  const gclidPendingRetryCount = leads.filter(
    (l) => Boolean(l.tracking?.gclid && l.tracking?.isUnknownCampaign),
  ).length;
  const wordpressConfigured = Boolean(
    process.env.WORDPRESS_SITE_URL &&
      process.env.WORDPRESS_USERNAME &&
      process.env.WORDPRESS_APP_PASSWORD
  );
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  // Prioritized Actionable Tasks scoped by user role (HOME-03)
  const actionableTasks: ActionableTaskItemDto[] = [];
  const canWorkLeads = ['ADMIN', 'BOD', 'SALES_LEAD', 'SALES'].includes(user.roleCode);
  const canWorkDesigns = hasBaPermission(user.roleCode, 'AI_DESIGN');
  const canWorkSeo = hasBaPermission(user.roleCode, 'AI_MARKETING_SEO');
  const canWorkTracking = hasBaPermission(user.roleCode, 'TRACKING_ADS_OPTIMIZE');

  if (canWorkLeads) {
    actionableTasks.push({
      id: 'unaccepted_leads',
      title: 'Lead mới chưa xác nhận tiếp nhận',
      description: 'Hồ sơ trạng thái Vừa nhận thông tin cần Sales bấm Tiếp nhận để bắt đầu tư vấn.',
      count: currentUnacceptedLeadsCount,
      severity: currentUnacceptedLeadsCount > 0 ? 'critical' : 'info',
      moduleLabel: 'Leads & Giao dịch',
      href: '/leads?status=new_lead&unreceived=1',
    });
    actionableTasks.push({
      id: 'overdue_quotes',
      title: 'Báo giá quá 7 ngày chưa phản hồi',
      description: 'Hồ sơ Đã gửi báo giá quá hạn 7 ngày cần liên hệ chăm sóc hoặc cập nhật kết quả.',
      count: currentOverdueQuotesCount,
      severity: currentOverdueQuotesCount > 0 ? 'warning' : 'info',
      moduleLabel: 'Leads & Giao dịch',
      href: '/leads?status=quote_sent&overdueOnly=true',
    });
  }

  if (canWorkDesigns) {
    actionableTasks.push({
      id: 'pending_designs',
      title: 'Yêu cầu phối cảnh 3D / Banner đang chờ hoàn tất',
      description: 'Hồ sơ thiết kế đang ở trạng thái chờ xử lý, AI phác thảo hoặc chờ duyệt.',
      count: pendingDesignCount,
      severity: pendingDesignCount > 0 ? 'warning' : 'info',
      moduleLabel: 'Thiết kế & Phối cảnh',
      href: '/design',
    });
  }

  if (canWorkSeo) {
    const seoActionCount = draftSeoArticles + optimizationNeededArticles;
    actionableTasks.push({
      id: 'seo_approvals',
      title: 'Bài viết SEO chờ duyệt hoặc cần tối ưu lại',
      description: `${draftSeoArticles} bản nháp chờ duyệt lịch đăng, ${optimizationNeededArticles} bài cần tối ưu sau 30 ngày.`,
      count: seoActionCount,
      severity: seoActionCount > 0 ? 'warning' : 'info',
      moduleLabel: 'Từ khóa & SEO',
      href: '/ads?tab=articles',
    });
    if (failedPublishArticles > 0 || user.roleCode === 'ADMIN' || user.roleCode === 'MKT_LEAD') {
      actionableTasks.push({
        id: 'publication_failures',
        title: 'Bài viết lỗi xuất bản WordPress',
        description: 'Bài viết gặp lỗi kết nối khi đẩy lên Website cần kiểm tra và đăng lại.',
        count: failedPublishArticles,
        severity: failedPublishArticles > 0 ? 'critical' : 'info',
        moduleLabel: 'Từ khóa & SEO',
        href: '/ads?tab=articles',
      });
    }
  }

  if (canWorkTracking) {
    const syncIssueCount = openAlertsCount + failingConnectionsCount;
    actionableTasks.push({
      id: 'sync_failures',
      title: 'Cảnh báo lệch đối soát & lỗi đồng bộ nền tảng',
      description: `${openAlertsCount} cảnh báo chênh lệch số liệu đang mở, ${failingConnectionsCount} kết nối lỗi liên tiếp.`,
      count: syncIssueCount,
      severity: syncIssueCount > 0 ? 'critical' : 'info',
      moduleLabel: 'Chiến dịch & Đồng bộ',
      href: '/tracking',
    });
  }

  const detailedLeads: DetailedReportLeadRowDto[] = leads.map((lead, idx) => {
    const cleanCompany = lead.companyName ? lead.companyName.replace(/\s*\(Dữ liệu tổng hợp\)/gi, '') : null;
    const rawCompanyOrContact =
      [cleanCompany, lead.contactName].filter(Boolean).join(' — ') ||
      `Khách hàng #${lead.leadCode}`;
    const receivedDate = lead.receivedAt ?? lead.contactedAt ?? lead.createdAt;
    return {
      stt: idx + 1,
      leadCode: lead.leadCode,
      receivedAt: receivedDate.toISOString(),
      assignedSalesName: lead.assignedSales?.fullName || 'Chưa phân bổ',
      companyOrCustomer: anonymized
        ? maskCustomerCompanyForReport(rawCompanyOrContact)
        : rawCompanyOrContact,
      phone: anonymized ? maskPhoneForReport(lead.phone) : lead.phone || 'Chưa có SĐT',
      contactChannel:
        CONTACT_CHANNEL_LABELS[lead.contactChannel as ContactChannel] ?? lead.contactChannel,
      marketingSource: lead.tracking?.marketingSource ?? lead.selfReportedSource ?? 'Nhập tay',
      productsText:
        lead.leadProducts.map((lp) => lp.product.productName).join(', ') ||
        'Chưa chọn dòng sản phẩm LED',
      pipelineStatusLabel: lead.isSpam
        ? 'Spam / Loại trừ'
        : PIPELINE_STATUS_LABELS[lead.pipelineStatus as PipelineStatus] ?? lead.pipelineStatus,
      noteOrReason: lead.lostReason || lead.spamReason || lead.projectName || '—',
      isAnonymized: anonymized,
    };
  });

  const isSmallSample = totalLeadsL1 < 30;

  return {
    scopeRole,
    scopeDescription,
    preset: query.preset,
    fromDate: fromDate.toISOString(),
    toDate: toDate.toISOString(),
    generatedAt: new Date().toISOString(),
    isSmallSample,
    smallSampleNotice: isSmallSample
      ? 'Lưu ý mẫu dữ liệu nhỏ (< 30 Lead trong kỳ lọc): Tỷ lệ chốt (Win Rate) và CPL chỉ mang tính tham khảo.'
      : null,
    todayPreliminaryNotice:
      'Số liệu phát sinh trong ngày hôm nay là số liệu sơ bộ (Realtime/Light Sync 11:00 & 17:00), được chốt đối soát chính thức sau phiên đồng bộ 02:00 sáng hôm sau.',
    lastSyncedAt: latestSync?.completedAt ? latestSync.completedAt.toISOString() : null,
    overview: {
      totalLeadsL1,
      validLeadsL2,
      effectiveLeadsL3,
      activeLeadsCount,
      unreceivedLeadsCount,
      newLeadCount,
      quotingCount,
      quoteSentCount,
      wonCount,
      lostCount,
      unansweredQuoteCount: unansweredQuotes.length,
      overdue7DaysQuoteCount,
      winRateText,
    },
    leadTrend,
    actionableTasks,
    byChannel,
    salesPerformance,
    productInsights,
    unansweredQuotes,
    marketingSummary: {
      totalAdsSpend: toMonetaryAmountDto(totalAdsSpendMicros, 'VND', 'micros'),
      platformReportedConversions,
      effectiveLeadsFromAds,
      cplEffective:
        cplEffectiveMicros != null
          ? toMonetaryAmountDto(cplEffectiveMicros, 'VND', 'micros')
          : null,
      publishedSeoArticles,
      draftSeoArticles,
      scheduledSeoArticles,
      failedPublishArticles,
      optimizationNeededArticles,
      bySourceCampaign,
    },
    trackingOperationalSummary: {
      liveIntegrationMode,
      configuredConnectionsCount,
      totalConnectionsCount: Math.max(distinctPlatforms.size, 3),
      openAlertsCount,
      failingConnectionsCount,
      gclidPendingRetryCount,
      wordpressConfigured,
      geminiConfigured,
    },
    designSummary: {
      totalRequests: designRequests.length,
      pendingCount: pendingDesignCount,
      inReviewCount: inReviewDesignCount,
      completed3dCount,
      completedBannerCount,
      avgProcessingSecText: `${avgProcessingSec.toFixed(1)} giây`,
      totalAiTokens,
      totalAiCost: toMonetaryAmountDto(totalAiCostMicros, 'USD', 'micros'),
    },
    detailedLeads,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function generateScopedReportExportBuffer(
  user: SessionUserDto,
  rawQuery: unknown,
  format: 'xlsx' | 'csv' = 'xlsx'
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const dashboard = await getScopedReportsDashboard(user, rawQuery);
  const dateStamp = new Date().toISOString().slice(0, 10);

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: 'REPORT_EXPORTED',
      targetType: 'ReportExport',
      targetId: `${dashboard.scopeRole}_${dashboard.preset}_${format}`,
      detailsJson: JSON.stringify({
        scopeRole: dashboard.scopeRole,
        preset: dashboard.preset,
        format,
        leadCount: dashboard.detailedLeads.length,
      }),
    },
  });

  if (format === 'csv') {
    const lines: string[] = [
      `BAO CAO HE THONG TOAN TRUNG V2 - ${dashboard.scopeDescription}`,
      `Ky bao cao,${dashboard.fromDate.slice(0, 10)} den ${dashboard.toDate.slice(0, 10)}`,
      `Tong Lead L1,${dashboard.overview.totalLeadsL1},Lead Hop le L2,${dashboard.overview.validLeadsL2},Lead Hieu qua L3,${dashboard.overview.effectiveLeadsL3},Win Rate,${dashboard.overview.winRateText}`,
      '',
      [
        'STT',
        'Ma Lead',
        'Ngay tiep nhan',
        'Sales phu trach',
        'Khach hang / Cong ty',
        'So dien thoai',
        'Kenh lien he',
        'Nguon Marketing',
        'San pham LED quan tam',
        'Trang thai Pipeline',
        'Ghi chu / Ly do',
      ]
        .map(escapeCsvCell)
        .join(','),
    ];

    for (const row of dashboard.detailedLeads) {
      lines.push(
        [
          row.stt,
          row.leadCode,
          row.receivedAt.slice(0, 16).replace('T', ' '),
          row.assignedSalesName,
          row.companyOrCustomer,
          row.phone,
          row.contactChannel,
          row.marketingSource,
          row.productsText,
          row.pipelineStatusLabel,
          row.noteOrReason,
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    return {
      buffer: Buffer.from(csvContent, 'utf8'),
      fileName: `BaoCao_ToanTrung_${dashboard.scopeRole}_${dateStamp}.csv`,
      mimeType: 'text/csv; charset=utf-8',
    };
  }

  const xlsxBuffer = buildStandardXlsxBuffer([
    {
      name: 'ChiTietLead',
      title: `BÁO CÁO HỆ THỐNG TOÀN TRUNG — ${dashboard.scopeDescription}`,
      metadata: [
        { label: 'Kỳ báo cáo', value: `${dashboard.fromDate.slice(0, 10)} đến ${dashboard.toDate.slice(0, 10)}` },
        { label: 'Tổng Lead L1', value: String(dashboard.overview.totalLeadsL1) },
        { label: 'Lead Hợp lệ L2', value: String(dashboard.overview.validLeadsL2) },
        { label: 'Lead Hiệu quả L3', value: String(dashboard.overview.effectiveLeadsL3) },
        { label: 'Tỷ lệ chốt (Win Rate)', value: dashboard.overview.winRateText },
      ],
      columns: [
        { header: 'STT', key: 'stt', width: 8, type: 'number' },
        { header: 'Mã Lead', key: 'leadCode', width: 14, type: 'string' },
        { header: 'Ngày tiếp nhận', key: 'receivedAt', width: 20, type: 'string' },
        { header: 'Sales phụ trách', key: 'assignedSalesName', width: 22, type: 'string' },
        { header: 'Khách hàng / Công ty', key: 'companyOrCustomer', width: 32, type: 'string' },
        { header: 'Số điện thoại', key: 'phone', width: 16, type: 'string' },
        { header: 'Kênh liên hệ', key: 'contactChannel', width: 16, type: 'string' },
        { header: 'Nguồn Marketing', key: 'marketingSource', width: 18, type: 'string' },
        { header: 'Sản phẩm LED quan tâm', key: 'productsText', width: 30, type: 'string' },
        { header: 'Trạng thái Pipeline', key: 'pipelineStatusLabel', width: 22, type: 'string' },
        { header: 'Ghi chú / Lý do', key: 'noteOrReason', width: 35, type: 'string' },
      ],
      rows: dashboard.detailedLeads.map((r) => ({
        stt: r.stt,
        leadCode: r.leadCode,
        receivedAt: r.receivedAt.slice(0, 16).replace('T', ' '),
        assignedSalesName: r.assignedSalesName,
        companyOrCustomer: r.companyOrCustomer,
        phone: r.phone,
        contactChannel: r.contactChannel,
        marketingSource: r.marketingSource,
        productsText: r.productsText,
        pipelineStatusLabel: r.pipelineStatusLabel,
        noteOrReason: r.noteOrReason,
      })),
    },
  ]);

  return {
    buffer: xlsxBuffer,
    fileName: `BaoCao_ToanTrung_${dashboard.scopeRole}_${dateStamp}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
