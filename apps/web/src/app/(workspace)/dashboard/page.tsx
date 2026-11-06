'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReportPreset, ReportsDashboardDto } from '@toantrung/contracts';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  FolderKanban,
  Megaphone,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { useSession } from '@/core/session/SessionContext';
import { formatMoney, formatMoneyCompact } from '@/core/format/money';

const PERIODS: Array<{ label: string; value: ReportPreset }> = [
  { label: '7 ngày qua', value: '7d' },
  { label: '30 ngày qua', value: '30d' },
  { label: 'Tất cả thời gian', value: 'all' },
];

export default function DashboardPage() {
  const { user, branding } = useSession();
  const [preset, setPreset] = useState<ReportPreset>('30d');
  const [report, setReport] = useState<ReportsDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [bannerExpanded, setBannerExpanded] = useState<boolean>(false);

  const banner = branding.dashboardBanner;

  const loadDashboard = useCallback(
    async (selectedPreset: ReportPreset, manual = false) => {
      if (manual) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setFetchError(null);

      try {
        const res = await fetch(`/api/v1/reports?preset=${selectedPreset}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok || json.error || (!json.ok && !json.data)) {
          throw new Error(
            json.error?.message || 'Không thể tải dữ liệu tổng quan từ máy chủ.'
          );
        }
        setReport(json.data as ReportsDashboardDto);
        setLastFetchedAt(new Date().toISOString());
      } catch (err) {
        setFetchError(
          err instanceof Error
            ? err.message
            : 'Mất kết nối tới máy chủ. Vui lòng thử lại.'
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadDashboard(preset, false);
  }, [preset, loadDashboard]);

  const overview = report?.overview ?? {
    totalLeadsL1: 0,
    validLeadsL2: 0,
    effectiveLeadsL3: 0,
    activeLeadsCount: 0,
    unreceivedLeadsCount: 0,
    newLeadCount: 0,
    quotingCount: 0,
    quoteSentCount: 0,
    wonCount: 0,
    lostCount: 0,
    unansweredQuoteCount: 0,
    overdue7DaysQuoteCount: 0,
    winRateText: '0.0%',
  };

  const marketing = report?.marketingSummary;
  const design = report?.designSummary;
  const trackingOps = report?.trackingOperationalSummary;
  const actionableTasks = report?.actionableTasks ?? [];
  const leadTrend = report?.leadTrend ?? [];
  const unansweredQuotes = report?.unansweredQuotes ?? [];
  const urgentQuotes = unansweredQuotes.filter((q) => q.isOverdue7Days);

  const canViewMarketingSummary =
    !user ||
    ['ADMIN', 'BOD', 'MKT_LEAD', 'MKT_STAFF', 'ADS', 'SALES_LEAD'].includes(
      user.roleCode
    );

  const hasBannerContent =
    Boolean(banner.headline.trim()) ||
    Boolean(banner.description.trim()) ||
    (banner.showButton && Boolean(banner.buttonLabel.trim())) ||
    (banner.showImage && Boolean(banner.imageUrl));

  const periodLabel =
    PERIODS.find((p) => p.value === preset)?.label ?? '30 ngày qua';

  const cleanScopeDescription = (report?.scopeDescription || '')
    .replace(/\s*\(theo[^)]*\)/gi, '')
    .replace(/\s*theo UC\d+[^)]*/gi, '');

  return (
    <div className="space-y-6">
      {/* HOME-01: Compact Overview Header with Period, Scope, Refresh Action, and Last Update */}
      <header className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
                Tổng quan điều hành
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>{user?.roleName || 'Nhân sự'}</span>
              </span>
              {trackingOps && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${
                    trackingOps.liveIntegrationMode
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                  title={
                    trackingOps.liveIntegrationMode
                      ? 'Đang kết nối dữ liệu nền tảng thực tế'
                      : 'Chế độ dữ liệu mô phỏng nội bộ (Sandbox)'
                  }
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      trackingOps.liveIntegrationMode
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`}
                  />
                  <span>
                    {trackingOps.liveIntegrationMode
                      ? 'Tích hợp Trực tiếp (Live)'
                      : 'Chế độ Mô phỏng (Sandbox)'}
                  </span>
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600">
              {cleanScopeDescription ||
                `Phạm vi dữ liệu được phân quyền cho tài khoản ${user?.fullName || ''}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              role="group"
              aria-label="Chọn kỳ báo cáo"
              className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/90"
            >
              {PERIODS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPreset(item.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    preset === item.value
                      ? 'bg-[#1E3A8A] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void loadDashboard(preset, true)}
              disabled={isLoading || isRefreshing}
              className="h-10 px-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold inline-flex items-center gap-2 transition disabled:opacity-60"
              title="Làm mới số liệu tổng quan"
            >
              <RefreshCw
                className={`w-4 h-4 text-[#1E3A8A] ${
                  isRefreshing || isLoading ? 'animate-spin' : ''
                }`}
              />
              <span>Làm mới</span>
            </button>

            <Link
              href="/leads"
              className="h-10 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <span>Mở danh sách Lead</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Status metadata bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Kỳ thống kê: <strong className="text-slate-700">{periodLabel}</strong>
              {report && (
                <span className="ml-1">
                  ({report.fromDate.slice(0, 10)} → {report.toDate.slice(0, 10)})
                </span>
              )}
            </span>
            <span>
              Cập nhật số liệu lúc:{' '}
              <strong className="text-slate-700">
                {lastFetchedAt
                  ? new Date(lastFetchedAt).toLocaleTimeString('vi-VN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : 'Đang tải...'}
              </strong>
            </span>
            <span>
              Đồng bộ nền tảng gần nhất:{' '}
              <strong className="text-slate-700">
                {report?.lastSyncedAt
                  ? new Date(report.lastSyncedAt).toLocaleString('vi-VN')
                  : 'Chưa có phiên đồng bộ'}
              </strong>
            </span>
          </div>

          {hasBannerContent && (
            <button
              type="button"
              onClick={() => setBannerExpanded((prev) => !prev)}
              className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>
                {bannerExpanded ? 'Thu gọn thông điệp thương hiệu' : 'Xem thông điệp thương hiệu'}
              </span>
              {bannerExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>

        {/* Optional compact brand area (collapsible so business KPIs stay near the top) */}
        {hasBannerContent && bannerExpanded && (
          <div className="pt-2">
            <div className="rounded-xl bg-gradient-to-r from-[#143B85] via-[#1E53A3] to-[#2B6CB8] text-white p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
                  {branding.organizationName} · Không gian thương hiệu
                </p>
                {banner.headline.trim() && (
                  <h2 className="font-display text-lg font-bold text-white">
                    {banner.headline}
                  </h2>
                )}
                {banner.description.trim() && (
                  <p className="text-sm text-sky-100 leading-relaxed">
                    {banner.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {banner.showButton && banner.buttonLabel.trim() && (
                  <Link
                    href={banner.buttonHref || '/leads'}
                    className="px-4 py-2 rounded-xl bg-white text-[#1E3A8A] font-semibold text-sm inline-flex items-center gap-1.5 shadow-xs hover:bg-sky-50"
                  >
                    <span>{banner.buttonLabel}</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
                <Link
                  href="/settings"
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold"
                >
                  Cài đặt hiển thị
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* DATA-01: Truthful Error / Sample Notice States */}
      {fetchError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>
              <strong>Không thể cập nhật dữ liệu:</strong> {fetchError}
              {report ? ' Đang hiển thị bản chụp dữ liệu gần nhất.' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard(preset, true)}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
          >
            Thử tải lại
          </button>
        </div>
      )}

      {/* HOME-02: Primary Business KPIs (4 prioritized company-level cards, zero-truthful) */}
      <section aria-label="Chỉ số kinh doanh cốt lõi">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* KPI 1: Leads Received */}
          <div className="rounded-xl bg-white border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lead tiếp nhận ({periodLabel})
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <strong className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.totalLeadsL1}
                  </strong>
                  <span className="text-sm font-medium text-slate-500">hồ sơ</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1E3A8A] grid place-items-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Hợp lệ (L2):{' '}
                <strong className="text-slate-900 font-semibold">
                  {isLoading && !report ? '—' : overview.validLeadsL2}
                </strong>
              </span>
              <span>
                Hiệu quả (L3):{' '}
                <strong className="text-[#1E3A8A] font-semibold">
                  {isLoading && !report ? '—' : overview.effectiveLeadsL3}
                </strong>
              </span>
            </div>
          </div>

          {/* KPI 2: Active Leads */}
          <div className="rounded-xl bg-white border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lead đang xử lý (Active)
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <strong className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.activeLeadsCount}
                  </strong>
                  <span className="text-sm font-medium text-slate-500">đang mở</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 grid place-items-center shrink-0">
                <FolderKanban className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Chờ tiếp nhận:{' '}
                <strong
                  className={
                    overview.unreceivedLeadsCount > 0
                      ? 'text-amber-700 font-semibold'
                      : 'text-slate-900 font-semibold'
                  }
                >
                  {isLoading && !report ? '—' : overview.unreceivedLeadsCount}
                </strong>
              </span>
              <span>
                Đang soạn BG:{' '}
                <strong className="text-slate-900 font-semibold">
                  {isLoading && !report ? '—' : overview.quotingCount}
                </strong>
              </span>
            </div>
          </div>

          {/* KPI 3: Quotes Awaiting Response */}
          <div className="rounded-xl bg-white border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Báo giá chờ phản hồi
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <strong className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.unansweredQuoteCount}
                  </strong>
                  <span className="text-sm font-medium text-slate-500">hồ sơ</span>
                </div>
              </div>
              <div
                className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${
                  overview.overdue7DaysQuoteCount > 0
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Quá hạn &gt; 7 ngày:{' '}
                <strong
                  className={
                    overview.overdue7DaysQuoteCount > 0
                      ? 'text-rose-600 font-semibold'
                      : 'text-emerald-700 font-semibold'
                  }
                >
                  {isLoading && !report ? '—' : overview.overdue7DaysQuoteCount}
                </strong>
              </span>
              <Link
                href="/leads?status=quote_sent&overdueOnly=true"
                className="font-semibold text-[#1E3A8A] hover:underline"
              >
                Kiểm tra ngay →
              </Link>
            </div>
          </div>

          {/* KPI 4: Won Leads & Approved Win Rate */}
          <div className="rounded-xl bg-white border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Lead chốt thành công (Won)
                </span>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <strong className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.wonCount}
                  </strong>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                    Tỷ lệ chốt: {isLoading && !report ? '—' : overview.winRateText}
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Thất bại (Lost):{' '}
                <strong className="text-slate-900 font-semibold">
                  {isLoading && !report ? '—' : overview.lostCount}
                </strong>
              </span>
              <span>
                {report?.isSmallSample ? 'Mẫu < 30 Lead (Tham khảo)' : `Kỳ: ${periodLabel}`}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* HOME-03: Pipeline Distribution / Trend & Prioritized Actionable Work */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 columns: Pipeline Distribution & Daily Lead Trend */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Phân bổ trạng thái Pipeline & Xu hướng tiếp nhận
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Số liệu thực tế từ hồ sơ Lead hợp lệ (L2 = {overview.validLeadsL2} hồ sơ) trong kỳ{' '}
                {periodLabel.toLowerCase()}
              </p>
            </div>
            <Link
              href="/leads"
              className="text-sm font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>Mở bảng Lead</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Pipeline distribution bars (real backend numbers, zero remains zero) */}
          <div className="space-y-3.5">
            {[
              {
                status: 'new_lead',
                label: 'Vừa nhận thông tin',
                count: overview.newLeadCount,
                barClass: 'bg-blue-600',
                badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
                href: '/leads?status=new_lead',
              },
              {
                status: 'quoting',
                label: 'Đang soạn báo giá & khảo sát',
                count: overview.quotingCount,
                barClass: 'bg-sky-500',
                badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
                href: '/leads?status=quoting',
              },
              {
                status: 'quote_sent',
                label: 'Đã gửi báo giá (Chờ phản hồi)',
                count: overview.quoteSentCount,
                barClass: 'bg-amber-500',
                badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
                href: '/leads?status=quote_sent',
              },
              {
                status: 'won',
                label: 'Chốt thành công (Won)',
                count: overview.wonCount,
                barClass: 'bg-emerald-600',
                badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                href: '/leads?status=won',
              },
              {
                status: 'lost',
                label: 'Thất bại / Dừng triển khai (Lost)',
                count: overview.lostCount,
                barClass: 'bg-slate-400',
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
                href: '/leads?status=lost',
              },
            ].map((row) => {
              const denom = Math.max(overview.validLeadsL2, 1);
              const pct =
                overview.validLeadsL2 > 0
                  ? Math.round((row.count / denom) * 100)
                  : 0;
              return (
                <Link
                  key={row.status}
                  href={row.href}
                  className="block p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/80 border border-slate-200/70 transition space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-800">{row.label}</span>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded-md border text-xs font-semibold ${row.badgeClass}`}
                      >
                        {row.count} hồ sơ
                      </span>
                      <span className="font-mono text-xs font-semibold text-slate-500 w-10 text-right">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200/80 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.barClass} transition-all duration-300`}
                      style={{ width: `${row.count > 0 ? Math.max(4, pct) : 0}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Chronological Lead trend mini-chart */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                Xu hướng phát sinh Lead theo ngày (Tối đa 14 ngày gần nhất có dữ liệu)
              </h3>
              <span className="text-xs text-slate-500">
                Tổng L1: {overview.totalLeadsL1} · Chốt: {overview.wonCount}
              </span>
            </div>

            {leadTrend.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-sm text-slate-500 text-center">
                Chưa có phát sinh Lead trong khoảng thời gian đã chọn.
              </div>
            ) : (
              <div className="grid grid-cols-7 sm:grid-cols-14 gap-2 items-end pt-2">
                {(() => {
                  const maxDay = Math.max(...leadTrend.map((d) => d.totalL1), 1);
                  return leadTrend.map((pt) => {
                    const heightPct = Math.max(14, Math.round((pt.totalL1 / maxDay) * 100));
                    return (
                      <div
                        key={pt.date}
                        className="flex flex-col items-center gap-1.5"
                        title={`Ngày ${pt.date}: Tổng ${pt.totalL1} Lead (Hợp lệ: ${pt.validL2}, Chốt: ${pt.wonCount})`}
                      >
                        <span className="text-xs font-semibold text-slate-700 tabular-nums">
                          {pt.totalL1}
                        </span>
                        <div className="w-full h-20 bg-slate-100 rounded-lg flex items-end p-1">
                          <div
                            className="w-full rounded bg-[#1E3A8A] transition-all"
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 font-mono">{pt.label}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 columns: Prioritized Actionable Work List (HOME-03) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Việc cần xử lý ưu tiên
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Danh sách công việc thực tế theo quyền hạn của {user?.roleName}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold shrink-0">
              {actionableTasks.filter((t) => t.count > 0).length} hạng mục cần làm
            </span>
          </div>

          <div className="space-y-3">
            {actionableTasks.map((task) => {
              const hasWork = task.count > 0;
              const badgeStyles = !hasWork
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : task.severity === 'critical'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800';

              return (
                <Link
                  key={task.id}
                  href={task.href}
                  className={`block p-4 rounded-xl border transition ${
                    hasWork
                      ? 'bg-white hover:bg-slate-50 border-slate-200/90 shadow-2xs'
                      : 'bg-slate-50/60 hover:bg-slate-50 border-slate-200/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          {task.moduleLabel}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {task.title}
                      </h3>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {task.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-lg border text-xs font-bold tabular-nums ${badgeStyles}`}
                      >
                        {task.count === 0 ? 'Đã xử lý hết (0)' : `${task.count} hồ sơ`}
                      </span>
                      <span className="text-xs font-semibold text-[#1E3A8A] inline-flex items-center gap-1">
                        <span>Mở xử lý</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Direct list of urgent overdue quotes (>7 days) when present */}
          {urgentQuotes.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Hồ sơ báo giá quá hạn &gt; 7 ngày ({urgentQuotes.length})</span>
                </h3>
                <Link
                  href="/leads?status=quote_sent&overdueOnly=true"
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                >
                  Xem tất cả →
                </Link>
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {urgentQuotes.slice(0, 4).map((q) => (
                  <div
                    key={q.leadId}
                    className="p-3 rounded-xl bg-rose-50/50 border border-rose-200/80 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#1E3A8A]">
                          {q.leadCode}
                        </span>
                        <strong className="text-sm font-semibold text-slate-900 truncate">
                          {q.companyOrContact}
                        </strong>
                      </div>
                      <p className="text-xs text-slate-600 truncate mt-0.5">
                        Sales: <strong>{q.assignedSalesName}</strong> · Chờ {q.daysWaiting} ngày
                      </p>
                    </div>
                    <Link
                      href={`/leads?highlight=${q.leadId}`}
                      className="h-8 px-3 rounded-lg bg-white border border-slate-200 hover:border-blue-300 text-[#1E3A8A] text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                    >
                      <span>Mở hồ sơ</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* HOME-04: Marketing Summary (Where permitted — distinct Platform Conversions vs CRM Leads) */}
      {canViewMarketingSummary && marketing && (
        <section
          aria-label="Hiệu quả Marketing và Quảng cáo"
          className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Tổng hợp hiệu quả Quảng cáo & Nguồn Lead ({periodLabel})
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Phân tách rõ <strong>Chuyển đổi báo cáo từ nền tảng Ads</strong> và{' '}
                <strong>Lead thực tế ghi nhận trong CRM</strong> (Đồng bộ với Phân hệ Báo cáo)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/tracking"
                className="text-sm font-semibold text-slate-700 hover:text-[#1E3A8A] inline-flex items-center gap-1"
              >
                <span>Đối soát nguồn</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/reports"
                className="text-sm font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
              >
                <span>Báo cáo chi tiết</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
              <span className="text-[13px] font-semibold text-slate-500">
                Tổng chi phí quảng cáo (VNĐ)
              </span>
              <strong className="block font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {formatMoney(marketing.totalAdsSpend, { emptyText: '0 ₫' })}
              </strong>
              <span className="text-[13px] text-slate-500 mt-1 block">
                {marketing.totalAdsSpend
                  ? `≈ ${formatMoneyCompact(marketing.totalAdsSpend)} · Google Ads & Facebook Ads`
                  : 'Google Ads & Facebook Ads trong kỳ'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Chuyển đổi báo cáo trên Nền tảng Ads
              </span>
              <strong className="block font-display text-xl font-bold text-slate-900 mt-1 tabular-nums">
                {marketing.platformReportedConversions} chuyển đổi
              </strong>
              <span className="text-xs text-slate-500 mt-1 block">
                Số liệu từ Google/Meta (Chưa lọc trùng CRM)
              </span>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/70">
              <span className="text-xs font-semibold text-[#1E3A8A] uppercase">
                Lead CRM Hiệu quả từ Ads (L3)
              </span>
              <strong className="block font-display text-xl font-bold text-[#1E3A8A] mt-1 tabular-nums">
                {marketing.effectiveLeadsFromAds} Lead thực tế
              </strong>
              <span className="text-xs text-slate-600 mt-1 block">
                Đã loại trừ Spam xác nhận trong CRM
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
              <span className="text-[13px] font-semibold text-slate-500">
                Chi phí / Lead hiệu quả (CPL, VNĐ)
              </span>
              <strong className="block font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                {formatMoney(marketing.cplEffective, { emptyText: 'Chưa phát sinh' })}
              </strong>
              <span className="text-[13px] text-slate-500 mt-1 block">
                Tổng chi quảng cáo ÷ Lead hiệu quả (L3)
              </span>
            </div>
          </div>

          {/* Performance by Source / Campaign table */}
          <div className="overflow-x-auto border border-slate-200/90 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/90 text-xs font-semibold text-slate-600 uppercase">
                  <th className="py-3 px-4">Nguồn Marketing</th>
                  <th className="py-3 px-4">Chiến dịch</th>
                  <th className="py-3 px-4 text-right">Chi phí (VNĐ)</th>
                  <th className="py-3 px-4 text-right">Chuyển đổi Nền tảng</th>
                  <th className="py-3 px-4 text-right">Lead CRM (L1)</th>
                  <th className="py-3 px-4 text-right">Lead Hợp lệ (L2)</th>
                  <th className="py-3 px-4 text-right">Lead Hiệu quả (L3)</th>
                  <th className="py-3 px-4 text-right">Đã chốt (Won)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 text-sm">
                {marketing.bySourceCampaign.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 px-4 text-center text-slate-500">
                      Chưa có dữ liệu chiến dịch hoặc nguồn Lead trong kỳ báo cáo này.
                    </td>
                  </tr>
                ) : (
                  marketing.bySourceCampaign.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {row.sourceName}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{row.campaignName}</td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatMoney(row.spend)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">
                        {row.platformConversions > 0 ? row.platformConversions : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900 tabular-nums">
                        {row.crmLeadsL1}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700 tabular-nums">
                        {row.crmValidL2}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#1E3A8A] tabular-nums">
                        {row.crmEffectiveL3}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-700 tabular-nums">
                        {row.wonCount}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* HOME-05: Concise Operational Summaries for Tracking, SEO, and Design */}
      <section
        aria-label="Tóm tắt vận hành các phân hệ kỹ thuật"
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* 1. Tracking & Sync Summary */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E3A8A] grid place-items-center shrink-0">
                  <Crosshair className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Tracking & Đồng bộ nguồn
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kết nối nền tảng & đối soát chênh lệch
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                  trackingOps?.liveIntegrationMode
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                {trackingOps?.liveIntegrationMode ? 'Live API' : 'Chưa cấu hình Live API'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-xs text-slate-500 block">Kết nối nền tảng</span>
                <strong className="text-base font-bold text-slate-900">
                  {trackingOps
                    ? `${trackingOps.configuredConnectionsCount}/${trackingOps.totalConnectionsCount} hoạt động`
                    : '—'}
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-xs text-slate-500 block">Cảnh báo lệch đối soát</span>
                <strong
                  className={`text-base font-bold ${
                    (trackingOps?.openAlertsCount ?? 0) > 0
                      ? 'text-rose-600'
                      : 'text-emerald-700'
                  }`}
                >
                  {trackingOps?.openAlertsCount ?? 0} đang mở
                </strong>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <div className="flex items-center justify-between">
                <span>Kết nối lỗi liên tiếp (&ge; 3 lần):</span>
                <strong className="text-slate-900">
                  {trackingOps?.failingConnectionsCount ?? 0} kết nối
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Hàng đợi GCLID chờ đối chiếu lại:</span>
                <strong className="text-slate-900">
                  {trackingOps?.gclidPendingRetryCount ?? 0} hồ sơ
                </strong>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {trackingOps?.liveIntegrationMode
                ? 'Đồng bộ tự động định kỳ'
                : 'Đang dùng dữ liệu đối soát nội bộ'}
            </span>
            <Link
              href="/tracking"
              className="text-sm font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>Mở Tracking</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 2. SEO & Content Summary */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 grid place-items-center shrink-0">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Từ khóa & Nội dung SEO
                  </h3>
                  <p className="text-xs text-slate-500">
                    Trạng thái bài viết & xuất bản Website
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                  trackingOps?.wordpressConfigured
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {trackingOps?.wordpressConfigured
                  ? 'WordPress đã kết nối'
                  : 'WP chưa cấu hình'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-xs text-slate-500 block">Bài viết đã đăng</span>
                <strong className="text-base font-bold text-slate-900">
                  {marketing?.publishedSeoArticles ?? 0} bài viết
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-xs text-slate-500 block">Cần xử lý / Tối ưu</span>
                <strong
                  className={`text-base font-bold ${
                    ((marketing?.draftSeoArticles ?? 0) +
                      (marketing?.optimizationNeededArticles ?? 0)) >
                    0
                      ? 'text-amber-700'
                      : 'text-slate-900'
                  }`}
                >
                  {(marketing?.draftSeoArticles ?? 0) +
                    (marketing?.optimizationNeededArticles ?? 0)}{' '}
                  bài
                </strong>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <div className="flex items-center justify-between">
                <span>Bản nháp / Chờ lịch xuất bản:</span>
                <strong className="text-slate-900">
                  {marketing?.draftSeoArticles ?? 0} nháp ·{' '}
                  {marketing?.scheduledSeoArticles ?? 0} hẹn giờ
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Lỗi xuất bản lên Website:</span>
                <strong
                  className={
                    (marketing?.failedPublishArticles ?? 0) > 0
                      ? 'text-rose-600'
                      : 'text-slate-900'
                  }
                >
                  {marketing?.failedPublishArticles ?? 0} bài lỗi
                </strong>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Rà soát tối ưu định kỳ sau 30 ngày
            </span>
            <Link
              href="/ads"
              className="text-sm font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>Mở Từ khóa & SEO</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 3. Design & 3D Perspective Summary */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-700 grid place-items-center shrink-0">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Thiết kế & Phối cảnh 3D
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hỗ trợ kỹ thuật LED & Banner truyền thông
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                  trackingOps?.geminiConfigured
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                {trackingOps?.geminiConfigured
                  ? 'Gemini Live'
                  : 'AI Mockup nội bộ'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-xs text-slate-500 block">Đang chờ hoàn tất</span>
                <strong
                  className={`text-base font-bold ${
                    (design?.pendingCount ?? 0) > 0
                      ? 'text-amber-700'
                      : 'text-slate-900'
                  }`}
                >
                  {design?.pendingCount ?? 0} yêu cầu
                </strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-xs text-slate-500 block">Đã hoàn tất bàn giao</span>
                <strong className="text-base font-bold text-emerald-700">
                  {(design?.completed3dCount ?? 0) +
                    (design?.completedBannerCount ?? 0)}{' '}
                  bản vẽ
                </strong>
              </div>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <div className="flex items-center justify-between">
                <span>Phối cảnh 3D LED / Banner:</span>
                <strong className="text-slate-900">
                  {design?.completed3dCount ?? 0} 3D ·{' '}
                  {design?.completedBannerCount ?? 0} Banner
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Đang chờ duyệt (In review):</span>
                <strong className="text-slate-900">
                  {design?.inReviewCount ?? 0} hồ sơ
                </strong>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Tốc độ sinh AI TB: {design?.avgProcessingSecText ?? '0.0 giây'}
            </span>
            <Link
              href="/design"
              className="text-sm font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>Mở Studio 3D</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
