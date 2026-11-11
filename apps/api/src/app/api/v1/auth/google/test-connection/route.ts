import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import { testGoogleConnection } from '../../../../../../modules/02-tracking-sync/google-oauth.service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedSession(req, { requireCsrf: false });
    if (!auth.ok) return auth.response;

    const result = await testGoogleConnection();
    return jsonSuccess({ result });
  } catch (err) {
    return jsonError(
      'GOOGLE_TEST_CONNECTION_ERROR',
      err instanceof Error ? err.message : 'Lỗi khi kiểm tra kết nối Google API.',
      500,
    );
  }
}

