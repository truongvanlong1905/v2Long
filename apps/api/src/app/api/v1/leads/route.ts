import { CreateManualLeadSchema } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../core/http';
import {
  requirePermissionSession,
} from '../../../../core/permissions';
import {
  createManualLead,
  listLeadsForUser,
} from '../../../../modules/01-leads/service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'LEAD_VIEW_OWN');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const includeSpam = url.searchParams.get('includeSpam') === 'true';

    const payload = await listLeadsForUser(auth.user, {
      status,
      search,
      includeSpam,
    });

    return jsonSuccess(payload);
  } catch (err) {
    return jsonError(
      'LEAD_LIST_FAILED',
      err instanceof Error ? err.message : 'Không thể tải danh sách hồ sơ Lead.',
      500,
    );
  }
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'LEAD_CREATE');
  if (!auth.ok) return auth.response;

  try {
    const raw = await req.json();
    const parsed = CreateManualLeadSchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        'VALIDATION_ERROR',
        parsed.error.issues[0]?.message || 'Dữ liệu tạo Lead không hợp lệ.',
        400,
        parsed.error.flatten(),
      );
    }

    const created = await createManualLead(auth.user, parsed.data);
    return jsonSuccess({ id: created.id, leadCode: created.leadCode }, 201);
  } catch (err) {
    return jsonError(
      'LEAD_CREATE_FAILED',
      err instanceof Error ? err.message : 'Không thể tạo hồ sơ Lead mới.',
      400,
    );
  }
}

