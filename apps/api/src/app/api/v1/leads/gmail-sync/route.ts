import { jsonError, jsonSuccess } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import {
  ensureGmailAutoSyncPollerStarted,
  getGmailLeadSyncStatus,
  saveGmailLeadSyncConfig,
  syncLeadsFromGmail,
} from '../../../../../modules/01-leads/gmail-sync.service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'LEAD_VIEW_OWN');
  if (!auth.ok) return auth.response;

  ensureGmailAutoSyncPollerStarted();

  try {
    const status = await getGmailLeadSyncStatus();
    return jsonSuccess(status);
  } catch (err) {
    return jsonError(
      'GMAIL_SYNC_STATUS_FAILED',
      err instanceof Error ? err.message : 'Không thể đọc trạng thái đồng bộ Gmail.',
      500,
    );
  }
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'LEAD_CREATE');
  if (!auth.ok) return auth.response;

  ensureGmailAutoSyncPollerStarted();

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: 'sync_now' | 'save_config';
      enabled?: boolean;
      query?: string;
      maxMessages?: number;
      onlyLeadKeywords?: boolean;
    };

    if (body.action === 'save_config') {
      const updatedConfig = await saveGmailLeadSyncConfig({
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        query: typeof body.query === 'string' ? body.query : undefined,
        maxMessages: typeof body.maxMessages === 'number' ? body.maxMessages : undefined,
        onlyLeadKeywords:
          typeof body.onlyLeadKeywords === 'boolean' ? body.onlyLeadKeywords : undefined,
      });
      const status = await getGmailLeadSyncStatus();
      return jsonSuccess({ ...status, config: updatedConfig });
    }

    if (
      typeof body.enabled === 'boolean' ||
      typeof body.query === 'string' ||
      typeof body.maxMessages === 'number' ||
      typeof body.onlyLeadKeywords === 'boolean'
    ) {
      await saveGmailLeadSyncConfig({
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        query: typeof body.query === 'string' ? body.query : undefined,
        maxMessages: typeof body.maxMessages === 'number' ? body.maxMessages : undefined,
        onlyLeadKeywords:
          typeof body.onlyLeadKeywords === 'boolean' ? body.onlyLeadKeywords : undefined,
      });
    }

    const result = await syncLeadsFromGmail({
      query: body.query,
      maxMessages: body.maxMessages,
      onlyLeadKeywords: body.onlyLeadKeywords,
    });
    const status = await getGmailLeadSyncStatus();

    return jsonSuccess({
      ...result,
      status,
    });
  } catch (err) {
    return jsonError(
      'GMAIL_SYNC_FAILED',
      err instanceof Error ? err.message : 'Lỗi khi đồng bộ Lead từ Gmail.',
      500,
    );
  }
}
