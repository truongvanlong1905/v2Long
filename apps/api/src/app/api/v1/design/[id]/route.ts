import { ConcurrencyConflictError } from '@toantrung/database';
import {
  AddProjectPhotoSchema,
  ApproveDesignVersionSchema,
  ChatDesignRequestSchema,
  RegenerateDesignDraftSchema,
  UpdateDesignProjectSchema,
} from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import {
  addProjectPhoto,
  approveDesignAssetVersion,
  deleteDesignProject,
  deleteProjectPhoto,
  processChatDesignRequest,
  regenerateDesignDraftByAi,
  saveCompositedDraftVersion,
  updateDesignProject,
  uploadDesignerFinalRender,
} from '../../../../../modules/05-ai-design/service';

export async function PATCH(
  req: Request,
  context: { params: { id: string } }
) {
  const auth = await requirePermissionSession(req, 'AI_DESIGN');
  if (!auth.ok) return auth.response;

  const requestId = Number(context.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return jsonError('INVALID_ID', 'Mã yêu cầu thiết kế không hợp lệ.', 400);
  }

  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const action = String(raw.action || 'regenerate_ai');

    if (action === 'chat_edit') {
      const parsed = ChatDesignRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Yêu cầu chỉnh sửa AI không hợp lệ.',
          400
        );
      }
      const res = await processChatDesignRequest(auth.user, requestId, parsed.data);
      return jsonSuccess(res);
    }

    if (action === 'approve_version' || action === 'save_finished') {
      const parsed = ApproveDesignVersionSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Thông tin phê duyệt phiên bản không hợp lệ.',
          400
        );
      }
      const res = await approveDesignAssetVersion(auth.user, requestId, parsed.data);
      return jsonSuccess(res);
    }

    if (action === 'update_project') {
      const parsed = UpdateDesignProjectSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Thông tin dự án không hợp lệ.',
          400
        );
      }
      const res = await updateDesignProject(auth.user, requestId, parsed.data);
      return jsonSuccess(res);
    }

    const parsed = RegenerateDesignDraftSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Thông số tạo lại bản nháp AI không hợp lệ.',
        400
      );
    }

    const res = await regenerateDesignDraftByAi(auth.user, requestId, parsed.data);
    return jsonSuccess(res);
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      return jsonError('CONCURRENCY_CONFLICT', err.message, 409);
    }
    return jsonError(
      'DESIGN_UPDATE_FAILED',
      err instanceof Error ? err.message : 'Cập nhật yêu cầu thiết kế thất bại.',
      400
    );
  }
}

export async function POST(
  req: Request,
  context: { params: { id: string } }
) {
  const auth = await requirePermissionSession(req, 'AI_DESIGN');
  if (!auth.ok) return auth.response;

  const requestId = Number(context.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return jsonError('INVALID_ID', 'Mã yêu cầu thiết kế không hợp lệ.', 400);
  }

  try {
    const contentType = req.headers.get('content-type') || '';

    // Handle JSON payloads
    if (contentType.includes('application/json')) {
      const raw = (await req.json()) as Record<string, unknown>;
      const action = String(raw.action || 'upload_final');

      if (action === 'add_photo') {
        const parsed = AddProjectPhotoSchema.safeParse(raw);
        if (!parsed.success) {
          return jsonError('VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Dữ liệu ảnh không hợp lệ.', 400);
        }
        const res = await addProjectPhoto(auth.user, requestId, parsed.data);
        return jsonSuccess(res, 201);
      }

      if (action === 'save_composited_version') {
        const b64 = String(raw.base64Data || '');
        if (!b64) {
          return jsonError('VALIDATION_ERROR', 'Dữ liệu ảnh bản ghép 3D không được để trống.', 400);
        }
        const res = await saveCompositedDraftVersion(auth.user, requestId, {
          fileName: String(raw.fileName || `studio-composite-req-${requestId}.png`),
          mimeType: String(raw.mimeType || 'image/png'),
          buffer: Buffer.from(b64, 'base64'),
          note: raw.note ? String(raw.note) : undefined,
          placementQuad: raw.placementQuad as any,
        });
        return jsonSuccess(res, 201);
      }

      // Final render upload via JSON base64
      const buffer = raw.base64Data
        ? Buffer.from(String(raw.base64Data), 'base64')
        : Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEgQH532y8kAAAAABJRU5ErkJggg==',
            'base64'
          );

      const res = await uploadDesignerFinalRender(auth.user, requestId, {
        fileName: String(raw.fileName || `final-render-req-${requestId}.png`),
        mimeType: String(raw.mimeType || 'image/png'),
        buffer,
        note: raw.note ? String(raw.note) : undefined,
      });
      return jsonSuccess(res, 201);
    }

    // Handle Multipart Form Data
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const action = String(form.get('action') || 'upload_final');
      const note = String(form.get('note') || '');

      if (!file || !(file instanceof File)) {
        return jsonError('VALIDATION_ERROR', 'Vui lòng chọn tệp để tải lên.', 400);
      }

      const arrayBuf = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);

      if (action === 'add_photo') {
        const photo = await addProjectPhoto(auth.user, requestId, {
          photoName: file.name,
          fileName: file.name,
          mimeType: file.type || 'image/jpeg',
          base64Data: buffer.toString('base64'),
        });
        return jsonSuccess(photo, 201);
      }

      const res = await uploadDesignerFinalRender(auth.user, requestId, {
        fileName: file.name,
        mimeType: file.type || 'image/png',
        buffer,
        note,
      });
      return jsonSuccess(res, 201);
    }

    return jsonError('BAD_REQUEST', 'Content-Type không được hỗ trợ.', 400);
  } catch (err) {
    return jsonError(
      'OPERATION_FAILED',
      err instanceof Error ? err.message : 'Thao tác tệp thất bại.',
      400
    );
  }
}

export async function DELETE(
  req: Request,
  context: { params: { id: string } }
) {
  const auth = await requirePermissionSession(req, 'AI_DESIGN');
  if (!auth.ok) return auth.response;

  const requestId = Number(context.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return jsonError('INVALID_ID', 'Mã yêu cầu không hợp lệ.', 400);
  }

  const { searchParams } = new URL(req.url);
  const photoId = searchParams.get('photoId');

  try {
    if (!photoId) {
      const res = await deleteDesignProject(auth.user, requestId);
      return jsonSuccess(res);
    }
    const res = await deleteProjectPhoto(auth.user, requestId, photoId);
    return jsonSuccess(res);
  } catch (err) {
    return jsonError('DELETE_FAILED', err instanceof Error ? err.message : 'Xóa thất bại.', 400);
  }
}
