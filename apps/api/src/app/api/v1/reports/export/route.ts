import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { generateScopedReportExportBuffer } from '../../../../../modules/04-reports/service';

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const preset = url.searchParams.get('preset') ?? '30d';
    const fromDate = url.searchParams.get('fromDate') ?? undefined;
    const toDate = url.searchParams.get('toDate') ?? undefined;
    const formatParam = url.searchParams.get('format');
    const format = formatParam === 'csv' ? 'csv' : 'xlsx';

    const { buffer, fileName, mimeType } = await generateScopedReportExportBuffer(
      auth.user,
      { preset, fromDate, toDate },
      format
    );

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'REPORT_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể xuất file báo cáo.',
      400
    );
  }
}
