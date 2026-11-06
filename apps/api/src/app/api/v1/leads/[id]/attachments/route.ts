import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { requirePermissionSession } from '../../../../../../core/permissions';
import {
  shouldAnonymizeLeadForRole,
  uploadLeadAttachment,
} from '../../../../../../modules/01-leads/service';

export async function POST(
  req: Request,
  context: { params: { id: string } },
) {
  const auth = await requirePermissionSession(req, 'ATTACHMENT_UPLOAD_VIEW');
  if (!auth.ok) return auth.response;

  if (shouldAnonymizeLeadForRole(auth.user.roleCode)) {
    return jsonError(
      'FORBIDDEN_ANONYMIZED_ROLE',
      'Vai trò xem ẩn danh không có quyền tải tệp vào hồ sơ khách hàng.',
      403,
    );
  }

  const leadId = Number(context.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return jsonError('INVALID_LEAD_ID', 'Mã hồ sơ Lead không hợp lệ.', 400);
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return jsonError('FILE_REQUIRED', 'Vui lòng chọn tệp ảnh hiện trạng hoặc bản vẽ kỹ thuật.', 400);
    }

    const attachmentTypeRaw = String(formData.get('attachmentType') || 'site_photo');
    if (attachmentTypeRaw === 'quote_doc') {
      return jsonError(
        'PRICE_DOCUMENT_RESTRICTED',
        'Hệ thống không lưu hồ sơ báo giá có giá. Chỉ tải ảnh khảo sát, bản vẽ kỹ thuật và tài liệu dự án.',
        400,
      );
    }
    const attachmentType: 'site_photo' | 'customer_drawing_doc' =
      attachmentTypeRaw === 'customer_drawing_doc' ? 'customer_drawing_doc' : 'site_photo';
    const folderPath = String(formData.get('folderPath') || '/ho-so-cong-trinh');

    const arrayBuffer = await file.arrayBuffer();
    const created = await uploadLeadAttachment({
      actor: auth.user,
      leadId,
      attachmentType,
      folderPath,
      fileName: file.name || 'site-photo.png',
      fileBuffer: Buffer.from(arrayBuffer),
      declaredMimeType: file.type || 'image/png',
    });

    return jsonSuccess({ id: created.id, fileName: created.fileName }, 201);
  } catch (err) {
    return jsonError(
      'ATTACHMENT_UPLOAD_FAILED',
      err instanceof Error ? err.message : 'Không thể tải lên tệp đính kèm.',
      400,
    );
  }
}

