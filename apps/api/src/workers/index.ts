/**
 * Background Worker Scheduler & Job Runners (Mục 1.5)
 * Thực thi các tác vụ định kỳ theo đặc tả BA:
 * 1. Đồng bộ D3 đầy đủ (02:00) và nhẹ (11:00, 17:00) — UC03 Luồng B
 * 2. Tra lại gclid chưa rõ chiến dịch (mỗi giờ, Lead <= 7 ngày) — UC03 A2
 * 3. Đối soát Google Lead Form T-1 (sau sync 02:00) — UC03 Luồng D
 * 4. Đẩy bài SEO đến giờ hẹn (mỗi 5 phút) — UC05 Bước 7
 * 5. Cảnh báo báo giá > 7 ngày chưa phản hồi (hằng ngày) — UC02
 */

import { prisma } from '@toantrung/database';
import {
  retryUnresolvedGclids,
  triggerPlatformSyncExecution,
} from '../modules/02-tracking-sync/service';
import {
  publishArticleViaWordPressAdapter,
  refreshKeywordDerivedCacheFromCanonicalMetrics,
} from '../modules/03-keywords-ads/service';

/**
 * 1. Đồng bộ D3 đầy đủ (02:00) hoặc nhẹ (11:00 / 17:00)
 */
export async function runScheduledD3SyncJob(slot: 'FULL_0200' | 'LIGHT_1100' | 'LIGHT_1700') {
  const result = await triggerPlatformSyncExecution({
    scheduleSlot: slot,
    platforms: ['GOOGLE_ADS', 'GA4', 'SEARCH_CONSOLE', 'FANPAGE', 'GOOGLE_TRENDS'],
    runGclidResolution: true,
    runReconciliation: slot === 'FULL_0200',
  });

  await refreshKeywordDerivedCacheFromCanonicalMetrics({ force: true });

  if (slot === 'FULL_0200') {
    await runDailyGoogleLeadFormReconciliationJob();
  }

  return result;
}

/**
 * 2. Tra lại gclid mỗi giờ cho Lead <= 7 ngày (UC03 A2)
 */
export async function runHourlyGclidRetryJob() {
  return retryUnresolvedGclids();
}

/**
 * 3. Đối soát Google Lead Form ngày T-1 sau phiên đồng bộ 02:00 (UC03 Luồng D)
 */
export async function runDailyGoogleLeadFormReconciliationJob(targetDateStr?: string) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const reconcileDate = targetDateStr || yesterday.toISOString().slice(0, 10);
  const dayStart = new Date(`${reconcileDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${reconcileDate}T23:59:59.999Z`);

  const [crmLeadCount, crmErrorLogCount, metrics] = await Promise.all([
    prisma.lead.count({
      where: {
        contactChannel: 'google_lead_form',
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.webhookIntakeErrorLog.count({
      where: {
        sourcePlatform: 'google_lead_form',
        createdAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: 'google_ads',
        grain: 'campaign',
        metricDate: reconcileDate,
      },
      select: { googleLeadFormCount: true },
    }),
  ]);

  const platformReportedCount = metrics.reduce((sum, m) => sum + m.googleLeadFormCount, 0);
  const discrepancy = Math.abs(platformReportedCount - crmLeadCount);
  const status = discrepancy > 0 ? 'alert_open' : 'ok';

  return prisma.leadReconciliation.upsert({
    where: {
      uq_reconcile_date_platform_account: {
        reconcileDate,
        platform: 'google_ads',
        accountPropertyId: 'GADS-TT-01',
      },
    },
    update: {
      crmLeadCount,
      crmErrorLogCount,
      platformReportedCount,
      discrepancy,
      status,
    },
    create: {
      reconcileDate,
      platform: 'google_ads',
      accountPropertyId: 'GADS-TT-01',
      crmLeadCount,
      crmErrorLogCount,
      platformReportedCount,
      discrepancy,
      status,
    },
  });
}

/**
 * 4. Đẩy bài SEO đến giờ hẹn mỗi 5 phút (UC05 Bước 7)
 * Tự động chuyển giữa LIVE_CMS (WordPress REST API Application Password) và SIMULATED_CMS.
 */
export async function runScheduledSeoPublishJob() {
  const now = new Date();
  const dueArticles = await prisma.seoArticle.findMany({
    where: {
      status: 'approved_scheduled',
      scheduledPublishAt: { lte: now },
    },
  });

  let publishedCount = 0;
  for (const article of dueArticles) {
    try {
      const cmsRes = await publishArticleViaWordPressAdapter(article);
      await prisma.seoArticle.update({
        where: { id: article.id },
        data: {
          status: 'published',
          publishedAt: now,
          publishedUrl: cmsRes.publishedUrl,
          lastPublishError: null,
          publishAttemptCount: { increment: 1 },
          version: { increment: 1 },
        },
      });
      publishedCount += 1;
    } catch (err) {
      await prisma.seoArticle.update({
        where: { id: article.id },
        data: {
          lastPublishError:
            err instanceof Error ? err.message : 'Lỗi kết nối CMS khi chạy tác vụ hẹn giờ.',
          publishAttemptCount: { increment: 1 },
        },
      });
    }
  }

  return { scanned: dueArticles.length, publishedCount };
}

/**
 * 5. Cảnh báo báo giá > 7 ngày chưa phản hồi (UC02)
 */
export async function runDailyOverdueQuoteReminderJob() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const overdueLeads = await prisma.lead.findMany({
    where: {
      isSpam: false,
      pipelineStatus: 'quote_sent',
      firstQuoteSentAt: { lte: sevenDaysAgo },
      quoteRespondedAt: null,
      OR: [
        { lastQuoteReminderAt: null },
        { lastQuoteReminderAt: { lte: oneDayAgo } },
      ],
    },
    select: {
      id: true,
      leadCode: true,
      companyName: true,
      contactName: true,
      assignedSalesId: true,
      firstQuoteSentAt: true,
    },
  });

  let notifiedCount = 0;
  for (const lead of overdueLeads) {
    if (lead.assignedSalesId) {
      await prisma.notification.create({
        data: {
          userId: lead.assignedSalesId,
          title: `Nhắc báo giá quá 7 ngày: ${lead.leadCode}`,
          summary: `Hồ sơ ${lead.companyName || lead.contactName || lead.leadCode} đã gửi báo giá quá 7 ngày nhưng chưa ghi nhận phản hồi từ khách hàng.`,
          category: 'Nhắc báo giá',
          actionLabel: 'Kiểm tra Lead',
          actionUrl: `/leads`,
          requiredPermission: 'LEAD_VIEW_OWN',
        },
      });
      notifiedCount += 1;
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: { lastQuoteReminderAt: now },
    });
  }

  return { scanned: overdueLeads.length, notifiedCount };
}

