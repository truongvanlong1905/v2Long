import { MarkNotificationReadSchema } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../core/http';
import { requireAuthenticatedSession } from '../../../../core/permissions';
import {
  listUserNotifications,
  markNotificationsRead,
} from '../../../../core/notifications/service';

export async function GET(req: Request) {
  const auth = await requireAuthenticatedSession(req, { requireCsrf: false });
  if (!auth.ok) return auth.response;

  const result = await listUserNotifications(auth.user.id, auth.user.roleCode);
  return jsonSuccess(result);
}

export async function PATCH(req: Request) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('INVALID_JSON', 'Dữ liệu yêu cầu không hợp lệ.', 400);
  }

  const parsed = MarkNotificationReadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('VALIDATION_ERROR', 'Tham số cập nhật thông báo không hợp lệ.', 400);
  }

  const result = await markNotificationsRead(auth.user.id, auth.user.roleCode, parsed.data);
  return jsonSuccess(result);
}
