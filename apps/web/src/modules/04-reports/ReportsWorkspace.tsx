'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  hasBaPermission,
  type ReportPreset,
  type ReportsDashboardDto,
} from '@toantrung/contracts';
import {
  AlertTriangle,
  BarChart3,
  Check,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  Filter,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useSession } from '@/core/session/SessionContext';

const PRESET_OPTIONS: Array<{ value: ReportPreset; label: string }> = [
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
  { value: 'all', label: 'Toàn thời gian' },
  { value: 'custom', label: 'Tùy chỉnh ngày' },
];

export function ReportsWorkspace() {
  const { user } = useSession();
  const [preset, setPreset] = useState<ReportPreset>('all');
  const [fromDate, setFromDate] = useState('2026-10-01');
  const [toDate, setToDate] = useState('2026-11-06');
  const [data, setData] = useState<ReportsDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canExport = Boolean(user && hasBaPermission(user.roleCode, 'EXPORT_DATA'));

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ preset });
      if (preset === 'custom') {
        params.set('fromDate', fromDate);
        params.set('toDate', toDate);
      }
      const res = await fetch(`/api/v1/reports?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (!res.ok || json.error || !json.data) {
        throw new Error(json.error?.message || 'Không thể tải báo cáo phân quyền.');
      }
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải báo cáo');
    } finally {
      setLoading(false);
    }
  }, [preset, fromDate, toDate]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const [copiedSheets, setCopiedSheets] = useState(false);

  const handleExport = (format: 'xlsx' | 'csv') => {
    const params = new URLSearchParams({ preset, format });
    if (preset === 'custom') {
      params.set('fromDate', fromDate);
      params.set('toDate', toDate);
    }
    window.open(`/api/v1/reports/export?${params.toString()}`, '_blank');
  };

  const handleGoogleSheetsExport = () => {
    if (!data?.detailedLeads) return;
    const header = [
      'STT',
      'Mã Lead',
      'Ngày tiếp nhận',
      'Sales phụ trách',
      'Khách hàng / Công ty',
      'Số điện thoại',
      'Kênh liên hệ',
      'Nguồn Marketing',
      'Sản phẩm LED quan tâm',
      'Trạng thái Pipeline',
      'Ghi chú / Lý do',
    ].join('\t');
    const rows = data.detailedLeads
      .map((r) =>
        [
          r.stt,
          r.leadCode,
          r.receivedAt.slice(0, 16).replace('T', ' '),
          r.assignedSalesName,
          r.companyOrCustomer,
          r.phone,
          r.contactChannel,
          r.marketingSource,
          r.productsText,
          r.pipelineStatusLabel,
          r.noteOrReason,
        ].join('\t')
      )
      .join('\n');

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(`${header}\n${rows}`).then(() => {
        setCopiedSheets(true);
        setTimeout(() => setCopiedSheets(false), 3500);
      });
    }
    handleExport('csv');
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white border border-slate-200/80 rounded-2xl p-5 shadow-card">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-brand uppercase tracking-wider">
            <BarChart3 className="w-4 h-4" />
            <span>M04 · Dashboard & Báo cáo phân quyền (Canonical D1–D6)</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink mt-1">
            Báo cáo & Phân tích hiệu suất đa phòng ban
          </h1>
          {data && (
            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-brand shrink-0" />
              <span>{data.scopeDescription}</span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80">
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPreset(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  preset === opt.value
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-slate-600 hover:text-ink'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs font-medium"
              />
              <span className="text-xs text-slate-400">→</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 px-2.5 rounded-xl border border-slate-200 text-xs font-medium"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadReports()}
            className="h-9 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          {canExport && (
            <>
              <button
                type="button"
                onClick={() => handleExport('xlsx')}
                className="h-9 px-3.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Xuất Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={handleGoogleSheetsExport}
                className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                title="Tải CSV chuẩn UTF-8 & sao chép bảng vào Clipboard để dán nhanh (Ctrl+V) vào Google Sheets"
              >
                {copiedSheets ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSheets ? 'Đã sao chép Sheets!' : 'Google Sheets / CSV'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
          {error}
        </div>
      )}

      {copiedSheets && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-800 font-medium flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Đã sao chép bảng dữ liệu vào Clipboard & tải file CSV!</strong> Bạn có thể mở Google Sheets và nhấn <strong>Ctrl+V</strong> để dán trực tiếp, hoặc tải file CSV lên Google Drive.
          </span>
        </div>
      )}

      {data && (
        <>
          {/* Freshness & Small Sample Alerts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-brand-soft border border-brand-border text-xs text-slate-700 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-brand shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-brand">{data.todayPreliminaryNotice}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Đồng bộ gần nhất:{' '}
                  <strong>
                    {data.lastSyncedAt
                      ? new Date(data.lastSyncedAt).toLocaleString('vi-VN')
                      : 'Chưa có phiên đồng bộ'}
                  </strong>
                </p>
              </div>
            </div>

            {data.isSmallSample && data.smallSampleNotice && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-bold">Cảnh báo cỡ mẫu nhỏ (Small Sample):</strong>
                  <p className="mt-0.5">{data.smallSampleNotice}</p>
                </div>
              </div>
            )}
          </div>

          {/* 4 Main Overview KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-white border border-blue-200/80 rounded-2xl p-5 shadow-card">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Tổng Lead (L1 / L2 / L3)</span>
                <Users className="w-4 h-4 text-brand" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-ink">
                  {data.overview.totalLeadsL1}
                </span>
                <span className="text-xs text-slate-500">
                  (Hợp lệ L2: <strong>{data.overview.validLeadsL2}</strong> · Hiệu quả L3:{' '}
                  <strong className="text-emerald-700">{data.overview.effectiveLeadsL3}</strong>)
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Mới tiếp nhận: {data.overview.newLeadCount} · Đang báo giá: {data.overview.quotingCount}
              </p>
            </div>

            <div className="bg-white border border-amber-200/80 rounded-2xl p-5 shadow-card">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Báo giá chờ khách phản hồi</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-ink">
                  {data.overview.unansweredQuoteCount}
                </span>
                {data.overview.overdue7DaysQuoteCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[11px] font-bold">
                    {data.overview.overdue7DaysQuoteCount} quá hạn &gt; 7 ngày
                  </span>
                )}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Tổng hồ sơ ở trạng thái Đã gửi báo giá: {data.overview.quoteSentCount}
              </p>
            </div>

            <div className="bg-white border border-emerald-200/80 rounded-2xl p-5 shadow-card">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Chốt thành công & Win Rate</span>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-emerald-700">
                  {data.overview.wonCount}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                  Win Rate: {data.overview.winRateText}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Thất bại có lý do: {data.overview.lostCount} hồ sơ (không tính doanh thu tiền tệ)
              </p>
            </div>

            <div className="bg-white border border-violet-200/80 rounded-2xl p-5 shadow-card">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>Hiệu quả Quảng cáo & AI Thiết kế</span>
                <Sparkles className="w-4 h-4 text-violet-600" />
              </div>
              <div className="mt-2">
                <div className="text-xs text-slate-600">
                  CPL Hiệu quả (L3):{' '}
                  <strong className="font-mono text-ink">
                    {data.marketingSummary.cplEffective
                      ? `${data.marketingSummary.cplEffective.formattedDecimal} ${data.marketingSummary.cplEffective.currency}`
                      : 'Chưa phát sinh'}
                  </strong>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  Yêu cầu thiết kế AI:{' '}
                  <strong className="text-ink">{data.designSummary.totalRequests}</strong> (3D:{' '}
                  {data.designSummary.completed3dCount} · Banner:{' '}
                  {data.designSummary.completedBannerCount})
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Thời gian xử lý AI TB: {data.designSummary.avgProcessingSecText}
              </p>
            </div>
          </div>

          {/* Unanswered Quotes > 7 days Alert Table (BA UC02 / M04) */}
          <section className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold text-ink">
                  Danh sách báo giá đã gửi đang chờ khách hàng phản hồi (Cảnh báo đỏ khi &ge; 7 ngày)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hỗ trợ Trưởng nhóm Sales và Ban Giám đốc đôn đốc các hồ sơ đã gửi báo giá nhưng khách chưa phản hồi
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                {data.unansweredQuotes.length} hồ sơ chờ phản hồi
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4 font-bold">Mã Lead</th>
                    <th className="py-3 px-4 font-bold">Khách hàng / Đơn vị</th>
                    <th className="py-3 px-4 font-bold">Số điện thoại</th>
                    <th className="py-3 px-4 font-bold">Sales phụ trách</th>
                    <th className="py-3 px-4 font-bold">Sản phẩm báo giá</th>
                    <th className="py-3 px-4 font-bold">Thời điểm gửi</th>
                    <th className="py-3 px-4 font-bold">Số ngày chờ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.unansweredQuotes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Không có hồ sơ báo giá nào đang tồn đọng chờ phản hồi.
                      </td>
                    </tr>
                  ) : (
                    data.unansweredQuotes.map((q) => (
                      <tr
                        key={q.leadId}
                        className={q.isOverdue7Days ? 'bg-rose-50/60' : 'hover:bg-slate-50/70'}
                      >
                        <td className="py-3 px-4 font-mono font-bold text-brand">{q.leadCode}</td>
                        <td className="py-3 px-4 font-semibold text-ink">{q.companyOrContact}</td>
                        <td className="py-3 px-4 font-mono">{q.phone}</td>
                        <td className="py-3 px-4">{q.assignedSalesName}</td>
                        <td className="py-3 px-4 text-slate-600">{q.productSummary}</td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(q.quoteSentAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-1 rounded-full font-bold text-[11px] ${
                              q.isOverdue7Days
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {q.daysWaiting} ngày {q.isOverdue7Days ? '(Quá hạn > 7 ngày)' : ''}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sales Performance & Product Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-ink">
                  Hiệu suất xử lý theo nhân sự Sales
                </h2>
                <Filter className="w-4 h-4 text-brand" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <th className="py-2.5 px-4 font-bold">Nhân sự Sales</th>
                      <th className="py-2.5 px-3 font-bold text-center">Tổng</th>
                      <th className="py-2.5 px-3 font-bold text-center">Đang BG</th>
                      <th className="py-2.5 px-3 font-bold text-center">Đã gửi BG</th>
                      <th className="py-2.5 px-3 font-bold text-center">Chốt Won</th>
                      <th className="py-2.5 px-3 font-bold text-center">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.salesPerformance.map((sp) => (
                      <tr key={sp.salesUserId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-semibold text-ink">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                sp.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                            <span>{sp.salesFullName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold">
                          {sp.totalLeads}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">{sp.quotingLeads}</td>
                        <td className="py-2.5 px-3 text-center font-mono">{sp.quoteSentLeads}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-bold">
                          {sp.wonLeads}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-brand">
                          {sp.winRateText}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="lg:col-span-5 bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-ink">
                  Thống kê nhu cầu theo sản phẩm LED (BA Catalog)
                </h2>
                <Layers className="w-4 h-4 text-brand" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                      <th className="py-2.5 px-4 font-bold">Sản phẩm</th>
                      <th className="py-2.5 px-3 font-bold text-center">Lượt hỏi</th>
                      <th className="py-2.5 px-3 font-bold text-center">Đã chốt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.productInsights.map((pi) => (
                      <tr key={pi.productId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-ink">{pi.productName}</div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {pi.productCode} · {pi.category}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-brand">
                          {pi.inquiryCount}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-emerald-700 font-bold">
                          {pi.wonCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* Detailed Scoped Lead Report Table */}
          <section className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold text-ink">
                  Bảng chi tiết hồ sơ Lead đồng bộ theo phạm vi phân quyền (Dùng chung cho Xuất Excel/CSV)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động ẩn danh số điện thoại & tên công ty khách hàng nếu tài khoản thuộc nhóm Marketing / Ads / Designer (UC01 & Q03)
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                Tổng: {data.detailedLeads.length} dòng
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <th className="py-3 px-4 font-bold">STT</th>
                    <th className="py-3 px-4 font-bold">Mã Lead</th>
                    <th className="py-3 px-4 font-bold">Ngày nhận</th>
                    <th className="py-3 px-4 font-bold">Sales phụ trách</th>
                    <th className="py-3 px-4 font-bold">Khách hàng / Đơn vị</th>
                    <th className="py-3 px-4 font-bold">Số điện thoại</th>
                    <th className="py-3 px-4 font-bold">Kênh</th>
                    <th className="py-3 px-4 font-bold">Nguồn Marketing</th>
                    <th className="py-3 px-4 font-bold">Sản phẩm LED</th>
                    <th className="py-3 px-4 font-bold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.detailedLeads.map((row) => (
                    <tr key={row.leadCode} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-mono text-slate-400">{row.stt}</td>
                      <td className="py-2.5 px-4 font-mono font-bold text-brand">{row.leadCode}</td>
                      <td className="py-2.5 px-4 text-slate-500">
                        {new Date(row.receivedAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="py-2.5 px-4 font-medium">{row.assignedSalesName}</td>
                      <td className="py-2.5 px-4 font-semibold text-ink">
                        {row.companyOrCustomer}
                      </td>
                      <td className="py-2.5 px-4 font-mono">{row.phone}</td>
                      <td className="py-2.5 px-4">{row.contactChannel}</td>
                      <td className="py-2.5 px-4">{row.marketingSource}</td>
                      <td className="py-2.5 px-4 text-slate-600">{row.productsText}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {row.pipelineStatusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
