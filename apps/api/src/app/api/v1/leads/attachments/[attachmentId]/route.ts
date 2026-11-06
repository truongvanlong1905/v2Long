import { NextResponse } from 'next/server';
import { prisma } from '@toantrung/database';
import { hasBaPermission } from '@toantrung/contracts';
import { jsonError } from '../../../../../../core/http';
import { requirePermissionSession } from '../../../../../../core/permissions';
import { readPrivateBusinessFile } from '../../../../../../core/storage/private-files.service';
import { shouldAnonymizeLeadForRole } from '../../../../../../modules/01-leads/service';

export async function GET(
  req: Request,
  context: { params: { attachmentId: string } },
) {
  const auth = await requirePermissionSession(req, 'ATTACHMENT_UPLOAD_VIEW', {
    requireCsrf: false,
  });
  if (!auth.ok) return auth.response;

  if (shouldAnonymizeLeadForRole(auth.user.roleCode)) {
    return jsonError(
      'FORBIDDEN_ANONYMIZED_ROLE',
      'Vai trò Marketing/Ads chỉ được xem Lead ẩn danh (UC01), không được tải tệp gốc định danh khách hàng.',
      403,
    );
  }

  const attachmentId = Number(context.params.attachmentId);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return jsonError('INVALID_ATTACHMENT_ID', 'Mã tệp đính kèm không hợp lệ.', 400);
  }

  const attachment = await prisma.leadAttachment.findUnique({
    where: { id: attachmentId },
    include: { lead: true },
  });

  if (!attachment) {
    return jsonError('NOT_FOUND', 'Không tìm thấy tệp đính kèm.', 404);
  }

  // Quy tắc không công khai giá: hồ sơ báo giá cũ (quote_doc) có thể chứa đơn giá → không phục vụ qua web.
  if (attachment.attachmentType === 'quote_doc') {
    return jsonError(
      'PRICE_DOCUMENT_RESTRICTED',
      'Tệp hồ sơ báo giá có thể chứa giá nên không được hiển thị hoặc tải qua hệ thống.',
      403,
    );
  }

  const canViewAll = hasBaPermission(auth.user.roleCode, 'LEAD_VIEW_ALL');
  if (
    !canViewAll &&
    auth.user.roleCode !== 'DESIGNER' &&
    attachment.lead.assignedSalesId !== auth.user.id &&
    attachment.lead.createdByUserId !== auth.user.id
  ) {
    return jsonError(
      'FORBIDDEN_LEAD_SCOPE',
      'Bạn chỉ được tải tệp của hồ sơ Lead do mình phụ trách.',
      403,
    );
  }

  const fileData = readPrivateBusinessFile(attachment.fileUrl);
  if (!fileData) {
    return jsonError('FILE_MISSING', 'Tệp vật lý không tồn tại trong kho lưu trữ riêng tư.', 404);
  }

  return new NextResponse(new Uint8Array(fileData.buffer), {
    status: 200,
    headers: {
      'Content-Type': fileData.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(attachment.fileName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

