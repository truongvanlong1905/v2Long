import { prisma } from '@toantrung/database';
import { DESIGN_STATUS_LABELS, DESIGN_TYPE_LABELS } from '@toantrung/contracts';
import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { buildStandardXlsxBuffer } from '../../../../../core/export/xlsx-builder';
import { listDesignRequestsForUser } from '../../../../../modules/05-ai-design/service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const data = await listDesignRequestsForUser(auth.user);
    const requests = data.requests;
    const dateStamp = new Date().toISOString().slice(0, 10);

    const completedCount = requests.filter((r) => r.status === 'completed').length;
    const draftCount = requests.filter((r) => r.status === 'ai_drafted' || r.status === 'in_review').length;
    const totalVersions = requests.reduce((acc, r) => acc + r.assetVersions.length, 0);
    const totalPhotos = requests.reduce((acc, r) => acc + r.photos.length, 0);

    const versionRows: Array<Record<string, unknown>> = [];
    let assetIdx = 1;
    for (const r of requests) {
      for (const p of r.photos) {
        versionRows.push({
          stt: assetIdx++,
          projectCode: `DA-${String(r.id).padStart(4, '0')}`,
          projectName: r.projectName,
          folder: 'Ảnh kỹ thuật (Ảnh gốc)',
          assetLabel: p.name,
          dimensionsOrRatio: r.aspectRatio || '16:9',
          statusLabel: p.selected ? 'Đang chọn làm nền gốc' : 'Đã lưu kho',
          createdBy: r.requestedBySalesName || r.assignedDesignerName,
          createdAt: (p.uploadedAt || r.createdAt || '').slice(0, 16).replace('T', ' '),
        });
      }
      for (const v of r.assetVersions) {
        versionRows.push({
          stt: assetIdx++,
          projectCode: `DA-${String(r.id).padStart(4, '0')}`,
          projectName: r.projectName,
          folder: 'Bản thiết kế (Đầu ra)',
          assetLabel: `Phiên bản v${v.versionNumber} — ${v.promptUsed || 'Bản dựng AI'}`,
          dimensionsOrRatio: `${v.widthPx || 1920}x${v.heightPx || 1080}px (${v.aspectRatio || r.aspectRatio || '16:9'})`,
          statusLabel: v.isApprovedFinal
            ? 'Đã chốt bàn giao'
            : v.sourceType === 'DESIGNER_FINAL_UPLOAD'
              ? 'Bản Designer tải lên'
              : 'Bản nháp AI',
          createdBy: v.uploadedByName,
          createdAt: (v.createdAt || r.createdAt || '').slice(0, 16).replace('T', ' '),
        });
      }
    }

    const buffer = buildStandardXlsxBuffer([
      {
        name: '01_DuAn_ThietKe',
        title: `BÁO CÁO DỰ ÁN PHỐI CẢNH LED & BANNER AI — ${auth.user.fullName} (${auth.user.roleName})`,
        metadata: [
          { label: 'Đơn vị', value: 'CÔNG TY TNHH ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG' },
          { label: 'Thời gian xuất báo cáo', value: new Date().toLocaleString('vi-VN') },
          { label: 'Múi giờ', value: 'Asia/Ho_Chi_Minh (GMT+7)' },
          { label: 'Phạm vi dữ liệu', value: `${requests.length} dự án thiết kế trong phạm vi phân quyền` },
        ],
        kpiSummary: [
          { label: 'Tổng dự án', value: requests.length },
          { label: 'Đã chốt bàn giao', value: completedCount },
          { label: 'Đang dựng / Duyệt', value: draftCount },
          { label: 'Tổng ảnh kỹ thuật', value: totalPhotos },
          { label: 'Tổng phiên bản thiết kế', value: totalVersions },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Dự Án', key: 'projectCode', width: 14, type: 'string' },
          { header: 'Tên Dự Án', key: 'projectName', width: 28, type: 'string' },
          { header: 'Loại Dự Án', key: 'designType', width: 24, type: 'string' },
          { header: 'Mã Lead Liên Kết', key: 'leadCode', width: 18, type: 'string' },
          { header: 'Người Liên Hệ', key: 'contactName', width: 22, type: 'string' },
          { header: 'Cấu Hình LED / Sản Phẩm', key: 'ledSpec', width: 28, type: 'string' },
          { header: 'Kích Thước Vật Lý (m)', key: 'physicalSize', width: 20, type: 'string' },
          { header: 'Diện Tích (m²)', key: 'areaM2', width: 15, type: 'number' },
          { header: 'Tỷ Lệ Khung', key: 'aspectRatio', width: 14, type: 'string' },
          { header: 'Số Ảnh Kỹ Thuật', key: 'photoCount', width: 16, type: 'number' },
          { header: 'Số Bản Thiết Kế', key: 'versionCount', width: 16, type: 'number' },
          { header: 'Trạng Thái', key: 'statusLabel', width: 22, type: 'string' },
          { header: 'Designer Phụ Trách', key: 'designerName', width: 22, type: 'string' },
          { header: 'Ngày Tạo', key: 'createdAt', width: 18, type: 'string' },
        ],
        rows: requests.map((r, idx) => ({
          stt: idx + 1,
          projectCode: `DA-${String(r.id).padStart(4, '0')}`,
          projectName: r.projectName,
          designType: DESIGN_TYPE_LABELS[r.designType] || r.designType,
          leadCode: r.leadCode || 'Độc lập (Không gắn Lead)',
          contactName: r.contactName || '—',
          ledSpec: r.ledModuleSpec || r.productName || 'P2.5 Indoor',
          physicalSize:
            r.designType === 'perspective_3d'
              ? `${r.screenWidthM ?? 4.8}m × ${r.screenHeightM ?? 2.7}m`
              : `${r.bannerWidthPx ?? 1920}×${r.bannerHeightPx ?? 1080}px`,
          areaM2: r.productSpec?.areaM2 ?? Number(((r.screenWidthM || 4.8) * (r.screenHeightM || 2.7)).toFixed(2)),
          aspectRatio: r.aspectRatio || '16:9',
          photoCount: r.photos.length,
          versionCount: r.assetVersions.length,
          statusLabel: DESIGN_STATUS_LABELS[r.status] || r.status,
          designerName: r.assignedDesignerName,
          createdAt: r.createdAt.slice(0, 16).replace('T', ' '),
        })),
        summaryRow: {
          stt: '',
          projectCode: 'TỔNG CỘNG',
          projectName: `${requests.length} dự án`,
          designType: '',
          leadCode: '',
          contactName: '',
          ledSpec: '',
          physicalSize: '',
          areaM2: Number(
            requests
              .reduce(
                (acc, r) =>
                  acc + (r.productSpec?.areaM2 ?? (r.screenWidthM || 4.8) * (r.screenHeightM || 2.7)),
                0
              )
              .toFixed(2)
          ),
          aspectRatio: '',
          photoCount: totalPhotos,
          versionCount: totalVersions,
          statusLabel: `${completedCount} hoàn thành`,
          designerName: '',
          createdAt: '',
        },
        footerNotes: [
          'Ghi chú nghiệp vụ: Kho ảnh dự án tách biệt 2 thư mục chuẩn gồm "Ảnh kỹ thuật" (ảnh hiện trạng/khảo sát đầu vào) và "Bản thiết kế" (các phiên bản nháp AI và bản hoàn thiện đã duyệt).',
          'Bảo mật dữ liệu (UC06): Tuyệt đối không đính kèm SĐT/Email khách hàng trong prompt gửi sang dịch vụ AI bên thứ ba.',
        ],
      },
      {
        name: '02_KhoAnh_PhienBan',
        title: 'DANH MỤC TÀI SẢN KHO ẢNH DỰ ÁN (ẢNH KỸ THUẬT & BẢN THIẾT KẾ)',
        metadata: [
          { label: 'Tổng số tệp tài sản', value: String(versionRows.length) },
          { label: 'Thời gian kết xuất', value: new Date().toLocaleString('vi-VN') },
        ],
        columns: [
          { header: 'STT', key: 'stt', width: 8, type: 'number' },
          { header: 'Mã Dự Án', key: 'projectCode', width: 14, type: 'string' },
          { header: 'Tên Dự Án', key: 'projectName', width: 26, type: 'string' },
          { header: 'Thư Mục Kho Ảnh', key: 'folder', width: 24, type: 'string' },
          { header: 'Tên Tệp / Mô Tả Phiên Bản', key: 'assetLabel', width: 38, type: 'string' },
          { header: 'Độ Phân Giải & Tỷ Lệ', key: 'dimensionsOrRatio', width: 22, type: 'string' },
          { header: 'Trạng Thái Lưu Kho', key: 'statusLabel', width: 22, type: 'string' },
          { header: 'Người Tải Lên / Tạo', key: 'createdBy', width: 22, type: 'string' },
          { header: 'Thời Gian', key: 'createdAt', width: 18, type: 'string' },
        ],
        rows: versionRows,
      },
    ]);

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'DESIGN_PROJECTS_EXPORTED',
        targetType: 'DesignExport',
        targetId: `xlsx_${requests.length}`,
        detailsJson: JSON.stringify({
          projectCount: requests.length,
          assetCount: versionRows.length,
        }),
      },
    });

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="05_DuAn_AI_KhoAnh_${dateStamp}.xlsx"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'DESIGN_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xuất báo cáo Excel dự án thiết kế.',
      400
    );
  }
}
