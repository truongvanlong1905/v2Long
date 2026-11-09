import zlib from 'node:zlib';
import { prisma } from '@toantrung/database';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { buildStandardXlsxBuffer } from '../../../../../core/export/xlsx-builder';
import {
  createManualLead,
  exportAllLeadsForUser,
  shouldAnonymizeLeadForRole,
} from '../../../../../modules/01-leads/service';
import {
  CONTACT_CHANNEL_LABELS,
  HCM_DISTRICTS,
  PIPELINE_STATUS_LABELS,
  VIETNAM_PROVINCES,
  type ContactChannel,
  type PipelineStatus,
} from '@toantrung/contracts';

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

/**
 * Pure Node.js PKZip extractor for .xlsx workbooks (zero external dependencies)
 */
function extractZipEntries(buf: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Local file header signature

    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;

    // If bit 3 of general purpose flag is set, sizes may be in Central Directory instead
    if ((flags & 0x08) !== 0 && compressedSize === 0) {
      break;
    }

    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);
    try {
      if (method === 0) {
        entries.set(name, compressedData.toString('utf8'));
      } else if (method === 8) {
        const inflated = zlib.inflateRawSync(compressedData);
        entries.set(name, inflated.toString('utf8'));
      }
    } catch {
      // ignore non-text or corrupted entry
    }

    offset = dataStart + compressedSize;
  }

  // Fallback: read from Central Directory if local headers used data descriptors (flag bit 3)
  if (entries.size === 0) {
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        const totalEntries = buf.readUInt16LE(i + 10);
        let cdOffset = buf.readUInt32LE(i + 16);
        for (let e = 0; e < totalEntries && cdOffset + 46 <= buf.length; e++) {
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

function parseXlsxBufferToGrid(buf: Buffer): string[][] {
  const entries = extractZipEntries(buf);
  const sharedStrings: string[] = [];
  const sstXml = entries.get('xl/sharedStrings.xml');
  if (sstXml) {
    const siMatches = sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g);
    for (const m of siMatches) {
      const inner = m[1];
      const tMatches = Array.from(inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g));
      sharedStrings.push(tMatches.map((tm) => decodeXmlEntities(tm[1])).join(''));
    }
  }

  const sheetXml =
    entries.get('xl/worksheets/sheet1.xml') ||
    Array.from(entries.entries()).find(([k]) => k.startsWith('xl/worksheets/sheet'))?.[1];

  if (!sheetXml) {
    throw new Error('Không tìm thấy sheet dữ liệu trong file Excel (.xlsx).');
  }

  const rows: string[][] = [];
  const rowMatches = sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g);
  for (const rm of rowMatches) {
    const rowXml = rm[1];
    const rowCells: string[] = [];
    const cellMatches = rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g);
    let nextSequentialCol = 0;

    for (const cm of cellMatches) {
      const attrs = cm[1] || '';
      const content = cm[2] || '';
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const colIdx = refMatch ? letterToColIndex(refMatch[1]) : nextSequentialCol;
      nextSequentialCol = colIdx + 1;

      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : '';

      let val = '';
      if (cellType === 'inlineStr') {
        const tMatches = Array.from(content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g));
        val = tMatches.map((tm) => decodeXmlEntities(tm[1])).join('');
      } else if (cellType === 's') {
        const vMatch = content.match(/<v>(\d+)<\/v>/);
        if (vMatch) {
          val = sharedStrings[Number(vMatch[1])] ?? '';
        }
      } else {
        const vMatch = content.match(/<v>([\s\S]*?)<\/v>/);
        if (vMatch) {
          val = decodeXmlEntities(vMatch[1]);
        } else {
          const tMatches = Array.from(content.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g));
          val = tMatches.map((tm) => decodeXmlEntities(tm[1])).join('');
        }
      }

      if (val.startsWith("'")) {
        val = val.slice(1);
      }

      while (rowCells.length <= colIdx) {
        rowCells.push('');
      }
      rowCells[colIdx] = val.trim();
    }

    if (rowCells.some((c) => c !== '')) {
      rows.push(rowCells);
    }
  }

  return rows;
}

function parseCsvOrTsvToGrid(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '').trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const firstLine = lines[0] || '';
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

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

