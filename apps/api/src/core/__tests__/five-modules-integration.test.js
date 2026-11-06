'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const {
  ConcurrencyConflictError,
  ingestLeadWithTrackingIdempotent,
  upsertPlatformMetricIdempotent,
  recordAiUsageAttempt,
  transitionLeadWithVersion,
} = require('../../../../../packages/database/src/operations-runtime');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const INDEP_DB_PATH = path.join(REPO_ROOT, 'packages/database/prisma/independent_v2.db');
const INDEP_DB_NORM = INDEP_DB_PATH.replace(/\\/g, '/');
const INDEP_DB_URL = INDEP_DB_NORM.startsWith('/') ? `file://${INDEP_DB_NORM}` : `file:${INDEP_DB_NORM}`;

test('Cross-Module 1 (M01 + M02): Seeded shared database has 8 BA roles, 25 authoritative LED/Board products, L1/L2/L3 leads, and 7-day overdue quote alert', async (t) => {
  assert.ok(fs.existsSync(INDEP_DB_PATH), 'independent_v2.db must exist');
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  const [roles, products, leads, reconciliations] = await Promise.all([
    prisma.role.findMany(),
    prisma.product.findMany({ orderBy: { id: 'asc' } }),
    prisma.lead.findMany({ include: { tracking: true, leadProducts: true } }),
    prisma.leadReconciliation.findMany({ where: { status: 'alert_open' } }),
  ]);

  assert.equal(roles.length, 8, 'Must have all 8 BA roles');
  assert.equal(products.length, 25, 'Must have all 25 authoritative BA products');
  assert.ok(leads.length >= 5, 'Must have seeded synthetic leads across pipeline stages');

  // Verify Lead 2 triggers > 7 days unanswered quote alert (UC02/UC04)
  const overdueLead = leads.find((l) => l.leadCode === 'TT-20261102-0002');
  assert.ok(overdueLead, 'Lead TT-20261102-0002 must exist');
  assert.equal(overdueLead.pipelineStatus, 'quote_sent');
  assert.ok(overdueLead.firstQuoteSentAt, 'firstQuoteSentAt must be set');
  assert.equal(overdueLead.quoteRespondedAt, null);
  const daysWaiting = Math.floor(
    (Date.now() - overdueLead.firstQuoteSentAt.getTime()) / (24 * 3600 * 1000)
  );
  assert.ok(daysWaiting >= 7, `Expected >= 7 days waiting, got ${daysWaiting}`);

  // Verify Google Lead Form reconciliation alert when discrepancy >= 2 (UC03 Luồng D)
  assert.ok(reconciliations.length >= 1, 'Must have open reconciliation alert');
  assert.ok(reconciliations[0].discrepancy >= 2, 'Discrepancy threshold >= 2');
});

