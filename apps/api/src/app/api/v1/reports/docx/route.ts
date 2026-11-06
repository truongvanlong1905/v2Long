import { prisma } from '@toantrung/database';
import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { ZipArchive } from '../../../../../core/export/xlsx-builder';
import { getScopedReportsDashboard } from '../../../../../modules/04-reports/service';

function escXml(val: unknown): string {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function htmlToPlainLines(html: string): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
  return withBreaks
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function makeDocxParagraph(
  text: string,
  opts?: { bold?: boolean; sizeHalfPt?: number; colorHex?: string; align?: 'left' | 'center' | 'right'; spacingAfter?: number }
): string {
  const alignXml = opts?.align ? `<w:jc w:val="${opts.align}"/>` : '';
  const spacingXml = `<w:spacing w:before="60" w:after="${opts?.spacingAfter ?? 120}"/>`;
  const boldXml = opts?.bold ? '<w:b/>' : '';
  const sizeXml = `<w:sz w:val="${opts?.sizeHalfPt ?? 22}"/><w:szCs w:val="${opts?.sizeHalfPt ?? 22}"/>`;
  const colorXml = `<w:color w:val="${opts?.colorHex ?? '1E293B'}"/>`;
  return `<w:p>
    <w:pPr>${alignXml}${spacingXml}</w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>${boldXml}${sizeXml}${colorXml}</w:rPr>
      <w:t xml:space="preserve">${escXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function makeDocxTable(headers: string[], rows: string[][]): string {
  const headerCells = headers
    .map(
      (h) => `<w:tc>
        <w:tcPr>
          <w:shd w:val="clear" w:color="auto" w:fill="1E3A8A"/>
          <w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>
          <w:r>
            <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:b/><w:sz w:val="20"/><w:color w:val="FFFFFF"/></w:rPr>
            <w:t xml:space="preserve">${escXml(h)}</w:t>
          </w:r>
        </w:p>
      </w:tc>`
    )
    .join('');

  const bodyRows = rows
    .map((row, idx) => {
      const fill = idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
      const cells = row
        .map(
          (cell) => `<w:tc>
            <w:tcPr>
              <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
              <w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>
            </w:tcPr>
            <w:p>
              <w:pPr><w:spacing w:before="30" w:after="30"/></w:pPr>
              <w:r>
                <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="20"/><w:color w:val="1E293B"/></w:rPr>
                <w:t xml:space="preserve">${escXml(cell)}</w:t>
              </w:r>
            </w:p>
          </w:tc>`
        )
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tr>${headerCells}</w:tr>
    ${bodyRows}
  </w:tbl>`;
}

function buildGenuineDocxArchive(params: {
  reportTitle: string;
  docCode: string;
  reportingPeriod: string;
  scopeLabel: string;
  authorName: string;
  authorRole: string;
  kpiRows: string[][];
  sourceRows: string[][];
  salesRows: string[][];
  narrativeLines: string[];
}): Buffer {
  const zip = new ZipArchive();

  zip.addFile(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`
  );

  zip.addFile(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  zip.addFile(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`
  );

  zip.addFile(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>
        <w:sz w:val="22"/>
        <w:color w:val="1E293B"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`
  );

  zip.addFile(
    'word/footer1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr>
      <w:t xml:space="preserve">CÔNG TY TNHH ĐT VT TOÀN TRUNG · Mã văn bản: ${escXml(params.docCode)} · Trang </w:t>
    </w:r>
    <w:fldSimple w:instr="PAGE"/>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr>
      <w:t xml:space="preserve"> / </w:t>
    </w:r>
    <w:fldSimple w:instr="NUMPAGES"/>
  </w:p>
</w:ftr>`
  );

  const bodyParts: string[] = [
    makeDocxParagraph('CÔNG TY TNHH ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG', {
      bold: true,
      sizeHalfPt: 26,
      colorHex: '1E3A8A',
      align: 'center',
      spacingAfter: 60,
    }),
    makeDocxParagraph('HỆ THỐNG QUẢN TRỊ TĂNG TRƯỞNG MARKETING, KINH DOANH & STUDIO AI', {
      bold: false,
      sizeHalfPt: 18,
      colorHex: '475569',
      align: 'center',
      spacingAfter: 180,
    }),
    makeDocxParagraph(params.reportTitle.toUpperCase(), {
      bold: true,
      sizeHalfPt: 30,
      colorHex: '0F172A',
      align: 'center',
      spacingAfter: 120,
    }),
    makeDocxParagraph(
      `Mã văn bản: ${params.docCode}  |  Kỳ báo cáo: ${params.reportingPeriod}  |  Phạm vi: ${params.scopeLabel}`,
      { bold: true, sizeHalfPt: 20, colorHex: '334155', align: 'center', spacingAfter: 80 }
    ),
    makeDocxParagraph(
      `Người lập: ${params.authorName} (${params.authorRole})  |  Ngày xuất: ${new Date().toLocaleString('vi-VN')} (GMT+7)`,
      { bold: false, sizeHalfPt: 18, colorHex: '64748B', align: 'center', spacingAfter: 240 }
    ),
    makeDocxParagraph('I. TỔNG HỢP CHỈ SỐ ĐIỀU HÀNH TRỌNG YẾU (KPIs)', {
      bold: true,
      sizeHalfPt: 24,
      colorHex: '1E3A8A',
      spacingAfter: 120,
    }),
    makeDocxTable(['Chỉ tiêu điều hành', 'Giá trị ghi nhận', 'Ghi chú định nghĩa BA'], params.kpiRows),
  ];

  if (params.sourceRows.length > 0) {
    bodyParts.push(
      makeDocxParagraph('II. PHÂN TÍCH HIỆU QUẢ THEO NGUỒN / KÊNH MARKETING', {
        bold: true,
        sizeHalfPt: 24,
        colorHex: '1E3A8A',
        spacingAfter: 120,
      }),
      makeDocxTable(
        ['Nguồn Marketing', 'Lead hợp lệ (L2)', 'Lead hiệu quả (L3)', 'Đã gửi báo giá', 'Chốt Won', 'Tỷ lệ chốt'],
        params.sourceRows
      )
    );
  }

  if (params.salesRows.length > 0) {
    bodyParts.push(
      makeDocxParagraph('III. HIỆU SUẤT ĐỘI NGŨ KINH DOANH (SALES PIPELINE)', {
        bold: true,
        sizeHalfPt: 24,
        colorHex: '1E3A8A',
        spacingAfter: 120,
      }),
      makeDocxTable(
        ['Nhân sự Kinh doanh', 'Tổng Lead', 'Đang xử lý', 'Đã gửi BG', 'Quá hạn >7 ngày', 'Chốt Won'],
        params.salesRows
      )
    );
  }

  if (params.narrativeLines.length > 0) {
    bodyParts.push(
      makeDocxParagraph('IV. NHẬN ĐỊNH ĐIỀU HÀNH & ĐỀ XUẤT HÀNH ĐỘNG TRỌNG TÂM', {
        bold: true,
        sizeHalfPt: 24,
        colorHex: '1E3A8A',
        spacingAfter: 120,
      })
    );
    for (const line of params.narrativeLines) {
      bodyParts.push(makeDocxParagraph(line, { sizeHalfPt: 21, spacingAfter: 90 }));
    }
  }

  bodyParts.push(
    makeDocxParagraph(
      `TP. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`,
      { align: 'right', sizeHalfPt: 20, colorHex: '475569', spacingAfter: 80 }
    ),
    makeDocxParagraph(`NGƯỜI LẬP BÁO CÁO: ${params.authorName}`, {
      bold: true,
      align: 'right',
      sizeHalfPt: 21,
      colorHex: '1E3A8A',
      spacingAfter: 120,
    })
  );

  // Standard A4 Page Setup (11906 x 16838 twips) and Margins (Top/Right/Bottom = 2cm = 1134 twips; Left = 2.5cm = 1418 twips)
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join('\n    ')}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.addFile('word/document.xml', documentXml);
  return zip.toBuffer();
}

