import { ConcurrencyConflictError, prisma } from '@toantrung/database';
import {
  CreatePrivateQuoteVersionSchema,
  MarkLeadSpamSchema,
  ReassignLeadSchema,
  TransitionPipelineSchema,
  UpdateLeadDetailsSchema,
} from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import {
  requirePermissionSession,
} from '../../../../../core/permissions';
import {
  assertLeadMutationScope,
  confirmReceiveLead,
  createPrivateQuoteVersion,
  markLeadSpam,
  reassignLeadSales,
  reviewPendingSpamLead,
  transitionLeadPipeline,
  updateLeadInformation,
} from '../../../../../modules/01-leads/service';

export async function PATCH(
  req: Request,
  context: { params: { id: string } },
) {
  const leadId = Number(context.params.id);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return jsonError('INVALID_LEAD_ID', 'Mã hồ sơ Lead không hợp lệ.', 400);
  }

  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const action = String(raw.action || 'transition_pipeline');

    if (action === 'reassign_sales') {
      const auth = await requirePermissionSession(req, 'LEAD_REASSIGN');
      if (!auth.ok) return auth.response;

      const parsed = ReassignLeadSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Thông tin chuyển giao không hợp lệ.',
          400,
        );
      }
      const res = await reassignLeadSales(auth.user, leadId, parsed.data);
      return jsonSuccess({ id: res.lead.id, version: res.lead.version });
    }

    const auth = await requirePermissionSession(req, 'LEAD_UPDATE_PIPELINE');
    if (!auth.ok) return auth.response;

    if (action === 'confirm_receive') {
      const expectedVersion = Number(raw.expectedVersion || 1);
      const res = await confirmReceiveLead(auth.user, leadId, expectedVersion);
      return jsonSuccess({ id: res.lead.id, version: res.lead.version });
    }

    if (action === 'update_info') {
      const parsed = UpdateLeadDetailsSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Dữ liệu cập nhật Lead không hợp lệ.',
          400,
        );
      }
      await updateLeadInformation(auth.user, leadId, parsed.data);
      return jsonSuccess({ id: leadId });
    }

    if (action === 'mark_spam') {
      const parsed = MarkLeadSpamSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Vui lòng chọn lý do đánh dấu Spam.',
          400,
        );
      }
      const res = await markLeadSpam(auth.user, leadId, parsed.data);
      return jsonSuccess({ id: res.lead.id, version: res.lead.version });
    }

    if (action === 'review_spam') {
      const decision = raw.decision === 'restore_lead' ? 'RESTORE_VALID' : 'CONFIRM_SPAM';
      const updated = await reviewPendingSpamLead(
        auth.user,
        leadId,
        decision,
        typeof raw.note === 'string' ? raw.note : undefined,
      );
      return jsonSuccess({ id: updated.id, version: updated.version });
    }

    if (action === 'create_quote_version') {
      const parsed = CreatePrivateQuoteVersionSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Dữ liệu hồ sơ báo giá nội bộ không hợp lệ.',
          400,
        );
      }
      const res = await createPrivateQuoteVersion(auth.user, leadId, parsed.data);
      return jsonSuccess({
        id: res.lead.id,
        version: res.lead.version,
        pipelineStatus: res.lead.pipelineStatus,
      });
    }

    if (action === 'add_note') {
      const note = String(raw.noteContent || '').trim();
      if (!note) {
        return jsonError('VALIDATION_ERROR', 'Nội dung ghi chú không được để trống.', 400);
      }
      const existing = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!existing) {
        return jsonError('NOT_FOUND', 'Không tìm thấy hồ sơ Lead.', 404);
      }
      assertLeadMutationScope(auth.user, existing);
      await prisma.leadActivity.create({
        data: {
          leadId,
          actionType: 'add_note',
          actionById: auth.user.id,
          actorType: 'user',
          note,
        },
      });
      return jsonSuccess({ id: leadId });
    }

    if (action === 'send_reminder_nudge') {
      const existing = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!existing) {
        return jsonError('NOT_FOUND', 'Không tìm thấy hồ sơ Lead.', 404);
      }
      const reminderLabel = String(raw.reminderLabel || 'Nhắc xử lý hồ sơ Lead').trim();
      const customMessage = String(raw.message || '').trim();
      const noteText = customMessage
        ? `[Nhắc việc tự động · ${reminderLabel}] ${customMessage}`
        : `[Nhắc việc tự động · ${reminderLabel}] ${auth.user.fullName} đã gửi thông báo nhắc xử lý nhanh hồ sơ ${existing.leadCode}.`;

      await prisma.leadActivity.create({
        data: {
          leadId,
          actionType: 'add_note',
          actionById: auth.user.id,
          actorType: 'user',
          note: noteText,
        },
      });

      const targetUserId = existing.assignedSalesId || existing.createdByUserId || auth.user.id;
      if (targetUserId) {
        await prisma.notification.create({
          data: {
            userId: targetUserId,
            title: `🔔 Nhắc việc: ${existing.companyName || existing.contactName || existing.leadCode}`,
            summary: `${reminderLabel} (${existing.leadCode}) — Người gửi: ${auth.user.fullName}${customMessage ? ` · "${customMessage}"` : ''}`,
            category: 'Nhắc việc Lead',
            actionLabel: 'Mở xử lý ngay',
            actionUrl: `/leads?highlight=${existing.id}`,
            requiredPermission: 'LEAD_VIEW_OWN',
          },
        });
      }

      return jsonSuccess({ id: leadId, notifiedUserId: targetUserId });
    }

    if (action === 'quick_ack_reminder') {
      const existing = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!existing) {
        return jsonError('NOT_FOUND', 'Không tìm thấy hồ sơ Lead.', 404);
      }
      assertLeadMutationScope(auth.user, existing);
      const ackType = String(raw.ackType || 'followed_up');
      const noteContent = String(
        raw.noteContent || 'Đã liên hệ chăm sóc & cập nhật tiến độ theo nhắc việc tự động.',
      ).trim();

      await prisma.$transaction(async (tx) => {
        if (ackType === 'quote_responded') {
          await tx.lead.update({
            where: { id: leadId },
            data: {
              quoteRespondedAt: new Date(),
              version: { increment: 1 },
            },
          });
        }
        await tx.leadActivity.create({
          data: {
            leadId,
            actionType: 'add_note',
            actionById: auth.user.id,
            actorType: 'user',
            note: `[Xử lý nhắc việc] ${noteContent}`,
          },
        });
      });

      return jsonSuccess({ id: leadId });
    }

    const parsed = TransitionPipelineSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Dữ liệu chuyển trạng thái Pipeline không hợp lệ.',
        400,
      );
    }

    const res = await transitionLeadPipeline(auth.user, leadId, parsed.data);
    return jsonSuccess({
      id: res.lead.id,
      version: res.lead.version,
      pipelineStatus: res.lead.pipelineStatus,
    });
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      return jsonError('CONCURRENCY_CONFLICT', err.message, 409);
    }
    return jsonError(
      'LEAD_UPDATE_FAILED',
      err instanceof Error ? err.message : 'Không thể cập nhật hồ sơ Lead.',
      400,
    );
  }
}