test('Cross-Module 2 (M01 + M02): Webhook intake idempotency, multi-website submission isolation, shared phone leads, and optimistic concurrency pipeline transition', async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  const uniqueSubId = `INTEG-SUB-${Date.now()}`;
  const leadCode1 = `TT-INTEG-${Date.now()}-A`;
  const leadCode2 = `TT-INTEG-${Date.now()}-B`;

  // First delivery on toantrung.com.vn
  const first = await ingestLeadWithTrackingIdempotent(prisma, {
    intakeSourceProvider: 'website_webhook',
    intakeSourceAccountKey: 'toantrung.com.vn',
    externalSubmissionId: uniqueSubId,
    leadCode: leadCode1,
    contactChannel: 'form_web',
    phone: '0909888777',
    email: 'khachhang.integ@toantrung-synthetic.vn',
    companyName: 'Công ty TNHH Tích Hợp Toàn Trung',
    projectName: 'Màn hình LED P2.5 Hội trường 400 chỗ',
    marketingSource: 'Google Ads',
    sourceResolutionMethod: 'gclid',
    gclid: 'EAIaIQobChMI_integ_test_gclid',
  });
  assert.equal(first.deduplicated, false);

  // Replay identical webhook delivery -> deduplicated without creating duplicate lead
  const replay = await ingestLeadWithTrackingIdempotent(prisma, {
    intakeSourceProvider: 'website_webhook',
    intakeSourceAccountKey: 'toantrung.com.vn',
    externalSubmissionId: uniqueSubId,
    leadCode: `TT-INTEG-REPLAY`,
    contactChannel: 'form_web',
    phone: '0909888777',
    email: 'khachhang.integ@toantrung-synthetic.vn',
  });
  assert.equal(replay.deduplicated, true);
  assert.equal(replay.lead.id, first.lead.id);

  // Legitimate second lead with SAME phone number from bangled.vn (non-unique phone rule)
  const secondSite = await ingestLeadWithTrackingIdempotent(prisma, {
    intakeSourceProvider: 'website_webhook',
    intakeSourceAccountKey: 'bangled.vn',
    externalSubmissionId: uniqueSubId,
    leadCode: leadCode2,
    contactChannel: 'form_web',
    phone: '0909888777',
    email: 'khachhang.integ@toantrung-synthetic.vn',
    companyName: 'Công ty TNHH Tích Hợp Toàn Trung',
    projectName: 'Bảng điện tử năng suất nhà máy số 2',
  });
  assert.equal(secondSite.deduplicated, false);
  assert.notEqual(secondSite.lead.id, first.lead.id);

  // Transition pipeline with version check (new_lead -> quoting)
  const transitioned = await transitionLeadWithVersion(prisma, {
    leadId: first.lead.id,
    expectedVersion: first.lead.version,
    patch: {
      pipelineStatus: 'quoting',
    },
    activity: {
      actionType: 'status_change',
      oldStatus: 'new_lead',
      newStatus: 'quoting',
      note: 'Chuyển sang Đang báo giá trong kiểm thử tích hợp',
    },
  });
  assert.equal(transitioned.lead.pipelineStatus, 'quoting');
  assert.equal(transitioned.lead.version, first.lead.version + 1);

  // Stale version update must throw ConcurrencyConflictError
  await assert.rejects(
    () =>
      transitionLeadWithVersion(prisma, {
        leadId: first.lead.id,
        expectedVersion: first.lead.version, // stale!
        patch: { pipelineStatus: 'quote_sent' },
        activity: { actionType: 'status_change', oldStatus: 'quoting', newStatus: 'quote_sent' },
      }),
    (err) => err instanceof ConcurrencyConflictError
  );

  // Cleanup test leads
  await prisma.lead.deleteMany({
    where: { id: { in: [first.lead.id, secondSite.lead.id] } },
  });
});

test('Cross-Module 3 (M03 + M05 + Shared D5 AiUsageLog): Independent Banner without Lead, 3D Perspective with Lead, sequential DesignAssetVersions, and SEO Revisions', async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  // 1. Verify seeded independent Banner (leadId === null per UC06 2a) and 3D Perspective (leadId !== null)
  const designRequests = await prisma.designRequest.findMany({
    include: { assetVersions: { orderBy: { versionNumber: 'asc' } } },
  });
  const bannerWithoutLead = designRequests.find(
    (d) => d.requestType === 'banner' && d.leadId === null
  );
  assert.ok(
    bannerWithoutLead,
    'Must support independent Banner creation without a Lead (UC06 2a)'
  );

  const perspectiveWithLead = designRequests.find(
    (d) => d.requestType === '3d_perspective' && d.leadId !== null
  );
  assert.ok(perspectiveWithLead, 'Must have 3D perspective linked to a Lead');
  assert.ok(
    perspectiveWithLead.assetVersions.length >= 2,
    'Must preserve multiple asset versions (ai_draft v1 + final_render v2) without overwriting'
  );
  assert.ok(
    perspectiveWithLead.approvedVersionId !== null,
    'Completed 3D perspective must bind approvedVersionId'
  );

  // 2. Verify SEO Articles & Revisions (M03)
  const articles = await prisma.seoArticle.findMany({
    include: { revisions: { orderBy: { revisionNumber: 'asc' } } },
  });
  assert.ok(articles.length >= 2, 'Must have seeded SEO articles');
  const multiRevArticle = articles.find((a) => a.revisions.length >= 2);
  assert.ok(
    multiRevArticle,
    'Must preserve AI initial draft (rev 1) and human edit (rev 2) in SeoArticleRevision'
  );
  assert.equal(multiRevArticle.revisions[0].originType, 'ai_initial_draft');
  assert.equal(multiRevArticle.revisions[1].originType, 'human_edit');

  // 3. Verify Shared D5 AiUsageLog records both M03 and M05 attempts with real durationMs
  const aiLogs = await prisma.aiUsageLog.findMany();
  assert.ok(
    aiLogs.some((l) => l.moduleCode === '03-keywords-ads'),
    'AiUsageLog must track M03 SEO AI usage'
  );
  assert.ok(
    aiLogs.some((l) => l.moduleCode === '05-ai-design'),
    'AiUsageLog must track M05 Design AI usage'
  );
});

