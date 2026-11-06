import { prisma } from '@toantrung/database';
import { hasBaPermission } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import { executeWorkerJobByCode, type WorkerJobCode } from '../../../../../../workers';

const ALLOWLISTED_WORKER_JOBS: readonly WorkerJobCode[] = [
  'D3_SYNC_FULL',
  'GCLID_HOURLY_RETRY',
  'GOOGLE_LEAD_RECONCILE',
  'SEO_SCHEDULED_PUBLISH',
  'OVERDUE_QUOTE_REMINDER',
  'ALL_JOBS',
] as const;

// In-process execution lock & rate-limit tracker to prevent overlapping runs
const activeJobLocks = new Map<string, number>();
const lastJobCompletedAt = new Map<string, number>();

export async function POST(
  req: Request,
  context: { params: { jobCode: string } }
) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  const canRunWorker =
    hasBaPermission(auth.user.roleCode, 'TRACKING_ADS_OPTIMIZE') ||
    hasBaPermission(auth.user.roleCode, 'SYSTEM_USER_ADMIN');

  if (!canRunWorker) {
    return jsonError(
      'FORBIDDEN_PERMISSION',
      'Tài khoản không có quyền khởi chạy tác vụ đồng bộ nền (Worker).',
      403
    );
  }

  const rawCode = String(context.params.jobCode || '').trim().toUpperCase() as WorkerJobCode;
  if (!ALLOWLISTED_WORKER_JOBS.includes(rawCode)) {
    return jsonError(
      'WORKER_JOB_NOT_ALLOWLISTED',
      `Mã tác vụ "${rawCode}" không nằm trong danh sách cho phép (${ALLOWLISTED_WORKER_JOBS.join(', ')}).`,
      400
    );
  }

  const now = Date.now();
  const existingLockStarted = activeJobLocks.get(rawCode);
  if (existingLockStarted && now - existingLockStarted < 60_000) {
    return jsonError(
      'WORKER_JOB_ALREADY_RUNNING',
      `Tác vụ ${rawCode} đang chạy từ ${Math.round((now - existingLockStarted) / 1000)}s trước. Đã chặn chạy chồng lấp (Lock).`,
      409
    );
  }

  const lastRun = lastJobCompletedAt.get(`${auth.user.id}:${rawCode}`);
  if (lastRun && now - lastRun < 1500) {
    return jsonError(
      'WORKER_RATE_LIMITED',
      `Vui lòng đợi tối thiểu 2 giây trước khi kích hoạt lại tác vụ ${rawCode}.`,
      429
    );
  }

  activeJobLocks.set(rawCode, now);
  const startedAtIso = new Date(now).toISOString();

  try {
    let attempt = 0;
    let lastError: unknown = null;
    let jobResult: Awaited<ReturnType<typeof executeWorkerJobByCode>> | null = null;

    // Retry with exponential backoff on transient failure (max 2 attempts)
    while (attempt < 2) {
      attempt++;
      try {
        jobResult = await executeWorkerJobByCode(rawCode, auth.user.id);
        break;
      } catch (err) {
        lastError = err;
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 150 * attempt));
        }
      }
    }

    if (!jobResult) {
      throw lastError instanceof Error ? lastError : new Error('Thực thi Worker thất bại sau khi thử lại.');
    }

    const latestSyncRow = await prisma.platformSyncLog.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true, platform: true, status: true, startedAt: true, completedAt: true },
    });

    const executionId = latestSyncRow?.id
      ? `EXEC-${latestSyncRow.id}`
      : `EXEC-${rawCode}-${Date.now()}`;

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'WORKER_JOB_EXECUTED',
        targetType: 'WorkerJob',
        targetId: executionId,
        detailsJson: JSON.stringify({
          jobCode: rawCode,
          executionId,
          attempts: attempt,
          startedAt: startedAtIso,
          completedAt: jobResult.executedAt,
        }),
      },
    });

    lastJobCompletedAt.set(`${auth.user.id}:${rawCode}`, Date.now());

    return jsonSuccess({
      executionId,
      syncLogId: latestSyncRow?.id ?? null,
      jobCode: rawCode,
      status: 'success',
      attempts: attempt,
      startedAt: startedAtIso,
      completedAt: jobResult.executedAt,
      summary: jobResult.summary,
    });
  } catch (err) {
    return jsonError(
      'WORKER_EXECUTION_FAILED',
      err instanceof Error ? err.message : 'Không thể thực thi tác vụ nền.',
      500
    );
  } finally {
    activeJobLocks.delete(rawCode);
  }
}
