import { NextResponse } from 'next/server';
import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { buildGoogleAuthorizeUrl } from '../../../../../../modules/02-tracking-sync/google-oauth.service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const returnPath = url.searchParams.get('returnPath') || '/tracking';
    const redirectMode = url.searchParams.get('redirect') === 'true';
    const origin = url.origin;

    const result = await buildGoogleAuthorizeUrl(origin, returnPath);

    if (result.needsConfig || !result.authUrl) {
      if (redirectMode) {
        return NextResponse.redirect(
          new URL(`${returnPath}?google_auth=needs_config&msg=${encodeURIComponent(result.message || '')}`, origin),
        );
      }
      return jsonSuccess({
        needsConfig: true,
        authUrl: null,
        message: result.message,
      });
    }

    if (redirectMode) {
      return NextResponse.redirect(result.authUrl);
    }

    return jsonSuccess({
      needsConfig: false,
      authUrl: result.authUrl,
      message: null,
    });
  } catch (err) {
    return jsonError(
      'GOOGLE_AUTHORIZE_ERROR',
      err instanceof Error ? err.message : 'Không thể tạo đường dẫn xác thực Google.',
      500,
    );
  }
}
