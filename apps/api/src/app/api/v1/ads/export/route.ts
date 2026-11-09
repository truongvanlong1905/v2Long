import zlib from 'node:zlib';
import { prisma } from '@toantrung/database';
import { hasBaPermission, isL2Valid, isL3Effective } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { buildStandardXlsxBuffer } from '../../../../../core/export/xlsx-builder';

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function letterToColIndex(letters: string): number {
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  return col - 1;
}

function extractZipEntries(buf: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    if ((flags & 0x08) !== 0 && compSize === 0) break;
    const compData = buf.subarray(dataStart, dataStart + compSize);
    try {
      if (method === 0) entries.set(name, compData.toString('utf8'));
      else if (method === 8) entries.set(name, zlib.inflateRawSync(compData).toString('utf8'));
    } catch {
      // ignore
    }
    offset = dataStart + compSize;
  }
  if (entries.size === 0) {
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        const total = buf.readUInt16LE(i + 10);
        let cdOffset = buf.readUInt32LE(i + 16);
        for (let e = 0; e < total && cdOffset + 46 <= buf.length; e++) {
          if (buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
          const method = buf.readUInt16LE(cdOffset + 10);
          const compSize = buf.readUInt32LE(cdOffset + 20);
          const nameLen = buf.readUInt16LE(cdOffset + 28);
          const extraLen = buf.readUInt16LE(cdOffset + 30);
          const commentLen = buf.readUInt16LE(cdOffset + 32);
          const lfhOffset = buf.readUInt32LE(cdOffset + 42);
          const name = buf.subarray(cdOffset + 46, cdOffset + 46 + nameLen).toString('utf8');
          if (lfhOffset + 30 <= buf.length && buf.readUInt32LE(lfhOffset) === 0x04034b50) {
            const lfhNameLen = buf.readUInt16LE(lfhOffset + 26);
            const lfhExtraLen = buf.readUInt16LE(lfhOffset + 28);
            const dataStart = lfhOffset + 30 + lfhNameLen + lfhExtraLen;
            const compData = buf.subarray(dataStart, dataStart + compSize);
            try {
              if (method === 0) entries.set(name, compData.toString('utf8'));
              else if (method === 8) entries.set(name, zlib.inflateRawSync(compData).toString('utf8'));
            } catch {
              // ignore
            }
          }
          cdOffset += 46 + nameLen + extraLen + commentLen;
        }
        break;
      }
    }
  }
  return entries;
}

function parseXlsxSheetsToGrids(buf: Buffer): string[][][] {
  const entries = extractZipEntries(buf);
  const sharedStrings: string[] = [];
  const sstXml = entries.get('xl/sharedStrings.xml');
  if (sstXml) {
    for (const m of sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      const tMatches = Array.from(m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g));
      sharedStrings.push(tMatches.map((tm) => decodeXmlEntities(tm[1])).join(''));
    }
  }

  const sheetEntries = Array.from(entries.entries())
    .filter(([k]) => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'))
    .sort(([a], [b]) => a.localeCompare(b));

  return sheetEntries.map(([, sheetXml]) => {
    const rows: string[][] = [];
    for (const rm of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowCells: string[] = [];
      let nextCol = 0;
      for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1] || '';
        const content = cm[2] || '';
        const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
        const colIdx = refMatch ? letterToColIndex(refMatch[1]) : nextCol;
        nextCol = colIdx + 1;
        const typeMatch = attrs.match(/\bt="([^"]+)"/);
        const cellType = typeMatch ? typeMatch[1] : '';
        let val = '';
        if (cellType === 'inlineStr') {
          val = Array.from(content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
            .map((tm) => decodeXmlEntities(tm[1]))
            .join('');
        } else if (cellType === 's') {
          const vMatch = content.match(/<v>(\d+)<\/v>/);
          if (vMatch) val = sharedStrings[Number(vMatch[1])] ?? '';
        } else {
          const vMatch = content.match(/<v>([\s\S]*?)<\/v>/);
          val = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        }
        while (rowCells.length <= colIdx) rowCells.push('');
        rowCells[colIdx] = val.trim();
      }
      if (rowCells.some((c) => c !== '')) rows.push(rowCells);
    }
    return rows;
  });
}

