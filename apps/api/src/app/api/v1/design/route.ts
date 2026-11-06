import { CreateDesignRequestSchema } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../core/http';
import { requireAuthenticatedSession, requirePermissionSession } from '../../../../core/permissions';
import {
  createDesignRequestWithAiDraft,
  listDesignRequestsForUser,
} from '../../../../modules/05-ai-design/service';

export async function GET(req: Request) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  try {
    const data = await listDesignRequestsForUser(auth.user);
    return jsonSuccess(data);
  } catch (err) {
    return jsonError(
      'DESIGN_LIST_FAILED',
      err instanceof Error ? err.message : 'Không thể tải danh sách yêu cầu thiết kế AI.',
      500
    );
  }
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'AI_DESIGN');
  if (!auth.ok) return auth.response;

  try {
    const raw = await req.json();
    const parsed = CreateDesignRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Thông số yêu cầu thiết kế AI không hợp lệ.',
        400
      );
    }

    const result = await createDesignRequestWithAiDraft(auth.user, parsed.data);
    return jsonSuccess(result, 201);
  } catch (err) {
    return jsonError(
      'DESIGN_CREATE_FAILED',
      err instanceof Error ? err.message : 'Tạo yêu cầu thiết kế AI thất bại.',
      400
    );
  }
}