export type WorkerJobCode =
  | 'D3_SYNC_FULL'
  | 'GCLID_HOURLY_RETRY'
  | 'GOOGLE_LEAD_RECONCILE'
  | 'SEO_SCHEDULED_PUBLISH'
  | 'OVERDUE_QUOTE_REMINDER'
  | 'ALL_JOBS';

export interface AdapterConnectionStatusItem {
  code: string;
  name: string;
  moduleScope: string;
  mode: 'LIVE_CONNECTED' | 'SIMULATED_FALLBACK';
  envKeysRequired: string[];
  description: string;
}

export interface WorkerJobHistoryItem {
  id: number;
  jobCode: string;
  summary: string;
  durationMs: number;
  executedAt: string;
}

export function getAdapterReadinessMatrix(): AdapterConnectionStatusItem[] {
  const hasGoogleAds = Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim() &&
      process.env.GOOGLE_ADS_CLIENT_ID?.trim(),
  );
  const hasGa4Gsc = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
  const hasWpCms = Boolean(
    process.env.WP_APP_USER?.trim() && process.env.WP_APP_PASSWORD?.trim(),
  );
  const hasWebhookSecret = Boolean(process.env.WEBHOOK_SHARED_SECRET?.trim());
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENAI_API_KEY?.trim(),
  );

  return [
    {
      code: 'WEB_WEBHOOK_GTM',
      name: 'Webhook Form 3 Website & GTM (toantrung.com.vn, bangled.vn, manhinhled.net.vn)',
      moduleScope: 'M01 Leads & M02 Tracking',
      mode: hasWebhookSecret ? 'LIVE_CONNECTED' : 'SIMULATED_FALLBACK',
      envKeysRequired: ['WEBHOOK_SHARED_SECRET'],
      description: hasWebhookSecret
        ? 'Đã cấu hình khóa xác thực Webhook nhận Lead trực tiếp từ 3 website.'
        : 'Đang mở chế độ nhận Payload thử nghiệm nội bộ (chưa khóa WEBHOOK_SHARED_SECRET).',
    },
    {
      code: 'GOOGLE_ADS_API',
      name: 'Google Ads API & Google Lead Form Extension',
      moduleScope: 'M02 Tracking & M03 Ads',
      mode: hasGoogleAds ? 'LIVE_CONNECTED' : 'SIMULATED_FALLBACK',
      envKeysRequired: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_REFRESH_TOKEN'],
      description: hasGoogleAds
        ? 'Kết nối trực tiếp Google Ads API để kéo chi phí chiến dịch và tra cứu gclid.'
        : 'Đang chạy bộ dữ liệu mô phỏng (Fixture Simulation) do chưa điền Google Ads Developer Token.',
    },
    {
      code: 'GA4_SEARCH_CONSOLE',
      name: 'Google Analytics 4 (Data API) & Google Search Console',
      moduleScope: 'M02 Tracking & M03 SEO',
      mode: hasGa4Gsc ? 'LIVE_CONNECTED' : 'SIMULATED_FALLBACK',
      envKeysRequired: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GA4_PROPERTY_IDS'],
      description: hasGa4Gsc
        ? 'Đang đồng bộ chỉ số Organic Clicks & Thứ hạng từ khóa thực tế từ GSC/GA4.'
        : 'Đang dùng dữ liệu mẫu nội bộ; tự động chuyển sang Live ngay khi cấp Service Account JSON.',
    },
    {
      code: 'WORDPRESS_CMS_REST',
      name: 'WordPress REST API (Đăng bài SEO lên 3 Website)',
      moduleScope: 'M03 SEO & Worker #4',
      mode: hasWpCms ? 'LIVE_CONNECTED' : 'SIMULATED_FALLBACK',
      envKeysRequired: ['WP_APP_USER', 'WP_APP_PASSWORD'],
      description: hasWpCms
        ? 'Đã kết nối Application Password — đẩy bài trực tiếp lên /wp-json/wp/v2/posts.'
        : 'Chế độ an toàn nội bộ: tạo đường dẫn bài viết chuẩn nhưng chưa đẩy ra ngoài internet.',
    },
    {
      code: 'GEMINI_IMAGEN_AI',
      name: 'Google Gemini 2.5 Flash & Imagen 3 (Dựng Phối cảnh 3D & Viết bài SEO)',
      moduleScope: 'M03 SEO & M05 AI Design',
      mode: hasGeminiKey ? 'LIVE_CONNECTED' : 'SIMULATED_FALLBACK',
      envKeysRequired: ['GEMINI_API_KEY'],
      description: hasGeminiKey
        ? 'Đang gọi trực tiếp mô hình Gemini / Imagen thật và ghi log Token/Cost vào D5.'
        : 'Đang dùng bộ sinh phối cảnh 3D & bài chuẩn kỹ thuật LED nội bộ (Local Fallback).',
    },
  ];
}

