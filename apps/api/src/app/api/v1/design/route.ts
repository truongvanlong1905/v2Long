import {
  ConfigureAiProvidersSchema,
  CreateDesignRequestSchema,
  hasBaPermission,
} from '@toantrung/contracts';
import { prisma } from '@toantrung/database';
import { jsonError, jsonSuccess } from '../../../../core/http';
import { requireAuthenticatedSession } from '../../../../core/permissions';
import {
  configureAiProviders,
  createDesignRequestWithAiDraft,
  deleteDesignProject,
  listDesignRequestsForUser,
} from '../../../../modules/05-ai-design/service';

export async function GET(req: Request) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  try {
    const data = await listDesignRequestsForUser(auth.user);
    return jsonSuccess(data);
  } catch (err) {
    return jsonError(
      'DESIGN_LIST_FAILED',
      err instanceof Error ? err.message : 'Không thể tải danh sách yêu cầu thiết kế AI.',
      500
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  try {
    const raw = (await req.json()) as Record<string, unknown>;

    if (raw.action === 'configure_ai_providers') {
      if (!hasBaPermission(auth.user.roleCode, 'AI_DESIGN')) {
        return jsonError(
          'FORBIDDEN_PERMISSION',
          'Chỉ Quản trị viên, Ban Giám đốc, Trưởng phòng hoặc Designer được cấu hình hệ thống Đa AI.',
          403
        );
      }
      const parsedCfg = ConfigureAiProvidersSchema.safeParse(raw);
      if (!parsedCfg.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsedCfg.error.issues[0]?.message || 'Cấu hình Đa AI không hợp lệ.',
          400
        );
      }
      const providerStatus = await configureAiProviders(auth.user, parsedCfg.data);
      return jsonSuccess({ ok: true, providerStatus });
    }

    if (raw.action === 'bulk_delete_projects') {
      if (!hasBaPermission(auth.user.roleCode, 'AI_DESIGN')) {
        return jsonError(
          'FORBIDDEN_PERMISSION',
          'Tài khoản không có quyền xóa dự án thiết kế.',
          403
        );
      }
      const rawIds = Array.isArray(raw.projectIds) ? raw.projectIds : [];
      const ids = rawIds
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length === 0) {
        return jsonError('VALIDATION_ERROR', 'Vui lòng chọn ít nhất 1 dự án để xóa.', 400);
      }
      let deletedCount = 0;
      for (const pid of ids) {
        try {
          await deleteDesignProject(auth.user, pid);
          deletedCount += 1;
        } catch {
          // Skip projects already deleted or invalid
        }
      }
      return jsonSuccess({ ok: true, deletedCount });
    }

    const parsed = CreateDesignRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Thông số yêu cầu thiết kế AI không hợp lệ.',
        400
      );
    }

    const canDirectAiDesign = hasBaPermission(auth.user.roleCode, 'AI_DESIGN');
    const canRequestFromLead =
      Boolean(parsed.data.leadId) &&
      hasBaPermission(auth.user.roleCode, 'LEAD_UPDATE_PIPELINE') &&
      hasBaPermission(auth.user.roleCode, 'ATTACHMENT_UPLOAD_VIEW');

    if (!canDirectAiDesign && !canRequestFromLead) {
      return jsonError(
        'FORBIDDEN_PERMISSION',
        'Tài khoản không có quyền tạo dự án thiết kế trực tiếp (cần quyền AI_DESIGN hoặc gửi Yêu cầu thiết kế từ hồ sơ Lead được phân quyền).',
        403
      );
    }

    if (!canDirectAiDesign && parsed.data.leadId) {
      const lead = await prisma.lead.findUnique({
        where: { id: parsed.data.leadId },
        select: { id: true, assignedSalesId: true, createdByUserId: true },
      });
      if (!lead) {
        return jsonError('LEAD_NOT_FOUND', 'Không tìm thấy hồ sơ Lead liên kết.', 404);
      }
      if (
        auth.user.roleCode === 'SALES' &&
        lead.assignedSalesId !== auth.user.id &&
        lead.createdByUserId !== auth.user.id
      ) {
        return jsonError(
          'FORBIDDEN_LEAD_SCOPE',
          'Sales chỉ được gửi Yêu cầu thiết kế cho hồ sơ Lead mình phụ trách.',
          403
        );
      }
    }

    const result = await createDesignRequestWithAiDraft(auth.user, parsed.data);
    return jsonSuccess(result, 201);
  } catch (err) {
    return jsonError(
      'DESIGN_CREATE_FAILED',
      err instanceof Error ? err.message : 'Tạo yêu cầu thiết kế AI thất bại.',
      400
    );
  }
}

