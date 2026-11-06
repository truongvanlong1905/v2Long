import { prisma } from '@toantrung/database';
import { WebhookLeadIntakeSchema } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { ingestWebhookLeadWithErrorProtection } from '../../../../../modules/02-tracking-sync/service';

const WEBHOOK_RATE_WINDOW_MS = 60_000;
const WEBHOOK_MAX_REQUESTS_PER_WINDOW = 60;
const webhookRateMap = new Map<string, { count: number; resetAt: number }>();

function checkWebhookRateLimit(clientKey: string): boolean {
  const now = Date.now();
  const entry = webhookRateMap.get(clientKey);
  if (!entry || now >= entry.resetAt) {
    webhookRateMap.set(clientKey, { count: 1, resetAt: now + WEBHOOK_RATE_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= WEBHOOK_MAX_REQUESTS_PER_WINDOW;
}

export async function POST(req: Request) {
  let raw: Record<string, unknown> = {};
  try {
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'local';
    if (!checkWebhookRateLimit(clientIp)) {
      return jsonError(
        'WEBHOOK_RATE_LIMITED',
        'Vượt quá giới hạn tần suất gọi Webhook. Vui lòng thử lại sau 1 phút.',
        429,
      );
    }

    const configuredSecret = process.env.WEBHOOK_SECRET?.trim();
    const providedSecret = req.headers.get('x-webhook-secret')?.trim();
    if (configuredSecret && providedSecret !== configuredSecret) {
      return jsonError(
        'WEBHOOK_UNAUTHORIZED',
        'Chữ ký hoặc mã bí mật Webhook (x-webhook-secret) không hợp lệ.',
        401,
      );
    }

    raw = (await req.json()) as Record<string, unknown>;
    const parsed = WebhookLeadIntakeSchema.safeParse(raw);
    if (!parsed.success) {
      const errMsg =
        parsed.error.issues[0]?.message || 'Dữ liệu Webhook gửi lên không hợp lệ.';
      const providerInternal =
        raw.intakeSourceProvider === 'GOOGLE_LEAD_FORM' ? 'google_lead_form' : 'website_webhook';
      const accountKey = String(raw.intakeSourceAccountKey || 'unknown')
        .trim()
        .toLowerCase();
      const submissionId = String(
        raw.externalSubmissionId || `invalid_${Date.now()}`,
      ).trim();

      await prisma.webhookIntakeErrorLog.upsert({
        where: {
          uq_webhook_error_source_submission: {
            sourcePlatform: providerInternal,
            intakeSourceAccountKey: accountKey,
            externalSubmissionId: submissionId,
          },
        },
        update: {
          rawPayloadJson: JSON.stringify(raw),
          errorMessage: errMsg,
          retryCount: { increment: 1 },
          lastRetriedAt: new Date(),
        },
        create: {
          sourcePlatform: providerInternal,
          intakeSourceAccountKey: accountKey,
          externalSubmissionId: submissionId,
          rawPayloadJson: JSON.stringify(raw),
          errorCode: 'WEBHOOK_SCHEMA_INVALID',
          errorMessage: errMsg,
        },
      });

      return jsonError('WEBHOOK_SCHEMA_INVALID', errMsg, 400);
    }

    const res = await ingestWebhookLeadWithErrorProtection(parsed.data);
    return jsonSuccess(res, res.deduplicated ? 200 : 201);
  } catch (err) {
    return jsonError(
      'WEBHOOK_INGEST_FAILED',
      err instanceof Error ? err.message : 'Lỗi tiếp nhận Lead từ Webhook.',
      400,
    );
  }
}