export interface ParsedExcelLeadRow {
  rowNumber: number;
  phone: string;
  contactName: string;
  companyName: string;
  projectName: string;
  email: string;
  source: string;
  region: string;
  address: string;
  productsText: string;
  note: string;
}

function mapGridToLeadRows(grid: string[][]): ParsedExcelLeadRow[] {
  if (grid.length === 0) return [];

  // Tìm dòng Header thực sự (bỏ qua các dòng tiêu đề / metadata ở đầu file Excel)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const joined = grid[i].join(' | ').toLowerCase();
    if (
      joined.includes('điện thoại') ||
      joined.includes('sđt') ||
      joined.includes('sdt') ||
      joined.includes('phone') ||
      (joined.includes('khách hàng') && joined.includes('nguồn'))
    ) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = grid[headerRowIdx].map((h) => h.toLowerCase().trim());
  const findCol = (keywords: string[], fallbackIdx: number): number => {
    const idx = headers.findIndex((h) => keywords.some((kw) => h.includes(kw)));
    return idx >= 0 ? idx : fallbackIdx;
  };

  const phoneCol = findCol(['điện thoại', 'sđt', 'sdt', 'phone', 'liên hệ & sđt'], 0);
  const contactCol = findCol(['người liên hệ', 'liên hệ', 'contact'], -1);
  const companyCol = findCol(['công ty', 'đơn vị', 'khách hàng', 'company'], 1);
  const projectCol = findCol(['dự án', 'công trình', 'project'], -1);
  const emailCol = findCol(['email', 'thư điện tử'], -1);
  const sourceCol = findCol(['nguồn', 'kênh', 'source'], -1);
  const regionCol = findCol(['khu vực', 'quận', 'tỉnh', 'region'], -1);
  const addressCol = findCol(['địa chỉ', 'address'], -1);
  const productCol = findCol(['sản phẩm', 'product', 'hạng mục'], -1);
  const noteCol = findCol(['ghi chú', 'nguyên nhân', 'nhu cầu', 'note'], -1);

  const result: ParsedExcelLeadRow[] = [];

  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const firstCellsJoined = row.slice(0, 4).join(' ').toLowerCase();
    if (
      firstCellsJoined.includes('tổng cộng') ||
      firstCellsJoined.includes('ghi chú phân quyền') ||
      firstCellsJoined.includes('định nghĩa tỷ lệ')
    ) {
      continue;
    }

    let rawPhoneCell = (row[phoneCol] || '').trim();
    let contactName = contactCol >= 0 && contactCol !== phoneCol ? (row[contactCol] || '').trim() : '';

    // Nếu cột là "Người Liên Hệ & SĐT" dạng "Anh Minh - 0909123456" thì tách tự động
    if (rawPhoneCell.includes(' - ')) {
      const parts = rawPhoneCell.split(' - ');
      const lastPart = parts[parts.length - 1].trim();
      if (/\d{7,}/.test(lastPart.replace(/\D/g, ''))) {
        if (!contactName) contactName = parts.slice(0, -1).join(' - ').trim();
        rawPhoneCell = lastPart;
      }
    }

    const digitsOnly = rawPhoneCell.replace(/\D/g, '');
    // Nếu SĐT bị mất số 0 ở đầu do Excel format Number (ví dụ 909123456 -> 0909123456)
    const normalizedPhone =
      digitsOnly.length === 9 && !digitsOnly.startsWith('0')
        ? `0${digitsOnly}`
        : rawPhoneCell;

    const companyName = companyCol >= 0 ? (row[companyCol] || '').trim() : '';
    const projectName = projectCol >= 0 ? (row[projectCol] || '').trim() : '';

    // Bỏ qua dòng trống hoàn toàn
    if (!normalizedPhone && !companyName && !contactName) continue;

    result.push({
      rowNumber: r + 1,
      phone: normalizedPhone,
      contactName,
      companyName,
      projectName,
      email: emailCol >= 0 ? (row[emailCol] || '').trim() : '',
      source: sourceCol >= 0 ? (row[sourceCol] || '').trim() : 'Website Toàn Trung',
      region: regionCol >= 0 ? (row[regionCol] || '').trim() : 'TP.HCM - TP. Thủ Đức',
      address: addressCol >= 0 ? (row[addressCol] || '').trim() : '',
      productsText: productCol >= 0 ? (row[productCol] || '').trim() : 'Màn hình LED Indoor',
      note: noteCol >= 0 ? (row[noteCol] || '').trim() : '',
    });
  }

  return result;
}

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const isTemplate = url.searchParams.get('template') === '1';

    if (isTemplate) {
      const templateBuffer = buildStandardXlsxBuffer([
        {
          name: 'Mau_Nhap_Lead',
          title: 'FILE MẪU NHẬP DANH SÁCH LEAD TOÀN TRUNG (.XLSX)',
          metadata: [
            {
              label: 'Hướng dẫn',
              value:
                'Điền danh sách khách hàng từ dòng thứ 6 trở đi. Cột Số Điện Thoại là bắt buộc. Khi tải lên hệ thống sẽ tự động kiểm tra trùng lặp và phân loại ngay.',
            },
          ],
          columns: [
            { header: 'Số Điện Thoại *', key: 'phone', width: 18, type: 'string' },
            { header: 'Người Liên Hệ', key: 'contactName', width: 22, type: 'string' },
            { header: 'Tên Khách Hàng / Công Ty', key: 'companyName', width: 30, type: 'string' },
            { header: 'Tên Dự Án', key: 'projectName', width: 28, type: 'string' },
            { header: 'Email', key: 'email', width: 24, type: 'string' },
            { header: 'Nguồn Dự Án', key: 'source', width: 22, type: 'string' },
            { header: 'Khu Vực', key: 'region', width: 24, type: 'string' },
            { header: 'Địa Chỉ Lắp Đặt', key: 'address', width: 30, type: 'string' },
            { header: 'Sản Phẩm Quan Tâm', key: 'products', width: 28, type: 'string' },
            { header: 'Ghi Chú Nhu Cầu', key: 'note', width: 32, type: 'string' },
          ],
          rows: [
            {
              phone: '0908100201',
              contactName: 'Anh Minh Hoàng (Test TH1: Khách cũ đã mua quay lại)',
              companyName: 'Công ty CP Trung tâm Hội nghị Ánh Dương',
              projectName: 'Màn hình LED Hội trường Ballroom Tầng 6',
              email: 'minh.hoang@anhduong.vn',
              source: 'Website Toàn Trung',
              region: 'TP.HCM - TP. Thủ Đức',
              address: 'Khu Công Nghệ Cao, Quận 9, TP. Thủ Đức',
              products: 'Màn hình LED Indoor',
              note: 'Trùng SĐT với hồ sơ TT-20261101-0001 đã Chốt thành công -> Hiện KHÁCH CŨ QUAY LẠI',
            },
            {
              phone: '0364759204',
              contactName: 'Anh Long (Test TH2: Khách thất bại quay lại)',
              companyName: 'Công ty TNHH Xây dựng Long Phát',
              projectName: 'Màn hình LED Phòng họp Tầng 2',
              email: 'long@longphat.vn',
              source: 'Zalo',
              region: 'TP.HCM - TP. Thủ Đức',
              address: 'Đường Võ Văn Ngân, TP. Thủ Đức',
              products: 'Màn hình LED Indoor',
              note: 'Trùng SĐT với hồ sơ TT-20261106-000720 từng Thất bại -> Hiện KHÁCH QUAY LẠI',
            },
            {
              phone: '0908100204',
              contactName: 'Bác sĩ Khanh (Test TH3: Trùng Lead đang mở)',
              companyName: 'Bệnh viện Đa khoa Quốc tế Minh Tâm',
              projectName: 'Màn hình LED Sảnh khám & Đồng hồ LED',
              email: 'khanh@minhtamhospital.vn',
              source: 'Google Ads',
              region: 'TP.HCM - Quận 7',
              address: 'Nguyễn Lương Bằng, Quận 7, TP.HCM',
              products: 'Màn hình LED Indoor, Đồng hồ LED',
              note: 'Trùng SĐT với hồ sơ TT-20261105-0004 đang mở -> Hiện CẢNH BÁO TRÙNG LEAD',
            },
            {
              phone: '0918888999',
              contactName: 'Chị Lan (Test TH4: Khách mới hợp lệ)',
              companyName: 'Nhà máy Sản xuất Hòa Bình',
              projectName: 'Bảng điện tử Năng suất & An toàn lao động',
              email: 'lan.bql@hoabinhfactory.vn',
              source: 'Zalo',
              region: 'Bình Dương',
              address: 'KCN VSIP 1, Thuận An, Bình Dương',
              products: 'Bảng Năng suất, Bảng An toàn lao động',
              note: 'SĐT hoàn toàn mới chưa từng có trong hệ thống -> Hiện Mới hợp lệ',
            },
            {
              phone: '0918888999',
              contactName: 'Chị Lan (Test TH5: Trùng SĐT ngay trong file Excel)',
              companyName: 'Nhà máy Sản xuất Hòa Bình',
              projectName: 'Bảng điện tử Năng suất (Dòng bị lặp trong file)',
              email: 'lan.bql@hoabinhfactory.vn',
              source: 'Website Toàn Trung',
              region: 'Bình Dương',
              address: 'KCN VSIP 1, Thuận An, Bình Dương',
              products: 'Bảng Năng suất',
              note: 'Lặp lại SĐT 0918888999 của dòng trên -> Hiện TRÙNG SĐT TRONG FILE EXCEL',
            },
          ],
        },
      ]);

      return new Response(new Uint8Array(templateBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="MauNhapLead_ToanTrung.xlsx"',
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const statusParam = url.searchParams.get('status') || undefined;
    const searchParam = url.searchParams.get('search') || undefined;
    const includeSpam = url.searchParams.get('includeSpam') === 'true';
    const overdueOnly = url.searchParams.get('overdueOnly') === 'true';
    const unreceivedOnly =
      url.searchParams.get('unreceived') === '1' ||
      url.searchParams.get('unreceivedOnly') === 'true';

    const isAnonymized = shouldAnonymizeLeadForRole(auth.user.roleCode);

    const { leads } = await exportAllLeadsForUser(auth.user, {
      status: statusParam as PipelineStatus | 'all' | undefined,
      search: searchParam,
      includeSpam,
      overdueOnly,
      unreceivedOnly,
    });

    const dateStamp = new Date().toISOString().slice(0, 10);

    const workingCount = leads.filter(
      (l) => l.pipelineStatus === 'new_lead' || l.pipelineStatus === 'quoting',
    ).length;
    const quoteSentCount = leads.filter((l) => l.pipelineStatus === 'quote_sent').length;
    const wonCount = leads.filter((l) => l.pipelineStatus === 'won').length;
    const lostCount = leads.filter((l) => l.pipelineStatus === 'lost').length;

    // Tính nhãn Trùng / Quay lại đồng bộ với giao diện LeadsWorkspace
    const classifyDuplicateForExport = (lead: (typeof leads)[number]): string => {
      if (lead.pipelineStatus === 'won' || lead.pipelineStatus === 'lost') {
        return 'Đã đóng hồ sơ';
      }
      const cleanPhone = lead.phone.replace(/\D/g, '');
      const normCompany = (lead.companyName || '').trim().toLowerCase();
      const sameCustomer = leads.filter((other) => {
        if (other.id === lead.id || other.spamStatus !== 'NONE') return false;
        const otherClean = other.phone.replace(/\D/g, '');
        const phoneMatch = cleanPhone && !cleanPhone.includes('*') && otherClean === cleanPhone;
        const compMatch =
          normCompany.length >= 5 && (other.companyName || '').trim().toLowerCase() === normCompany;
        return phoneMatch || compMatch;
      });

      const openDup = sameCustomer.find(
        (o) =>
          o.pipelineStatus === 'new_lead' ||
          o.pipelineStatus === 'quoting' ||
          o.pipelineStatus === 'quote_sent',
      );
      if (openDup) return `CẢNH BÁO TRÙNG LEAD (${openDup.leadCode})`;

      const wonDup = sameCustomer.find((o) => o.pipelineStatus === 'won');
      if (wonDup) return `KHÁCH CŨ QUAY LẠI (${wonDup.leadCode})`;

      const lostDup = sameCustomer.find((o) => o.pipelineStatus === 'lost');
      if (lostDup) return `KHÁCH QUAY LẠI (${lostDup.leadCode})`;

      return 'Hợp lệ (Mới)';
    };

    const buffer = buildStandardXlsxBuffer([
      {
        name: '01_Lead_Pipeline',
        title: `DANH SÁCH LEAD & PIPELINE TOÀN TRUNG — ${auth.user.fullName} (${auth.user.roleName})`,
        metadata: [
          { label: 'Thời gian xuất file', value: new Date().toLocaleString('vi-VN') },
          { label: 'Tổng số bản ghi', value: String(leads.length) },
          {
            label: 'Quyền xem',
            value: isAnonymized ? 'Ẩn danh PII (UC01 / Q03)' : 'Xem theo phạm vi phân quyền',
          },
        ],
        kpiSummary: [
          { label: 'Tổng Lead (L1/L2)', value: leads.length },
          { label: 'Đang làm việc', value: workingCount },
          { label: 'Đã gửi báo giá', value: quoteSentCount },
          { label: 'Chốt thành công', value: wonCount },
          { label: 'Thất bại', value: lostCount },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Lead', key: 'leadCode', width: 18, type: 'string' },
          { header: 'Số Điện Thoại', key: 'phone', width: 16, type: 'string' },
          { header: 'Người Liên Hệ', key: 'contactName', width: 20, type: 'string' },
          { header: 'Tên Khách Hàng / Công Ty', key: 'customerName', width: 30, type: 'string' },
          { header: 'Tên Dự Án', key: 'projectName', width: 28, type: 'string' },
          { header: 'Nguồn Dự Án', key: 'source', width: 20, type: 'string' },
          { header: 'Người Liên Hệ & SĐT', key: 'contactAndPhone', width: 26, type: 'string' },
          { header: 'Ngày', key: 'createdAt', width: 18, type: 'string' },
          { header: 'Khu Vực', key: 'region', width: 22, type: 'string' },
          { header: 'Địa Chỉ Lắp Đặt', key: 'address', width: 28, type: 'string' },
          { header: 'Sản Phẩm', key: 'products', width: 28, type: 'string' },
          { header: 'Tag Phân Loại (Indoor/Outdoor/BĐT)', key: 'productTags', width: 24, type: 'string' },
          { header: 'Trạng Thái', key: 'status', width: 20, type: 'string' },
          { header: 'Phân Loại Trùng / Quay Lại', key: 'duplicateBadge', width: 28, type: 'string' },
          { header: 'Ghi chú / Nguyên nhân', key: 'noteOrReason', width: 32, type: 'string' },
          { header: 'Sales Phụ Trách', key: 'salesName', width: 22, type: 'string' },
        ],
        rows: leads.map((l, idx) => {
          const tags = Array.from(
            new Set(
              l.products.map((p) => {
                const lower = p.productName.toLowerCase();
                if (p.category === 'BANG_DIEN_TU') return 'BĐT';
                if (lower.includes('outdoor') || lower.includes('ngoài trời')) return 'Outdoor';
                return 'Indoor';
              }),
            ),
          ).join(', ');

          return {
            stt: idx + 1,
            leadCode: l.leadCode,
            phone: l.phone,
            contactName: isAnonymized ? 'Ẩn danh' : l.contactName || 'Khách liên hệ',
            customerName: isAnonymized
              ? 'Khách hàng ẩn danh (UC01)'
              : l.companyName || l.contactName || 'Chưa cập nhật',
            projectName: l.projectName || '—',
            source:
              l.tracking?.marketingSource ||
              l.selfReportedSource ||
              (CONTACT_CHANNEL_LABELS as Record<string, string>)[l.contactChannel] ||
              l.contactChannel,
            contactAndPhone: isAnonymized
              ? l.phone
              : `${l.contactName || 'Khách hàng'} - ${l.phone}`,
            createdAt: l.createdAt.slice(0, 16).replace('T', ' '),
            region:
              l.areaType === 'hcm'
                ? `TP.HCM - ${l.hcmDistrict || ''}`
                : l.province || 'Chưa chọn tỉnh',
            address: isAnonymized ? 'Ẩn địa chỉ' : l.installationAddress || '—',
            products: l.products.map((p) => p.productName).join(', ') || 'Chưa chọn',
            productTags: tags || 'Indoor',
            status:
              l.spamStatus !== 'NONE'
                ? `Spam (${l.spamReason || ''})`
                : (PIPELINE_STATUS_LABELS as Record<string, string>)[l.pipelineStatus] ||
                  l.pipelineStatus,
            duplicateBadge: classifyDuplicateForExport(l),
            noteOrReason:
              l.lostReason ||
              l.reopenReason ||
              l.spamReason ||
              l.customProductNote ||
              l.initialNote ||
              '—',
            salesName: l.assignedSalesName || 'Chưa phân bổ',
          };
        }),
        summaryRow: {
          stt: '',
          leadCode: 'TỔNG CỘNG',
          phone: '—',
          contactName: '—',
          customerName: `${leads.length} hồ sơ Lead`,
          projectName: '—',
          source: '—',
          contactAndPhone: isAnonymized ? 'Đã ẩn danh PII' : 'Đầy đủ theo phân quyền',
          createdAt: dateStamp,
          region: 'Toàn quốc',
          address: '—',
          products: `Đang xử lý: ${workingCount} | Đã báo giá: ${quoteSentCount}`,
          productTags: '—',
          status: `Won: ${wonCount} | Lost: ${lostCount}`,
          duplicateBadge: '—',
          noteOrReason: `Win rate: ${leads.length > 0 ? ((wonCount / leads.length) * 100).toFixed(1) : '0.0'}%`,
          salesName: '—',
        },
        footerNotes: [
          'Ghi chú phân quyền: Vai trò Marketing/Content/Designer tự động nhận bản xuất ẩn danh SĐT và thông tin cá nhân khách hàng (UC01/Q03).',
          'Định nghĩa tỷ lệ chốt: Win rate tính từ Tổng số Lead chốt thành công (Won) chia cho Tổng số Lead hợp lệ trong phạm vi lọc.',
        ],
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'LEADS_EXPORTED',
        targetType: 'LeadExport',
        targetId: `xlsx_${leads.length}`,
        detailsJson: JSON.stringify({
          count: leads.length,
          status: statusParam || 'all',
          includeSpam,
          overdueOnly,
        }),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="DanhSachLead_ToanTrung_${dateStamp}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'LEAD_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xuất danh sách Lead.',
      400,
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePermissionSession(request, 'LEAD_CREATE');
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get('content-type') || '';

    // Mode 1: Parse uploaded .xlsx or .csv file into preview rows
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      const pastedText = formData.get('pastedText');

      let grid: string[][] = [];
      if (file && typeof file === 'object' && 'arrayBuffer' in file) {
        const arrayBuf = await (file as Blob).arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        const fileName = ((file as File).name || '').toLowerCase();

        // Check PKZip signature (0x04034b50) for .xlsx
        if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) {
          grid = parseXlsxBufferToGrid(buf);
        } else if (fileName.endsWith('.xlsx')) {
          throw new Error('File .xlsx không đúng định dạng chuẩn OpenXML.');
        } else {
          grid = parseCsvOrTsvToGrid(buf.toString('utf8'));
        }
      } else if (typeof pastedText === 'string' && pastedText.trim()) {
        grid = parseCsvOrTsvToGrid(pastedText);
      } else {
        return jsonError('EMPTY_IMPORT', 'Vui lòng chọn file Excel (.xlsx, .csv) hoặc dán dữ liệu.', 400);
      }

      const rows = mapGridToLeadRows(grid);
      return jsonSuccess({ rows });
    }

    // Mode 2: Commit bulk import of validated rows
    const body = (await request.json()) as {
      rows?: ParsedExcelLeadRow[];
    };

    const rowsToImport = Array.isArray(body.rows) ? body.rows : [];
    if (rowsToImport.length === 0) {
      return jsonError('EMPTY_ROWS', 'Không có dòng dữ liệu nào được chọn để nhập.', 400);
    }
    if (rowsToImport.length > 200) {
      return jsonError('TOO_MANY_ROWS', 'Mỗi lần nhập tối đa 200 dòng để đảm bảo kiểm soát chất lượng.', 400);
    }

    const activeProducts = await prisma.product.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });
    const defaultProductId = activeProducts[0]?.id || 1;

    const mapSourceToChannel = (src: string): 'hotline' | 'zalo' | 'email' | 'form_web' => {
      const lower = (src || '').toLowerCase();
      if (lower.includes('zalo')) return 'zalo';
      if (lower.includes('web') || lower.includes('landing') || lower.includes('form')) return 'form_web';
      if (lower.includes('email')) return 'email';
      return 'hotline';
    };

    const createdLeads: Array<{ id: number; leadCode: string; phone: string }> = [];
    const failedRows: Array<{ rowNumber: number; phone: string; error: string }> = [];

    for (const row of rowsToImport) {
      try {
        const cleanDigits = (row.phone || '').replace(/\D/g, '');
        if (cleanDigits.length < 8) {
          failedRows.push({
            rowNumber: row.rowNumber,
            phone: row.phone,
            error: 'Số điện thoại không hợp lệ (dưới 8 chữ số)',
          });
          continue;
        }

        // Match products by name or default to first product
        const matchedProductIds: number[] = [];
        if (row.productsText) {
          const parts = row.productsText
            .split(/[,;|]/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);
          for (const p of activeProducts) {
            const pNameLower = p.productName.toLowerCase();
            if (parts.some((part) => pNameLower.includes(part) || part.includes(pNameLower))) {
              matchedProductIds.push(p.id);
            }
          }
        }
        if (matchedProductIds.length === 0) {
          matchedProductIds.push(defaultProductId);
        }

        // Parse region (TP.HCM vs Tỉnh thành khác)
        const regionText = (row.region || '').trim();
        const isHcm =
          !regionText ||
          regionText.toLowerCase().includes('hcm') ||
          regionText.toLowerCase().includes('hồ chí minh') ||
          regionText.toLowerCase().includes('thủ đức') ||
          regionText.toLowerCase().includes('quận');

        let hcmDistrict: string | null = HCM_DISTRICTS[0];
        let province: string | null = 'TP. Hồ Chí Minh';

        if (isHcm) {
          const matchedDist = HCM_DISTRICTS.find((d) =>
            regionText.toLowerCase().includes(d.toLowerCase()),
          );
          hcmDistrict = matchedDist || HCM_DISTRICTS[0];
        } else {
          hcmDistrict = null;
          const matchedProv = VIETNAM_PROVINCES.find((p) =>
            regionText.toLowerCase().includes(p.toLowerCase()),
          );
          province = matchedProv || regionText || VIETNAM_PROVINCES[0];
        }

        const created = await createManualLead(auth.user, {
          contactChannel: mapSourceToChannel(row.source),
          phone: row.phone,
          contactName: row.contactName || null,
          companyName: row.companyName || null,
          projectName: row.projectName || null,
          email: row.email && row.email.includes('@') ? row.email : null,
          selfReportedSource: row.source || 'Nhập Excel',
          areaType: isHcm ? 'hcm' : 'other_province',
          hcmDistrict,
          province,
          installationAddress: row.address || null,
          productIds: matchedProductIds,
          customProductNote: row.note && row.note !== '—' ? row.note : null,
          initialNote: `[Nhập từ Excel dòng #${row.rowNumber}] ${row.note && row.note !== '—' ? row.note : ''}`.trim(),
          reassignToSalesId: null,
          reassignReason: null,
        });

        createdLeads.push({
          id: created.id,
          leadCode: created.leadCode,
          phone: row.phone,
        });
      } catch (rowErr) {
        failedRows.push({
          rowNumber: row.rowNumber,
          phone: row.phone,
          error: rowErr instanceof Error ? rowErr.message : 'Lỗi tạo hồ sơ',
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'LEADS_IMPORTED_EXCEL',
        targetType: 'LeadImport',
        targetId: `xlsx_import_${createdLeads.length}`,
        detailsJson: JSON.stringify({
          createdCount: createdLeads.length,
          failedCount: failedRows.length,
        }),
      },
    });

    return jsonSuccess({
      createdCount: createdLeads.length,
      failedCount: failedRows.length,
      createdLeads,
      failedRows,
    });
  } catch (err) {
    return jsonError(
      'LEAD_IMPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xử lý file Excel nhập vào.',
      400,
    );
  }
}
