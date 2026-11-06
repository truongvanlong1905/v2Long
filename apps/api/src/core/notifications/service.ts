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

export async function createDispatchNotification(
  userId: number,
  roleCode: RoleCode,
  input: {
    title: string;
    summary: string;
    category?: string;
    actionLabel?: string;
    actionUrl?: string;
    contentHtml?: string;
    targetDepartments?: string[];
    authorName?: string;
    authorRole?: string;
  },
) {
  let savedReportId: number | null = null;
  if (input.contentHtml && input.contentHtml.trim()) {
    const auditEntry = await prisma.auditLog.create({
      data: {
        actorUserId: userId,
        action: 'REPORT_DISPATCHED',
        targetType: 'EXECUTIVE_REPORT',
        targetId: `RPT-${Date.now()}`,
        detailsJson: JSON.stringify({
          title: input.title.trim(),
          summary: input.summary.trim(),
          contentHtml: input.contentHtml,
          targetDepartments: input.targetDepartments || [],
          authorName: input.authorName || 'Điều hành Toàn Trung',
          authorRole: input.authorRole || roleCode,
        }),
      },
    });
    savedReportId = auditEntry.id;
  }

  const finalActionUrl = savedReportId
    ? `/reports?viewReportId=${savedReportId}`
    : input.actionUrl || '/reports';

  // Gửi thông báo thực tế đến toàn bộ người dùng thuộc phòng ban nhận + Ban Giám đốc + Người gửi
  const allActiveUsers = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    include: { role: true },
  });

  const targetDepts = input.targetDepartments || [];
  const isBroadcast = targetDepts.length === 0 || targetDepts.includes('ALL');

  const recipientIds = new Set<number>([userId]);
  for (const u of allActiveUsers) {
    const rc = u.role.roleCode;
    if (rc === 'BOD' || rc === 'ADMIN' || isBroadcast) {
      recipientIds.add(u.id);
      continue;
    }
    if (targetDepts.includes('KINH_DOANH') && (rc === 'SALES' || rc === 'SALES_LEAD')) {
      recipientIds.add(u.id);
    }
    if (targetDepts.includes('MARKETING_SEO') && (rc === 'MKT_STAFF' || rc === 'MKT_LEAD')) {
      recipientIds.add(u.id);
    }
    if (targetDepts.includes('ADS') && rc === 'ADS') {
      recipientIds.add(u.id);
    }
    if (targetDepts.includes('KY_THUAT_THIET_KE') && rc === 'DESIGNER') {
      recipientIds.add(u.id);
    }
  }

  await prisma.notification.createMany({
    data: Array.from(recipientIds).map((uid) => ({
      userId: uid,
      title: input.title.trim().slice(0, 200),
      summary: input.summary.trim().slice(0, 500),
      category: (input.category || 'Báo cáo & Điều hành').trim().slice(0, 80),
      isRead: false,
      actionLabel: input.actionLabel || 'Mở đọc toàn văn báo cáo',
      actionUrl: finalActionUrl,
      requiredPermission: 'DASHBOARD_VIEW',
    })),
  });

  const list = await listUserNotifications(userId, roleCode);
  return {
    ...list,
    savedReportId,
  };
}

export async function saveReportDraftForUser(
  userId: number,
  roleCode: RoleCode,
  input: {
    draftId?: number | null;
    title: string;
    summary: string;
    contentHtml: string;
    targetDepartments?: string[];
    authorName?: string;
    authorRole?: string;
    reportingPeriod?: string;
  },
) {
  const payloadJson = JSON.stringify({
    status: 'DRAFT',
    title: input.title.trim(),
    summary: input.summary.trim(),
    contentHtml: input.contentHtml,
    targetDepartments: input.targetDepartments || [],
    authorName: input.authorName || 'Điều hành Toàn Trung',
    authorRole: input.authorRole || roleCode,
    reportingPeriod: input.reportingPeriod || '30 ngày gần nhất',
    updatedAt: new Date().toISOString(),
  });

  if (input.draftId && input.draftId > 0) {
    const existing = await prisma.auditLog.findFirst({
      where: {
        id: input.draftId,
        actorUserId: userId,
        targetType: 'EXECUTIVE_REPORT_DRAFT',
      },
    });
    if (existing) {
      const updated = await prisma.auditLog.update({
        where: { id: existing.id },
        data: { detailsJson: payloadJson },
      });
      return {
        id: updated.id,
        reportCode: updated.targetId || `DRAFT-${updated.id}`,
        status: 'DRAFT' as const,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  const created = await prisma.auditLog.create({
    data: {
      actorUserId: userId,
      action: 'REPORT_DRAFT_SAVED',
      targetType: 'EXECUTIVE_REPORT_DRAFT',
      targetId: `DRAFT-${Date.now()}`,
      detailsJson: payloadJson,
    },
  });

  return {
    id: created.id,
    reportCode: created.targetId || `DRAFT-${created.id}`,
    status: 'DRAFT' as const,
    updatedAt: created.createdAt.toISOString(),
  };
}

export async function listDispatchedExecutiveReports(limit = 15, actorUserId?: number) {
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: 'EXECUTIVE_REPORT' },
        ...(actorUserId
          ? [{ targetType: 'EXECUTIVE_REPORT_DRAFT', actorUserId }]
          : [{ targetType: 'EXECUTIVE_REPORT_DRAFT' }]),
      ],
    },
    include: { actor: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return logs.map((l) => {
    let parsed: {
      status?: 'DRAFT' | 'ISSUED';
      title?: string;
      summary?: string;
      contentHtml?: string;
      targetDepartments?: string[];
      authorName?: string;
      authorRole?: string;
      reportingPeriod?: string;
    } = {};
    if (l.detailsJson) {
      try {
        parsed = JSON.parse(l.detailsJson) as typeof parsed;
      } catch {
        // ignore
      }
    }
    const isDraft = l.targetType === 'EXECUTIVE_REPORT_DRAFT' || parsed.status === 'DRAFT';
    return {
      id: l.id,
      reportCode: l.targetId || (isDraft ? `TT-DRAFT-${l.id}` : `TT-RPT-${l.id}`),
      status: isDraft ? ('DRAFT' as const) : ('ISSUED' as const),
      title: parsed.title || 'Báo cáo điều hành nội bộ',
      summary: parsed.summary || '',
      contentHtml: parsed.contentHtml || '',
      targetDepartments: parsed.targetDepartments || [],
      reportingPeriod: parsed.reportingPeriod || '30 ngày gần nhất',
      authorName: parsed.authorName || l.actor?.fullName || 'Điều hành',
      authorRole: parsed.authorRole || '',
      createdAt: l.createdAt.toISOString(),
    };
  });
}

