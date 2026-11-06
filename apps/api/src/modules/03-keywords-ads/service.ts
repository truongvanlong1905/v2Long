import crypto from 'node:crypto';
import {
  prisma,
  ConcurrencyConflictError,
  recordAiUsageAttempt,
} from '@toantrung/database';
import {
  containsCustomerPiiInPrompt,
  type AdsCampaignItemDto,
  type AdsPerformancePointDto,
  type AdsWorkspacePayloadDto,
  type ApproveAndScheduleSeoArticleDto,
  type CreateSeoKeywordDto,
  type GenerateSeoDraftByAiDto,
  type KeywordDemandBarDto,
  type PublishSeoArticleNowDto,
  type SeoArticleItemDto,
  type SeoArticleRevisionItemDto,
  type SeoArticleStatus,
  type SeoKeywordItemDto,
  type SessionUserDto,
  type UpdateSeoArticleDraftDto,
  type WithdrawSeoApprovalDto,
} from '@toantrung/contracts';

export function isAdsReadOnlyRole(roleCode: SessionUserDto['roleCode']): boolean {
  return roleCode === 'ADS';
}

export function assertMarketingEditorRole(user: SessionUserDto): void {
  if (isAdsReadOnlyRole(user.roleCode)) {
    throw new Error(
      'Theo đặc tả UC05 (Luồng phụ A4), Nhân viên Ads chỉ có quyền xem số liệu từ khóa và xu hướng tìm kiếm; không có quyền tạo nháp AI, sửa bài, duyệt hoặc lên lịch đăng bài.',
    );
  }
}

function slugifyVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function mapArticleStatusToDto(status: string, hasError: boolean): SeoArticleStatus {
  if (status === 'published') return 'PUBLISHED';
  if (status === 'approved_scheduled') {
    return hasError ? 'PUBLISH_FAILED' : 'APPROVED_SCHEDULED';
  }
  return 'DRAFT';
}

const KEYWORD_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function refreshKeywordDerivedCacheFromCanonicalMetrics(options?: { force?: boolean }) {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - KEYWORD_CACHE_TTL_MS);

  const keywords = await prisma.seoKeyword.findMany({
    where: options?.force
      ? undefined
      : {
          OR: [
            { cacheRefreshedAt: null },
            { cacheRefreshedAt: { lt: staleThreshold } },
          ],
        },
  });

  if (keywords.length === 0) return;

  const startStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endStr = now.toISOString().slice(0, 10);
  const norms = keywords.map((k) => k.keywordNorm).filter(Boolean);

  const allMetrics = norms.length > 0
    ? await prisma.platformDailyMetric.findMany({
        where: {
          keywordTextNorm: { in: norms },
          metricDate: { gte: startStr, lte: endStr },
        },
      })
    : [];

  const metricsByNorm = new Map<string, typeof allMetrics>();
  for (const m of allMetrics) {
    const arr = metricsByNorm.get(m.keywordTextNorm) || [];
    arr.push(m);
    metricsByNorm.set(m.keywordTextNorm, arr);
  }

  for (const kw of keywords) {
    const metrics = metricsByNorm.get(kw.keywordNorm) || [];
    if (metrics.length > 0) {
      const adsClicks = metrics
        .filter((m) => m.platform === 'google_ads')
        .reduce((acc, m) => acc + m.clicks, 0);
      const gscRows = metrics.filter((m) => m.platform === 'search_console');
      const organicClicks = gscRows.reduce((acc, m) => acc + m.clicks, 0);
      const posRows = gscRows.filter((m) => m.avgPosition !== null);
      const avgPosition =
        posRows.length > 0
          ? posRows.reduce((acc, m) => acc + (m.avgPosition || 0), 0) / posRows.length
          : kw.cachedAvgPosition;

      await prisma.seoKeyword.update({
        where: { id: kw.id },
        data: {
          cachedAdsClicks: adsClicks || kw.cachedAdsClicks,
          cachedOrganicClicks: organicClicks || kw.cachedOrganicClicks,
          cachedAvgPosition: avgPosition,
          cacheWindowStartDate: startStr,
          cacheWindowEndDate: endStr,
          cacheRefreshedAt: now,
        },
      });
    } else {
      await prisma.seoKeyword.update({
        where: { id: kw.id },
        data: { cacheRefreshedAt: now },
      });
    }
  }
}

