import {
  CreateSeoKeywordSchema,
  GenerateSeoDraftByAiSchema,
} from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../core/http';
import { requirePermissionSession } from '../../../../core/permissions';
import {
  createSeoKeyword,
  deleteSeoKeywordById,
  generateSeoArticleDraftByAi,
  listKeywordsAndArticlesForUser,
} from '../../../../modules/03-keywords-ads/service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'AI_MARKETING_SEO');
  if (!auth.ok) return auth.response;

  try {
    const payload = await listKeywordsAndArticlesForUser(auth.user);
    return jsonSuccess(payload);
  } catch (err) {
    return jsonError(
      'SEO_LIST_FAILED',
      err instanceof Error ? err.message : 'Không thể tải dữ liệu Từ khóa & Nội dung SEO.',
      500,
    );
  }
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'AI_MARKETING_SEO');
  if (!auth.ok) return auth.response;

  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const action = String(raw.action || 'generate_ai_draft');

    if (action === 'delete_keyword') {
      const kwId = Number(raw.keywordId);
      if (!Number.isInteger(kwId) || kwId <= 0) {
        return jsonError('VALIDATION_ERROR', 'Mã từ khóa cần xoá không hợp lệ.', 400);
      }
      await deleteSeoKeywordById(auth.user, kwId);
      return jsonSuccess({ deletedId: kwId });
    }

    if (action === 'create_keyword' || action === 'upsert_keyword') {
      const parsed = CreateSeoKeywordSchema.safeParse({
        action: 'create_keyword',
        keywordText: raw.keywordText,
        targetWebsite: raw.targetWebsite || 'toantrung.com.vn',
      });
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Từ khóa không hợp lệ.',
          400,
        );
      }
      const created = await createSeoKeyword(auth.user, {
        ...parsed.data,
        cachedSearchVolume:
          raw.cachedSearchVolume !== undefined && raw.cachedSearchVolume !== ''
            ? Number(raw.cachedSearchVolume)
            : undefined,
        cachedAdsClicks:
          raw.cachedAdsClicks !== undefined && raw.cachedAdsClicks !== ''
            ? Number(raw.cachedAdsClicks)
            : undefined,
        cachedOrganicClicks:
          raw.cachedOrganicClicks !== undefined && raw.cachedOrganicClicks !== ''
            ? Number(raw.cachedOrganicClicks)
            : undefined,
        cachedAvgPosition:
          raw.cachedAvgPosition !== undefined && raw.cachedAvgPosition !== ''
            ? Number(raw.cachedAvgPosition)
            : undefined,
        trendDirection:
          raw.trendDirection === 'UP' ||
          raw.trendDirection === 'STABLE' ||
          raw.trendDirection === 'DOWN'
            ? raw.trendDirection
            : undefined,
        recommendedPublishWindow:
          typeof raw.recommendedPublishWindow === 'string' && raw.recommendedPublishWindow.trim()
            ? raw.recommendedPublishWindow.trim()
            : undefined,
      });
      return jsonSuccess({ id: created.id, keyword: created.keyword }, 201);
    }

    const parsed = GenerateSeoDraftByAiSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Thông tin tạo bản nháp AI không hợp lệ.',
        400,
      );
    }

    const article = await generateSeoArticleDraftByAi(auth.user, parsed.data);
    return jsonSuccess({ id: article.id, title: article.title }, 201);
  } catch (err) {
    return jsonError(
      'SEO_ACTION_FAILED',
      err instanceof Error ? err.message : 'Thao tác SEO thất bại.',
      400,
    );
  }
}

