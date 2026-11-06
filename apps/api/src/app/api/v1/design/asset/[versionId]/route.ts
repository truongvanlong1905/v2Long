import { prisma } from '@toantrung/database';
import { hasBaPermission } from '@toantrung/contracts';
import { jsonError } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import { readPrivateBusinessFile } from '../../../../../../core/storage/private-files.service';

export async function GET(
  req: Request,
  context: { params: { versionId: string } }
) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  const canDownload =
    hasBaPermission(auth.user.roleCode, 'AI_DESIGN') ||
    hasBaPermission(auth.user.roleCode, 'ATTACHMENT_UPLOAD_VIEW');

  if (!canDownload) {
    return jsonError(
      'FORBIDDEN_PERMISSION',
      'Tài khoản không có quyền tải xuống tài sản thiết kế độ phân giải cao (AI_DESIGN hoặc ATTACHMENT_UPLOAD_VIEW).',
      403
    );
  }

  const versionId = Number(context.params.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return jsonError('INVALID_VERSION_ID', 'Mã phiên bản thiết kế không hợp lệ.', 400);
  }

  const versionRow = await prisma.designAssetVersion.findUnique({
    where: { id: versionId },
  });

  if (!versionRow) {
    return jsonError('NOT_FOUND', 'Không tìm thấy phiên bản thiết kế yêu cầu.', 404);
  }

  const fileData = readPrivateBusinessFile(versionRow.storageObjectKey);
  if (!fileData) {
    return jsonError('FILE_NOT_FOUND', 'Không tìm thấy tệp vật lý trong kho lưu trữ bảo mật.', 404);
  }

  return new Response(new Uint8Array(fileData.buffer), {
    status: 200,
    headers: {
      'Content-Type': fileData.mimeType,
      'Content-Disposition': `inline; filename="${fileData.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

