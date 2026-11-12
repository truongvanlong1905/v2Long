const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));
const prisma = new PrismaClient();

async function runAudit() {
  console.log('=== BẮT ĐẦU KIỂM TOÁN DỮ LIỆU ĐỘC LẬP (READ-ONLY AUDIT) ===\n');

  // 1. Kiểm tra Lead chứa cụm từ nghi ngờ
  const leadsNghiKhaoGia = await prisma.lead.findMany({
    where: { companyName: { contains: '(Nghi khảo giá)' } },
    select: { id: true, leadCode: true, companyName: true, contactName: true, phone: true, createdAt: true },
  });
  console.log(`1. Lead có tên chứa "(Nghi khảo giá)": ${leadsNghiKhaoGia.length} bản ghi`);
  leadsNghiKhaoGia.forEach((l) => console.log(`   - [ID ${l.id}] ${l.leadCode}: ${l.companyName} (${l.contactName || 'N/A'}, SĐT: ${l.phone || 'N/A'})`));

  const demoCodes = await prisma.lead.findMany({
    where: { leadCode: { in: ['TT-20261101-0001', 'TT-20261102-0002', 'TT-20261104-0003', 'TT-20261105-0004', 'TT-20261105-0005'] } },
    select: { id: true, leadCode: true, companyName: true, createdAt: true },
  });
  console.log(`\n2. Lead có mã seed demo mẫu (TT-20261101-xxxx): ${demoCodes.length} bản ghi`);
  demoCodes.forEach((l) => console.log(`   - [ID ${l.id}] ${l.leadCode}: ${l.companyName}`));

  const syntheticEmails = await prisma.lead.findMany({
    where: { email: { contains: 'synthetic.vn' } },
    select: { id: true, leadCode: true, email: true },
  });
  console.log(`\n3. Lead có email chứa synthetic.vn: ${syntheticEmails.length} bản ghi`);

  // 4. Kiểm tra chiến dịch Google Ads bị lẫn traffic từ GA4 (Finding 2)
  const ga4CampaignsInGads = await prisma.campaign.findMany({
    where: { platform: 'google_ads', accountExternalId: { startsWith: 'GA4-' } },
    select: { id: true, campaignCode: true, campaignName: true, accountExternalId: true, isActive: true },
  });
  console.log(`\n4. Chiến dịch GA4 lưu sai thành google_ads (Finding 2): ${ga4CampaignsInGads.length} chiến dịch`);
  ga4CampaignsInGads.forEach((c) => console.log(`   - [ID ${c.id}] Code: ${c.campaignCode} | Tên: ${c.campaignName} | Account: ${c.accountExternalId}`));

  // 5. Kiểm tra metric có accountPropertyId giả lập (Finding 1)
  const mockPropertyMetrics = await prisma.platformDailyMetric.findMany({
    where: { accountPropertyId: { in: ['GADS-TT-01', 'GA4-TOANTRUNG-MAIN', 'sc-domain:toantrung.com.vn', '213025502', '889-102-4451'] } },
    select: { id: true, platform: true, accountPropertyId: true, metricDate: true, clicks: true, impressions: true },
  });
  console.log(`\n5. Bản ghi PlatformDailyMetric mang ID giả lập cũ: ${mockPropertyMetrics.length} bản ghi`);

  // 6. Kiểm tra các metric GA4 thực tế đã lưu trong DB
  const realGa4Metrics = await prisma.platformDailyMetric.findMany({
    where: { platform: 'ga4' },
    select: { id: true, accountPropertyId: true, metricDate: true, grain: true, clicks: true, impressions: true, pageViews: true },
    orderBy: { metricDate: 'desc' },
    take: 10,
  });
  console.log(`\n6. Mẫu 10 bản ghi GA4 mới nhất trong DB: ${realGa4Metrics.length} bản ghi`);
  realGa4Metrics.forEach((m) => console.log(`   - Property: ${m.accountPropertyId} | Ngày: ${m.metricDate} | Grain: ${m.grain} | Users: ${m.clicks} | Views: ${m.pageViews}`));

  // 7. Kiểm tra các metric Search Console thực tế
  const realScMetrics = await prisma.platformDailyMetric.findMany({
    where: { platform: 'search_console' },
    select: { id: true, accountPropertyId: true, metricDate: true, grain: true, clicks: true, impressions: true, keywordRaw: true },
    orderBy: { metricDate: 'desc' },
    take: 10,
  });
  console.log(`\n7. Mẫu 10 bản ghi Search Console mới nhất trong DB: ${realScMetrics.length} bản ghi`);
  realScMetrics.forEach((m) => console.log(`   - Site: ${m.accountPropertyId} | Ngày: ${m.metricDate} | Grain: ${m.grain} | Clicks: ${m.clicks} | Impr: ${m.impressions} | Kw: ${m.keywordRaw || 'N/A'}`));

  console.log('\n=== KẾT THÚC KIỂM TOÁN (KHÔNG CÓ DỮ LIỆU NÀO BỊ XÓA) ===');
}

runAudit()
  .catch((err) => console.error('Lỗi kiểm toán:', err))
  .finally(() => prisma.$disconnect());

