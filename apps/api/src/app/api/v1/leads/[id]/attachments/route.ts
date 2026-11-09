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
    const contentType = (req.headers.get('content-type') || '').toLowerCase();

    if (contentType.includes('application/json')) {
      const body = (await req.json()) as {
        attachmentType?: string;
        folderPath?: string;
        fileName?: string;
        mimeType?: string;
        base64Data?: string;
        files?: Array<{
          fileName: string;
          mimeType?: string;
          base64Data: string;
        }>;
      };

      const attachmentTypeRaw = String(body.attachmentType || 'site_photo');
      if (attachmentTypeRaw === 'quote_doc') {
        return jsonError(
          'PRICE_DOCUMENT_RESTRICTED',
          'Hệ thống không lưu hồ sơ báo giá có giá. Chỉ tải ảnh khảo sát, bản vẽ kỹ thuật và tài liệu dự án.',
          400,
        );
      }
      const attachmentType: 'site_photo' | 'customer_drawing_doc' | 'other' =
        attachmentTypeRaw === 'customer_drawing_doc'
          ? 'customer_drawing_doc'
          : attachmentTypeRaw === 'other'
            ? 'other'
            : 'site_photo';
      const folderPath = String(body.folderPath || '/ho-so-cong-trinh');

      const incomingFiles =
        Array.isArray(body.files) && body.files.length > 0
          ? body.files
          : body.base64Data && body.fileName
            ? [{ fileName: body.fileName, mimeType: body.mimeType, base64Data: body.base64Data }]
            : [];

      if (incomingFiles.length === 0) {
        return jsonError('FILE_REQUIRED', 'Vui lòng chọn ít nhất 1 tệp đính kèm.', 400);
      }

      const uploadedList = [];
      for (const item of incomingFiles) {
        const cleanB64 = item.base64Data.includes(',')
          ? item.base64Data.split(',')[1] || ''
          : item.base64Data;
        const fileBuffer = Buffer.from(cleanB64, 'base64');
        const created = await uploadLeadAttachment({
          actor: auth.user,
          leadId,
          attachmentType,
          folderPath,
          fileName: item.fileName || 'tai-lieu-du-an.bin',
          fileBuffer,
          declaredMimeType: item.mimeType || 'application/octet-stream',
        });
        uploadedList.push({ id: created.id, fileName: created.fileName });
      }

      return jsonSuccess(
        {
          id: uploadedList[0]?.id,
          fileName: uploadedList[0]?.fileName,
          uploadedCount: uploadedList.length,
          items: uploadedList,
        },
        201,
      );
    }

    const formData = await req.formData();
    const rawFiles = formData.getAll('files');
    const singleFile = formData.get('file');
    const candidateBlobs = rawFiles.length > 0 ? rawFiles : singleFile ? [singleFile] : [];

    const validBlobs = candidateBlobs.filter(
      (f): f is File =>
        Boolean(f) && typeof f === 'object' && typeof (f as Blob).arrayBuffer === 'function',
    );

    if (validBlobs.length === 0) {
      return jsonError('FILE_REQUIRED', 'Vui lòng chọn tệp đính kèm để tải lên.', 400);
    }

    const attachmentTypeRaw = String(formData.get('attachmentType') || 'site_photo');
    if (attachmentTypeRaw === 'quote_doc') {
      return jsonError(
        'PRICE_DOCUMENT_RESTRICTED',
        'Hệ thống không lưu hồ sơ báo giá có giá. Chỉ tải ảnh khảo sát, bản vẽ kỹ thuật và tài liệu dự án.',
        400,
      );
    }
    const attachmentType: 'site_photo' | 'customer_drawing_doc' | 'other' =
      attachmentTypeRaw === 'customer_drawing_doc'
        ? 'customer_drawing_doc'
        : attachmentTypeRaw === 'other'
          ? 'other'
          : 'site_photo';
    const folderPath = String(formData.get('folderPath') || '/ho-so-cong-trinh');

    const uploadedList = [];
    for (const file of validBlobs) {
      const arrayBuffer = await file.arrayBuffer();
      const created = await uploadLeadAttachment({
        actor: auth.user,
        leadId,
        attachmentType,
        folderPath,
        fileName: file.name || 'site-photo.png',
        fileBuffer: Buffer.from(arrayBuffer),
        declaredMimeType: file.type || 'application/octet-stream',
      });
      uploadedList.push({ id: created.id, fileName: created.fileName });
    }

    return jsonSuccess(
      {
        id: uploadedList[0]?.id,
        fileName: uploadedList[0]?.fileName,
        uploadedCount: uploadedList.length,
        items: uploadedList,
      },
      201,
    );
  } catch (err) {
    return jsonError(
      'ATTACHMENT_UPLOAD_FAILED',
      err instanceof Error ? err.message : 'Không thể tải lên tệp đính kèm.',
      400,
    );
  }
}

