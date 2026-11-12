const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));
const prisma = new PrismaClient();

async function inspectContaminated() {
  console.log('=== ĐIỀU TRA CHI TIẾT 76 CHIẾN DỊCH GA4 BỊ PHÂN LOẠI SAI (FINDING 2 & 3) ===\n');

  // 1. Danh sách chiến dịch bị ô nhiễm
  const contaminatedCampaigns = await prisma.campaign.findMany({
    where: {
      platform: 'google_ads',
      OR: [
        { accountExternalId: { startsWith: 'GA4-' } },
        { campaignCode: { startsWith: 'ga4_' } },
      ],
    },
    include: {
      dailyMetrics: true,
      trackings: true,
    },
  });

  console.log(`1. Tổng số chiến dịch bị ô nhiễm: ${contaminatedCampaigns.length}`);
  const campIds = contaminatedCampaigns.map((c) => c.id);

  // 2. Các bản ghi PlatformDailyMetric liên kết
  const metricsLinked = await prisma.platformDailyMetric.findMany({
    where: {
      OR: [
        { campaignId: { in: campIds } },
        { campaignExternalId: { in: contaminatedCampaigns.map((c) => c.campaignCode) } },
        { accountPropertyId: { startsWith: 'GA4-' }, platform: 'google_ads' },
      ],
    },
  });

  console.log(`2. Tổng số bản ghi PlatformDailyMetric bị ô nhiễm: ${metricsLinked.length}`);

  let totalFakeClicks = 0;
  let totalFakeImpressions = 0;
  let totalFakeSpend = 0n;
  let totalFakeConversions = 0n;

  const datesImpacted = new Set();
  for (const m of metricsLinked) {
    totalFakeClicks += m.clicks;
    totalFakeImpressions += m.impressions;
    totalFakeSpend += m.spendMicros || 0n;
    totalFakeConversions += m.conversionsMicros || 0n;
    datesImpacted.add(m.metricDate);
  }

  console.log(`   - Clicks giả (bị biến từ GA4 sessions): ${totalFakeClicks}`);
  console.log(`   - Impressions giả (bị tính bằng Math.max(views, users, sessions)): ${totalFakeImpressions}`);
  console.log(`   - Spend giả: ${totalFakeSpend} (đều là 0)`);
  console.log(`   - Conversions: ${Number(totalFakeConversions / 1_000_000n)}`);
  console.log(`   - Các ngày bị ảnh hưởng trong DB: ${Array.from(datesImpacted).sort().join(', ')}`);

  // 3. Tác động tới M02 Dashboard:
  // Trong M02: prisma.campaign.findMany({ ... }) nếu không loại trừ sẽ liệt kê 76 chiến dịch này trong danh sách chiến dịch Ads!
  // Trong M02: CPL được tính dựa trên spend / L3. Khi spend = 0, CPL = null nhưng chiến dịch vẫn xuất hiện làm loãng danh sách.

  // 4. Tác động tới M04 Reports:
  // Trong M04: prisma.platformDailyMetric.findMany({ where: { platform: { in: ['google_ads', 'facebook', 'facebook_ads'] }, grain: 'campaign', metricDate: ... } })
  // MetricsLinked có platform: 'google_ads', grain: 'campaign'!
  // Do đó, M04 KÉO CẢ metricsLinked vào mảng metrics báo cáo chi phí & chuyển đổi!
  const m04AffectedCount = metricsLinked.filter((m) => m.grain === 'campaign').length;
  console.log(`\n3. Tác động tới M04 Reports (báo cáo chiến dịch & nguồn Marketing):`);
  console.log(`   - Số bản ghi metric bị M04 kéo vào: ${m04AffectedCount}`);

  // 5. Kiểm tra các bản ghi 30/90-day snapshots bị lưu nhầm thành daily records (Finding 3):
  const ga4AccountMetrics = await prisma.platformDailyMetric.findMany({
    where: { platform: 'ga4', grain: 'account' },
    select: { id: true, accountPropertyId: true, metricDate: true, clicks: true, pageViews: true, impressions: true },
  });
  console.log(`\n4. Các bản ghi GA4 account metrics hiện có: ${ga4AccountMetrics.length}`);
  ga4AccountMetrics.forEach((m) => {
    console.log(`   - [ID ${m.id}] Prop: ${m.accountPropertyId} | Ngày: ${m.metricDate} | Users: ${m.clicks} | Views: ${m.pageViews} | Events: ${m.impressions}`);
  });

  const scAccountMetrics = await prisma.platformDailyMetric.findMany({
    where: { platform: 'search_console', grain: 'account' },
    select: { id: true, accountPropertyId: true, metricDate: true, clicks: true, impressions: true },
  });
  console.log(`\n5. Các bản ghi Search Console account metrics hiện có: ${scAccountMetrics.length}`);
  scAccountMetrics.forEach((m) => {
    console.log(`   - [ID ${m.id}] Site: ${m.accountPropertyId} | Ngày: ${m.metricDate} | Clicks: ${m.clicks} | Impr: ${m.impressions}`);
  });
}

inspectContaminated()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

