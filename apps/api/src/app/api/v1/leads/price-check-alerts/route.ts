import { NextResponse } from 'next/server';
import { prisma } from '@toantrung/database';
import { CreatePriceCheckAlertSchema } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { readPrivateBusinessFile } from '../../../../../core/storage/private-files.service';
import {
  createCompetitorPriceCheckAlert,
  dismissCompetitorPriceCheckAlert,
  shouldAnonymizeLeadForRole,
} from '../../../../../modules/01-leads/service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'LEAD_VIEW_OWN', {
    requireCsrf: false,
  });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const downloadAlertId = Number(url.searchParams.get('downloadAlertId') || 0);
  if (downloadAlertId > 0) {
    if (shouldAnonymizeLeadForRole(auth.user.roleCode)) {
      return jsonError(
        'FORBIDDEN_ANONYMIZED_ROLE',
        'Vai trò xem ẩn danh không được tải ảnh chụp đoạn chat khách hàng.',
        403,
      );
    }
    const alert = await prisma.priceCheckAlert.findUnique({
      where: { id: downloadAlertId },
    });
    if (!alert || !alert.chatScreenshotUrl) {
      return jsonError('NOT_FOUND', 'Không tìm thấy ảnh minh chứng cảnh báo dò giá.', 404);
    }
    const fileData = readPrivateBusinessFile(alert.chatScreenshotUrl);
    if (!fileData) {
      return jsonError('FILE_MISSING', 'Tệp ảnh minh chứng không tồn tại.', 404);
    }
    return new NextResponse(new Uint8Array(fileData.buffer), {
      status: 200,
      headers: {
        'Content-Type': fileData.mimeType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  return jsonSuccess({ ok: true });
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'LEAD_UPDATE_PIPELINE');
  if (!auth.ok) return auth.response;

  try {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const leadId = Number(formData.get('leadId') || 0);
      const reasonEvidence = String(formData.get('reasonEvidence') || '').trim();
      const parsed = CreatePriceCheckAlertSchema.safeParse({ leadId, reasonEvidence });
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Thông tin cảnh báo dò giá không hợp lệ.',
          400,
        );
      }
      const screenshotFile = formData.get('screenshot');
      let screenshotBuffer: Buffer | null = null;
      let screenshotMimeType: string | null = null;
      if (screenshotFile instanceof File && screenshotFile.size > 0) {
        screenshotBuffer = Buffer.from(await screenshotFile.arrayBuffer());
        screenshotMimeType = screenshotFile.type || 'image/png';
      }
      const created = await createCompetitorPriceCheckAlert({
        actor: auth.user,
        leadId: parsed.data.leadId,
        reasonEvidence: parsed.data.reasonEvidence,
        screenshotBuffer,
        screenshotMimeType,
      });
      return jsonSuccess({ id: created.id }, 201);
    }

    const raw = await req.json();
    const parsed = CreatePriceCheckAlertSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Thông tin cảnh báo dò giá không hợp lệ.',
        400,
      );
    }

    const created = await createCompetitorPriceCheckAlert({
      actor: auth.user,
      leadId: parsed.data.leadId,
      reasonEvidence: parsed.data.reasonEvidence,
    });
    return jsonSuccess({ id: created.id }, 201);
  } catch (err) {
    return jsonError(
      'PRICE_CHECK_ALERT_FAILED',
      err instanceof Error ? err.message : 'Không thể đăng cảnh báo dò giá.',
      400,
    );
  }
}

export async function PATCH(req: Request) {
  const auth = await requirePermissionSession(req, 'LEAD_UPDATE_PIPELINE');
  if (!auth.ok) return auth.response;

  try {
    const raw = (await req.json()) as { alertId?: number; dismissReason?: string };
    const alertId = Number(raw?.alertId || 0);
    const dismissReason = String(raw?.dismissReason || '').trim();
    if (!alertId || !dismissReason) {
      return jsonError(
        'VALIDATION_ERROR',
        'Vui lòng chọn cảnh báo và nhập lý do gỡ cảnh báo bắt buộc (UC01 5.3).',
        400,
      );
    }

    const updated = await dismissCompetitorPriceCheckAlert({
      actor: auth.user,
      alertId,
      dismissReason,
    });
    return jsonSuccess({ id: updated.id, status: updated.status }, 200);
  } catch (err) {
    return jsonError(
      'PRICE_CHECK_DISMISS_FAILED',
      err instanceof Error ? err.message : 'Không thể gỡ cảnh báo dò giá.',
      400,
    );
  }
}


