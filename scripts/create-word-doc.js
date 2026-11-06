const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// --- Helper for Zip Archive ---
class ZipArchive {
  constructor() {
    this.files = [];
  }

  addFile(name, content) {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const crc = this.computeCrc32(data);
    const compressed = zlib.deflateRawSync(data);
    this.files.push({ name, data, crc32: crc, compressed });
  }

  toBuffer() {
    const localHeaders = [];
    const centralDirs = [];
    let offset = 0;

    for (const file of this.files) {
      const nameBuf = Buffer.from(file.name, 'utf8');

      // Local file header (30 bytes + name)
      const lfh = Buffer.alloc(30 + nameBuf.length);
      lfh.writeUInt32LE(0x04034b50, 0);
      lfh.writeUInt16LE(20, 4);
      lfh.writeUInt16LE(0, 6);
      lfh.writeUInt16LE(8, 8); // Deflate
      lfh.writeUInt16LE(0, 10);
      lfh.writeUInt16LE(0, 12);
      lfh.writeUInt32LE(file.crc32, 14);
      lfh.writeUInt32LE(file.compressed.length, 18);
      lfh.writeUInt32LE(file.data.length, 22);
      lfh.writeUInt16LE(nameBuf.length, 26);
      lfh.writeUInt16LE(0, 28);
      nameBuf.copy(lfh, 30);

      localHeaders.push(lfh);
      localHeaders.push(file.compressed);

      // Central directory header (46 bytes + name)
      const cdh = Buffer.alloc(46 + nameBuf.length);
      cdh.writeUInt32LE(0x02014b50, 0);
      cdh.writeUInt16LE(20, 4);
      cdh.writeUInt16LE(20, 6);
      cdh.writeUInt16LE(0, 8);
      cdh.writeUInt16LE(8, 10);
      cdh.writeUInt16LE(0, 12);
      cdh.writeUInt16LE(0, 14);
      cdh.writeUInt32LE(file.crc32, 16);
      cdh.writeUInt32LE(file.compressed.length, 20);
      cdh.writeUInt32LE(file.data.length, 24);
      cdh.writeUInt16LE(nameBuf.length, 28);
      cdh.writeUInt16LE(0, 30);
      cdh.writeUInt16LE(0, 32);
      cdh.writeUInt16LE(0, 34);
      cdh.writeUInt16LE(0, 36);
      cdh.writeUInt32LE(0, 38);
      cdh.writeUInt32LE(offset, 42);
      nameBuf.copy(cdh, 46);

      centralDirs.push(cdh);
      offset += lfh.length + file.compressed.length;
    }

    const cdStart = offset;
    let cdSize = 0;
    for (const c of centralDirs) cdSize += c.length;

    // End of central directory record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.files.length, 8);
    eocd.writeUInt16LE(this.files.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localHeaders, ...centralDirs, eocd]);
  }

  computeCrc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];
      crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

function xmlEscape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- WordprocessingML Helpers ---
function p(text, options = {}) {
  const { bold, italic, size = 22, color = '2D3748', align = 'left', spaceAfter = 100, spaceBefore = 0 } = options;
  const jc = align !== 'left' ? `<w:jc w:val="${align}"/>` : '';
  const rPr = `
    <w:rPr>
      ${bold ? '<w:b/>' : ''}
      ${italic ? '<w:i/>' : ''}
      <w:color w:val="${color}"/>
      <w:sz w:val="${size}"/>
      <w:szCs w:val="${size}"/>
      <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
    </w:rPr>`;
  return `<w:p>
    <w:pPr>
      ${jc}
      <w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}"/>
    </w:pPr>
    <w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>
  </w:p>`;
}

function heading1(text) {
  return `<w:p>
    <w:pPr>
      <w:spacing w:before="240" w:after="100"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/>
        <w:color w:val="1E3A8A"/>
        <w:sz w:val="26"/>
        <w:szCs w:val="26"/>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      </w:rPr>
      <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
    </w:r>
  </w:p>`;
}

