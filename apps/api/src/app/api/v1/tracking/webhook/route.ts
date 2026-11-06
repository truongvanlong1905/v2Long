import { WebhookLeadIntakeSchema } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { ingestWebhookLeadWithErrorProtection } from '../../../../../modules/02-tracking-sync/service';

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = WebhookLeadIntakeSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'WEBHOOK_SCHEMA_INVALID',
        parsed.error.issues[0]?.message || 'Dữ liệu Webhook gửi lên không hợp lệ.',
        400,
      );
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

