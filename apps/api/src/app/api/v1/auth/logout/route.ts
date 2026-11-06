import { APP_CONFIG } from '../../../../../core/config';
import { getClientIp, jsonSuccess } from '../../../../../core/http';
import { logoutByToken } from '../../../../../core/auth/service';
import { extractSessionTokenFromRequest } from '../../../../../core/permissions';

export async function POST(req: Request) {
  const token = extractSessionTokenFromRequest(req);
  await logoutByToken(token, getClientIp(req));

  const response = jsonSuccess({ loggedOut: true }, 200);
  response.cookies.set(APP_CONFIG.sessionCookieName, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  return response;
}

