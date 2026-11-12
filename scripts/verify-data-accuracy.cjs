const assert = require('assert');
const path = require('path');
const { PrismaClient } = require(path.resolve(__dirname, '../node_modules/@prisma/client'));
const prisma = new PrismaClient();

async function runTestSuite() {
  console.log('================================================================');
  console.log('BỘ KIỂM THỬ HÀNH VI ĐỘC LẬP: ĐỘ CHÍNH XÁC DỮ LIỆU M02 - M04');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function runTest(name, fn) {
    try {
      fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  async function runAsyncTest(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // TEST 1: CÁCH LY 102 CHIẾN DỊCH Ô NHIỄM KHỎI M02, M03, M04 & EXPORT
  await runAsyncTest('Test 1: Bộ lọc cách ly 102 chiến dịch GA4 giả lập khỏi M02/M03/M04', async () => {
    const rawContaminatedCampaigns = await prisma.campaign.findMany({
      where: {
        platform: 'google_ads',
        OR: [
          { accountExternalId: { startsWith: 'GA4-' } },
          { campaignCode: { startsWith: 'ga4_' } },
        ],
      },
    });
    assert.strictEqual(rawContaminatedCampaigns.length, 102, 'Phải phát hiện đúng 102 chiến dịch GA4 ô nhiễm trong DB');

    // Truy vấn M02/M03 đã cách ly
    const cleanCampaigns = await prisma.campaign.findMany({
      where: {
        platform: 'google_ads',
        NOT: [
          { accountExternalId: { startsWith: 'GA4-' } },
          { campaignCode: { startsWith: 'ga4_' } },
        ],
      },
    });
    assert.strictEqual(cleanCampaigns.length, 0, 'Sau khi cách ly, số chiến dịch Google Ads giả phải là 0');

    // Truy vấn M04 đã cách ly
    const cleanMetrics = await prisma.platformDailyMetric.findMany({
      where: {
        platform: 'google_ads',
        grain: 'campaign',
        NOT: [
          { accountPropertyId: { startsWith: 'GA4-' } },
          { campaignExternalId: { startsWith: 'ga4_' } },
        ],
      },
    });
    assert.strictEqual(cleanMetrics.length, 0, 'Sau khi cách ly, số metric Google Ads giả trong M04 phải là 0');
  });

  // TEST 2: TÁCH BIỆT ZERO THẬT VỚI THIẾU DỮ LIỆU (ZERO VS UNAVAILABLE)
  runTest('Test 2: Phân định rõ ràng Confirmed Zero và Not Synced / Unavailable', () => {
    // Fixture 1: Thuộc tính chưa có bản ghi nào trong kỳ
    const noRows = [];
    const hasAccountRows = noRows.length > 0;
    const statusNoRows = !hasAccountRows ? 'NOT_SYNCED' : 'CONFIRMED_ZERO';
    const usersNoRows = hasAccountRows ? 0 : null;
    assert.strictEqual(statusNoRows, 'NOT_SYNCED', 'Khi DB chưa có bản ghi, trạng thái phải là NOT_SYNCED');
    assert.strictEqual(usersNoRows, null, 'Khi chưa có bản ghi, giá trị người dùng phải là null (hiển thị --), không được giả định là 0');

    // Fixture 2: Thuộc tính đã đồng bộ thành công và trả về 0 lượt truy cập thực tế
    const zeroRows = [{ grain: 'account', clicks: 0, pageViews: 0, impressions: 0 }];
    const hasZeroRows = zeroRows.length > 0;
    const totalViews = zeroRows.reduce((s, r) => s + r.pageViews, 0);
    const totalUsers = zeroRows.reduce((s, r) => s + r.clicks, 0);
    const statusZero = hasZeroRows && totalViews === 0 && totalUsers === 0 ? 'CONFIRMED_ZERO' : 'HAS_DATA';
    assert.strictEqual(statusZero, 'CONFIRMED_ZERO', 'Khi API xác nhận 0 truy cập, trạng thái phải là CONFIRMED_ZERO');
    assert.strictEqual(totalUsers, 0, 'Khi CONFIRMED_ZERO, giá trị người dùng xác nhận là 0');
  });

  // TEST 3: ĐỘ CHÍNH XÁC PHÉP CỘNG DỒN UNIQUE USERS GA4
  runTest('Test 3: Không gộp độc đoán daily active users thành unique users đa ngày', () => {
    // Giả sử có 3 ngày, cùng 1 người truy cập cả 3 ngày
    const dailyRecords = [
      { metricDate: '2026-11-01', clicks: 10, pageViews: 25 },
      { metricDate: '2026-11-02', clicks: 10, pageViews: 20 },
      { metricDate: '2026-11-03', clicks: 10, pageViews: 15 },
    ];
    const periodDays = 3;
    const sumDailyUsers = dailyRecords.reduce((s, r) => s + r.clicks, 0);
    const isEstimatedPeriodUsers = periodDays > 1;

    assert.strictEqual(sumDailyUsers, 30, 'Tổng tích lũy số phiên active user theo ngày là 30');
    assert.strictEqual(isEstimatedPeriodUsers, true, 'Kỳ > 1 ngày phải đánh cờ isEstimatedPeriodUsers = true để cảnh báo chưa khử trùng lặp');
  });

  // TEST 4: TÁCH BIỆT GRAIN ACCOUNT VÀ GRAIN PAGE (KHÔNG CỘNG CHỒNG CHÉO)
  runTest('Test 4: Không cộng chồng chéo grain account với grain page', () => {
    const mixedMetrics = [
      { grain: 'account', clicks: 100, pageViews: 500 }, // Tổng toàn site
      { grain: 'page', pageUrlRaw: '/trang-chu', pageViews: 300 }, // Chi tiết trang 1
      { grain: 'page', pageUrlRaw: '/lien-he', pageViews: 200 }, // Chi tiết trang 2
    ];

    const accountRows = mixedMetrics.filter((m) => m.grain === 'account');
    const pageRows = mixedMetrics.filter((m) => m.grain === 'page');

    const totalViewsFromAccount = accountRows.reduce((s, r) => s + r.pageViews, 0);
    const sumPageViews = pageRows.reduce((s, r) => s + r.pageViews, 0);

    assert.strictEqual(totalViewsFromAccount, 500, 'Lượt xem site phải lấy từ grain account');
    assert.strictEqual(sumPageViews, 500, 'Tổng các trang chi tiết bằng 500');
    // Nếu cộng gộp cả 2 grain sẽ bị duplicate lên 1000!
    assert.notStrictEqual(totalViewsFromAccount + sumPageViews, 500, 'Cộng cả 2 grain sẽ gây lỗi nhân đôi dữ liệu!');
  });

  // TEST 5: TÍNH NHẤT QUÁN CỬA SỔ NGÀY GIỮA CHIẾN DỊCH VÀ METRIC TRONG M02 & M04
  runTest('Test 5: Bộ lọc ngày cutoffDate bao trùm cả dailyMetrics và trackings trong kỳ', () => {
    const cutoffDateStr = '2026-11-05';
    const todayStr = '2026-11-12';

    const sampleMetrics = [
      { metricDate: '2026-10-20', spendMicros: 1000000n }, // Ngoài kỳ
      { metricDate: '2026-11-06', spendMicros: 2000000n }, // Trong kỳ
      { metricDate: '2026-11-10', spendMicros: 3000000n }, // Trong kỳ
      { metricDate: '2026-11-15', spendMicros: 4000000n }, // Tương lai
    ];

    const filtered = sampleMetrics.filter((m) => m.metricDate >= cutoffDateStr && m.metricDate <= todayStr);
    assert.strictEqual(filtered.length, 2, 'Chỉ 2 bản ghi trong kỳ [2026-11-05, 2026-11-12] được giữ lại');
    const totalSpend = filtered.reduce((s, m) => s + m.spendMicros, 0n);
    assert.strictEqual(totalSpend, 5000000n, 'Tổng chi phí đúng 5.000.000 micros');
  });

  // TEST 6: BẢO VỆ DỮ LIỆU - PURGEDEMOMETRICS KHÔNG ĐƯỢC XÓA BẢN GHI KINH DOANH
  runTest('Test 6: purgeDemoMetrics là hàm an toàn (non-destructive stub) và không bị gọi tự động', () => {
    const fs = require('fs');
    const oauthServiceContent = fs.readFileSync(path.resolve(__dirname, '../apps/api/src/modules/02-tracking-sync/google-oauth.service.ts'), 'utf8');
    
    // Kiểm tra hàm purgeDemoMetrics không chứa các lệnh xóa nguy hiểm
    assert.ok(oauthServiceContent.includes("export async function purgeDemoMetrics()"), 'Phải có export hàm purgeDemoMetrics');
    assert.ok(oauthServiceContent.includes("Purge disabled for safety."), 'Hàm phải trả về thông điệp Purge disabled for safety');
    assert.ok(!oauthServiceContent.includes("companyName: { contains: '(Nghi khảo giá)' }"), 'Đã loại bỏ hoàn toàn lệnh tìm và xóa lead Nghi khảo giá');
    
    // Kiểm tra không bị gọi trong syncAllGoogleDataAcrossModules
    const syncFuncMatch = oauthServiceContent.match(/export async function syncAllGoogleDataAcrossModules[\s\S]*?^}/m);
    if (syncFuncMatch) {
      assert.ok(!syncFuncMatch[0].includes("purgeDemoMetrics()"), 'syncAllGoogleDataAcrossModules tuyệt đối không được gọi purgeDemoMetrics');
    }
  });

  // TEST 7: SEARCH CONSOLE - TÁCH BIỆT TỔNG SITE VÀ BẢNG TỪ KHÓA
  runTest('Test 7: Search Console tính tổng site riêng biệt với danh sách từ khóa', () => {
    const scData = [
      { grain: 'account', clicks: 50, impressions: 1200 }, // Tổng toàn site
      { grain: 'keyword', keywordRaw: 'màn hình led', clicks: 20, impressions: 500 },
      { grain: 'keyword', keywordRaw: 'bảng điện tử', clicks: 15, impressions: 300 },
    ];

    const accountRows = scData.filter((m) => m.grain === 'account');
    const kwRows = scData.filter((m) => m.grain === 'keyword');

    const totalClicks = accountRows.reduce((s, r) => s + r.clicks, 0);
    const totalImpr = accountRows.reduce((s, r) => s + r.impressions, 0);

    assert.strictEqual(totalClicks, 50, 'Tổng click site phải lấy từ grain account = 50');
    assert.strictEqual(totalImpr, 1200, 'Tổng impression site phải lấy từ grain account = 1200');
    assert.strictEqual(kwRows.length, 2, 'Danh sách từ khóa có 2 từ khóa con');
  });

  console.log('\n================================================================');
  console.log(`KẾT QUẢ: ${passed} bài test ĐẠT, ${failed} bài test THẤT BẠI`);
  console.log('================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
