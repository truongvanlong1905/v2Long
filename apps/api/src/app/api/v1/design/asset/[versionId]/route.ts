import { prisma } from '@toantrung/database';
import { hasBaPermission } from '@toantrung/contracts';
import { jsonError } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import { readPrivateBusinessFile } from '../../../../../../core/storage/private-files.service';
import { renderSyntheticLedPngBuffer } from '../../../../../../modules/05-ai-design/providers';

export async function GET(
  req: Request,
  context: { params: { versionId: string } }
) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  const canDownload =
    hasBaPermission(auth.user.roleCode, 'AI_DESIGN') ||
    hasBaPermission(auth.user.roleCode, 'ATTACHMENT_UPLOAD_VIEW') ||
    hasBaPermission(auth.user.roleCode, 'LEAD_VIEW_OWN');

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
    include: { designRequest: true },
  });

  if (!versionRow) {
    return jsonError('NOT_FOUND', 'Không tìm thấy phiên bản thiết kế yêu cầu.', 404);
  }

  const fileData = readPrivateBusinessFile(versionRow.storageObjectKey);
  if (!fileData || fileData.buffer.length <= 200) {
    const mode = versionRow.designRequest?.requestType === 'banner' ? 'banner' : 'perspective_3d';
    const syntheticBuffer = renderSyntheticLedPngBuffer({
      mode,
      prompt: versionRow.promptUsed || `Phiên bản thiết kế v${versionRow.versionNumber}`,
      seedKey: `ver-${versionRow.id}-v${versionRow.versionNumber}`,
    });
    return new Response(new Uint8Array(syntheticBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `inline; filename="design-req-${versionRow.designRequestId}-v${versionRow.versionNumber}.png"`,
        'Cache-Control': 'private, no-store',
      },
    });
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

