'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Info,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { TrackingDashboardDto } from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

interface AdapterStatusItem {
  code: string;
  name: string;
  moduleScope: string;
  mode: 'LIVE_CONNECTED' | 'SIMULATED_FALLBACK';
  envKeysRequired: string[];
  description: string;
}

interface WorkerHistoryItem {
  id: number;
  jobCode: string;
  summary: string;
  durationMs: number;
  executedAt: string;
}

type ExtendedTrackingDashboardDto = TrackingDashboardDto & {
  adapterMatrix?: AdapterStatusItem[];
  workerHistory?: WorkerHistoryItem[];
};

export function TrackingWorkspace() {
  const { user } = useSession();
  const [data, setData] = useState<ExtendedTrackingDashboardDto | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Declare Campaign state (A3)
  const [newCampPlatform, setNewCampPlatform] = useState<'EXTERNAL' | 'GOOGLE_ADS' | 'FANPAGE'>('EXTERNAL');
  const [newCampCode, setNewCampCode] = useState('');
  const [newCampName, setNewCampName] = useState('');
  const [newCampBudgetVnd, setNewCampBudgetVnd] = useState('2000000');

  // Webhook simulator state (A1 & Idempotency)
  const [whWebsite, setWhWebsite] = useState('toantrung.com.vn');
  const [whSubmissionId, setWhSubmissionId] = useState('WEB-SUB-2026-9001');
  const [whPhone, setWhPhone] = useState('0909345678');
  const [whEmail, setWhEmail] = useState('khachhang@congtymau-synthetic.vn');
  const [whCompany, setWhCompany] = useState('Công ty TNHH Điện tử Á Châu');
  const [whGclid, setWhGclid] = useState('EAIaIQobChMI_test_gclid_9001');
  const [whUtmSource, setWhUtmSource] = useState('google');
  const [whUtmCampaign, setWhUtmCampaign] = useState('led_indoor_p25_q4');

  // Reconciliation resolution note
  const [reconcileNotes, setReconcileNotes] = useState<Record<number, string>>({});

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<ExtendedTrackingDashboardDto>(
        `/api/v1/tracking?periodDays=${periodDays}`,
      );
      setData(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dữ liệu Tracking.');
    } finally {
      setLoading(false);
    }
  }, [periodDays]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const handleTriggerSync = async (slot: 'FULL_0200' | 'LIGHT_1100' | 'MANUAL_RETRY') => {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        recordsSynced: number;
        gclidRetryResult: { scanned: number; resolved: number };
      }>('/api/v1/tracking', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          action: 'trigger_sync',
          scheduleSlot: slot,
          runGclidResolution: true,
          runReconciliation: true,
        },
      });
      setFeedbackMsg(
        `Đồng bộ hoàn tất (${res.recordsSynced} bản ghi metric, quét lại ${res.gclidRetryResult.scanned} gclid, giải quyết ${res.gclidRetryResult.resolved}).`,
      );
      await fetchDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi chạy đồng bộ.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeclareCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const budgetMicros = (BigInt(newCampBudgetVnd || '0') * 1_000_000n).toString(10);
      const res = await apiRequest<{ campaignId: number; remappedCount: number }>(
        '/api/v1/tracking',
        {
          method: 'POST',
          csrfToken: user.csrfToken,
          body: {
            action: 'declare_campaign',
            platform: newCampPlatform,
            accountExternalId: 'TOANTRUNG_MKT',
            campaignCode: newCampCode,
            campaignName: newCampName,
            dailyBudgetMicrosString: budgetMicros,
          },
        },
      );
      setNewCampCode('');
      setNewCampName('');
      setFeedbackMsg(
        `Đã khai báo chiến dịch và tự động gắn lại cho ${res.remappedCount} Lead đang ở trạng thái UTM chưa khớp (UC03 A3).`,
      );
      await fetchDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khai báo chiến dịch.');
    } finally {
      setBusy(false);
    }
  };

  const handleSimulateWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        leadCode: string;
        deduplicated: boolean;
        marketingSource: string;
      }>('/api/v1/tracking', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          action: 'simulate_webhook',
          intakeSourceProvider: 'WEBSITE_FORM',
          intakeSourceAccountKey: whWebsite,
          externalSubmissionId: whSubmissionId,
          phone: whPhone,
          email: whEmail,
          companyName: whCompany,
          tracking: {
            gclid: whGclid || null,
            utmSource: whUtmSource || null,
            utmCampaign: whUtmCampaign || null,
            landingPageUrl: `https://${whWebsite}/lien-he-bao-gia`,
            deviceType: 'desktop',
          },
        },
      });
      setFeedbackMsg(
        res.deduplicated
          ? `Chống lặp Idempotency hoạt động: Mã gửi form "${whSubmissionId}" từ "${whWebsite}" đã tồn tại (${res.leadCode}), không tạo bản ghi Lead trùng.`
          : `Đã tiếp nhận Lead mới ${res.leadCode} từ Webhook (${whWebsite}) · Nguồn: ${res.marketingSource}.`,
      );
      await fetchDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi gửi Webhook.');
    } finally {
      setBusy(false);
    }
  };

  const handleResolveReconciliation = async (reconciliationId: number) => {
    if (!user) return;
    const note = (reconcileNotes[reconciliationId] || '').trim();
    if (note.length < 5) {
      setErrorMsg('Vui lòng nhập ghi chú nguyên nhân / xử lý chênh lệch đối soát (tối thiểu 5 ký tự).');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/tracking', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          action: 'resolve_reconciliation',
          reconciliationId,
          resolutionNote: note,
        },
      });
      setFeedbackMsg('Đã xác nhận xử lý cảnh báo đối soát Google Lead Form (UC03 Luồng D).');
      await fetchDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi cập nhật đối soát.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunWorkerJob = async (
    jobCode:
      | 'D3_SYNC_FULL'
      | 'GCLID_HOURLY_RETRY'
      | 'GOOGLE_LEAD_RECONCILE'
      | 'SEO_SCHEDULED_PUBLISH'
      | 'OVERDUE_QUOTE_REMINDER'
      | 'ALL_JOBS',
  ) => {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        executionId: string;
        jobCode: string;
        attempts: number;
        results: Array<{ jobCode: string; summary: string; durationMs: number }>;
      }>(`/api/v1/workers/${jobCode}/run`, {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {},
      });
      const firstResult = res.results?.[0];
      const summaryText = res.results?.map((r) => r.summary).join(' · ') || 'Hoàn tất đồng bộ';
      setFeedbackMsg(
        `[Mã thực thi ${res.executionId} · ${res.jobCode}] Hoàn tất (${firstResult?.durationMs ?? 0}ms, lần thử #${res.attempts}): ${summaryText}`,
      );
      await fetchDashboard();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi thực thi tác vụ nền.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 text-sm">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-soft border border-brand-border text-xs font-bold text-brand mb-2">
            <span>Tracking Nguồn, Đồng bộ Đa kênh & Đối soát</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink tracking-tight">
            Tracking Nguồn & Đồng bộ Dữ liệu Đa kênh
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Ưu tiên tín hiệu <code className="font-mono">gclid &gt; UTM &gt; Referrer</code>, phân tầng 3 cấp Lead (L1/L2/L3) và đối soát Google Lead Form tự động.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPeriodDays(d)}
              className={`h-9 px-3.5 rounded-xl text-sm font-semibold ${
                periodDays === d
                  ? 'bg-brand text-white'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {d} ngày
            </button>
          ))}

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleTriggerSync('FULL_0200')}
            className="h-9 px-3.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-sm"
          >
            <Play className="w-4 h-4" />
            <span>Chạy Đồng bộ + Tra lại gclid</span>
          </button>

          <a
            href={`/api/v1/tracking/export?periodDays=${periodDays}`}
            className="h-9 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center gap-1.5"
            title="Xuất báo cáo Excel Tracking & Đồng bộ (02_Tracking_DongBo.xlsx)"
          >
            <span>Xuất Excel (.xlsx)</span>
          </a>

          <button
            type="button"
            onClick={() => void fetchDashboard()}
            className="h-9 px-3.5 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Adapter Mode & Freshness Notice */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-brand-soft/80 border border-brand-border flex items-start gap-2.5 text-sm text-slate-700">
            <Info className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div>
              <strong>
                Trạng thái kết nối ({data.liveIntegrationMode === 'FIXTURE_SIMULATION' ? 'Dữ liệu mô phỏng — Chưa cấu hình khóa API thật' : 'Live API'}):
              </strong>{' '}
              Cập nhật lần cuối lúc{' '}
              <strong>
                {data.lastSyncedAt
                  ? new Date(data.lastSyncedAt).toLocaleString('vi-VN')
                  : 'Chưa chạy'}
              </strong>
              . {data.todayPreliminaryNotice}
              {data.smallSampleNote && (
                <span className="block mt-1 font-semibold text-amber-800">
                  • {data.smallSampleNote}
                </span>
              )}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-sm text-amber-900">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Quy tắc bảo toàn Nguồn Marketing & Chiến dịch:</strong> Nguồn Marketing và Chiến dịch hiện được cập nhật tự động qua đối chiếu <code className="font-mono">gclid</code> và ánh xạ danh mục chiến dịch để bảo đảm tính khách quan khi tính chi phí quảng cáo.
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-bold">
            Đóng
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button type="button" onClick={() => setFeedbackMsg(null)} className="font-bold">
            Đóng
          </button>
        </div>
      )}

      {loading || !data ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
          Đang tải số liệu Tracking & Đồng bộ...
        </div>
      ) : (
        <>
          {/* 4 KPI Cards for L1 / L2 / L3 & Tracking Quality */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card">
              <p className="text-sm font-bold text-slate-700">Cấp L1 — Lead thô (Raw Leads)</p>
              <p className="font-display text-3xl font-bold text-ink mt-2">
                {data.totals.rawLeadsL1}
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                Mọi Lead tiếp nhận trong kỳ (Trong đó Lead lặp: <strong>{data.totals.repeatLeads}</strong>)
              </p>
            </div>

            <div className="bg-white border border-blue-200 rounded-2xl p-5 shadow-card">
              <p className="text-sm font-bold text-brand">Cấp L2 — Lead hợp lệ (Pipeline)</p>
              <p className="font-display text-3xl font-bold text-brand mt-2">
                {data.totals.validLeadsL2}
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                L1 trừ toàn bộ Lead có cờ Spam (kể cả đang chờ xác nhận)
              </p>
            </div>

            <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-card">
              <p className="text-sm font-bold text-emerald-700">Cấp L3 — Lead hiệu quả (Tính CPL/Ads)</p>
              <p className="font-display text-3xl font-bold text-emerald-700 mt-2">
                {data.totals.effectiveLeadsL3}
              </p>
              <p className="text-xs text-slate-500 mt-1.5">
                L1 trừ Spam tự động & Spam đã xác nhận của Trưởng bộ phận
              </p>
            </div>

            <div className="bg-white border border-amber-200 rounded-2xl p-5 shadow-card">
              <p className="text-sm font-bold text-amber-800">Chất lượng Tracking & Cảnh báo</p>
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <div>
                  UTM lệch gclid: <strong>{data.totals.utmGclidMismatchCount}</strong>
                </div>
                <div>
                  Chưa rõ chiến dịch / UTM chưa khớp:{' '}
                  <strong>
                    {data.totals.unknownCampaignLeads} / {data.totals.unmatchedUtmCount}
                  </strong>
                </div>
                <div>
                  Cảnh báo đối soát mở:{' '}
                  <strong className="text-red-600">{data.totals.openReconciliationAlerts}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Cảnh báo Đối soát Google Lead Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="font-display text-base font-bold text-ink">
                  Đối soát Lead Google Form (Cảnh báo khi chênh lệch &ge; 2 Lead)
                </h2>
              </div>
              <span className="text-xs text-slate-500">So khớp CRM (cộng cả log lỗi tiếp nhận) với Google Ads</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-bold">Ngày đối soát</th>
                    <th className="py-2.5 px-3 font-bold">Tài khoản</th>
                    <th className="py-2.5 px-3 font-bold">Lead trong CRM</th>
                    <th className="py-2.5 px-3 font-bold">Log lỗi tiếp nhận</th>
                    <th className="py-2.5 px-3 font-bold">Google báo</th>
                    <th className="py-2.5 px-3 font-bold">Chênh lệch</th>
                    <th className="py-2.5 px-3 font-bold">Trạng thái / Xử lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.reconciliations.map((rec) => (
                    <tr
                      key={rec.id}
                      className={rec.status === 'ALERT_OPEN' ? 'bg-red-50/70' : ''}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold">{rec.reconcileDate}</td>
                      <td className="py-2.5 px-3 font-mono">{rec.accountPropertyId}</td>
                      <td className="py-2.5 px-3 font-bold">{rec.crmLeadCount}</td>
                      <td className="py-2.5 px-3">{rec.errorIntakeCount}</td>
                      <td className="py-2.5 px-3 font-bold">{rec.platformReportedCount}</td>
                      <td className="py-2.5 px-3 font-bold text-red-600">
                        {rec.discrepancyCount} Lead
                      </td>
                      <td className="py-2.5 px-3">
                        {rec.status === 'ALERT_OPEN' ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={reconcileNotes[rec.id] || ''}
                              onChange={(e) =>
                                setReconcileNotes((prev) => ({
                                  ...prev,
                                  [rec.id]: e.target.value,
                                }))
                              }
                              placeholder="Nhập ghi chú đối chiếu danh sách Google Ads..."
                              className="h-9 px-3 rounded-lg border border-red-200 bg-white text-sm flex-1"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleResolveReconciliation(rec.id)}
                              className="h-9 px-3.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold shrink-0"
                            >
                              Xác nhận Đã xử lý
                            </button>
                          </div>
                        ) : rec.status === 'RESOLVED' ? (
                          <span className="text-emerald-700 font-semibold">
                            Đã xử lý ({rec.resolvedByName}): {rec.resolutionNote}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-4 h-4" /> Khớp 100%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bảng phân bổ theo Nguồn Marketing & Kênh tiếp nhận */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-3">
              <h2 className="font-display text-base font-bold text-ink">
                Phân bổ Lead theo Nguồn Marketing (Bao gồm Chưa xác định & Nhập tay)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3 font-bold">Nguồn Marketing</th>
                      <th className="py-2.5 px-3 font-bold">L1 Thô</th>
                      <th className="py-2.5 px-3 font-bold">L3 Hiệu quả</th>
                      <th className="py-2.5 px-3 font-bold">Lead lặp</th>
                      <th className="py-2.5 px-3 font-bold">Tỷ lệ BG</th>
                      <th className="py-2.5 px-3 font-bold">Tỷ lệ Chốt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.bySource.map((row) => (
                      <tr key={row.dimensionKey}>
                        <td className="py-2.5 px-3 font-semibold text-ink">
                          {row.dimensionLabel}
                        </td>
                        <td className="py-2.5 px-3 font-mono">{row.rawLeadsL1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-brand">
                          {row.effectiveLeadsL3}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">{row.repeatLeads}</td>
                        <td className="py-2.5 px-3 font-mono">{row.quoteRateText}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                          {row.winRateText}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-3">
              <h2 className="font-display text-base font-bold text-ink">
                Đối chiếu Nguồn Marketing (Hệ thống) vs Nguồn Khách tự khai
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3 font-bold">Mã Lead</th>
                      <th className="py-2.5 px-3 font-bold">Kênh</th>
                      <th className="py-2.5 px-3 font-bold">Nguồn Marketing</th>
                      <th className="py-2.5 px-3 font-bold">Khách tự khai</th>
                      <th className="py-2.5 px-3 font-bold">Đối chiếu Tín hiệu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.sourceVsSelfReported.map((item) => (
                      <tr key={item.leadCode}>
                        <td className="py-2.5 px-3 font-mono font-bold text-brand">
                          {item.leadCode}
                        </td>
                        <td className="py-2.5 px-3">{item.contactChannel}</td>
                        <td className="py-2.5 px-3 font-semibold text-ink">
                          {item.marketingSource}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {item.selfReportedSource || '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          {item.utmGclidMismatch ? (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-xs">
                              UTM lệch gclid
                            </span>
                          ) : (
                            <span className="text-slate-400">Đồng nhất</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Hiệu quả Chiến dịch Quảng cáo — chỉ dùng chi phí quảng cáo, không có doanh thu/ROAS */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-4">
            <h2 className="font-display text-base font-bold text-ink">
              Hiệu quả Chiến dịch Quảng cáo (CPL trên L3)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-bold">Mã / Tên Chiến dịch</th>
                    <th className="py-2.5 px-3 font-bold">Nền tảng / TK</th>
                    <th className="py-2.5 px-3 font-bold">Ngân sách ngày</th>
                    <th className="py-2.5 px-3 font-bold">Tổng chi phí</th>
                    <th className="py-2.5 px-3 font-bold">L1 / L3</th>
                    <th className="py-2.5 px-3 font-bold">CPL (Chi phí/L3)</th>
                    <th className="py-2.5 px-3 font-bold">Chi phí/Báo giá</th>
                    <th className="py-2.5 px-3 font-bold">Chi phí/Lead chốt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.campaigns.map((camp) => (
                    <tr key={camp.id}>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-ink">{camp.campaignName}</div>
                        <div className="font-mono text-xs text-slate-400">
                          {camp.campaignCode}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-xs">
                        {camp.platform} · {camp.accountExternalId}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {camp.dailyBudget
                          ? `${Number(camp.dailyBudget.formattedDecimal).toLocaleString('vi-VN')} ₫`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-ink">
                        {camp.totalSpend
                          ? `${Number(camp.totalSpend.formattedDecimal).toLocaleString('vi-VN')} ₫`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {camp.leadsCountL1} / <strong className="text-brand">{camp.leadsCountL3}</strong>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-brand">
                        {camp.cplEffective
                          ? `${Math.round(Number(camp.cplEffective.formattedDecimal)).toLocaleString('vi-VN')} ₫`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {camp.costPerQuote
                          ? `${Math.round(Number(camp.costPerQuote.formattedDecimal)).toLocaleString('vi-VN')} ₫`
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {camp.costPerWon
                          ? `${Math.round(Number(camp.costPerWon.formattedDecimal)).toLocaleString('vi-VN')} ₫`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Form khai báo chiến dịch ngoài Google Ads */}
            <form
              onSubmit={(e) => void handleDeclareCampaign(e)}
              className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-5 gap-2.5 items-end"
            >
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Nền tảng chiến dịch
                </label>
                <select
                  value={newCampPlatform}
                  onChange={(e) =>
                    setNewCampPlatform(e.target.value as 'EXTERNAL' | 'GOOGLE_ADS' | 'FANPAGE')
                  }
                  className="w-full h-9 px-2.5 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="EXTERNAL">Chiến dịch Ngoài (Zalo/PR/Event)</option>
                  <option value="FANPAGE">Facebook Fanpage Ads</option>
                  <option value="GOOGLE_ADS">Google Ads</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Mã chiến dịch / UTM Slug *
                </label>
                <input
                  type="text"
                  required
                  value={newCampCode}
                  onChange={(e) => setNewCampCode(e.target.value)}
                  placeholder="VD: zalo_led_outdoor_t11"
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold text-slate-600 mb-1">
                  Tên chiến dịch *
                </label>
                <input
                  type="text"
                  required
                  value={newCampName}
                  onChange={(e) => setNewCampName(e.target.value)}
                  placeholder="Tên chiến dịch truyền thông..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Khai báo & Map lại UTM</span>
              </button>
            </form>
          </div>

          {/* Trình mô phỏng Webhook & Kiểm thử Chống trùng (Idempotency theo Website + Submission ID) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-3">
            <div className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-brand" />
              <h2 className="font-display text-base font-bold text-ink">
                Trình mô phỏng Webhook Intake & Kiểm thử Chống trùng theo Website
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              Khóa chống trùng: <code className="font-mono">(intakeSourceProvider, intakeSourceAccountKey, externalSubmissionId)</code>. Gửi lặp cùng Submission ID trên cùng 1 website sẽ được deduplicate an toàn; cùng Submission ID trên website khác vẫn tạo Lead hợp lệ.
            </p>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <span className="text-sm font-bold text-slate-600">Chọn nhanh kịch bản mẫu:</span>
              <button
                type="button"
                onClick={() => {
                  setWhWebsite('toantrung.com.vn');
                  setWhSubmissionId(`WEB-GADS-${Date.now().toString().slice(-4)}`);
                  setWhPhone('0909345678');
                  setWhCompany('Công ty TNHH Điện tử Á Châu');
                  setWhGclid(`EAIaIQobChMI_std_${Date.now().toString().slice(-4)}`);
                  setWhUtmSource('google');
                  setWhUtmCampaign('led_indoor_p25_q4');
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-brand text-xs font-semibold hover:bg-blue-100"
              >
                1. Lead chuẩn Google Ads
              </button>
              <button
                type="button"
                onClick={() => {
                  setWhWebsite('bangled.vn');
                  setWhSubmissionId(`WEB-DELAY-${Date.now().toString().slice(-4)}`);
                  setWhPhone('0918223344');
                  setWhCompany('Bệnh viện Đa khoa Tỉnh');
                  setWhGclid(`EAIaIQobChMI_delayed_${Date.now().toString().slice(-4)}`);
                  setWhUtmSource('');
                  setWhUtmCampaign('');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold hover:bg-amber-100"
              >
                2. GCLID trễ Campaign (Chờ đồng bộ tra lại)
              </button>
              <button
                type="button"
                onClick={() => {
                  setWhWebsite('manhinhled.net.vn');
                  setWhSubmissionId(`WEB-BR4-${Date.now().toString().slice(-4)}`);
                  setWhPhone('0987654321');
                  setWhCompany('Trung tâm Hội nghị Quốc tế');
                  setWhGclid(`EAIaIQobChMI_br4_${Date.now().toString().slice(-4)}`);
                  setWhUtmSource('facebook');
                  setWhUtmCampaign('fb_retargeting_q4');
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 text-xs font-semibold hover:bg-purple-100"
              >
                3. UTM lệch GCLID
              </button>
            </div>
            <form
              onSubmit={(e) => void handleSimulateWebhook(e)}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            >
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Website nguồn</label>
                <select
                  value={whWebsite}
                  onChange={(e) => setWhWebsite(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="toantrung.com.vn">toantrung.com.vn</option>
                  <option value="bangled.vn">bangled.vn</option>
                  <option value="manhinhled.net.vn">manhinhled.net.vn</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Mã sự kiện (externalSubmissionId)
                </label>
                <input
                  type="text"
                  required
                  value={whSubmissionId}
                  onChange={(e) => setWhSubmissionId(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">SĐT khách hàng *</label>
                <input
                  type="text"
                  required
                  value={whPhone}
                  onChange={(e) => setWhPhone(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Email (Bắt buộc với Form Web) *
                </label>
                <input
                  type="email"
                  required
                  value={whEmail}
                  onChange={(e) => setWhEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Tên công ty</label>
                <input
                  type="text"
                  value={whCompany}
                  onChange={(e) => setWhCompany(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">gclid (tùy chọn)</label>
                <input
                  type="text"
                  value={whGclid}
                  onChange={(e) => setWhGclid(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">utm_campaign</label>
                <input
                  type="text"
                  value={whUtmCampaign}
                  onChange={(e) => setWhUtmCampaign(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 font-mono text-sm"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full h-9 px-4 rounded-xl bg-brand hover:bg-brand-deep text-white text-sm font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>Gửi Webhook Intake</span>
                </button>
              </div>
            </form>
          </div>

          {/* Bảng điều khiển 5 Tác vụ Nền (Background Workers) & Ma trận Kết nối API Thật/Giả lập */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Cột trái: Điều khiển 5 Worker Jobs */}
            <div className="xl:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="font-display font-bold text-base text-ink">
                    Trung tâm Điều hành 5 Tác vụ Tự động (Background Workers)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Kích hoạt trực tiếp hoặc theo dõi lịch sử thực thi của 5 tiến trình đồng bộ tự động
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRunWorkerJob('ALL_JOBS')}
                  className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-xs"
                >
                  <Play className="w-4 h-4" />
                  <span>Chạy Tất Cả 5 Worker Jobs</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  {
                    code: 'D3_SYNC_FULL' as const,
                    title: '1. Đồng bộ Đa kênh & Cache Từ khóa',
                    schedule: 'Định kỳ 02:00 / 11:00 / 17:00',
                    desc: 'Kéo chi phí Ads, GA4, GSC và làm mới cache từ khóa SEO.',
                  },
                  {
                    code: 'GCLID_HOURLY_RETRY' as const,
                    title: '2. Tra lại mã gclid bị trễ',
                    schedule: 'Định kỳ mỗi 60 phút',
                    desc: 'Quét các Lead <= 7 ngày có gclid nhưng chưa rõ chiến dịch.',
                  },
                  {
                    code: 'GOOGLE_LEAD_RECONCILE' as const,
                    title: '3. Đối soát Google Lead Form (T-1)',
                    schedule: 'Định kỳ 02:15 sáng',
                    desc: 'So khớp số Lead trên Google Ads với số Lead vào CRM.',
                  },
                  {
                    code: 'SEO_SCHEDULED_PUBLISH' as const,
                    title: '4. Xuất bản Bài SEO Đúng Giờ Hẹn',
                    schedule: 'Định kỳ mỗi 5 phút',
                    desc: 'Đẩy bài viết đã duyệt đến hạn lên 3 Website qua REST API.',
                  },
                  {
                    code: 'OVERDUE_QUOTE_REMINDER' as const,
                    title: '5. Nhắc Báo giá Quá hạn > 7 ngày',
                    schedule: 'Định kỳ 08:00 sáng',
                    desc: 'Gửi thông báo nhắc NVKD chăm sóc lại các báo giá chưa phản hồi.',
                  },
                ].map((job) => (
                  <div
                    key={job.code}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-sm text-slate-900 font-bold">{job.title}</strong>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                          {job.schedule}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{job.desc}</p>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleRunWorkerJob(job.code)}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-brand hover:text-white border border-slate-300 text-slate-800 font-bold text-xs transition inline-flex items-center gap-1"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Chạy ngay</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {data.workerHistory && data.workerHistory.length > 0 && (
                <div className="pt-2 space-y-1.5">
                  <span className="text-sm font-bold text-slate-700 block">
                    Nhật ký thực thi Worker gần nhất:
                  </span>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {data.workerHistory.map((wh) => (
                      <div
                        key={wh.id}
                        className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-mono font-bold text-brand mr-2">[{wh.jobCode}]</span>
                          <span className="text-slate-700">{wh.summary}</span>
                        </div>
                        <span className="text-slate-400 font-mono shrink-0">
                          {wh.durationMs}ms · {new Date(wh.executedAt).toLocaleTimeString('vi-VN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cột phải: Ma trận Kết nối API Thật / Giả lập */}
            <div className="xl:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-display font-bold text-base text-ink">
                  Ma trận Trạng thái Kết nối Tài nguyên Công ty (Dual-Mode Adapters)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hệ thống tự động chuyển từ <strong>Mô phỏng an toàn</strong> sang <strong>Kết nối thật (Live API)</strong> ngay khi cấu hình khóa kết nối
                </p>
              </div>

              <div className="space-y-2.5">
                {(data.adapterMatrix || []).map((item) => (
                  <div
                    key={item.code}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-sm text-slate-900 font-bold">{item.name}</strong>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${
                          item.mode === 'LIVE_CONNECTED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border border-amber-300'
                        }`}
                      >
                        {item.mode === 'LIVE_CONNECTED' ? '● Live API' : '◐ Mô phỏng (Chờ cấp Key)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{item.description}</p>
                    <div className="text-xs text-slate-400 font-mono">
                      Biến môi trường: {item.envKeysRequired.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