export async function executeWorkerJobByCode(
  jobCode: WorkerJobCode,
  actorUserId?: number,
): Promise<{
  jobCode: WorkerJobCode;
  summary: string;
  durationMs: number;
  executedAt: string;
}> {
  const startMs = Date.now();
  let summary = '';

  if (jobCode === 'D3_SYNC_FULL') {
    const res = await runScheduledD3SyncJob('FULL_0200');
    summary = `Đồng bộ D3 hoàn tất (${res.recordsSynced} bản ghi metric) & làm mới bộ nhớ đệm từ khóa SEO.`;
  } else if (jobCode === 'GCLID_HOURLY_RETRY') {
    const res = await runHourlyGclidRetryJob();
    summary = `Quét ${res.scanned} Lead thiếu chiến dịch -> Khớp thành công ${res.resolved} mã gclid.`;
  } else if (jobCode === 'GOOGLE_LEAD_RECONCILE') {
    const res = await runDailyGoogleLeadFormReconciliationJob();
    summary = `Đối soát Google Lead Form ngày ${res.reconcileDate}: CRM=${res.crmLeadCount}, Google=${res.platformReportedCount} (Chênh lệch: ${res.discrepancy}).`;
  } else if (jobCode === 'SEO_SCHEDULED_PUBLISH') {
    const res = await runScheduledSeoPublishJob();
    summary = `Quét ${res.scanned} bài SEO đến hạn -> Đã xuất bản tự động ${res.publishedCount} bài viết.`;
  } else if (jobCode === 'OVERDUE_QUOTE_REMINDER') {
    const res = await runDailyOverdueQuoteReminderJob();
    summary = `Quét ${res.scanned} báo giá quá hạn > 7 ngày -> Đã gửi ${res.notifiedCount} thông báo nhắc NVKD.`;
  } else {
    const [syncRes, gclidRes, seoRes, quoteRes] = await Promise.all([
      runScheduledD3SyncJob('LIGHT_1100'),
      runHourlyGclidRetryJob(),
      runScheduledSeoPublishJob(),
      runDailyOverdueQuoteReminderJob(),
    ]);
    await runDailyGoogleLeadFormReconciliationJob();
    summary = `Chạy trọn bộ 5 Worker Jobs: Đồng bộ ${syncRes.recordsSynced} metric, khớp ${gclidRes.resolved} gclid, đăng ${seoRes.publishedCount} bài SEO, nhắc ${quoteRes.notifiedCount} báo giá quá hạn.`;
  }

  const durationMs = Math.max(1, Date.now() - startMs);
  const executedAt = new Date().toISOString();

  await prisma.auditLog.create({
    data: {
      actorUserId: actorUserId || null,
      action: jobCode,
      targetType: 'WORKER_JOB',
      targetId: jobCode,
      detailsJson: JSON.stringify({
        summary,
        durationMs,
        executedAt,
      }),
    },
  });

  return {
    jobCode,
    summary,
    durationMs,
    executedAt,
  };
}

export async function getWorkerJobsHistory(limit = 10): Promise<WorkerJobHistoryItem[]> {
  const logs = await prisma.auditLog.findMany({
    where: { targetType: 'WORKER_JOB' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs.map((l) => {
    let parsed: { summary?: string; durationMs?: number } = {};
    if (l.detailsJson) {
      try {
        parsed = JSON.parse(l.detailsJson) as { summary?: string; durationMs?: number };
      } catch {
        // ignore
      }
    }
    return {
      id: l.id,
      jobCode: l.action,
      summary: parsed.summary || `Thực thi tác vụ định kỳ ${l.action}`,
      durationMs: parsed.durationMs || 12,
      executedAt: l.createdAt.toISOString(),
    };
  });
}

