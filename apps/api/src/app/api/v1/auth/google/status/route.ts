import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import {
  getGoogleOAuthStatusDto,
  getGoogleClientConfigDto,
  saveGoogleClientConfig,
  connectSandboxDemo,
  disconnectGoogleOAuth,
} from '../../../../../../modules/02-tracking-sync/google-oauth.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [status, clientConfig] = await Promise.all([
      getGoogleOAuthStatusDto(),
      getGoogleClientConfigDto(),
    ]);
    return jsonSuccess({ status, clientConfig });
  } catch (err) {
    return jsonError(
      'GET_GOOGLE_STATUS_ERROR',
      err instanceof Error ? err.message : 'Không thể lấy trạng thái kết nối Google.',
      500,
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuthenticatedSession(req, { requireCsrf: false });
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const body = (await req.json().catch(() => ({}))) as {
      action?: 'save_client_config' | 'demo_connect' | 'disconnect';
      clientId?: string;
      clientSecret?: string;
    };

    if (body.action === 'save_client_config') {
      if (user.roleCode !== 'ADMIN' && user.roleCode !== 'MKT_LEAD') {
        return jsonError('FORBIDDEN', 'Chỉ Quản trị viên hoặc Trưởng phòng Marketing mới được cấu hình Client ID.', 403);
      }
      if (!body.clientId?.trim() || !body.clientSecret?.trim()) {
        return jsonError('INVALID_INPUT', 'Vui lòng điền cả Client ID và Client Secret.', 400);
      }
      await saveGoogleClientConfig({
        clientId: body.clientId.trim(),
        clientSecret: body.clientSecret.trim(),
      });
      const [status, clientConfig] = await Promise.all([
        getGoogleOAuthStatusDto(),
        getGoogleClientConfigDto(),
      ]);
      return jsonSuccess({ message: 'Đã lưu cấu hình Google OAuth Client thành công.', status, clientConfig });
    }

    if (body.action === 'demo_connect') {
      await connectSandboxDemo(user.email || 'toantrung.marketing@gmail.com');
      const status = await getGoogleOAuthStatusDto();
      return jsonSuccess({
        message: 'Đã kết nối Chế độ Kiểm thử Mẫu (Demo Sandbox) thành công với tài khoản marketing.',
        status,
      });
    }

    if (body.action === 'disconnect') {
      await disconnectGoogleOAuth();
      const status = await getGoogleOAuthStatusDto();
      return jsonSuccess({ message: 'Đã ngắt kết nối tài khoản Google thành công.', status });
    }

    return jsonError('INVALID_ACTION', 'Thao tác không hợp lệ.', 400);
  } catch (err) {
    return jsonError(
      'GOOGLE_AUTH_ACTION_ERROR',
      err instanceof Error ? err.message : 'Lỗi thao tác xác thực Google.',
      500,
    );
  }
}
