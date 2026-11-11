import { NextResponse } from 'next/server';
import { handleGoogleOAuthCallback } from '../../../../../../modules/02-tracking-sync/google-oauth.service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateStr = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const origin = url.origin;

  let returnPath = '/tracking';
  if (stateStr) {
    try {
      const parsed = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8'));
      if (parsed.returnPath && typeof parsed.returnPath === 'string' && parsed.returnPath.startsWith('/')) {
        returnPath = parsed.returnPath;
      }
    } catch {
      // ignore
    }
  }

  if (error || !code) {
    const errorMsg = error || 'Không nhận được mã ủy quyền từ Google.';
    return NextResponse.redirect(
      new URL(`${returnPath}?google_auth=error&msg=${encodeURIComponent(errorMsg)}`, origin),
    );
  }

  try {
    const res = await handleGoogleOAuthCallback(code, origin, stateStr);
    return NextResponse.redirect(
      new URL(
        `${res.returnPath}?google_auth=success&email=${encodeURIComponent(res.email)}&name=${encodeURIComponent(res.name)}`,
        origin,
      ),
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Lỗi xử lý phản hồi từ Google.';
    return NextResponse.redirect(
      new URL(`${returnPath}?google_auth=error&msg=${encodeURIComponent(errorMsg)}`, origin),
    );
  }
}