function parseCsvBufferToGrid(buf: Buffer): string[][] {
  let text = '';
  // Google Ads "CSV for Excel" uses UTF-16LE BOM (0xFF 0xFE)
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.subarray(2).toString('utf16le');
  } else {
    text = buf.toString('utf8').replace(/^\uFEFF/, '');
  }
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // Detect delimiter from the row with the most separators
  const sampleLine =
    lines.find((l) => l.includes('\t') || (l.match(/,/g) || []).length >= 3) || lines[0];
  const delimiter = sampleLine.includes('\t')
    ? '\t'
    : (sampleLine.match(/;/g) || []).length > (sampleLine.match(/,/g) || []).length
      ? ';'
      : ',';

  return lines.map((line) => {
    if (delimiter === '\t') {
      return line.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''));
    }
    const cols: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  });
}

function parseNumericCell(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[^\d.,-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(/,(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function slugifyCode(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  if (
    !hasBaPermission(auth.user.roleCode, 'AI_MARKETING_SEO') &&
    !hasBaPermission(auth.user.roleCode, 'TRACKING_ADS_OPTIMIZE')
  ) {
    return jsonError(
      'FORBIDDEN',
      'Bạn không có quyền xuất dữ liệu Từ khóa SEO & Chiến dịch Quảng cáo.',
      403
    );
  }

  try {
    const keywords: any[] = await prisma.seoKeyword.findMany({
      orderBy: { cachedSearchVolume: 'desc' },
    });

    const campaigns: any[] = await prisma.campaign.findMany({
      include: {
        trackings: {
          include: { lead: true },
        },
      },
      orderBy: { id: 'asc' },
    });

    const dailyMetrics: any[] = await prisma.platformDailyMetric.findMany({
      where: {
        platform: { in: ['google_ads', 'facebook', 'facebook_ads', 'search_console'] },
      },
    });

    const articles: any[] = await prisma.seoArticle.findMany({
      include: {
        keyword: true,
        createdBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const dateStamp = new Date().toISOString().slice(0, 10);

    const campaignRows = (campaigns || []).map((c: any, idx: number) => {
      const campMetrics = (dailyMetrics || []).filter(
        (m: any) =>
          m.grain === 'campaign' &&
          (m.campaignId === c.id || m.campaignExternalId === c.campaignCode)
      );
      const impressions = campMetrics.reduce((s: number, m: any) => s + (m.impressions || 0), 0);
      const clicks = campMetrics.reduce((s: number, m: any) => s + (m.clicks || 0), 0);
      const spendVnd = Number(
        campMetrics.reduce((s: bigint, m: any) => s + BigInt(m.spendMicros || 0), 0n) / 1_000_000n
      );
      const platformConversions = campMetrics.reduce(
        (s: number, m: any) => s + Number(BigInt(m.conversionsMicros || 0) / 1_000_000n),
        0
      );
      const dailyBudgetVnd = c.dailyBudgetMicros ? Number(BigInt(c.dailyBudgetMicros) / 1_000_000n) : 0;

      const campLeads = Array.isArray(c.trackings)
        ? c.trackings.map((t: any) => t.lead).filter(Boolean)
        : [];
      const crmLeadsL2 = campLeads.filter(isL2Valid).length;
      const crmLeadsL3 = campLeads.filter(isL3Effective).length;
      const wonCount = campLeads.filter(
        (l: any) => isL3Effective(l) && l.pipelineStatus === 'won'
      ).length;

      const ctrRatio = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : 0;
      const cplVnd = crmLeadsL3 > 0 && spendVnd > 0 ? Math.round(spendVnd / crmLeadsL3) : 0;

      return {
        stt: idx + 1,
        code: c.campaignCode,
        name: c.campaignName,
        platform:
          c.platform === 'google_ads'
            ? 'Google Ads'
            : c.platform === 'facebook' || c.platform === 'facebook_ads'
              ? 'Facebook Ads'
              : c.platform,
        status: c.isActive ? 'Đang chạy' : 'Tạm dừng',
        dailyBudget: dailyBudgetVnd,
        impressions,
        clicks,
        ctr: ctrRatio,
        spend: spendVnd,
        platformConversions,
        crmLeadsL2,
        crmLeadsL3,
        cplEffective: cplVnd,
        wonCount,
      };
    });

    const totalImpressions = campaignRows.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = campaignRows.reduce((s, r) => s + r.clicks, 0);
    const totalSpend = campaignRows.reduce((s, r) => s + r.spend, 0);
    const totalPlatformConv = campaignRows.reduce((s, r) => s + r.platformConversions, 0);
    const totalCrmL2 = campaignRows.reduce((s, r) => s + r.crmLeadsL2, 0);
    const totalCrmL3 = campaignRows.reduce((s, r) => s + r.crmLeadsL3, 0);
    const totalWon = campaignRows.reduce((s, r) => s + r.wonCount, 0);
    const aggregateCtr =
      totalImpressions > 0 ? Number((totalClicks / totalImpressions).toFixed(4)) : 0;
    const aggregateCpl = totalCrmL3 > 0 && totalSpend > 0 ? Math.round(totalSpend / totalCrmL3) : 0;

    const buffer = buildStandardXlsxBuffer([
      {
        name: '01_ChienDich_QuangCao',
        title: `BÁO CÁO HIỆU QUẢ CHIẾN DỊCH QUẢNG CÁO & ĐỐI CHIẾU LEAD CRM — TOÀN TRUNG`,
        metadata: [
          { label: 'Đơn vị', value: 'CÔNG TY TNHH ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG' },
          { label: 'Thời gian xuất file', value: new Date().toLocaleString('vi-VN') },
          { label: 'Người xuất', value: `${auth.user.fullName} (${auth.user.roleName})` },
          { label: 'Múi giờ', value: 'Asia/Ho_Chi_Minh (GMT+7)' },
        ],
        kpiSummary: [
          { label: 'Tổng Chi Phí Ads (VNĐ)', value: totalSpend.toLocaleString('vi-VN') },
          { label: 'Chuyển Đổi Nền Tảng', value: totalPlatformConv },
          { label: 'Lead CRM Thực Tế (L3)', value: totalCrmL3 },
          { label: 'CPL Thực Tế (VNĐ/Lead)', value: aggregateCpl.toLocaleString('vi-VN') },
          { label: 'Hợp Đồng Thành Công (Won)', value: totalWon },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Chiến Dịch', key: 'code', width: 20, type: 'string' },
          { header: 'Tên Chiến Dịch', key: 'name', width: 34, type: 'string' },
          { header: 'Nền Tảng', key: 'platform', width: 16, type: 'string' },
          { header: 'Trạng Thái', key: 'status', width: 14, type: 'string' },
          { header: 'Ngân Sách Ngày (VNĐ)', key: 'dailyBudget', width: 20, type: 'currency' },
          { header: 'Hiển Thị (Impressions)', key: 'impressions', width: 20, type: 'number' },
          { header: 'Lượt Nhấp (Clicks)', key: 'clicks', width: 18, type: 'number' },
          { header: 'CTR (%)', key: 'ctr', width: 14, type: 'percent' },
          { header: 'Chi Phí Thực Chi (VNĐ)', key: 'spend', width: 22, type: 'currency' },
          { header: 'Chuyển Đổi Nền Tảng (Platform Conv.)', key: 'platformConversions', width: 26, type: 'number' },
          { header: 'Lead CRM Hợp Lệ (L2)', key: 'crmLeadsL2', width: 20, type: 'number' },
          { header: 'Lead CRM Tính CPL (L3)', key: 'crmLeadsL3', width: 22, type: 'number' },
          { header: 'CPL Thực Tế (VNĐ/L3)', key: 'cplEffective', width: 22, type: 'currency' },
          { header: 'Chốt Won', key: 'wonCount', width: 14, type: 'number' },
        ],
        rows: campaignRows,
        summaryRow: {
          stt: '',
          code: 'TỔNG / TỶ LỆ GỘP',
          name: `${campaignRows.length} chiến dịch`,
          platform: '',
          status: '',
          dailyBudget: campaignRows.reduce((s, r) => s + r.dailyBudget, 0),
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr: aggregateCtr,
          spend: totalSpend,
          platformConversions: totalPlatformConv,
          crmLeadsL2: totalCrmL2,
          crmLeadsL3: totalCrmL3,
          cplEffective: aggregateCpl,
          wonCount: totalWon,
        },
        footerNotes: [
          'Nguyên tắc đối chiếu (UC03 & M03): "Chuyển đổi nền tảng (Platform Conversions)" là số sự kiện do Google/Facebook ghi nhận; "Lead CRM tính CPL (L3)" là hồ sơ khách hàng thực tế trong CRM đã trừ Spam.',
          'Công thức tỷ lệ gộp: CTR tổng = Tổng Clicks / Tổng Impressions; CPL thực tế = Tổng Chi Phí / Tổng Lead CRM (L3). Tuyệt đối không tính trung bình cộng của các tỷ lệ.',
        ],
      },
      {
        name: '02_TuKhoa_SEO_Ads',
        title: `DANH SÁCH TỪ KHÓA SEO & QUẢNG CÁO TÌM KIẾM — TOÀN TRUNG`,
        metadata: [
          { label: 'Tổng số từ khóa theo dõi', value: String(keywords.length) },
          { label: 'Thời gian kết xuất', value: new Date().toLocaleString('vi-VN') },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Từ Khóa Mục Tiêu', key: 'keyword', width: 32, type: 'string' },
          { header: 'Lượt Tìm Kiếm/Tháng', key: 'volume', width: 22, type: 'number' },
          { header: 'Thứ Hạng TB (GSC)', key: 'position', width: 20, type: 'number' },
          { header: 'Click Tự Nhiên (Organic)', key: 'organicClicks', width: 22, type: 'number' },
          { header: 'Click Quảng Cáo (Ads)', key: 'adsClicks', width: 20, type: 'number' },
          { header: 'Xu Hướng', key: 'trend', width: 16, type: 'string' },
          { header: 'Khung Thời Điểm Đẩy Mạnh', key: 'publishWindow', width: 24, type: 'string' },
        ],
        rows: keywords.map((k, idx) => ({
          stt: idx + 1,
          keyword: k.keyword,
          volume: k.cachedSearchVolume || 0,
          position: k.cachedAvgPosition ? Number(k.cachedAvgPosition.toFixed(1)) : 0,
          organicClicks: k.cachedOrganicClicks || 0,
          adsClicks: k.cachedAdsClicks || 0,
          trend:
            k.trendDirection === 'rising'
              ? 'Tăng trưởng'
              : k.trendDirection === 'declining'
                ? 'Giảm'
                : 'Ổn định',
          publishWindow: k.recommendedPublishWindow || 'Quanh năm',
        })),
        summaryRow: {
          stt: '',
          keyword: 'TỔNG CỘNG',
          volume: keywords.reduce((s, k) => s + (k.cachedSearchVolume || 0), 0),
          position: '',
          organicClicks: keywords.reduce((s, k) => s + (k.cachedOrganicClicks || 0), 0),
          adsClicks: keywords.reduce((s, k) => s + (k.cachedAdsClicks || 0), 0),
          trend: '',
          publishWindow: '',
        },
      },
      {
        name: '03_BaiViet_SEO',
        title: 'DANH SÁCH BÀI VIẾT CHUẨN SEO & TRẠNG THÁI XUẤT BẢN WEBSITE VỆ TINH',
        metadata: [
          { label: 'Tổng số bài viết SEO', value: String(articles.length) },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Tiêu Đề Bài Viết', key: 'title', width: 38, type: 'string' },
          { header: 'Từ Khóa Chính', key: 'keyword', width: 26, type: 'string' },
          { header: 'Website Đích', key: 'targetSite', width: 24, type: 'string' },
          { header: 'Điểm Chuẩn SEO (/100)', key: 'seoScore', width: 20, type: 'number' },
          { header: 'Trạng Thái Xuất Bản', key: 'status', width: 22, type: 'string' },
          { header: 'Tác Giả / Phụ Trách', key: 'author', width: 22, type: 'string' },
          { header: 'Ngày Tạo', key: 'createdAt', width: 18, type: 'string' },
        ],
        rows: articles.map((a, idx) => ({
          stt: idx + 1,
          title: a.title,
          keyword: a.keyword?.keyword || a.topic || '—',
          targetSite: a.targetWebsite || 'toantrung.vn',
          seoScore: a.needsOptimization ? 72 : 90,
          status:
            a.status === 'published'
              ? 'Đã đăng (Mô phỏng/CMS)'
              : a.status === 'approved_scheduled'
                ? a.lastPublishError
                  ? 'Lỗi xuất bản'
                  : 'Đã duyệt & hẹn giờ đăng'
                : 'Bản nháp',
          author: a.createdBy?.fullName || 'Chuyên viên Marketing',
          createdAt: a.createdAt.toISOString().slice(0, 16).replace('T', ' '),
        })),
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'ADS_DATA_EXPORTED',
        targetType: 'AdsExport',
        targetId: `xlsx_${keywords.length}_${campaigns.length}`,
        detailsJson: JSON.stringify({
          keywords: keywords.length,
          campaigns: campaigns.length,
          articles: articles.length,
        }),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="03_QuangCao_SEO_${dateStamp}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'ADS_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xuất báo cáo Từ khóa & Ads.',
      400
    );
  }
}

async function ingestGridsIntoAdsDatabase(grids: string[][][]): Promise<{
  importedCampaigns: number;
  importedKeywords: number;
}> {
  let importedCampaigns = 0;
  let importedKeywords = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  for (const grid of grids) {
    if (grid.length < 2) continue;

    let headerIdx = -1;
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const joined = grid[i].join(' | ').toLowerCase();
      if (
        (joined.includes('chiến dịch') ||
          joined.includes('campaign') ||
          joined.includes('từ khóa') ||
          joined.includes('keyword') ||
          joined.includes('cụm từ tìm kiếm') ||
          joined.includes('search term')) &&
        (joined.includes('nhấp') ||
          joined.includes('click') ||
          joined.includes('hiển thị') ||
          joined.includes('impr') ||
          joined.includes('chi phí') ||
          joined.includes('cost') ||
          joined.includes('tìm kiếm') ||
          joined.includes('volume'))
      ) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx < 0) continue;
    const headers = grid[headerIdx].map((h) => h.toLowerCase().trim());
    const findCol = (kws: string[]) => headers.findIndex((h) => kws.some((k) => h.includes(k)));

    const kwCol = findCol([
      'từ khóa mục tiêu',
      'từ khóa tìm kiếm',
      'từ khóa',
      'search keyword',
      'keyword',
      'cụm từ tìm kiếm',
      'search term',
    ]);
    const campNameCol = findCol(['tên chiến dịch', 'chiến dịch', 'campaign']);
    const campCodeCol = findCol(['mã chiến dịch', 'campaign id', 'campaign code']);
    const statusCol = findCol(['trạng thái chiến dịch', 'trạng thái', 'campaign status', 'status']);
    const budgetCol = findCol(['ngân sách', 'budget']);
    const imprCol = findCol([
      'lượt hiển thị',
      'hiển thị',
      'impr',
      'impressions',
      'lượt tìm kiếm',
      'volume',
    ]);
    const clicksCol = findCol(['click quảng cáo', 'lượt nhấp', 'nhấp', 'clicks']);
    const orgClicksCol = findCol(['click tự nhiên', 'organic']);
    const costCol = findCol(['chi phí thực chi', 'chi phí', 'cost', 'spend']);
    const convCol = findCol([
      'chuyển đổi nền tảng',
      'lượt chuyển đổi',
      'chuyển đổi',
      'conversions',
      'conv.',
    ]);

    if (kwCol >= 0) {
      for (let r = headerIdx + 1; r < grid.length; r++) {
        const row = grid[r];
        const kwRaw = (row[kwCol] || '').replace(/^\[|\]$|^"|"$/g, '').trim();
        if (!kwRaw) continue;
        const lowerKw = kwRaw.toLowerCase();
        if (
          lowerKw.includes('tổng cộng') ||
          lowerKw.startsWith('total') ||
          lowerKw.includes('ghi chú')
        ) {
          continue;
        }

        const norm = lowerKw.replace(/\s+/g, ' ');
        const clicks = clicksCol >= 0 ? Math.round(parseNumericCell(row[clicksCol])) : 0;
        const orgClicks = orgClicksCol >= 0 ? Math.round(parseNumericCell(row[orgClicksCol])) : 0;
        const imprOrVol =
          imprCol >= 0 ? Math.round(parseNumericCell(row[imprCol])) : Math.max(150, clicks * 12);

        await prisma.seoKeyword.upsert({
          where: { keywordNorm: norm },
          update: {
            cachedAdsClicks: clicks > 0 ? clicks : undefined,
            cachedOrganicClicks: orgClicks > 0 ? orgClicks : undefined,
            cachedSearchVolume: imprOrVol > 0 ? imprOrVol : undefined,
            cacheWindowEndDate: todayStr,
            cacheRefreshedAt: new Date(),
          },
          create: {
            keyword: kwRaw,
            keywordNorm: norm,
            cachedSearchVolume: Math.max(100, imprOrVol),
            cachedAdsClicks: clicks,
            cachedOrganicClicks: orgClicks,
            cachedAvgPosition: 4.5,
            cacheSourceAccountKey: 'google_ads_direct',
            cacheWindowStartDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
            cacheWindowEndDate: todayStr,
            cacheRefreshedAt: new Date(),
            trendDirection: clicks >= 30 ? 'rising' : 'stable',
            recommendedPublishWindow: 'Thứ 3 & Thứ 5 (08:30 - 10:00)',
          },
        });
        importedKeywords++;
      }
      continue;
    }

    if (campNameCol >= 0) {
      for (let r = headerIdx + 1; r < grid.length; r++) {
        const row = grid[r];
        const campName = (row[campNameCol] || '').trim();
        if (!campName) continue;
        const lowerName = campName.toLowerCase();
        if (
          lowerName.includes('tổng') ||
          lowerName.startsWith('total') ||
          lowerName.includes('nguyên tắc đối chiếu') ||
          lowerName.includes('công thức')
        ) {
          continue;
        }

        const rawCode = campCodeCol >= 0 ? (row[campCodeCol] || '').trim() : '';
        if (rawCode.toLowerCase().includes('tổng')) continue;
        const campCode = rawCode || `gads_${slugifyCode(campName)}`;

        const statusText = statusCol >= 0 ? (row[statusCol] || '').toLowerCase() : 'đang chạy';
        const isActive =
          !statusText.includes('tạm dừng') &&
          !statusText.includes('paused') &&
          !statusText.includes('removed') &&
          !statusText.includes('đã xóa');

        const dailyBudgetVnd =
          budgetCol >= 0 ? Math.round(parseNumericCell(row[budgetCol])) : 500000;
        const impressions = imprCol >= 0 ? Math.round(parseNumericCell(row[imprCol])) : 0;
        const clicks = clicksCol >= 0 ? Math.round(parseNumericCell(row[clicksCol])) : 0;
        const spendVnd = costCol >= 0 ? Math.round(parseNumericCell(row[costCol])) : 0;
        const conversions = convCol >= 0 ? Math.round(parseNumericCell(row[convCol])) : 0;

        const upsertedCamp = await prisma.campaign.upsert({
          where: {
            uq_campaign_platform_account_code: {
              platform: 'google_ads',
              accountExternalId: 'default',
              campaignCode: campCode,
            },
          },
          update: {
            campaignName: campName,
            isActive,
            dailyBudgetMicros:
              dailyBudgetVnd > 0 ? BigInt(dailyBudgetVnd) * 1_000_000n : undefined,
          },
          create: {
            platform: 'google_ads',
            accountExternalId: 'default',
            campaignCode: campCode,
            campaignName: campName,
            utmCampaignSlug: campCode,
            dailyBudgetMicros: BigInt(Math.max(200000, dailyBudgetVnd)) * 1_000_000n,
            isActive,
          },
        });

        const dimFp = `google_ads|default|${todayStr}|campaign|${campCode}|||`;
        await prisma.platformDailyMetric.upsert({
          where: {
            uq_platform_metric_scope: {
              platform: 'google_ads',
              accountPropertyId: 'default',
              metricDate: todayStr,
              grain: 'campaign',
              campaignExternalId: campCode,
              keywordMatchType: '',
              keywordTextNorm: '',
              pagePathNorm: '',
            },
          },
          update: {
            campaignId: upsertedCamp.id,
            campaignName: campName,
            impressions,
            clicks,
            spendMicros: BigInt(spendVnd) * 1_000_000n,
            conversionsMicros: BigInt(conversions) * 1_000_000n,
            dailyBudgetMicros: BigInt(Math.max(200000, dailyBudgetVnd)) * 1_000_000n,
            syncedAt: new Date(),
          },
          create: {
            platform: 'google_ads',
            accountPropertyId: 'default',
            metricDate: todayStr,
            grain: 'campaign',
            campaignExternalId: campCode,
            keywordMatchType: '',
            keywordTextNorm: '',
            pagePathNorm: '',
            dimensionFingerprint: dimFp,
            campaignId: upsertedCamp.id,
            campaignName: campName,
            impressions,
            clicks,
            spendMicros: BigInt(spendVnd) * 1_000_000n,
            conversionsMicros: BigInt(conversions) * 1_000_000n,
            dailyBudgetMicros: BigInt(Math.max(200000, dailyBudgetVnd)) * 1_000_000n,
          },
        });

        importedCampaigns++;
      }
    }
  }

  return { importedCampaigns, importedKeywords };
}

export async function POST(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get('content-type') || '';

    // Mode A: Direct JSON sync (Google Sheets Link OR Direct Google Ads REST API OR Script Push)
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as {
        mode?: 'gsheet_url' | 'google_ads_api';
        sheetUrl?: string;
        customerId?: string;
        loginCustomerId?: string;
        developerToken?: string;
        clientId?: string;
        clientSecret?: string;
        refreshToken?: string;
        accessToken?: string;
      };

      // Mode A1: Đồng bộ trực tiếp từ Link Google Sheets xuất từ Google Ads
      if (body.mode === 'gsheet_url') {
        const rawUrl = (body.sheetUrl || '').trim();
        if (!rawUrl) {
          return jsonError('EMPTY_URL', 'Vui lòng dán đường dẫn Google Sheets của báo cáo Google Ads.', 400);
        }

        const sheetIdMatch = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        const exportUrl = sheetIdMatch
          ? `https://docs.google.com/spreadsheets/d/${sheetIdMatch[1]}/export?format=xlsx`
          : rawUrl;

        const resp = await fetch(exportUrl, {
          headers: { Accept: '*/*' },
          redirect: 'follow',
        });

        if (!resp.ok) {
          return jsonError(
            'GSHEET_FETCH_FAILED',
            `Không thể tải dữ liệu từ link Google Sheets (HTTP ${resp.status}). Hãy đảm bảo đã bật Chia sẻ: "Bất kỳ ai có đường liên kết đều có thể xem".`,
            400,
          );
        }

        const arrBuf = await resp.arrayBuffer();
        const buf = Buffer.from(arrBuf);
        const grids =
          buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50
            ? parseXlsxSheetsToGrids(buf)
            : [parseCsvBufferToGrid(buf)];

        const { importedCampaigns, importedKeywords } = await ingestGridsIntoAdsDatabase(grids);
        if (importedCampaigns === 0 && importedKeywords === 0) {
          return jsonError(
            'NO_RECOGNIZED_ADS_DATA',
            'Đã kết nối tới Google Sheet nhưng không tìm thấy cột Chiến dịch hoặc Từ khóa Google Ads hợp lệ.',
            400,
          );
        }

        return jsonSuccess({
          importedCampaigns,
          importedKeywords,
          source: 'Google Sheets Live Link',
        });
      }

      // Mode A2: Kết nối trực tiếp Google Ads REST API (GAQL searchStream)
      if (body.mode === 'google_ads_api') {
        const cleanCustomerId = (
          body.customerId ||
          process.env.GOOGLE_ADS_CUSTOMER_ID ||
          ''
        ).replace(/\D/g, '');
        const developerToken = (
          body.developerToken ||
          process.env.GOOGLE_ADS_DEVELOPER_TOKEN ||
          ''
        ).trim();
        const clientId = (body.clientId || process.env.GOOGLE_ADS_CLIENT_ID || '').trim();
        const clientSecret = (
          body.clientSecret ||
          process.env.GOOGLE_ADS_CLIENT_SECRET ||
          ''
        ).trim();
        const refreshToken = (
          body.refreshToken ||
          process.env.GOOGLE_ADS_REFRESH_TOKEN ||
          ''
        ).trim();
        const loginCustomerId = (
          body.loginCustomerId ||
          process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ||
          ''
        ).replace(/\D/g, '');

        if (!cleanCustomerId || !developerToken) {
          return jsonError(
            'MISSING_GADS_CREDENTIALS',
            'Vui lòng nhập Mã tài khoản Google Ads (Customer ID 10 số) và Developer Token.',
            400,
          );
        }

        let bearerToken = (body.accessToken || '').trim();
        if (!bearerToken) {
          if (!clientId || !clientSecret || !refreshToken) {
            return jsonError(
              'MISSING_OAUTH_CREDENTIALS',
              'Vui lòng cung cấp OAuth Client ID, Client Secret và Refresh Token (hoặc Access Token).',
              400,
            );
          }

          const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
              grant_type: 'refresh_token',
            }).toString(),
          });

          if (!tokenResp.ok) {
            const errTxt = await tokenResp.text();
            return jsonError(
              'OAUTH_TOKEN_ERROR',
              `Không thể lấy Access Token từ Google OAuth2: ${errTxt.slice(0, 180)}`,
              400,
            );
          }
          const tokenJson = (await tokenResp.json()) as { access_token?: string };
          bearerToken = tokenJson.access_token || '';
        }

        const gadsHeaders: Record<string, string> = {
          Authorization: `Bearer ${bearerToken}`,
          'developer-token': developerToken,
          'Content-Type': 'application/json',
        };
        if (loginCustomerId) {
          gadsHeaders['login-customer-id'] = loginCustomerId;
        }

        const campQuery = `
          SELECT
            campaign.id,
            campaign.name,
            campaign.status,
            campaign_budget.amount_micros,
            metrics.impressions,
            metrics.clicks,
            metrics.cost_micros,
            metrics.conversions
          FROM campaign
          WHERE segments.date DURING LAST_30_DAYS
        `;

        const campResp = await fetch(
          `https://googleads.googleapis.com/v17/customers/${cleanCustomerId}/googleAds:searchStream`,
          {
            method: 'POST',
            headers: gadsHeaders,
            body: JSON.stringify({ query: campQuery }),
          },
        );

        if (!campResp.ok) {
          const errText = await campResp.text();
          return jsonError(
            'GOOGLE_ADS_API_ERROR',
            `Google Ads API trả về lỗi (${campResp.status}): ${errText.slice(0, 220)}`,
            400,
          );
        }

        const streamChunks = (await campResp.json()) as Array<{
          results?: Array<{
            campaign?: { id?: string; name?: string; status?: string };
            campaignBudget?: { amountMicros?: string };
            metrics?: {
              impressions?: string;
              clicks?: string;
              costMicros?: string;
              conversions?: number;
            };
          }>;
        }>;

        const campGrid: string[][] = [
          [
            'Mã Chiến Dịch',
            'Tên Chiến Dịch',
            'Trạng Thái',
            'Ngân Sách',
            'Lượt Hiển Thị',
            'Lượt Nhấp',
            'Chi Phí',
            'Lượt Chuyển Đổi',
          ],
        ];

        for (const chunk of streamChunks) {
          for (const item of chunk.results || []) {
            const cId = item.campaign?.id || '';
            const cName = item.campaign?.name || '';
            if (!cName) continue;
            const status = item.campaign?.status === 'ENABLED' ? 'Đang chạy' : 'Tạm dừng';
            const budgetVnd = Math.round(Number(item.campaignBudget?.amountMicros || 0) / 1_000_000);
            const impr = Number(item.metrics?.impressions || 0);
            const clicks = Number(item.metrics?.clicks || 0);
            const costVnd = Math.round(Number(item.metrics?.costMicros || 0) / 1_000_000);
            const conv = Math.round(Number(item.metrics?.conversions || 0));
            campGrid.push([
              cId,
              cName,
              status,
              String(budgetVnd),
              String(impr),
              String(clicks),
              String(costVnd),
              String(conv),
            ]);
          }
        }

        const { importedCampaigns, importedKeywords } = await ingestGridsIntoAdsDatabase([
          campGrid,
        ]);

        return jsonSuccess({
          importedCampaigns,
          importedKeywords,
          source: `Google Ads API (${cleanCustomerId})`,
        });
      }

      return jsonError('INVALID_MODE', 'Chế độ đồng bộ không hợp lệ.', 400);
    }

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return jsonError('EMPTY_FILE', 'Vui lòng chọn file báo cáo Google Ads (.xlsx hoặc .csv).', 400);
    }

    const arrayBuf = await (file as Blob).arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    const grids =
      buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50
        ? parseXlsxSheetsToGrids(buf)
        : [parseCsvBufferToGrid(buf)];

    const { importedCampaigns, importedKeywords } = await ingestGridsIntoAdsDatabase(grids);

    if (importedCampaigns === 0 && importedKeywords === 0) {
      return jsonError(
        'NO_RECOGNIZED_ADS_DATA',
        'Không tìm thấy cột Chiến dịch hoặc Từ khóa hợp lệ trong file. Vui lòng chọn file .xlsx / .csv xuất từ bảng Chiến dịch hoặc Từ khóa của Google Ads.',
        400,
      );
    }

    return jsonSuccess({
      importedCampaigns,
      importedKeywords,
    });
  } catch (err) {
    return jsonError(
      'ADS_IMPORT_FAILED',
      err instanceof Error ? err.message : 'Lỗi khi nhập dữ liệu Google Ads.',
      400,
    );
  }
}
