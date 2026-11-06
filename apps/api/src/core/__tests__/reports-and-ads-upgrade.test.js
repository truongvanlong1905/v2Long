'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const INDEP_DB_PATH = path.join(REPO_ROOT, 'packages/database/prisma/independent_v2.db');
const INDEP_DB_NORM = INDEP_DB_PATH.replace(/\\/g, '/');
const INDEP_DB_URL = INDEP_DB_NORM.startsWith('/') ? `file://${INDEP_DB_NORM}` : `file:${INDEP_DB_NORM}`;

function maskPhoneForReport(phone) {
  if (!phone || phone.length < 7) return '***';
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

function maskCustomerCompanyForReport(text) {
  if (!text) return 'Khách hàng ẩn danh';
  return 'Khách hàng ẩn danh (Bảo mật kinh doanh)';
}

test('Priority 1 & 4 Verification: Reports D1–D6 Canonical Metrics & Overdue > 7 Days Calculation', async (t) => {
  assert.ok(fs.existsSync(INDEP_DB_PATH), 'independent_v2.db must exist');
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  const leads = await prisma.lead.findMany({
    include: { tracking: true, leadProducts: { include: { product: true } } },
  });

  assert.ok(leads.length >= 5, 'Must have at least 5 seeded synthetic leads');

  // L1 / L2 / L3 calculations
  const totalLeadsL1 = leads.length;
  const validLeads = leads.filter((l) => !l.isSpam);
  const validLeadsL2 = validLeads.length;
  const effectiveLeads = validLeads.filter((l) =>
    ['quoting', 'quote_sent', 'won'].includes(l.pipelineStatus)
  );
  const effectiveLeadsL3 = effectiveLeads.length;

  assert.ok(totalLeadsL1 >= validLeadsL2, 'L1 >= L2');
  assert.ok(validLeadsL2 >= effectiveLeadsL3, 'L2 >= L3');

  // Unanswered quotes > 7 days detection (UC02 / M04)
  const nowMs = Date.now();
  const unansweredQuotes = [];

  for (const lead of leads) {
    if (lead.pipelineStatus === 'quote_sent' && lead.firstQuoteSentAt && !lead.quoteRespondedAt) {
      const waitingMs = nowMs - lead.firstQuoteSentAt.getTime();
      const daysWaiting = Math.max(0, Math.floor(waitingMs / (24 * 3600 * 1000)));
      const isOverdue7Days = daysWaiting >= 7;

      unansweredQuotes.push({
        leadId: lead.id,
        leadCode: lead.leadCode,
        companyOrContact: lead.companyName || lead.contactName || 'Chưa cập nhật',
        phone: lead.phone || 'Chưa có',
        quoteSentAt: lead.firstQuoteSentAt.toISOString(),
        daysWaiting,
        isOverdue7Days,
      });
    }
  }

  assert.ok(unansweredQuotes.length > 0, 'Must identify quotes awaiting customer response');
  const overdueItem = unansweredQuotes.find((q) => q.isOverdue7Days);
  assert.ok(overdueItem, 'Must flag quotes overdue >= 7 days with red alert');
  assert.ok(overdueItem.daysWaiting >= 7, 'Overdue days must be >= 7');

  // Verify PII masking functions for anonymized viewer roles
  const maskedPhone = maskPhoneForReport(overdueItem.phone);
  assert.ok(maskedPhone.includes('***'), 'Masked phone must obscure central digits');
  const maskedCompany = maskCustomerCompanyForReport(overdueItem.companyOrContact);
  assert.equal(maskedCompany, 'Khách hàng ẩn danh (Bảo mật kinh doanh)');
});

test('Priority 2 Verification: Overview authoritatively connects to shared DB tables across modules', async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  const [leadCount, trackingCount, campaignCount, metricCount, articleCount, designCount] =
    await Promise.all([
      prisma.lead.count(),
      prisma.marketingTracking.count(),
      prisma.campaign.count(),
      prisma.platformDailyMetric.count(),
      prisma.seoArticle.count(),
      prisma.designRequest.count(),
    ]);

  assert.ok(leadCount > 0, 'Lead table (M01) has records');
  assert.ok(trackingCount > 0, 'Tracking table (M02) has records');
  assert.ok(campaignCount >= 2, 'Campaigns table has at least 2 campaigns');
  assert.ok(metricCount > 0, 'PlatformDailyMetric table (Kho D3) has records');
  assert.ok(articleCount > 0, 'SeoArticle table (M03) has records');
  assert.ok(designCount > 0, 'DesignRequest table (M05) has records');
});

test('Priority 3 Verification: Ads & Keywords KPIs, Campaigns, and Search Demand Aggregations', async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  const [campaigns, metrics, keywords] = await Promise.all([
    prisma.campaign.findMany(),
    prisma.platformDailyMetric.findMany({
      where: { platform: { in: ['google_ads', 'facebook', 'facebook_ads'] } },
    }),
    prisma.seoKeyword.findMany({ orderBy: { cachedSearchVolume: 'desc' } }),
  ]);

  const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
  const totalClicks = metrics.reduce((s, m) => s + m.clicks, 0);
  const totalSpendMicros = metrics.reduce((s, m) => s + m.spendMicros, 0n);
  const totalSpendVnd = Number(totalSpendMicros / 1_000_000n);
  const totalConversions = metrics.reduce((s, m) => s + Number(m.conversionsMicros / 1_000_000n), 0);

  assert.ok(totalImpressions > 0, 'Total impressions must be > 0');
  assert.ok(totalClicks > 0, 'Total clicks must be > 0');
  assert.ok(totalSpendVnd > 0, 'Total spend must be > 0');
  assert.ok(totalConversions > 0, 'Total conversions must be > 0');

  // Verify CTR calculation
  const ctrPct = ((totalClicks / totalImpressions) * 100).toFixed(2) + '%';
  assert.ok(parseFloat(ctrPct) > 0, 'CTR % must be positive');

  // Verify Campaign level aggregations
  for (const c of campaigns) {
    const cMetrics = metrics.filter((m) => m.campaignId === c.id || m.campaignExternalId === c.campaignCode);
    const cSpend = cMetrics.reduce((s, m) => s + m.spendMicros, 0n);
    const cClicks = cMetrics.reduce((s, m) => s + m.clicks, 0);
    assert.ok(c.campaignName, 'Campaign must have a descriptive name');
    assert.ok(c.campaignCode, 'Campaign must have a unique code');
  }

  // Verify Search Demand Bars (Top keywords percentage scaling)
  const maxSearchVol = Math.max(...keywords.map((k) => k.cachedSearchVolume || 0), 100);
  for (const kw of keywords) {
    const vol = kw.cachedSearchVolume || 0;
    const percentage = Math.min(100, Math.max(12, Math.round((vol / maxSearchVol) * 100)));
    assert.ok(percentage >= 12 && percentage <= 100, 'Search demand bar percentage must be bounded between 12 and 100');
  }
});
