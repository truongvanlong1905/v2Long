import { ConcurrencyConflictError } from '@toantrung/database';
import {
  ApproveAndScheduleSeoArticleSchema,
  PublishSeoArticleNowSchema,
  UpdateSeoArticleDraftSchema,
  WithdrawSeoApprovalSchema,
} from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { requirePermissionSession } from '../../../../../../core/permissions';
import {
  approveAndScheduleSeoArticle,
  publishSeoArticleToTargetWebsite,
  updateSeoArticleDraftWithRevision,
  withdrawSeoArticleApproval,
} from '../../../../../../modules/03-keywords-ads/service';

export async function PATCH(
  req: Request,
  context: { params: { id: string } },
) {
  const auth = await requirePermissionSession(req, 'AI_MARKETING_SEO');
  if (!auth.ok) return auth.response;

  const articleId = Number(context.params.id);
  if (!Number.isInteger(articleId) || articleId <= 0) {
    return jsonError('INVALID_ARTICLE_ID', 'Mã bài viết SEO không hợp lệ.', 400);
  }

  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const action = String(raw.action || 'update_draft');

    if (action === 'approve_schedule') {
      const parsed = ApproveAndScheduleSeoArticleSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Thông tin duyệt & lên lịch không hợp lệ.',
          400,
        );
      }
      await approveAndScheduleSeoArticle(auth.user, articleId, parsed.data);
      return jsonSuccess({ id: articleId, status: 'APPROVED_SCHEDULED' });
    }

    if (action === 'withdraw_approval') {
      const parsed = WithdrawSeoApprovalSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError('VALIDATION_ERROR', 'Dữ liệu rút duyệt không hợp lệ.', 400);
      }
      await withdrawSeoArticleApproval(auth.user, articleId, parsed.data);
      return jsonSuccess({ id: articleId, status: 'DRAFT' });
    }

    if (action === 'publish_now') {
      const parsed = PublishSeoArticleNowSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError('VALIDATION_ERROR', 'Dữ liệu xuất bản không hợp lệ.', 400);
      }
      const res = await publishSeoArticleToTargetWebsite(auth.user, articleId, parsed.data);
      return jsonSuccess({ id: articleId, status: 'PUBLISHED', publishedUrl: res.publishedUrl });
    }

    const parsed = UpdateSeoArticleDraftSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Nội dung chỉnh sửa không hợp lệ.',
        400,
      );
    }
    const rev = await updateSeoArticleDraftWithRevision(auth.user, articleId, parsed.data);
    return jsonSuccess({ id: articleId, revisionNumber: rev.revisionNumber });
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      return jsonError('CONCURRENCY_CONFLICT', err.message, 409);
    }
    return jsonError(
      'SEO_ARTICLE_UPDATE_FAILED',
      err instanceof Error ? err.message : 'Không thể cập nhật bài viết SEO.',
      400,
    );
  }
}

