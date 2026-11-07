'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReportPreset, ReportsDashboardDto } from '@toantrung/contracts';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Flame,
  FolderKanban,
  Layers,
  Megaphone,
  Palette,
  Pencil,
  PhoneCall,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useSession } from '@/core/session/SessionContext';
import { formatMoney, formatMoneyCompact } from '@/core/format/money';

const PERIODS: Array<{ label: string; value: ReportPreset }> = [
  { label: '7 ngày qua', value: '7d' },
  { label: '30 ngày qua', value: '30d' },
  { label: 'Toàn thời gian', value: 'all' },
];

export default function DashboardPage() {
  const { user, branding } = useSession();
  const [preset, setPreset] = useState<ReportPreset>('all');
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
  const salesPerformance = report?.salesPerformance ?? [];
  const productInsights = report?.productInsights ?? [];
  const byChannel = report?.byChannel ?? [];
  const detailedLeads = report?.detailedLeads ?? [];

  // Phân tầng chu kỳ khách hỏi giá & ngâm báo giá B2B (Vài ngày -> Hàng tháng -> Năm sau)
  const b2bQuoteHorizonStats = useMemo(() => {
    const freshUnder7d = unansweredQuotes.filter((q) => q.daysWaiting < 7).length;
    const shortOverdue7to14d = unansweredQuotes.filter(
      (q) => q.daysWaiting >= 7 && q.daysWaiting <= 14
    ).length;
    const mediumMonthly15to45d = unansweredQuotes.filter(
      (q) => q.daysWaiting > 14 && q.daysWaiting <= 45
    ).length;
    const longTermOver45d = unansweredQuotes.filter((q) => q.daysWaiting > 45).length;
    return {
      freshUnder7d,
      shortOverdue7to14d,
      mediumMonthly15to45d,
      longTermOver45d,
    };
  }, [unansweredQuotes]);

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
    PERIODS.find((p) => p.value === preset)?.label ?? 'Toàn thời gian';

  const cleanScopeDescription = (report?.scopeDescription || '')
    .replace(/\s*\(theo[^)]*\)/gi, '')
    .replace(/\s*theo UC\d+[^)]*/gi, '');

  const spamFilteredCount = Math.max(0, overview.totalLeadsL1 - overview.effectiveLeadsL3);
  const cleanRatePct =
    overview.totalLeadsL1 > 0
      ? Math.round((overview.effectiveLeadsL3 / overview.totalLeadsL1) * 100)
      : 100;

  return (
    <div className="space-y-3.5 text-sm">
      {/* 1. HERO COMMAND HEADER — Mảng màu Navy-Indigo đậm nét, tích hợp thanh xung nhịp vận hành */}
      <header className="rounded-2xl bg-gradient-to-r from-[#0F2557] via-[#1E3A8A] to-[#1D4ED8] text-white shadow-md overflow-hidden border border-blue-900">
        <div className="p-4 sm:px-5 sm:py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-bold uppercase tracking-wider">
                <Activity className="w-3.5 h-3.5 text-amber-300" />
                <span>Trung tâm Điều hành Toàn Trung</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/15 border border-white/20 text-white text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                <span>{user?.roleName || 'Nhân sự'}</span>
              </span>
              {trackingOps && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-semibold ${
                    trackingOps.liveIntegrationMode
                      ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                      : 'bg-sky-500/20 border-sky-300/40 text-sky-100'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      trackingOps.liveIntegrationMode ? 'bg-emerald-400' : 'bg-sky-300'
                    }`}
                  />
                  <span>
                    {trackingOps.liveIntegrationMode
                      ? 'Đồng bộ Live API'
                      : 'Dữ liệu Đồng bộ Nội bộ'}
                  </span>
                </span>
              )}
            </div>
            <h1 className="font-display text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Bức tranh Toàn cảnh Kinh doanh, Quảng cáo &amp; Kỹ thuật LED
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/90 truncate">
              {cleanScopeDescription ||
                `Phạm vi dữ liệu được phân quyền cho tài khoản ${user?.fullName || ''}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Chọn kỳ báo cáo"
              className="inline-flex p-1 rounded-xl bg-slate-950/35 border border-white/15"
            >
              {PERIODS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPreset(item.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                    preset === item.value
                      ? 'bg-white text-[#0F2557] shadow-xs'
                      : 'text-blue-100 hover:text-white hover:bg-white/10'
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
              className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
              title="Làm mới số liệu tổng quan"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRefreshing || isLoading ? 'animate-spin' : ''}`}
              />
              <span>Làm mới</span>
            </button>

            <a
              href={`/api/v1/reports/export?preset=${preset}&format=xlsx`}
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-xs transition"
              title="Tải báo cáo tổng hợp Excel"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Excel</span>
            </a>

            <Link
              href="/leads"
              className="h-9 px-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs sm:text-sm font-extrabold inline-flex items-center gap-1.5 shadow-xs transition"
            >
              <span>Quản lý &amp; Sửa Lead</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* Sub-bar: 4 Operational Pulse Pills inside Hero */}
        <div className="bg-slate-950/30 border-t border-white/10 px-4 sm:px-5 py-2.5 grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-1.5 border border-white/10">
            <span className="text-blue-100">Tỷ lệ Lead sạch (L3/L1):</span>
            <strong className="text-emerald-300 font-bold tabular-nums">
              {cleanRatePct}% ({overview.effectiveLeadsL3}/{overview.totalLeadsL1})
            </strong>
          </div>
          <div className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-1.5 border border-white/10">
            <span className="text-blue-100">Chờ xác nhận tiếp nhận:</span>
            <strong
              className={`font-bold tabular-nums ${
                overview.unreceivedLeadsCount > 0 ? 'text-amber-300' : 'text-emerald-300'
              }`}
            >
              {overview.unreceivedLeadsCount} hồ sơ
            </strong>
          </div>
          <div className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-1.5 border border-white/10">
            <span className="text-blue-100">Khách ngâm BG &ge; 7 ngày:</span>
            <strong
              className={`font-bold tabular-nums ${
                overview.overdue7DaysQuoteCount > 0 ? 'text-rose-300' : 'text-emerald-300'
              }`}
            >
              {overview.overdue7DaysQuoteCount} hồ sơ B2B
            </strong>
          </div>
          <div className="flex items-center justify-between bg-white/10 rounded-lg px-3 py-1.5 border border-white/10">
            <span className="text-blue-100">Cập nhật lúc:</span>
            <strong className="text-sky-200 font-semibold tabular-nums">
              {lastFetchedAt
                ? new Date(lastFetchedAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'Đang đồng bộ...'}
            </strong>
          </div>
        </div>
      </header>

      {fetchError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>
              <strong>Lỗi tải dữ liệu:</strong> {fetchError}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard(preset, true)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
          >
            Thử lại ngay
          </button>
        </div>
      )}

      {/* 2. 6 MẢNG MÀU KPI CỐT LÕI (High-Density 6-Card Color Grid) */}
      <section aria-label="Chỉ số điều hành cốt lõi">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* KPI 1: Indigo — Tổng Lead L1/L2/L3 */}
          <Link
            href="/leads"
            className="rounded-xl bg-gradient-to-br from-indigo-50/90 via-white to-white border border-indigo-200 border-t-4 border-t-indigo-600 p-3.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold text-indigo-800 uppercase tracking-wider block">
                  1. Tổng Lead (L1)
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl sm:text-3xl font-extrabold text-indigo-950 tabular-nums">
                    {isLoading && !report ? '—' : overview.totalLeadsL1}
                  </strong>
                  <span className="text-xs font-semibold text-indigo-700">hồ sơ</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white grid place-items-center shrink-0 shadow-xs">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-indigo-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Hợp lệ (L2):</span>
                <strong className="text-slate-900 font-bold tabular-nums">{overview.validLeadsL2}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Hiệu quả (L3):</span>
                <strong className="text-indigo-700 font-bold tabular-nums">
                  {overview.effectiveLeadsL3} (Loại {spamFilteredCount} Spam)
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 2: Blue — Đang xử lý & Khảo sát */}
          <Link
            href="/leads?status=quoting"
            className="rounded-xl bg-gradient-to-br from-blue-50/90 via-white to-white border border-blue-200 border-t-4 border-t-blue-600 p-3.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold text-blue-800 uppercase tracking-wider block">
                  2. Đang Xử Lý (Active)
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl sm:text-3xl font-extrabold text-blue-950 tabular-nums">
                    {isLoading && !report ? '—' : overview.activeLeadsCount}
                  </strong>
                  <span className="text-xs font-semibold text-blue-700">đang mở</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-blue-600 text-white grid place-items-center shrink-0 shadow-xs">
                <FolderKanban className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-blue-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Mới nhận thông tin:</span>
                <strong className="text-blue-800 font-bold tabular-nums">{overview.newLeadCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Đang khảo sát / BG:</span>
                <strong className="text-slate-900 font-bold tabular-nums">{overview.quotingCount}</strong>
              </div>
            </div>
          </Link>

          {/* KPI 3: Amber/Orange — Báo giá chờ & Khách ngâm B2B */}
          <Link
            href="/leads?status=quote_sent"
            className="rounded-xl bg-gradient-to-br from-amber-50/95 via-white to-white border border-amber-300 border-t-4 border-t-amber-500 p-3.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wider block">
                  3. Đã Gửi BG &amp; Khách Ngâm
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl sm:text-3xl font-extrabold text-amber-950 tabular-nums">
                    {isLoading && !report ? '—' : overview.unansweredQuoteCount}
                  </strong>
                  <span className="text-xs font-semibold text-amber-800">chờ khách</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white grid place-items-center shrink-0 shadow-xs">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-amber-200/80 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Tổng đã gửi BG:</span>
                <strong className="text-slate-900 font-bold tabular-nums">{overview.quoteSentCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Ngâm &ge; 7 ngày / Tháng:</span>
                <strong className="text-rose-600 font-extrabold tabular-nums">
                  {overview.overdue7DaysQuoteCount} hồ sơ
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 4: Emerald — Chốt hợp đồng & Win Rate */}
          <Link
            href="/leads?status=won"
            className="rounded-xl bg-gradient-to-br from-emerald-50/95 via-white to-white border border-emerald-200 border-t-4 border-t-emerald-600 p-3.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold text-emerald-800 uppercase tracking-wider block">
                  4. Chốt Thành Công (Won)
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl sm:text-3xl font-extrabold text-emerald-950 tabular-nums">
                    {isLoading && !report ? '—' : overview.wonCount}
                  </strong>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-extrabold tabular-nums">
                    {overview.winRateText}
                  </span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white grid place-items-center shrink-0 shadow-xs">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-emerald-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Thất bại (Lost):</span>
                <strong className="text-rose-700 font-bold tabular-nums">{overview.lostCount} hồ sơ</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Đánh giá mẫu:</span>
                <strong className="text-emerald-800 font-semibold">
                  {report?.isSmallSample ? 'Mẫu < 30 Lead' : 'Đủ cỡ mẫu'}
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 5: Violet — Ngân sách Ads & CPL Hiệu quả */}
          <Link
            href="/ads"
            className="rounded-xl bg-gradient-to-br from-violet-50/90 via-white to-white border border-violet-200 border-t-4 border-t-violet-600 p-3.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold text-violet-800 uppercase tracking-wider block">
                  5. Chi Phí Ads &amp; CPL
                </span>
                <div className="mt-1">
                  <strong className="font-display text-xl sm:text-2xl font-extrabold text-violet-950 tabular-nums block truncate">
                    {marketing?.totalAdsSpend
                      ? formatMoneyCompact(marketing.totalAdsSpend)
                      : '0 ₫'}
                  </strong>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-violet-600 text-white grid place-items-center shrink-0 shadow-xs">
                <Target className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-violet-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">CPL Thực tế (L3):</span>
                <strong className="text-violet-800 font-bold tabular-nums">
                  {marketing?.cplEffective
                    ? formatMoneyCompact(marketing.cplEffective)
                    : 'Chưa tính'}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Lead từ Ads (L3):</span>
                <strong className="text-slate-900 font-bold tabular-nums">
                  {marketing?.effectiveLeadsFromAds ?? 0} Lead
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 6: Teal/Cyan — Studio Phối cảnh 3D & Nội dung SEO */}
          <Link
            href="/design"
            className="rounded-xl bg-gradient-to-br from-teal-50/90 via-white to-white border border-teal-200 border-t-4 border-t-teal-600 p-3.5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold text-teal-800 uppercase tracking-wider block">
                  6. Phối Cảnh 3D &amp; SEO
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl sm:text-3xl font-extrabold text-teal-950 tabular-nums">
                    {design?.totalRequests ?? 0}
                  </strong>
                  <span className="text-xs font-semibold text-teal-700">bản vẽ AI</span>
                </div>
              </div>
              <div className="w-9 h-9 rounded-xl bg-teal-600 text-white grid place-items-center shrink-0 shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-teal-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Hoàn tất 3D / Banner:</span>
                <strong className="text-teal-800 font-bold tabular-nums">
                  {design?.completed3dCount ?? 0} 3D · {design?.completedBannerCount ?? 0} Banner
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Bài SEO đã đăng:</span>
                <strong className="text-slate-900 font-bold tabular-nums">
                  {marketing?.publishedSeoArticles ?? 0} bài ({marketing?.draftSeoArticles ?? 0} nháp)
                </strong>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. ROW 2: PHỄU PIPELINE 5 MÀU + CHU KỲ KHÁCH NGÂM B2B (Trái 7 cột) & VIỆC CẦN XỬ LÝ + BÁO GIÁ CHỜ (Phải 5 cột) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Left 7 columns */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            {/* Colored Section Banner */}
            <div className="bg-gradient-to-r from-[#1E3A8A] via-indigo-800 to-blue-700 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-300 shrink-0" />
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-white">
                    Phễu Trạng Thái Pipeline &amp; Phân Tích Chu Kỳ Chốt B2B
                  </h2>
                  <p className="text-[11px] text-blue-100">
                    Theo dõi tỷ trọng từng khâu và đặc thù khách hỏi giá LED để từ vài ngày tới hàng tháng / năm sau
                  </p>
                </div>
              </div>
              <Link
                href="/leads"
                className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1 transition"
              >
                <span>Mở bảng Lead</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-4 space-y-4">
              {/* 5 Color-Coded Stage Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {[
                  {
                    status: 'new_lead',
                    step: 'Bước 1',
                    label: 'Vừa nhận thông tin',
                    count: overview.newLeadCount,
                    cardBg: 'bg-indigo-50/90 border-indigo-300 hover:bg-indigo-100/80',
                    badgeBg: 'bg-indigo-600 text-white',
                    textCol: 'text-indigo-950',
                    barCol: 'bg-indigo-600',
                    href: '/leads?status=new_lead',
                  },
                  {
                    status: 'quoting',
                    step: 'Bước 2',
                    label: 'Đang soạn báo giá',
                    count: overview.quotingCount,
                    cardBg: 'bg-blue-50/90 border-blue-300 hover:bg-blue-100/80',
                    badgeBg: 'bg-blue-600 text-white',
                    textCol: 'text-blue-950',
                    barCol: 'bg-blue-600',
                    href: '/leads?status=quoting',
                  },
                  {
                    status: 'quote_sent',
                    step: 'Bước 3',
                    label: 'Đã gửi báo giá',
                    count: overview.quoteSentCount,
                    cardBg: 'bg-amber-50/95 border-amber-300 hover:bg-amber-100/80',
                    badgeBg: 'bg-amber-500 text-white',
                    textCol: 'text-amber-950',
                    barCol: 'bg-amber-500',
                    href: '/leads?status=quote_sent',
                  },
                  {
                    status: 'won',
                    step: 'Bước 4',
                    label: 'Chốt thành công',
                    count: overview.wonCount,
                    cardBg: 'bg-emerald-50/95 border-emerald-300 hover:bg-emerald-100/80',
                    badgeBg: 'bg-emerald-600 text-white',
                    textCol: 'text-emerald-950',
                    barCol: 'bg-emerald-600',
                    href: '/leads?status=won',
                  },
                  {
                    status: 'lost',
                    step: 'Bước 5',
                    label: 'Thất bại / Dừng',
                    count: overview.lostCount,
                    cardBg: 'bg-rose-50/80 border-rose-200 hover:bg-rose-100/70',
                    badgeBg: 'bg-rose-600 text-white',
                    textCol: 'text-rose-950',
                    barCol: 'bg-rose-500',
                    href: '/leads?status=lost',
                  },
                ].map((stage) => {
                  const denom = Math.max(overview.validLeadsL2, 1);
                  const pct =
                    overview.validLeadsL2 > 0
                      ? Math.round((stage.count / denom) * 100)
                      : 0;
                  return (
                    <Link
                      key={stage.status}
                      href={stage.href}
                      className={`p-3 rounded-xl border ${stage.cardBg} transition flex flex-col justify-between`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${stage.badgeBg}`}>
                            {stage.step}
                          </span>
                          <span className="text-xs font-extrabold text-slate-600 tabular-nums">
                            {pct}%
                          </span>
                        </div>
                        <p className={`text-xs font-extrabold ${stage.textCol} mt-2 leading-snug`}>
                          {stage.label}
                        </p>
                      </div>
                      <div className="mt-2.5">
                        <div className="flex items-baseline justify-between">
                          <strong className={`font-display text-2xl font-extrabold ${stage.textCol} tabular-nums`}>
                            {stage.count}
                          </strong>
                          <span className="text-[11px] text-slate-500 font-medium">hồ sơ</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-white/80 overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full ${stage.barCol}`}
                            style={{ width: `${stage.count > 0 ? Math.max(10, pct) : 0}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Chu kỳ nuôi dưỡng Báo giá B2B (Giải quyết bài toán khách hỏi giá để vài ngày -> hàng tháng -> năm sau chốt) */}
              <div className="rounded-xl bg-gradient-to-r from-amber-50/70 via-orange-50/50 to-purple-50/60 border border-amber-200/90 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-amber-700 shrink-0" />
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                      Phân Tầng Chu Kỳ Khách Hỏi Giá &amp; Ngâm Báo Giá B2B (Dự án LED / Bảng điện tử)
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-[11px] font-bold text-amber-900">
                    Đặc thù B2B: Chu kỳ chốt từ 3 ngày → 12 tháng
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Link
                    href="/leads?status=quote_sent"
                    className="p-2.5 rounded-lg bg-sky-50 border border-sky-200 hover:border-sky-400 transition"
                  >
                    <span className="text-[11px] font-bold text-sky-800 block">
                      1. Mới báo giá (&lt; 7 ngày)
                    </span>
                    <strong className="text-lg font-extrabold text-sky-950 tabular-nums">
                      {b2bQuoteHorizonStats.freshUnder7d} hồ sơ
                    </strong>
                    <span className="text-[11px] text-sky-700 block mt-0.5">
                      Đang tương tác nóng
                    </span>
                  </Link>

                  <Link
                    href="/leads?status=quote_sent&overdueOnly=true"
                    className="p-2.5 rounded-lg bg-amber-100/70 border border-amber-300 hover:border-amber-500 transition"
                  >
                    <span className="text-[11px] font-bold text-amber-900 block">
                      2. Cần nhắc (7 – 14 ngày)
                    </span>
                    <strong className="text-lg font-extrabold text-amber-950 tabular-nums">
                      {b2bQuoteHorizonStats.shortOverdue7to14d} hồ sơ
                    </strong>
                    <span className="text-[11px] text-amber-800 block mt-0.5">
                      Gọi hỏi phản hồi lần 1-2
                    </span>
                  </Link>

                  <Link
                    href="/leads?status=quote_sent&overdueOnly=true"
                    className="p-2.5 rounded-lg bg-orange-100/70 border border-orange-300 hover:border-orange-500 transition"
                  >
                    <span className="text-[11px] font-bold text-orange-900 block">
                      3. Ngâm hàng tháng (15–45d)
                    </span>
                    <strong className="text-lg font-extrabold text-orange-950 tabular-nums">
                      {b2bQuoteHorizonStats.mediumMonthly15to45d} hồ sơ
                    </strong>
                    <span className="text-[11px] text-orange-800 block mt-0.5">
                      Chờ trình duyệt ngân sách
                    </span>
                  </Link>

                  <Link
                    href="/leads?status=quote_sent"
                    className="p-2.5 rounded-lg bg-purple-100/70 border border-purple-300 hover:border-purple-500 transition"
                  >
                    <span className="text-[11px] font-bold text-purple-900 block">
                      4. Dài hạn / Năm sau chốt
                    </span>
                    <strong className="text-lg font-extrabold text-purple-950 tabular-nums">
                      {b2bQuoteHorizonStats.longTermOver45d} hồ sơ
                    </strong>
                    <span className="text-[11px] text-purple-800 block mt-0.5">
                      Chờ mặt bằng / dự toán năm
                    </span>
                  </Link>
                </div>
              </div>

              {/* Chronological Lead trend mini-chart */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    <span>Biểu đồ Nhịp độ Tiếp nhận Lead &amp; Chốt Hợp đồng theo ngày</span>
                  </span>
                  <div className="flex items-center gap-3 text-[11px] font-semibold">
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#1E3A8A]" /> Tổng Lead L1
                    </span>
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Đã chốt Won
                    </span>
                  </div>
                </div>

                {leadTrend.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-500 text-center">
                    Chưa có phát sinh Lead trong khoảng thời gian đã chọn.
                  </div>
                ) : (
                  <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 items-end pt-1">
                    {(() => {
                      const maxDay = Math.max(...leadTrend.map((d) => d.totalL1), 1);
                      return leadTrend.map((pt) => {
                        const heightPct = Math.max(16, Math.round((pt.totalL1 / maxDay) * 100));
                        return (
                          <div
                            key={pt.date}
                            className="flex flex-col items-center gap-1"
                            title={`Ngày ${pt.date}: Tổng ${pt.totalL1} Lead (Hợp lệ: ${pt.validL2}, Chốt: ${pt.wonCount})`}
                          >
                            <span className="text-[11px] font-bold text-slate-700 tabular-nums">
                              {pt.totalL1}
                            </span>
                            <div className="w-full h-16 bg-slate-100 rounded-lg flex items-end p-1 gap-0.5">
                              <div
                                className="flex-1 rounded bg-gradient-to-t from-[#1E3A8A] to-blue-500 transition-all"
                                style={{ height: `${heightPct}%` }}
                              />
                              {pt.wonCount > 0 && (
                                <div
                                  className="w-1.5 rounded bg-emerald-500"
                                  style={{
                                    height: `${Math.max(25, Math.round((pt.wonCount / maxDay) * 100))}%`,
                                  }}
                                />
                              )}
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 tabular-nums">
                              {pt.label}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right 5 columns: Priority Action Center & Waiting B2B Quotes */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            {/* Colored Section Banner */}
            <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-amber-200 shrink-0" />
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-white">
                    Việc Cần Xử Lý Ưu Tiên &amp; Đôn Đốc Báo Giá
                  </h2>
                  <p className="text-[11px] text-amber-100">
                    Cảnh báo hành động tức thời theo quyền hạn của {user?.roleName}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-white text-orange-900 text-xs font-extrabold shrink-0">
                {actionableTasks.filter((t) => t.count > 0).length} cần làm
              </span>
            </div>

            <div className="p-4 space-y-2.5">
              {actionableTasks.map((task) => {
                const hasWork = task.count > 0;
                const cardStyle = !hasWork
                  ? 'bg-emerald-50/40 border-emerald-200/80 border-l-4 border-l-emerald-500'
                  : task.severity === 'critical'
                    ? 'bg-rose-50/60 border-rose-200 border-l-4 border-l-rose-600 hover:bg-rose-50'
                    : 'bg-amber-50/60 border-amber-200 border-l-4 border-l-amber-500 hover:bg-amber-50';
                const badgeStyles = !hasWork
                  ? 'bg-emerald-600 text-white'
                  : task.severity === 'critical'
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-500 text-white';

                return (
                  <Link
                    key={task.id}
                    href={task.href}
                    className={`block p-3 rounded-xl border transition ${cardStyle}`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                          {task.moduleLabel}
                        </span>
                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 mt-0.5">
                          {task.title}
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                          {task.description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold tabular-nums whitespace-nowrap ${badgeStyles}`}
                        >
                          {task.count === 0 ? 'Hoàn tất (0)' : `${task.count} hồ sơ`}
                        </span>
                        <span className="text-[11px] font-bold text-[#1E3A8A] inline-flex items-center gap-0.5">
                          <span>Xử lý ngay</span>
                          <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {/* Direct list of waiting/overdue quotes */}
              <div className="pt-2.5 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-rose-900 flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Hồ sơ đã gửi báo giá đang chờ khách ({unansweredQuotes.length})</span>
                  </h3>
                  <Link
                    href="/leads?status=quote_sent"
                    className="text-xs font-bold text-[#1E3A8A] hover:underline"
                  >
                    Xem tất cả →
                  </Link>
                </div>

                {unansweredQuotes.length === 0 ? (
                  <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-800 font-medium text-center">
                    Tất cả hồ sơ báo giá đều đã được khách hàng phản hồi.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {unansweredQuotes.slice(0, 4).map((q) => (
                      <div
                        key={q.leadId}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${
                          q.isOverdue7Days
                            ? 'bg-rose-50/70 border-rose-200/90'
                            : 'bg-amber-50/60 border-amber-200/90'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-[#1E3A8A] text-[11px] font-extrabold tabular-nums">
                              {q.leadCode}
                            </span>
                            <strong className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {q.companyOrContact}
                            </strong>
                          </div>
                          <p className="text-xs text-slate-600 truncate mt-1">
                            Sales: <strong className="text-slate-800">{q.assignedSalesName}</strong> ·{' '}
                            <span className="text-slate-700">{q.productSummary}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold whitespace-nowrap ${
                              q.isOverdue7Days
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-500 text-white'
                            }`}
                          >
                            {q.isOverdue7Days ? `Quá hạn ${q.daysWaiting}d` : `Chờ ${q.daysWaiting}d`}
                          </span>
                          <Link
                            href={`/leads?highlight=${q.leadId}`}
                            className="h-7 px-2.5 rounded-lg bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Sửa</span>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. ROW 3: BẢNG HIỆU SUẤT ĐỘI NGŨ KINH DOANH (Trái 7 cột) & NHU CẦU DÒNG SẢN PHẨM LED + KÊNH LIÊN HỆ (Phải 5 cột) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Left 7 Cols: Sales Team Performance Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs flex flex-col">
          <div className="bg-gradient-to-r from-indigo-900 via-slate-800 to-blue-900 text-white px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-300 shrink-0" />
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-white">
                  Hiệu Suất Xử Lý &amp; Phân Bổ Lead Theo Nhân Sự Kinh Doanh
                </h2>
                <p className="text-[11px] text-indigo-200">
                  Trạng thái nhận Lead tự động (Round-Robin), tải công việc đang mở và tỷ lệ chốt thực tế
                </p>
              </div>
            </div>
            <Link
              href="/reports"
              className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <span>Chi tiết Báo cáo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-indigo-50/70 text-indigo-950 border-b border-indigo-100 text-[11px] uppercase tracking-wider font-extrabold">
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Nhân sự Sales</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Trạng thái</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Tổng</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Mới</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Đang BG</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Đã gửi BG</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Ngâm &gt;7d</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Chốt Won</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Win Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-slate-400">
                      Chưa có dữ liệu nhân sự kinh doanh trong phạm vi xem.
                    </td>
                  </tr>
                ) : (
                  salesPerformance.map((sp) => (
                    <tr key={sp.salesUserId} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              sp.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                          <span>{sp.salesFullName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            sp.isReceivingLeads
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sp.isReceivingLeads ? 'Đang nhận' : 'Tạm ngưng'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-extrabold text-slate-900">
                        {sp.totalLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-semibold text-indigo-700">
                        {sp.newLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-semibold text-blue-700">
                        {sp.quotingLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-semibold text-amber-700">
                        {sp.quoteSentLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums">
                        {sp.unansweredOverdue7d > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-extrabold">
                            {sp.unansweredOverdue7d}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-extrabold text-emerald-700">
                        {sp.wonLeads}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[#1E3A8A] font-extrabold text-xs">
                          {sp.winRateText}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 5 Cols: Product Demand & Contact Channel Breakdown */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            <div className="bg-gradient-to-r from-emerald-800 via-teal-700 to-cyan-700 text-white px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-emerald-200 shrink-0" />
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-white">
                    Nhu Cầu Sản Phẩm LED &amp; Kênh Tiếp Nhận
                  </h2>
                  <p className="text-[11px] text-emerald-100">
                    Top sản phẩm khách hỏi báo giá nhiều nhất &amp; tỷ trọng kênh liên hệ
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-white/15 text-white text-xs font-bold">
                {productInsights.length} dòng SP
              </span>
            </div>

            <div className="p-4 space-y-3">
              {/* Top Products */}
              <div className="space-y-2">
                {productInsights.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    Chưa có thống kê sản phẩm trong kỳ.
                  </p>
                ) : (
                  productInsights.slice(0, 5).map((pi) => {
                    const maxInq = Math.max(...productInsights.map((p) => p.inquiryCount), 1);
                    const pct = Math.max(12, Math.round((pi.inquiryCount / maxInq) * 100));
                    const isLed = pi.category === 'MAN_HINH_LED';
                    return (
                      <div
                        key={pi.productId}
                        className="p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold shrink-0 ${
                                isLed
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-violet-100 text-violet-900'
                              }`}
                            >
                              {isLed ? 'Màn hình LED' : 'Bảng điện tử'}
                            </span>
                            <strong className="text-slate-900 font-bold truncate">
                              {pi.productName}
                            </strong>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            <span className="text-blue-800 font-extrabold">
                              {pi.inquiryCount} hỏi
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                              {pi.wonCount} chốt
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isLed
                                ? 'bg-gradient-to-r from-blue-600 to-cyan-500'
                                : 'bg-gradient-to-r from-violet-600 to-indigo-500'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Contact Channels Distribution */}
              <div className="pt-2.5 border-t border-slate-200/80">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block mb-2">
                  Phân bổ theo Kênh khách hàng liên hệ
                </span>
                <div className="flex flex-wrap gap-2">
                  {byChannel.map((ch) => (
                    <div
                      key={ch.channel}
                      className="px-3 py-1.5 rounded-xl bg-teal-50/80 border border-teal-200 flex items-center gap-2 text-xs"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-teal-700" />
                      <span className="font-semibold text-teal-950">{ch.label}:</span>
                      <strong className="font-extrabold text-teal-800 tabular-nums">
                        {ch.count} Lead
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. ROW 4: HIỆU QUẢ CHIẾN DỊCH QUẢNG CÁO & ĐỐI SOÁT NGUỒN LEAD */}
      {canViewMarketingSummary && marketing && (
        <section
          aria-label="Hiệu quả Marketing và Quảng cáo"
          className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs"
        >
          <div className="bg-gradient-to-r from-violet-900 via-purple-800 to-indigo-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-violet-200 shrink-0" />
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-white">
                  Đối Chiếu Hiệu Quả Chiến Dịch Quảng Cáo (Ads Nền Tảng vs Lead Thực Tế CRM)
                </h2>
                <p className="text-[11px] text-violet-200">
                  Minh bạch chi phí quảng cáo, chuyển đổi báo cáo từ Google/Facebook và Lead hợp lệ L2 / hiệu quả L3
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/tracking"
                className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold inline-flex items-center gap-1"
              >
                <span>Mở Tracking</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/ads"
                className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1"
              >
                <span>Quảng cáo &amp; SEO</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-violet-50/70 border-b border-violet-100 text-[11px] font-extrabold text-violet-950 uppercase tracking-wider">
                  <th className="py-2.5 px-4 whitespace-nowrap">Nguồn Marketing</th>
                  <th className="py-2.5 px-4">Chiến dịch Quảng cáo / Nguồn thu hút</th>
                  <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Chi phí Ads (VNĐ)</th>
                  <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Chuyển đổi Nền tảng</th>
                  <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Lead CRM (L1)</th>
                  <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Hợp lệ (L2)</th>
                  <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Hiệu quả (L3)</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Đã chốt (Won)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {marketing.bySourceCampaign.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 px-4 text-center text-slate-500">
                      Chưa có dữ liệu chiến dịch hoặc nguồn Lead trong kỳ báo cáo này.
                    </td>
                  </tr>
                ) : (
                  marketing.bySourceCampaign.map((row) => (
                    <tr key={row.key} className="hover:bg-violet-50/30 transition-colors">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            row.sourceName === 'Google Ads'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : row.sourceName === 'Facebook Ads'
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {row.sourceName}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">{row.campaignName}</td>
                      <td className="py-2.5 px-3.5 text-right font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatMoney(row.spend)}
                      </td>
                      <td className="py-2.5 px-3.5 text-center tabular-nums font-semibold text-slate-700">
                        {row.platformConversions > 0 ? row.platformConversions : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-extrabold text-slate-900 tabular-nums">
                        {row.crmLeadsL1}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-semibold text-blue-700 tabular-nums">
                        {row.crmValidL2}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-extrabold text-indigo-800 tabular-nums">
                        {row.crmEffectiveL3}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                          {row.wonCount} Won
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 6. ROW 5: BẢNG HỒ SƠ LEAD MỚI NHẤT ĐỒNG BỘ TRỰC TIẾP & LIÊN KẾT MỞ SỬA NGAY */}
      <section className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-[#1E3A8A] text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-300 shrink-0" />
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-white">
                Danh Sách Hồ Sơ Lead Đồng Bộ Mới Nhất ({detailedLeads.length} hồ sơ)
              </h2>
              <p className="text-[11px] text-slate-300">
                Nhấn trực tiếp vào nút &ldquo;Mở &amp; Sửa&rdquo; để chỉnh sửa thông tin khách hàng, cập nhật báo giá hoặc tiến độ dự án
              </p>
            </div>
          </div>
          <Link
            href="/leads"
            className="px-3 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1"
          >
            <span>Xem toàn bộ &amp; Sửa Lead</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider">
                <th className="py-2.5 px-3.5 whitespace-nowrap">Mã Lead</th>
                <th className="py-2.5 px-3.5 min-w-[210px]">Khách hàng / Đơn vị</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Số điện thoại</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Kênh &amp; Nguồn</th>
                <th className="py-2.5 px-3.5 min-w-[180px]">Sản phẩm LED quan tâm</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Sales phụ trách</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Trạng thái</th>
                <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailedLeads.slice(0, 8).map((row) => {
                const statusText = row.pipelineStatusLabel || '';
                const isSpam = statusText.toLowerCase().includes('spam');
                const isWon = statusText.includes('Chốt thành công');
                const isLost = statusText.includes('Thất bại');
                const isQuoteSent = statusText.includes('Đã gửi báo giá');
                const isQuoting = statusText.includes('Đang soạn báo giá');

                const statusPill = isSpam
                  ? 'bg-red-600 text-white'
                  : isWon
                    ? 'bg-emerald-600 text-white'
                    : isLost
                      ? 'bg-rose-600 text-white'
                      : isQuoteSent
                        ? 'bg-amber-500 text-white'
                        : isQuoting
                          ? 'bg-blue-600 text-white'
                          : 'bg-indigo-600 text-white';

                return (
                  <tr
                    key={row.leadCode}
                    className={
                      isSpam
                        ? 'bg-red-50/50 hover:bg-red-50/80 transition-colors'
                        : 'hover:bg-blue-50/30 transition-colors'
                    }
                  >
                    <td className="py-2.5 px-3.5 tabular-nums font-extrabold text-[#1E3A8A] whitespace-nowrap">
                      {row.leadCode}
                    </td>
                    <td className="py-2.5 px-3.5 font-bold text-slate-900">
                      {row.companyOrCustomer.replace(/\s*\(Dữ liệu tổng hợp\)/gi, '')}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                      {row.phone}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-semibold">
                        {row.contactChannel}
                      </span>
                      <span className="ml-1 px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-bold">
                        {row.marketingSource}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="flex flex-wrap gap-1">
                        {row.productsText
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean)
                          .map((p, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200/80 text-indigo-900 text-[11px] font-semibold whitespace-nowrap"
                            >
                              {p}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700 whitespace-nowrap">
                      {row.assignedSalesName}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold whitespace-nowrap ${statusPill}`}
                      >
                        {row.pipelineStatusLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`/leads?search=${encodeURIComponent(row.leadCode)}`}
                        className="h-7 px-2.5 rounded-lg bg-[#1E3A8A] hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1 shadow-2xs"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>Mở &amp; Sửa</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
