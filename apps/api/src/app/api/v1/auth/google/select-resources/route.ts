import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import { SelectGoogleResourcesSchema } from '@toantrung/contracts';
import { saveSelectedResources } from '../../../../../../modules/02-tracking-sync/google-oauth.service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedSession(req, { requireCsrf: false });
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const parsed = SelectGoogleResourcesSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Dữ liệu chọn tài nguyên không hợp lệ.', 400);
    }

    const updatedStatus = await saveSelectedResources(parsed.data);
    return jsonSuccess({
      message: 'Đã lưu cấu hình tài nguyên mặc định cho GA4, Search Console và Google Ads.',
      status: updatedStatus,
    });
  } catch (err) {
    return jsonError(
      'GOOGLE_SELECT_RESOURCES_ERROR',
      err instanceof Error ? err.message : 'Lỗi khi lưu lựa chọn tài nguyên Google.',
      500,
    );
  }
}