async function handleGenerateDocx(
  request: Request,
  customPayload?: {
    title?: string;
    docCode?: string;
    reportingPeriod?: string;
    contentHtml?: string;
    preset?: string;
  }
) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const preset = customPayload?.preset || url.searchParams.get('preset') || '30d';
    const fromDate = url.searchParams.get('fromDate') || undefined;
    const toDate = url.searchParams.get('toDate') || undefined;

    const dash = await getScopedReportsDashboard(auth.user, { preset, fromDate, toDate });
    const dateStamp = new Date().toISOString().slice(0, 10);
    const docCode = customPayload?.docCode || `TT-BC-${dateStamp.replace(/-/g, '')}`;
    const reportTitle =
      customPayload?.title ||
      `Báo cáo Điều hành Tổng hợp Toàn Trung (${dash.fromDate} đến ${dash.toDate})`;

    const kpiRows: string[][] = [
      [
        'Tổng Lead thu nhận (L1)',
        String(dash.overview.totalLeadsL1),
        'Toàn bộ Lead phát sinh trong kỳ báo cáo',
      ],
      [
        'Lead hợp lệ (L2)',
        String(dash.overview.validLeadsL2),
        'Lead hợp lệ (!isSpam) đưa vào Pipeline tư vấn',
      ],
      [
        'Lead hiệu quả tính CPL (L3)',
        String(dash.overview.effectiveLeadsL3),
        'Đã trừ Spam tự động & Spam đã xác nhận (UC03 BR6)',
      ],
      [
        'Đang làm việc / Báo giá chờ phản hồi',
        `${dash.overview.activeLeadsCount ?? dash.overview.quotingCount} / ${dash.overview.quoteSentCount}`,
        `Quá hạn báo giá >7 ngày: ${dash.overview.overdue7DaysQuoteCount}`,
      ],
      [
        'Hợp đồng thành công (Won) & Tỷ lệ chốt',
        `${dash.overview.wonCount} (${dash.overview.winRateText})`,
        'Tính trên tổng số Lead hợp lệ (L2)',
      ],
    ];

    if (dash.marketingSummary.totalAdsSpend) {
      kpiRows.push([
        'Tổng chi phí Quảng cáo & CPL thực tế',
        `${Number(dash.marketingSummary.totalAdsSpend.formattedDecimal).toLocaleString('vi-VN')} ₫ (CPL: ${
          dash.marketingSummary.cplEffective
            ? `${Math.round(Number(dash.marketingSummary.cplEffective.formattedDecimal)).toLocaleString('vi-VN')} ₫`
            : '—'
        })`,
        `Chuyển đổi nền tảng: ${dash.marketingSummary.platformReportedConversions ?? 0}`,
      ]);
    }

    const sourceRows: string[][] = (dash.marketingSummary.bySourceCampaign || []).map((s) => [
      `${s.sourceName} (${s.campaignName})`,
      String(s.crmValidL2),
      String(s.crmEffectiveL3),
      String(s.platformConversions),
      String(s.wonCount),
      s.crmValidL2 > 0 ? `${((s.wonCount / s.crmValidL2) * 100).toFixed(1)}%` : '0.0%',
    ]);

    const salesRows: string[][] = (dash.salesPerformance || []).map((sp) => [
      sp.salesFullName,
      String(sp.totalLeads),
      String(sp.newLeads + sp.quotingLeads),
      String(sp.quoteSentLeads),
      String(sp.unansweredOverdue7d),
      String(sp.wonLeads),
    ]);

    const narrativeLines = customPayload?.contentHtml
      ? htmlToPlainLines(customPayload.contentHtml)
      : [
          '1. Tập trung xử lý dứt điểm các hồ sơ Lead chưa xác nhận tiếp nhận và các báo giá đã gửi quá 7 ngày chưa có phản hồi.',
          '2. Tiếp tục đối chiếu độc lập giữa số liệu Chuyển đổi do nền tảng quảng cáo ghi nhận và Lead thực tế trong CRM (L3) để tối ưu ngân sách.',
          '3. Đẩy nhanh tiến độ phê duyệt các yêu cầu dựng Phối cảnh 3D LED tại Studio M05 để hỗ trợ đội ngũ Kinh doanh thuyết phục khách hàng dự án.',
        ];

    const docxBuffer = buildGenuineDocxArchive({
      reportTitle,
      docCode,
      reportingPeriod:
        customPayload?.reportingPeriod || `${dash.fromDate} → ${dash.toDate}`,
      scopeLabel: dash.scopeDescription,
      authorName: auth.user.fullName,
      authorRole: auth.user.roleName,
      kpiRows,
      sourceRows,
      salesRows,
      narrativeLines,
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'REPORT_DOCX_EXPORTED',
        targetType: 'ReportDocxExport',
        targetId: docCode,
        detailsJson: JSON.stringify({
          reportTitle,
          preset,
          bytes: docxBuffer.length,
        }),
      },
    });

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="04_BaoCao_DieuHanh_ToanTrung_${dateStamp}.docx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'REPORT_DOCX_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể kết xuất tệp Word (.docx) chuẩn OpenXML.',
      400
    );
  }
}

export async function GET(request: Request) {
  return handleGenerateDocx(request);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      docCode?: string;
      reportingPeriod?: string;
      contentHtml?: string;
      preset?: string;
    };
    return handleGenerateDocx(request, body);
  } catch {
    return handleGenerateDocx(request);
  }
}
