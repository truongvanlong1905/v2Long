import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import {
  syncAllGoogleDataAcrossModules,
  getGoogleOAuthStatusDto,
} from '../../../../../../modules/02-tracking-sync/google-oauth.service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedSession(req, { requireCsrf: false });
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as {
      slot?: 'FULL_0200' | 'LIGHT_1100' | 'LIGHT_1700' | 'MANUAL_RETRY';
    };

    const slot = body.slot || 'MANUAL_RETRY';
    const result = await syncAllGoogleDataAcrossModules(slot);
    const status = await getGoogleOAuthStatusDto();

    return jsonSuccess({
      message: `Đồng bộ toàn diện Google hoàn tất (${result.syncedRecords} bản ghi, giải quyết ${result.gclidResolved} gclid).`,
      result,
      status,
    });
  } catch (err) {
    return jsonError(
      'GOOGLE_SYNC_ERROR',
      err instanceof Error ? err.message : 'Không thể thực hiện đồng bộ dữ liệu Google.',
      500,
    );
  }
}
