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
import { refreshKeywordDerivedCacheFromCanonicalMetrics } from '../modules/03-keywords-ads/service';

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
 * Chế độ giả lập (Q12): chỉ lưu nội bộ và tạo link xem trước, không gọi ra ngoài.
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
    const simulatedPreviewUrl = `https://${article.targetWebsite}/tin-tuc/${article.slug}?preview=simulated`;
    await prisma.seoArticle.update({
      where: { id: article.id },
      data: {
        status: 'published',
        publishedAt: now,
        publishedUrl: simulatedPreviewUrl,
        lastPublishError: null,
        publishAttemptCount: { increment: 1 },
        version: { increment: 1 },
      },
    });
    publishedCount += 1;
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