function heading2(text) {
  return `<w:p>
    <w:pPr>
      <w:spacing w:before="180" w:after="60"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/>
        <w:color w:val="2563EB"/>
        <w:sz w:val="23"/>
        <w:szCs w:val="23"/>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      </w:rPr>
      <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
    </w:r>
  </w:p>`;
}

function bullet(text, boldPrefix = '') {
  return `<w:p>
    <w:pPr>
      <w:ind w:left="400" w:hanging="240"/>
      <w:spacing w:before="30" w:after="50"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:b/>
        <w:color w:val="1E3A8A"/>
        <w:sz w:val="22"/>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      </w:rPr>
      <w:t>• </w:t>
    </w:r>
    ${boldPrefix ? `<w:r><w:rPr><w:b/><w:color w:val="1E293B"/><w:sz w:val="22"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t xml:space="preserve">${xmlEscape(boldPrefix)} </w:t></w:r>` : ''}
    <w:r>
      <w:rPr>
        <w:color w:val="334155"/>
        <w:sz w:val="22"/>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
      </w:rPr>
      <w:t xml:space="preserve">${xmlEscape(text)}</w:t>
    </w:r>
  </w:p>`;
}

function table(headers, rows, colWidths) {
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  const gridCols = colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');

  // Header row
  const headerCells = headers
    .map(
      (h, idx) => `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${colWidths[idx]}" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="1E3A8A"/>
        <w:tcMar>
          <w:top w:w="120" w:type="dxa"/>
          <w:bottom w:w="120" w:type="dxa"/>
          <w:left w:w="140" w:type="dxa"/>
          <w:right w:w="140" w:type="dxa"/>
        </w:tcMar>
      </w:tcPr>
      <w:p>
        <w:pPr><w:jc w:val="${idx === 0 ? 'center' : 'left'}"/></w:pPr>
        <w:r>
          <w:rPr>
            <w:b/>
            <w:color w:val="FFFFFF"/>
            <w:sz w:val="20"/>
            <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
          </w:rPr>
          <w:t xml:space="preserve">${xmlEscape(h)}</w:t>
        </w:r>
      </w:p>
    </w:tc>`
    )
    .join('');

  const headerRowXml = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${headerCells}</w:tr>`;

  // Data rows
  const dataRowsXml = rows
    .map((r, rIdx) => {
      const isZebra = rIdx % 2 === 1;
      const fill = isZebra ? 'F8FAFC' : 'FFFFFF';

      const cells = r
        .map(
          (c, cIdx) => `
      <w:tc>
        <w:tcPr>
          <w:tcW w:w="${colWidths[cIdx]}" w:type="dxa"/>
          <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
          <w:tcMar>
            <w:top w:w="100" w:type="dxa"/>
            <w:bottom w:w="100" w:type="dxa"/>
            <w:left w:w="140" w:type="dxa"/>
            <w:right w:w="140" w:type="dxa"/>
          </w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr><w:jc w:val="${cIdx === 0 ? 'center' : 'left'}"/></w:pPr>
          <w:r>
            <w:rPr>
              ${c.bold ? '<w:b/>' : ''}
              <w:color w:val="${c.color || '334155'}"/>
              <w:sz w:val="20"/>
              <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
            </w:rPr>
            <w:t xml:space="preserve">${xmlEscape(c.text || c)}</w:t>
          </w:r>
        </w:p>
      </w:tc>`
        )
        .join('');

      return `<w:tr>${cells}</w:tr>`;
    })
    .join('\n');

  return `
  <w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalW}" w:type="dxa"/>
      <w:jc w:val="center"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="6" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      ${gridCols}
    </w:tblGrid>
    ${headerRowXml}
    ${dataRowsXml}
  </w:tbl>
  <w:p><w:pPr><w:spacing w:after="160"/></w:pPr></w:p>`;
}

// Generate complete document XML body
function buildDocXml() {
  const parts = [];

  // Header Quốc hiệu & Tiêu ngữ
  parts.push(p('CÔNG TY CỔ PHẦN CÔNG NGHỆ TOÀN TRUNG', { bold: true, size: 22, color: '1E3A8A', align: 'center', spaceAfter: 30 }));
  parts.push(p('HỆ THỐNG QUẢN TRỊ MARKETING & BÁN HÀNG TẬP TRUNG (TOÀN TRUNG CRM V2)', { bold: true, size: 20, color: '64748B', align: 'center', spaceAfter: 100 }));
  parts.push(p('Số: 01/2026/TTr-MKT-IT                    ---o0o---                    TP. Hồ Chí Minh, ngày 06 tháng 11 năm 2026', { italic: true, size: 19, color: '64748B', align: 'center', spaceAfter: 200 }));

  // Tiêu đề chính
  parts.push(p('PHIẾU ĐỀ XUẤT CẤP QUYỀN TRUY CẬP & TÀI NGUYÊN KỸ THUẬT', { bold: true, size: 30, color: '1E3A8A', align: 'center', spaceAfter: 40 }));
  parts.push(p('V/v: Cung cấp thông tin kết nối, khóa API và cấp quyền vận hành Hệ thống Toàn Trung V2', { italic: true, size: 22, color: '475569', align: 'center', spaceAfter: 240 }));

  // Kính gửi
  parts.push(p('KÍNH GỬI:', { bold: true, size: 22, color: '1E3A8A', spaceAfter: 40 }));
  parts.push(bullet('Ban Giám Đốc Công ty Cổ phần Công nghệ Toàn Trung', 'Ban Lãnh Đạo:'));
  parts.push(bullet('Phụ trách Kỹ thuật / Quản trị hệ thống máy chủ (IT)', 'Bộ phận IT:'));
  parts.push(bullet('Trưởng phòng Marketing & Trưởng phòng Kinh doanh', 'Bộ phận Nghiệp vụ:'));
  parts.push(p('', { spaceAfter: 120 }));

  // Căn cứ
  parts.push(heading1('I. CĂN CỨ VÀ MỤC ĐÍCH ĐỀ XUẤT'));
  parts.push(p('Hiện tại, dự án nâng cấp phần mềm Hệ thống Marketing – Sales Toàn Trung V2 (gồm 5 phân hệ chuyên sâu: M01 Lead & Khách hàng, M02 Tracking & Đồng bộ, M03 Quảng cáo & SEO, M04 Báo cáo Canonical D1-D6, M05 Phối cảnh AI) đã hoàn tất 100% mã nguồn và kiểm thử đạt chuẩn (21/21 suite test PASS, tối ưu bộ nhớ 68MB, tốc độ xử lý 702 webhook/giây).'));
  parts.push(p('Để đưa hệ thống vào triển khai thực tế trên môi trường sản xuất (Production) cho toàn công ty sử dụng với dữ liệu thật, nhân viên kỹ thuật kính gửi Phiếu đề xuất này kính mong Ban Giám đốc và các bộ phận liên quan phê duyệt, cung cấp các quyền và tài nguyên chi tiết dưới đây.'));

  // Bảng tóm tắt
  parts.push(heading1('II. BẢNG TỔNG HỢP CÁC HẠNG MỤC CẦN CÔNG TY BÀN GIAO'));
  const summaryHeaders = ['STT', 'Nhóm Tài nguyên', 'Bộ phận cấp', 'Mức độ ưu tiên', 'Mục đích giải quyết'];
  const summaryRows = [
    [
      { text: '1' },
      { text: 'Tài khoản Google Ads, GA4, Search Console, Meta', bold: true },
      { text: 'Marketing / Ads' },
      { text: 'Bắt buộc', color: 'DC2626', bold: true },
      { text: 'Đồng bộ chi phí tự động, tra gclid, đo lường ROAS và thứ hạng SEO' },
    ],
    [
      { text: '2' },
      { text: 'Kết nối Webhook & API 3 Website vệ tinh', bold: true },
      { text: 'IT / Webmaster' },
      { text: 'Bắt buộc', color: 'DC2626', bold: true },
      { text: 'Thu thập Lead từ website tức thì và tự động đăng bài viết SEO' },
    ],
    [
      { text: '3' },
      { text: 'Tài khoản Dịch vụ AI (Vertex AI Imagen 3 / OpenAI)', bold: true },
      { text: 'Ban Giám Đốc' },
      { text: 'Quan trọng', color: 'D97706', bold: true },
      { text: 'Dựng phối cảnh 3D LED lên ảnh hiện trường thật & sinh nháp bài SEO' },
    ],
    [
      { text: '4' },
      { text: 'Hạ tầng VPS, Subdomain SSL, Storage S3, Email SMTP', bold: true },
      { text: 'Bộ phận IT' },
      { text: 'Bắt buộc', color: 'DC2626', bold: true },
      { text: 'Chạy hệ thống 24/7 online, lưu trữ bản vẽ CAD và gửi mail cảnh báo' },
    ],
    [
      { text: '5' },
      { text: 'Danh sách nhân sự (8 vai trò) & Danh mục 25 sản phẩm LED', bold: true },
      { text: 'Hành chính / Kinh doanh' },
      { text: 'Cần thiết', color: '2563EB', bold: true },
      { text: 'Khởi tạo tài khoản nhân viên thật và nạp thông số kỹ thuật lập dự toán báo giá theo từng công trình (Bảo mật tuyệt đối, không công khai giá)' },
    ],
  ];
  parts.push(table(summaryHeaders, summaryRows, [600, 2600, 1600, 1500, 3300]));

  // Chi tiết từng mục
  parts.push(heading1('III. CHI TIẾT TÀI NGUYÊN CẦN XIN VÀ MỤC ĐÍCH CỤ THỂ'));

  // Mục 1
  parts.push(heading2('1. Nền tảng Tiếp thị số & Quảng cáo (M02 Tracking & M03 Ads)'));
  parts.push(bullet('Quyền truy cập Standard / Read-Only trên tài khoản Google Ads MCC hoặc tài khoản chạy Ads của Toàn Trung.', 'Quyền cần xin:'));
  parts.push(bullet('Developer Token, Customer ID (10 chữ số), OAuth2 Client ID, Client Secret, Refresh Token từ Google Cloud Console.', 'Thông tin cần lấy:'));
  parts.push(bullet('Tệp Service Account JSON được cấp quyền đọc trên Google Search Console và GA4 Property ID cho 3 website (toantrung.com.vn, bangled.vn, manhinhled.net.vn).', 'Google Search Console & GA4:'));
  parts.push(bullet('Meta App ID, App Secret, Long-lived Page Access Token của Fanpage, Ad Account ID.', 'Meta / Facebook Ads:'));
  parts.push(bullet('Tự động chạy định kỳ lúc 02:00, 11:00, 17:00 kéo chi phí, lượt click, hiển thị, CPC của từng chiến dịch; Tra cứu mã click gclid hàng giờ để gắn đúng chiến dịch cho Lead mà không sợ mất UTM; Thống kê ROAS nội bộ và thứ hạng từ khóa SEO.', 'Mục đích giải quyết:'));

  // Mục 2
  parts.push(heading2('2. Hệ thống 3 Website vệ tinh của công ty (toantrung.com.vn, bangled.vn, manhinhled.net.vn)'));
  parts.push(bullet('Quyền Admin quản trị web hoặc cấu hình Webhook Form liên hệ.', 'Quyền cần xin:'));
  parts.push(bullet('Webhook Secret Token (chuỗi khóa ký bảo mật HMAC-SHA256); Application Password hoặc API Token cho phép xuất bản bài viết qua REST API.', 'Thông tin cần lấy:'));
  parts.push(bullet('Tiếp nhận hồ sơ khách hàng ngay lập tức khi điền form trên web với cơ chế Idempotency (chống trùng lặp tuyệt đối); Cho phép Trưởng phòng Marketing bấm "Duyệt" là hệ thống tự động đẩy bài viết chuẩn SEO lên website theo lịch hẹn.', 'Mục đích giải quyết:'));

  // Mục 3
  parts.push(heading2('3. Tài nguyên Trí tuệ nhân tạo (M03 SEO AI & M05 AI Studio)'));
  parts.push(bullet('Phê duyệt hạn mức thanh toán dịch vụ AI hàng tháng (khoảng 300.000 – 600.000 VNĐ/tháng).', 'Quyền cần xin:'));
  parts.push(bullet('GCP Project ID & Service Account đã kích hoạt Google Vertex AI Imagen 3 API (giá ~$0.030 USD/ảnh dựng); hoặc OpenAI API Key (DALL-E 3 / Images Edit).', 'Thông tin cần lấy:'));
  parts.push(bullet('Kích hoạt trợ lý AI thiết kế thực tế: Designer chỉ cần chọn ảnh hiện trường công trình thực tế, khoanh 4 góc tường và nhập kích thước LED (VD: 4.8m x 2.7m), AI sẽ render màn hình LED sáng chân thực trong 15 giây; Tự động sinh bài viết SEO không chứa thông tin PII của khách hàng.', 'Mục đích giải quyết:'));

  // Mục 4
  parts.push(heading2('4. Hạ tầng Máy chủ, Tên miền & Lưu trữ tệp'));
  parts.push(bullet('Cấp 01 tên miền phụ (Subdomain), ví dụ crm.toantrung.com.vn hoặc mar.toantrung.com.vn và trỏ DNS về máy chủ hệ thống.', 'Tên miền & SSL:'));
  parts.push(bullet('01 máy chủ VPS Linux (Ubuntu 22.04 LTS, cấu hình tối thiểu 2 vCPU, 4GB RAM, 50GB SSD).', 'Máy chủ VPS:'));
  parts.push(bullet('Bucket lưu trữ S3-compatible (như Cloudflare R2, AWS S3 hoặc MinIO) kèm Access Key & Secret Key để lưu trữ ảnh hiện trường, bản vẽ CAD và file thiết kế LED độ phân giải cao.', 'Lưu trữ Object Storage:'));
  parts.push(bullet('Tài khoản SMTP công ty (noreply@toantrung.com.vn) để gửi email thông báo Lead mới và cảnh báo nghi ngờ đối thủ khảo giá.', 'Hệ thống Email (SMTP):'));

  // Mục 5
  parts.push(heading2('5. Danh mục Nhân sự & Sản phẩm Doanh nghiệp'));
  parts.push(bullet('Danh sách họ tên, email công ty, số điện thoại và vai trò nhân sự phân theo 8 vai trò (Ban Giám Đốc, Trưởng phòng Kinh doanh, NVKD, Trưởng phòng Marketing, NV Marketing, NV Ads, Designer, IT Admin).', 'Danh sách nhân sự:'));
  parts.push(bullet('Danh mục 25 sản phẩm màn hình LED & Bảng điện tử Toàn Trung (thông số Pitch P2/P2.5/P3, kích thước cabinet, bóng LED, công năng trong nhà/ngoài trời). Do đặc thù ngành dự án LED KHÔNG CÔNG KHAI GIÁ trên website/hệ thống đại trà, thông tin này chỉ dùng để NVKD lập phương án kỹ thuật và báo giá riêng cho từng công trình, đồng thời kích hoạt cảnh báo nghi ngờ đối thủ khảo giá (E5).', 'Danh mục sản phẩm & Quy chuẩn báo giá:'));

  // Cam kết bảo mật
  parts.push(heading1('IV. CAM KẾT BẢO MẬT DỮ LIỆU & BẢO VỆ KHÁCH HÀNG (SECURITY & PII)'));
  parts.push(bullet('Dự án LED có tính chất đặc thù không công khai giá bán cố định. Mọi mức giá đều được tính toán và phê duyệt theo phương án kỹ thuật của từng công trình. Hệ thống tự động kiểm tra trùng lặp và gắn cờ cảnh báo đối thủ khảo giá (E5) để bảo vệ tuyệt đối lợi thế cạnh tranh của Toàn Trung.', 'Bảo mật phương án giá & Chống đối thủ dò giá:'));
  parts.push(bullet('Toàn bộ số điện thoại, email, địa chỉ chi tiết của khách hàng đều được mã hóa, phân quyền chỉ có NVKD phụ trách và Ban Giám đốc xem được (các vai trò Marketing/Ads/AI bị ẩn danh PII theo quy chuẩn Q03).', 'Chống lộ lọt thông tin khách hàng:'));
  parts.push(bullet('Bộ lọc an toàn tự động phát hiện và chặn toàn bộ số điện thoại, email trước khi gửi prompt ra các hệ thống AI bên ngoài.', 'Không chia sẻ PII cho AI:'));
  parts.push(bullet('Mật khẩu người dùng được băm một chiều bằng thuật toán Scrypt chuẩn an ninh, phiên đăng nhập được ký số HMAC-SHA256.', 'Bảo mật tài khoản:'));

  // Phần ký tên
  parts.push(heading1('V. Ý KIẾN PHÊ DUYỆT CỦA CÁC BÊN LIÊN QUAN'));
  parts.push(p('Kính trình Ban Giám đốc xem xét phê duyệt chủ trương và giao các bộ phận phối hợp thực hiện bàn giao trong thời hạn 03 – 05 ngày làm việc.'));

  const signHeaders = ['NGƯỜI ĐỀ XUẤT', 'BỘ PHẬN IT / HẠ TẦNG', 'PHÒNG MARKETING - KD', 'BAN GIÁM ĐỐC PHÊ DUYỆT'];
  const signRows = [
    [
      { text: '\n\n\n(Ký và ghi rõ họ tên)' },
      { text: '\n\n\n(Xác nhận cấp quyền hạ tầng)' },
      { text: '\n\n\n(Xác nhận tài khoản & dữ liệu)' },
      { text: '\n\n\n(Ký duyệt & Đóng dấu)' },
    ],
  ];
  parts.push(table(signHeaders, signRows, [2400, 2400, 2400, 2400]));

  return parts.join('\n');
}

// Assemble full OpenXML docx package
function generateDocx(outputPath) {
  const zip = new ZipArchive();

  // 1. [Content_Types].xml
  zip.addFile(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`
  );

  // 2. _rels/.rels
  zip.addFile(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );

  // 3. word/_rels/document.xml.rels
  zip.addFile(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
  );

  // 4. word/styles.xml
  zip.addFile(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
        <w:color w:val="2D3748"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`
  );

  // 5. word/document.xml
  const bodyXml = buildDocXml();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.addFile('word/document.xml', documentXml);

  const buffer = zip.toBuffer();
  fs.writeFileSync(outputPath, buffer);
  console.log(`Successfully generated DOCX at: ${outputPath} (${buffer.length} bytes)`);
}

// Generate files in both locations
const v2Path = path.join(__dirname, '..', 'docs', 'DE_XUAT_CAP_QUYEN_VA_TAI_NGUYEN_TOAN_TRUNG_V2_CHINH_THUC.docx');
const rootPath = path.join(__dirname, '..', '..', 'DE_XUAT_CAP_QUYEN_VA_TAI_NGUYEN_TOAN_TRUNG_V2_CHINH_THUC.docx');

generateDocx(v2Path);
generateDocx(rootPath);

// Also attempt to overwrite base file if not locked by Word
try {
  generateDocx(path.join(__dirname, '..', 'docs', 'DE_XUAT_CAP_QUYEN_VA_TAI_NGUYEN_TOAN_TRUNG_V2.docx'));
  generateDocx(path.join(__dirname, '..', '..', 'DE_XUAT_CAP_QUYEN_VA_TAI_NGUYEN_TOAN_TRUNG_V2.docx'));
} catch (e) {
  console.log('Base file is currently open in Word, official updated version created with suffix _CHINH_THUC.');
}

