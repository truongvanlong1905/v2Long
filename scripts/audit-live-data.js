const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const prisma = new PrismaClient();

async function audit() {
  console.log('================================================================');
  console.log('   BÁO CÁO ĐỐI SOÁT DỮ LIỆU THỰC TẾ HỆ THỐNG TOÀN TRUNG V2');
  console.log('================================================================\n');

  console.log('1. KẾT NỐI GOOGLE OAUTH 2.0:');
  const connSetting = await prisma.systemSetting.findUnique({ where: { key: 'google_oauth_connection' } });
  if (!connSetting) {
    console.log(' - Trạng thái: Chưa tìm thấy kết nối');
  } else {
    const conn = JSON.parse(connSetting.value);
    console.log(' - Email kết nối:', conn.connectedEmail);
    console.log(' - Lần đồng bộ gần nhất:', conn.lastSyncAt);
  }

  console.log('\n2. DỮ LIỆU GOOGLE ANALYTICS 4 (GA4) THẬT TRONG DATABASE:');
  const ga4Metrics = await prisma.platformDailyMetric.findMany({ where: { platform: 'ga4' } });
  const ga4Props = [...new Set(ga4Metrics.map(m => m.accountPropertyId))];
  const propNames = {
    '512879968': 'toantrung.com.vn',
    '509190194': 'manhinhled.net.vn',
    '538179128': 'bangled.vn',
    '508951192': 'Toàn Trung - Bảng điện tử',
  };
  for (const pid of ga4Props) {
    const rows = ga4Metrics.filter(m => m.accountPropertyId === pid);
    const totalViews = rows.reduce((s, r) => s + (r.pageViews || 0), 0);
    const name = propNames[pid] || pid;
    console.log(` - Website: ${name} (ID: ${pid})`);
    console.log(`   + Số trang được theo dõi: ${rows.length}`);
    console.log(`   + Tổng lượt xem trang (Pageviews): ${totalViews.toLocaleString('vi-VN')}`);
  }

  console.log('\n3. DỮ LIỆU GOOGLE SEARCH CONSOLE THẬT TRONG DATABASE:');
  const gscMetrics = await prisma.platformDailyMetric.findMany({ where: { platform: 'search_console' } });
  const gscSites = [...new Set(gscMetrics.map(m => m.accountPropertyId))];
  for (const s of gscSites) {
    const rows = gscMetrics.filter(m => m.accountPropertyId === s);
    const clicks = rows.reduce((acc, r) => acc + (r.clicks || 0), 0);
    const imps = rows.reduce((acc, r) => acc + (r.impressions || 0), 0);
    console.log(` - Website: ${s}`);
    console.log(`   + Số từ khóa tìm kiếm: ${rows.length}`);
    console.log(`   + Tổng lượt click tự nhiên (Clicks): ${clicks.toLocaleString('vi-VN')}`);
    console.log(`   + Tổng lượt hiển thị (Impressions): ${imps.toLocaleString('vi-VN')}`);
  }

  console.log('\n4. MẪU TỪ KHÓA TÌM KIẾM THỰC TẾ ĐƯỢC KHÁCH HÀNG GÕ VÀO GOOGLE:');
  const topQueries = gscMetrics
    .filter(m => m.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 8);
  topQueries.forEach((q, idx) => {
    console.log(`   ${idx + 1}. "${q.keywordRaw}" -> Clicks: ${q.clicks} | Hiển thị: ${q.impressions} | CTR: ${q.ctrPercent}% (Nguồn: ${q.accountPropertyId})`);
  });

  console.log('\n5. DỮ LIỆU LEAD CRM & ĐỐI SOÁT:');
  const leads = await prisma.lead.findMany({
    select: { id: true, leadCode: true, contactName: true, contactChannel: true, selfReportedSource: true }
  });
  console.log(` - Tổng số Lead trong CRM: ${leads.length}`);
  leads.forEach(l => {
    console.log(`   + Lead ${l.leadCode}: ${l.contactName} | Kênh: ${l.contactChannel}`);
  });

  console.log('\n6. KIỂM TRA MỨC ĐỘ SẠCH DỮ LIỆU (KHÔNG DÙNG MOCK):');
  const mockMetrics = await prisma.platformDailyMetric.count({
    where: { OR: [{ accountPropertyId: { contains: 'GADS-TT' } }, { accountPropertyId: { contains: 'MOCK' } }] }
  });
  const mockCampaigns = await prisma.campaign.count({
    where: { campaignCode: { contains: 'CAMP_LED_INDOOR' } }
  });
  console.log(` - Bản ghi rác/demo trong Metric: ${mockMetrics} -> ${mockMetrics === 0 ? 'SẠCH 100%' : 'CÒN MOCK'}`);
  console.log(` - Chiến dịch rác/demo trong Campaign: ${mockCampaigns} -> ${mockCampaigns === 0 ? 'SẠCH 100%' : 'CÒN MOCK'}`);
  console.log('================================================================\n');
}

audit()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect();
  });