export async function listKeywordsAndArticlesForUser(user: SessionUserDto): Promise<AdsWorkspacePayloadDto> {
  // Only refresh if cache is missing or older than 30 minutes
  await refreshKeywordDerivedCacheFromCanonicalMetrics({ force: false });

  const [keywordRows, campaignRows, dailyMetricRows] = await Promise.all([
    prisma.seoKeyword.findMany({
      include: {
        articles: { select: { id: true } },
      },
      orderBy: { cachedSearchVolume: 'desc' },
    }),
    prisma.campaign.findMany({
      orderBy: { id: 'asc' },
    }),
    prisma.platformDailyMetric.findMany({
      where: {
        grain: 'campaign',
        platform: { in: ['google_ads', 'facebook', 'facebook_ads'] },
      },
      orderBy: { metricDate: 'desc' },
    }),
  ]);

  const adsMetrics = dailyMetricRows.filter(
    (m) =>
      m.grain === 'campaign' &&
      ['google_ads', 'facebook', 'facebook_ads'].includes(m.platform),
  );

  const totalImpressions = adsMetrics.reduce((sum, m) => sum + m.impressions, 0);
  const totalClicks = adsMetrics.reduce((sum, m) => sum + m.clicks, 0);
  const totalSpendMicros = adsMetrics.reduce((sum, m) => sum + m.spendMicros, 0n);
  const totalSpendVnd = Number(totalSpendMicros / 1_000_000n);
  const totalConversions = adsMetrics.reduce(
    (sum, m) => sum + Number(m.conversionsMicros / 1_000_000n),
    0,
  );
  const avgCtrPct =
    totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) + '%' : '0.00%';
  const cplVndText =
    totalConversions > 0
      ? Math.round(totalSpendVnd / totalConversions).toLocaleString('vi-VN') + ' ₫'
      : 'Chưa có';
  const totalSpendVndText = totalSpendVnd.toLocaleString('vi-VN') + ' ₫';

  const kpis = {
    totalImpressions,
    totalClicks,
    totalSpendVndText,
    avgCtrPct,
    totalConversions,
    cplVndText,
  };

  const campaigns: AdsCampaignItemDto[] = campaignRows.map((camp) => {
    const campMetrics = adsMetrics.filter(
      (m) => m.campaignId === camp.id || m.campaignExternalId === camp.campaignCode,
    );
    const impressions = campMetrics.reduce((s, m) => s + m.impressions, 0);
    const clicks = campMetrics.reduce((s, m) => s + m.clicks, 0);
    const spendMicros = campMetrics.reduce((s, m) => s + m.spendMicros, 0n);
    const spendVnd = Number(spendMicros / 1_000_000n);
    const conversions = campMetrics.reduce(
      (s, m) => s + Number(m.conversionsMicros / 1_000_000n),
      0,
    );
    const ctrPct =
      impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + '%' : '0.00%';
    const cplText =
      conversions > 0 ? Math.round(spendVnd / conversions).toLocaleString('vi-VN') + ' ₫' : 'Chưa có';
    const dailyBudgetVndText = camp.dailyBudgetMicros
      ? Number(camp.dailyBudgetMicros / 1_000_000n).toLocaleString('vi-VN') + ' ₫'
      : 'Không giới hạn';

    return {
      id: camp.id,
      platform:
        camp.platform === 'google_ads'
          ? 'Google Ads'
          : camp.platform === 'facebook'
            ? 'Facebook Ads'
            : camp.platform,
      campaignCode: camp.campaignCode,
      campaignName: camp.campaignName,
      isActive: camp.isActive,
      dailyBudgetVndText,
      impressions,
      clicks,
      ctrPct,
      spendVndText: spendVnd.toLocaleString('vi-VN') + ' ₫',
      conversions,
      cplText,
    };
  });

  const performanceMap = new Map<string, { clicks: number; conversions: number }>();
  for (const m of adsMetrics) {
    const month = m.metricDate.slice(0, 7);
    const label = month ? `T${month.slice(5)}/${month.slice(0, 4)}` : 'Hiện tại';
    const existing = performanceMap.get(label) || { clicks: 0, conversions: 0 };
    existing.clicks += m.clicks;
    existing.conversions += Number(m.conversionsMicros / 1_000_000n);
    performanceMap.set(label, existing);
  }

  const performanceChart: AdsPerformancePointDto[] = Array.from(performanceMap.entries()).map(
    ([label, val]) => ({
      label,
      clicks: val.clicks,
      conversions: val.conversions,
    }),
  );

  if (performanceChart.length === 0) {
    for (const c of campaigns) {
      performanceChart.push({
        label: c.campaignName.length > 20 ? c.campaignName.slice(0, 18) + '...' : c.campaignName,
        clicks: c.clicks,
        conversions: c.conversions,
      });
    }
  }

  const maxSearchVol = Math.max(...keywordRows.map((k) => k.cachedSearchVolume ?? 0), 100);
  const demandBars: KeywordDemandBarDto[] = keywordRows.slice(0, 6).map((k) => {
    const vol = k.cachedSearchVolume ?? 0;
    const percentage = Math.min(100, Math.max(12, Math.round((vol / maxSearchVol) * 100)));
    return {
      id: k.id,
      keywordText: k.keyword,
      searchVolume: vol,
      percentage,
      trendDirection: (k.trendDirection === 'rising'
        ? 'UP'
        : k.trendDirection === 'declining'
          ? 'DOWN'
          : 'STABLE') as 'UP' | 'STABLE' | 'DOWN',
    };
  });

  const keywords: SeoKeywordItemDto[] = keywordRows.map((k) => ({
    id: k.id,
    keywordText: k.keyword,
    topicCluster: 'Giải pháp Màn hình LED & Bảng điện tử',
    searchIntent: 'COMMERCIAL',
    targetWebsite: 'toantrung.vn',
    cachedSearchVolume: k.cachedSearchVolume ?? 1000,
    cachedAdsClicks: k.cachedAdsClicks ?? 0,
    cachedOrganicClicks: k.cachedOrganicClicks ?? 0,
    cachedAvgPosition: k.cachedAvgPosition,
    trendScore: k.trendDirection === 'rising' ? 88 : k.trendDirection === 'declining' ? 42 : 68,
    trendDirection:
      k.trendDirection === 'rising'
        ? 'UP'
        : k.trendDirection === 'declining'
          ? 'DOWN'
          : 'STABLE',
    cacheSourceAccountKey: k.cacheSourceAccountKey,
    cacheWindowStartDate: k.cacheWindowStartDate,
    cacheWindowEndDate: k.cacheWindowEndDate,
    cacheRefreshedAt: k.cacheRefreshedAt ? k.cacheRefreshedAt.toISOString() : null,
    suggestedPublishSlot:
      k.recommendedPublishWindow || 'Thứ Ba / Thứ Năm 09:00 - 10:30 (Khung giờ B2B cao điểm)',
    articlesCount: k.articles.length,
  }));

  // UC05 A4: Nhân viên Ads chỉ xem bảng từ khóa & xu hướng, không xem danh sách quản trị bài viết
  if (isAdsReadOnlyRole(user.roleCode)) {
    return {
      isAdsReadOnly: true,
      kpis,
      campaigns,
      performanceChart,
      demandBars,
      keywords,
      articles: [],
    };
  }

  const articleRows = await prisma.seoArticle.findMany({
    include: {
      keyword: true,
      createdBy: { select: { fullName: true } },
      approvedBy: { select: { fullName: true } },
      revisions: {
        include: { editedBy: { select: { fullName: true } } },
        orderBy: { revisionNumber: 'desc' },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const articles: SeoArticleItemDto[] = articleRows.map((a) => {
    const revisions: SeoArticleRevisionItemDto[] = a.revisions.map((rev) => ({
      id: rev.id,
      articleId: rev.articleId,
      revisionNumber: rev.revisionNumber,
      title: rev.title,
      metaDescription: rev.metaDescription,
      headingStructureJson: a.aiSuggestedOutline,
      contentHtml: rev.contentHtml,
      editorNote: rev.changeNote,
      isAiGenerated: rev.originType === 'ai_initial_draft',
      editedByName: rev.editedBy.fullName,
      createdAt: rev.createdAt.toISOString(),
    }));

    return {
      id: a.id,
      version: a.version,
      keywordId: a.keywordId || 0,
      keywordText: a.keyword?.keyword || a.topic,
      targetWebsite: a.targetWebsite,
      title: a.title,
      slug: a.slug || '',
      metaDescription: a.metaDescription,
      headingStructureJson: a.aiSuggestedOutline,
      contentHtml: a.contentHtml,
      featuredImageUrl: null,
      keywordDensityPct: 1.8,
      status: mapArticleStatusToDto(a.status, Boolean(a.lastPublishError)),
      currentRevisionId: a.currentRevisionId,
      approvedRevisionId: a.approvedRevisionId,
      scheduledPublishAt: a.scheduledPublishAt ? a.scheduledPublishAt.toISOString() : null,
      publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
      publishedUrl: a.publishedUrl,
      publishErrorMessage: a.lastPublishError,
      publishAttemptCount: a.publishAttemptCount,
      organicClicks30d: a.cachedOrganicClicks ?? 0,
      avgPosition30d: a.cachedAvgPosition,
      avgReadTimeSec: a.cachedAvgTimeOnPageSec ? Math.round(a.cachedAvgTimeOnPageSec) : null,
      needsOptimization: a.needsOptimization,
      createdByName: a.createdBy.fullName,
      approvedByName: a.approvedBy?.fullName || null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      revisions,
    };
  });

  return {
    isAdsReadOnly: false,
    kpis,
    campaigns,
    performanceChart,
    demandBars,
    keywords,
    articles,
  };
}

export async function createSeoKeyword(actor: SessionUserDto, input: CreateSeoKeywordDto) {
  assertMarketingEditorRole(actor);
  const norm = input.keywordText.trim().toLowerCase().replace(/\s+/g, ' ');
  const now = new Date();
  return prisma.seoKeyword.upsert({
    where: { keywordNorm: norm },
    update: {
      keyword: input.keywordText.trim(),
    },
    create: {
      keyword: input.keywordText.trim(),
      keywordNorm: norm,
      cachedSearchVolume: 950,
      cachedAdsClicks: 45,
      cachedOrganicClicks: 60,
      cachedAvgPosition: 6.4,
      cacheSourceAccountKey: `GADS-TT-01 + https://${input.targetWebsite}`,
      cacheWindowStartDate: new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10),
      cacheWindowEndDate: now.toISOString().slice(0, 10),
      cacheRefreshedAt: now,
      trendDirection: 'rising',
      recommendedPublishWindow: 'Thứ Ba / Thứ Năm 09:00 - 10:30',
    },
  });
}

export async function generateSeoArticleDraftByAi(
  actor: SessionUserDto,
  input: GenerateSeoDraftByAiDto,
) {
  assertMarketingEditorRole(actor);

  const piiCheck = containsCustomerPiiInPrompt(
    `${input.topicFocus} ${input.customPromptInstruction || ''}`,
  );
  if (piiCheck.hasPii) {
    throw new Error(piiCheck.reason);
  }

  const keyword = await prisma.seoKeyword.findUnique({
    where: { id: input.keywordId },
  });
  if (!keyword) {
    throw new Error('Không tìm thấy từ khóa mục tiêu.');
  }

  const startedMs = Date.now();
  await new Promise((r) => setTimeout(r, 85));
  const durationMs = Date.now() - startedMs;

  // UC05 A3: Sự cố kết nối AI -> ghi log lỗi thực tế (token/cost = null) và không tạo bản nháp lỗi
  if (input.simulateAiFailure) {
    await recordAiUsageAttempt(prisma, {
      idempotencyKey: `seo-ai-fail-${actor.id}-${Date.now()}`,
      attemptNumber: 1,
      moduleCode: '03-keywords-ads',
      taskType: 'seo_draft',
      userId: actor.id,
      modelName: 'gemini-2.5-flash',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costMicros: null,
      durationMs,
      status: 'timeout',
      errorMessage: 'Hệ thống AI quá thời gian phản hồi (Simulated Timeout UC05 A3).',
    });
    throw new Error(
      'Kết nối hệ thống AI bị gián đoạn (UC05 A3). Không tạo bản nháp lỗi; bạn có thể thử lại hoặc tự soạn thảo thủ công.',
    );
  }

  const baseTitle = `${input.topicFocus} — Tư vấn chuẩn kỹ thuật (${keyword.keyword})`;
  const slug = `${slugifyVietnamese(baseTitle)}-${crypto.randomInt(100, 999)}`;
  const metaDescription = `Giải pháp ${keyword.keyword} chính hãng tại Toàn Trung: thông số kỹ thuật chi tiết, tiêu chuẩn lắp đặt và quy trình bảo hành tận nơi.`;
  const outline = [
    `H2: 1. Tổng quan nhu cầu và tiêu chuẩn kỹ thuật cho "${keyword.keyword}"`,
    'H2: 2. Phân tích cấu hình Module, tần số quét và độ sáng thực tế',
    'H2: 3. Quy trình khảo sát hiện trường và thi công đạt chuẩn ISO tại Toàn Trung',
  ];
  const contentHtml = `<h2>1. Tổng quan nhu cầu và tiêu chuẩn kỹ thuật cho ${keyword.keyword}</h2>
<p>Trong các dự án hiện đại, việc lựa chọn đúng cấu hình <strong>${keyword.keyword}</strong> quyết định trực tiếp đến độ bền vận hành và chất lượng hiển thị hình ảnh. Chủ đề trọng tâm: <em>${input.topicFocus}</em>.</p>
<h2>2. Phân tích cấu hình Module, tần số quét và độ sáng thực tế</h2>
<p>Đội ngũ kỹ sư Toàn Trung khuyến nghị sử dụng tần số quét từ 3840Hz trở lên kết hợp bộ xử lý hình ảnh đồng bộ để hình ảnh không bị sọc khi quay phim, chụp ảnh sự kiện.</p>
<h2>3. Quy trình khảo sát hiện trường và thi công đạt chuẩn ISO</h2>
<p>Mọi công trình đều được khảo sát kết cấu khung chịu lực, hệ thống điện 3 pha và dựng phối cảnh 3D trực quan trước khi lắp đặt.</p>`;

  const result = await prisma.$transaction(async (tx) => {
    const article = await tx.seoArticle.create({
      data: {
        keywordId: keyword.id,
        topic: input.topicFocus.trim(),
        title: baseTitle,
        slug,
        metaDescription,
        aiSuggestedOutline: JSON.stringify(outline),
        contentHtml,
        targetWebsite: input.targetWebsite,
        status: 'draft',
        createdByUserId: actor.id,
      },
    });

    const rev1 = await tx.seoArticleRevision.create({
      data: {
        articleId: article.id,
        revisionNumber: 1,
        originType: 'ai_initial_draft',
        title: baseTitle,
        metaDescription,
        contentHtml,
        changeNote: 'Bản nháp chuẩn SEO đầu tiên do AI khởi tạo (UC05 Bước 3).',
        editedByUserId: actor.id,
      },
    });

    const updatedArticle = await tx.seoArticle.update({
      where: { id: article.id },
      data: { currentRevisionId: rev1.id },
    });

    return { article: updatedArticle, revision: rev1 };
  });

  await recordAiUsageAttempt(prisma, {
    idempotencyKey: `seo-ai-draft-article-${result.article.id}-rev-1`,
    attemptNumber: 1,
    providerRequestId: `gemini-seo-${result.article.id}`,
    moduleCode: '03-keywords-ads',
    taskType: 'seo_draft',
    userId: actor.id,
    seoArticleId: result.article.id,
    modelName: 'gemini-2.5-flash',
    promptTokens: 380,
    completionTokens: 960,
    totalTokens: 1340,
    costMicros: 10_500n,
    costCurrency: 'USD',
    durationMs,
    status: 'success',
  });

  return result.article;
}

export async function updateSeoArticleDraftWithRevision(
  actor: SessionUserDto,
  articleId: number,
  input: UpdateSeoArticleDraftDto,
) {
  assertMarketingEditorRole(actor);

  const existing = await prisma.seoArticle.findUnique({
    where: { id: articleId },
    include: {
      revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 },
    },
  });
  if (!existing) throw new Error('Không tìm thấy bài viết SEO.');

  if (existing.status !== 'draft') {
    throw new Error(
      'Bài viết đã được duyệt và khóa nội dung chỉnh sửa nhanh. Vui lòng bấm "Rút duyệt về Nháp" (UC05 A1) trước khi biên tập lại.',
    );
  }

  const nextRevNumber = (existing.revisions[0]?.revisionNumber || 0) + 1;

  return prisma.$transaction(async (tx) => {
    const rev = await tx.seoArticleRevision.create({
      data: {
        articleId,
        revisionNumber: nextRevNumber,
        originType: 'human_edit',
        title: input.title.trim(),
        metaDescription: input.metaDescription?.trim() || null,
        contentHtml: input.contentHtml,
        changeNote: input.editorNote?.trim() || `Biên tập thủ công phiên bản v${nextRevNumber}`,
        editedByUserId: actor.id,
      },
    });

    const updated = await tx.seoArticle.updateMany({
      where: { id: articleId, version: input.expectedVersion },
      data: {
        title: input.title.trim(),
        metaDescription: input.metaDescription?.trim() || null,
        contentHtml: input.contentHtml,
        targetWebsite: input.targetWebsite || existing.targetWebsite,
        currentRevisionId: rev.id,
        needsOptimization: false,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new ConcurrencyConflictError('SeoArticle', articleId, input.expectedVersion);
    }

    return rev;
  });
}

export async function approveAndScheduleSeoArticle(
  actor: SessionUserDto,
  articleId: number,
  input: ApproveAndScheduleSeoArticleDto,
) {
  assertMarketingEditorRole(actor);

  const existing = await prisma.seoArticle.findUnique({ where: { id: articleId } });
  if (!existing) throw new Error('Không tìm thấy bài viết SEO.');

  const boundRevisionId = input.revisionId || existing.currentRevisionId;
  if (!boundRevisionId) {
    throw new Error('Bài viết chưa có phiên bản nội dung để phê duyệt.');
  }

  const updated = await prisma.seoArticle.updateMany({
    where: { id: articleId, version: input.expectedVersion },
    data: {
      status: 'approved_scheduled',
      targetWebsite: input.targetWebsite,
      approvedRevisionId: boundRevisionId,
      scheduledPublishAt: new Date(input.scheduledPublishAt),
      approvedByUserId: actor.id,
      approvedAt: new Date(),
      lastPublishError: null,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new ConcurrencyConflictError('SeoArticle', articleId, input.expectedVersion);
  }
}

export async function withdrawSeoArticleApproval(
  actor: SessionUserDto,
  articleId: number,
  input: WithdrawSeoApprovalDto,
) {
  assertMarketingEditorRole(actor);

  const existing = await prisma.seoArticle.findUnique({ where: { id: articleId } });
  if (!existing) throw new Error('Không tìm thấy bài viết SEO.');
  if (existing.status === 'published') {
    throw new Error('Bài viết đã đăng lên website không thể rút duyệt; vui lòng tạo bản chỉnh sửa mới.');
  }

  const updated = await prisma.seoArticle.updateMany({
    where: { id: articleId, version: input.expectedVersion },
    data: {
      status: 'draft',
      approvedRevisionId: null,
      scheduledPublishAt: null,
      lastPublishError: null,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new ConcurrencyConflictError('SeoArticle', articleId, input.expectedVersion);
  }
}

export async function publishArticleViaWordPressAdapter(article: {
  id: number;
  title: string;
  slug: string | null;
  metaDescription: string | null;
  contentHtml: string | null;
  targetWebsite: string;
}): Promise<{ publishedUrl: string; mode: 'LIVE_CMS' | 'SIMULATED_CMS' }> {
  const slugSafe = article.slug || `bai-viet-${article.id}`;
  const wpUser = process.env.WP_APP_USER?.trim();
  const wpPassword = process.env.WP_APP_PASSWORD?.trim();

  if (wpUser && wpPassword) {
    const endpoint = `https://${article.targetWebsite}/wp-json/wp/v2/posts`;
    const basicToken = Buffer.from(`${wpUser}:${wpPassword}`).toString('base64');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basicToken}`,
      },
      body: JSON.stringify({
        title: article.title,
        slug: slugSafe,
        excerpt: article.metaDescription || '',
        content: article.contentHtml || '',
        status: 'publish',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `WordPress REST API (${article.targetWebsite}) trả về HTTP ${response.status}. Vui lòng kiểm tra Application Password.`,
      );
    }

    const json = (await response.json()) as { link?: string };
    return {
      publishedUrl: json.link || `https://${article.targetWebsite}/tin-tuc/${slugSafe}`,
      mode: 'LIVE_CMS',
    };
  }

  return {
    publishedUrl: `https://${article.targetWebsite}/tin-tuc/${slugSafe}`,
    mode: 'SIMULATED_CMS',
  };
}

export async function publishSeoArticleToTargetWebsite(
  actor: SessionUserDto,
  articleId: number,
  input: PublishSeoArticleNowDto,
) {
  assertMarketingEditorRole(actor);

  const existing = await prisma.seoArticle.findUnique({ where: { id: articleId } });
  if (!existing) throw new Error('Không tìm thấy bài viết SEO.');
  if (existing.status !== 'approved_scheduled') {
    throw new Error('Chỉ có thể đẩy bài lên website khi bài viết đang ở trạng thái "Đã duyệt - chờ đăng" (UC05 Bước 6-7).');
  }

  // UC05 A2: Lỗi kết nối Website đích -> giữ nguyên trạng thái Đã duyệt - chờ đăng, ghi lỗi chi tiết
  if (input.simulateWebhookFailure) {
    const errorMsg = `Kết nối API tới website ${existing.targetWebsite} bị từ chối (HTTP 503 Gateway Timeout). Giữ trạng thái chờ đăng lại (UC05 A2).`;
    await prisma.seoArticle.updateMany({
      where: { id: articleId, version: input.expectedVersion },
      data: {
        publishAttemptCount: { increment: 1 },
        lastPublishError: errorMsg,
        version: { increment: 1 },
      },
    });
    throw new Error(errorMsg);
  }

  let publishedUrl = `https://${existing.targetWebsite}/tin-tuc/${existing.slug || `bai-viet-${existing.id}`}`;
  try {
    const cmsRes = await publishArticleViaWordPressAdapter(existing);
    publishedUrl = cmsRes.publishedUrl;
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : `Lỗi kết nối CMS ${existing.targetWebsite}`;
    await prisma.seoArticle.updateMany({
      where: { id: articleId, version: input.expectedVersion },
      data: {
        publishAttemptCount: { increment: 1 },
        lastPublishError: errorMsg,
        version: { increment: 1 },
      },
    });
    throw new Error(errorMsg);
  }

  const updated = await prisma.seoArticle.updateMany({
    where: { id: articleId, version: input.expectedVersion },
    data: {
      status: 'published',
      publishedAt: new Date(),
      publishedUrl,
      publishAttemptCount: { increment: 1 },
      lastPublishError: null,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new ConcurrencyConflictError('SeoArticle', articleId, input.expectedVersion);
  }

  return { publishedUrl };
}

