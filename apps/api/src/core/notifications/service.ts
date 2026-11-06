import { prisma } from '@toantrung/database';
import {
  BA_PERMISSIONS,
  hasBaPermission,
  type BaPermissionKey,
  type NotificationDto,
  type RoleCode,
} from '@toantrung/contracts';

function canAccessNotificationAction(
  roleCode: RoleCode,
  actionUrl: string | null,
  requiredPermission: string | null,
): boolean {
  if (!actionUrl) return false;
  if (actionUrl.startsWith('/admin') && roleCode !== 'ADMIN') {
    return false;
  }
  if (requiredPermission && requiredPermission in BA_PERMISSIONS) {
    return hasBaPermission(roleCode, requiredPermission as BaPermissionKey);
  }
  return true;
}

export async function listUserNotifications(
  userId: number,
  roleCode: RoleCode,
): Promise<{
  items: NotificationDto[];
  unreadCount: number;
}> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const unreadCount = rows.filter((r) => !r.isRead).length;

  return {
    items: rows.map((r) => {
      const allowed = canAccessNotificationAction(
        roleCode,
        r.actionUrl,
        r.requiredPermission,
      );
      return {
        id: r.id,
        title: r.title,
        summary: r.summary,
        category: r.category,
        isRead: r.isRead,
        actionLabel: allowed ? r.actionLabel : null,
        actionUrl: allowed ? r.actionUrl : null,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
      };
    }),
    unreadCount,
  };
}

export async function markNotificationsRead(
  userId: number,
  roleCode: RoleCode,
  options: { notificationId?: number; markAll?: boolean },
) {
  const now = new Date();
  if (options.markAll) {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: now },
    });
  } else if (options.notificationId) {
    await prisma.notification.updateMany({
      where: { id: options.notificationId, userId },
      data: { isRead: true, readAt: now },
    });
  }

  return listUserNotifications(userId, roleCode);
}
