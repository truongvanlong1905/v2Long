import {
  DeclareExternalCampaignSchema,
  ResolveReconciliationSchema,
  TriggerPlatformSyncSchema,
  WebhookLeadIntakeSchema,
} from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../core/http';
import { requirePermissionSession } from '../../../../core/permissions';
import {
  declareExternalCampaignAndRemapUtm,
  getTrackingDashboardData,
  ingestWebhookLeadWithErrorProtection,
  resolveLeadReconciliationAlert,
  triggerPlatformSyncExecution,
} from '../../../../modules/02-tracking-sync/service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'TRACKING_ADS_OPTIMIZE');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const periodDays = Number(url.searchParams.get('periodDays') || 30);
    const data = await getTrackingDashboardData(
      Number.isFinite(periodDays) && periodDays > 0 ? periodDays : 30,
    );
    return jsonSuccess(data);
  } catch (err) {
    return jsonError(
      'TRACKING_DASHBOARD_FAILED',
      err instanceof Error ? err.message : 'Không thể tải dữ liệu Tracking & Đồng bộ.',
      500,
    );
  }
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'TRACKING_ADS_OPTIMIZE');
  if (!auth.ok) return auth.response;

  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const action = String(raw.action || 'trigger_sync');

    if (action === 'declare_campaign') {
      const parsed = DeclareExternalCampaignSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Thông tin khai báo chiến dịch không hợp lệ.',
          400,
        );
      }
      const res = await declareExternalCampaignAndRemapUtm(parsed.data);
      return jsonSuccess(
        {
          campaignId: res.campaign.id,
          remappedCount: res.remappedCount,
        },
        201,
      );
    }

    if (action === 'resolve_reconciliation') {
      const parsed = ResolveReconciliationSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Vui lòng nhập ghi chú xử lý đối soát.',
          400,
        );
      }
      const res = await resolveLeadReconciliationAlert(auth.user, parsed.data);
      return jsonSuccess({ id: res.id, status: res.status });
    }

    if (action === 'simulate_webhook') {
      const parsed = WebhookLeadIntakeSchema.safeParse(raw);
      if (!parsed.success) {
        return jsonError(
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Payload Webhook không hợp lệ.',
          400,
        );
      }
      const res = await ingestWebhookLeadWithErrorProtection(parsed.data);
      return jsonSuccess(res, res.deduplicated ? 200 : 201);
    }

    const parsed = TriggerPlatformSyncSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError('VALIDATION_ERROR', 'Tham số đồng bộ không hợp lệ.', 400);
    }
    const res = await triggerPlatformSyncExecution(parsed.data);
    return jsonSuccess(res);
  } catch (err) {
    return jsonError(
      'TRACKING_ACTION_FAILED',
      err instanceof Error ? err.message : 'Thao tác Tracking/Đồng bộ thất bại.',
      400,
    );
  }
}

