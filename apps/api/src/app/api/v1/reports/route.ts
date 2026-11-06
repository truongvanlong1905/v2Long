import { jsonError, jsonSuccess } from '../../../../core/http';
import { requirePermissionSession } from '../../../../core/permissions';
import { getScopedReportsDashboard } from '../../../../modules/04-reports/service';

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'DASHBOARD_VIEW');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const preset = url.searchParams.get('preset') ?? '30d';
    const fromDate = url.searchParams.get('fromDate') ?? undefined;
    const toDate = url.searchParams.get('toDate') ?? undefined;

    const data = await getScopedReportsDashboard(auth.user, {
      preset,
      fromDate,
      toDate,
    });
    return jsonSuccess(data);
  } catch (err) {
    return jsonError(
      'REPORTS_FETCH_FAILED',
      err instanceof Error ? err.message : 'Không thể tải báo cáo phân quyền.',
      500
    );
  }
}
