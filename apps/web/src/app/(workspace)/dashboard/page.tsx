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
  Clock,
  Download,
  FileSpreadsheet,
  FolderKanban,
  Layers,
  Megaphone,
  PhoneCall,
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
  const { user } = useSession();
  const [preset, setPreset] = useState<ReportPreset>('all');
  const [report, setReport] = useState<ReportsDashboardDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

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

  const b2bFollowUpHorizonStats = useMemo(() => {
    const activeUnder7d = unansweredQuotes.filter((q) => q.daysWaiting < 7).length;
    const followUp7to30d = unansweredQuotes.filter(
      (q) => q.daysWaiting >= 7 && q.daysWaiting <= 30
    ).length;
    const periodic1to2m = unansweredQuotes.filter(
      (q) => q.daysWaiting > 30 && q.daysWaiting <= 60
    ).length;
    const longTermOver60d = unansweredQuotes.filter((q) => q.daysWaiting > 60).length;
    return {
      activeUnder7d,
      followUp7to30d,
      periodic1to2m,
      longTermOver60d,
    };
  }, [unansweredQuotes]);

  const canViewMarketingSummary =
    !user ||
    ['ADMIN', 'BOD', 'MKT_LEAD', 'MKT_STAFF', 'ADS', 'SALES_LEAD'].includes(
      user.roleCode
    );

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
      {/* 1. CLEAN MODERN WHITE HEADER */}
      <header className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 sm:px-5 sm:py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200/80 text-[#1E3A8A] text-xs font-bold">
                <Activity className="w-3.5 h-3.5 text-blue-600" />
                <span>Trung tâm Điều hành Toàn Trung</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>{user?.roleName || 'Nhân sự'}</span>
              </span>
              {trackingOps && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-semibold ${
                    trackingOps.liveIntegrationMode
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      trackingOps.liveIntegrationMode ? 'bg-emerald-500' : 'bg-blue-500'
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
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Tổng quan Kinh doanh, Quảng cáo &amp; Kỹ thuật LED
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 truncate">
              {cleanScopeDescription ||
                `Phạm vi dữ liệu được phân quyền cho tài khoản ${user?.fullName || ''}.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label="Chọn kỳ báo cáo"
              className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200/80"
            >
              {PERIODS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPreset(item.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                    preset === item.value
                      ? 'bg-white text-[#1E3A8A] shadow-2xs font-bold'
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
              className="h-9 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-60"
              title="Làm mới số liệu tổng quan"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing || isLoading ? 'animate-spin' : ''}`}
              />
              <span>Làm mới</span>
            </button>

            <a
              href={`/api/v1/reports/export?preset=${preset}&format=xlsx`}
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition"
              title="Tải báo cáo tổng hợp Excel"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Xuất Excel</span>
            </a>

            <Link
              href="/leads"
              className="h-9 px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition"
            >
              <span>Quản lý Lead</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Sub-bar: 4 Clean Operational Summary Pills */}
        <div className="bg-slate-50/80 border-t border-slate-200/80 px-4 sm:px-5 py-2.5 grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-slate-200/80">
            <span className="text-slate-500">Tỷ lệ Lead sạch (L3/L1):</span>
            <strong className="text-emerald-700 font-bold tabular-nums">
              {cleanRatePct}% ({overview.effectiveLeadsL3}/{overview.totalLeadsL1})
            </strong>
          </div>
          <div className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-slate-200/80">
            <span className="text-slate-500">Chờ xác nhận tiếp nhận:</span>
            <strong
              className={`font-bold tabular-nums ${
                overview.unreceivedLeadsCount > 0 ? 'text-amber-700' : 'text-slate-700'
              }`}
            >
              {overview.unreceivedLeadsCount} hồ sơ
            </strong>
          </div>
          <div className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-slate-200/80">
            <span className="text-slate-500">Báo giá chờ &ge; 7 ngày:</span>
            <strong
              className={`font-bold tabular-nums ${
                overview.overdue7DaysQuoteCount > 0 ? 'text-rose-600' : 'text-slate-700'
              }`}
            >
              {overview.overdue7DaysQuoteCount} hồ sơ
            </strong>
          </div>
          <div className="flex items-center justify-between bg-white rounded-lg px-3 py-1.5 border border-slate-200/80">
            <span className="text-slate-500">Cập nhật lúc:</span>
            <strong className="text-slate-700 font-semibold tabular-nums">
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
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>Lỗi tải dữ liệu:</strong> {fetchError}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadDashboard(preset, true)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 2. 6 CLEAN WHITE KPI CARDS WITH SUBTLE TINT ACCENTS */}
      <section aria-label="Chỉ số điều hành cốt lõi">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* KPI 1: Tổng Lead */}
          <Link
            href="/leads"
            className="rounded-xl bg-white border border-slate-200/90 p-3.5 shadow-2xs hover:border-blue-300 hover:shadow-xs transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Tổng Lead (L1)
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.totalLeadsL1}
                  </strong>
                  <span className="text-xs text-slate-500">hồ sơ</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-100 grid place-items-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Hợp lệ (L2):</span>
                <strong className="text-slate-800 font-semibold tabular-nums">{overview.validLeadsL2}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Hiệu quả (L3):</span>
                <strong className="text-[#1E3A8A] font-semibold tabular-nums">
                  {overview.effectiveLeadsL3} ({spamFilteredCount} loại trừ)
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 2: Đang xử lý */}
          <Link
            href="/leads?status=quoting"
            className="rounded-xl bg-white border border-slate-200/90 p-3.5 shadow-2xs hover:border-blue-300 hover:shadow-xs transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Đang Tư Vấn
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.activeLeadsCount}
                  </strong>
                  <span className="text-xs text-slate-500">đang mở</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 grid place-items-center shrink-0">
                <FolderKanban className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mới nhận thông tin:</span>
                <strong className="text-slate-800 font-semibold tabular-nums">{overview.newLeadCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Đang soạn báo giá:</span>
                <strong className="text-sky-700 font-semibold tabular-nums">{overview.quotingCount}</strong>
              </div>
            </div>
          </Link>

          {/* KPI 3: Đã gửi báo giá & Theo dõi */}
          <Link
            href="/leads?status=quote_sent"
            className="rounded-xl bg-white border border-slate-200/90 p-3.5 shadow-2xs hover:border-amber-300 hover:shadow-xs transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Đã Gửi Báo Giá
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.unansweredQuoteCount}
                  </strong>
                  <span className="text-xs text-amber-700 font-medium">chờ phản hồi</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/70 grid place-items-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tổng đã gửi BG:</span>
                <strong className="text-slate-800 font-semibold tabular-nums">{overview.quoteSentCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Cần liên hệ (&ge; 7 ngày):</span>
                <strong className="text-amber-700 font-bold tabular-nums">
                  {overview.overdue7DaysQuoteCount} hồ sơ
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 4: Chốt thành công */}
          <Link
            href="/leads?status=won"
            className="rounded-xl bg-white border border-slate-200/90 p-3.5 shadow-2xs hover:border-emerald-300 hover:shadow-xs transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Chốt Thành Công
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {isLoading && !report ? '—' : overview.wonCount}
                  </strong>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold tabular-nums">
                    {overview.winRateText}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70 grid place-items-center shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Thất bại / Dừng:</span>
                <strong className="text-slate-700 font-semibold tabular-nums">{overview.lostCount} hồ sơ</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Đánh giá mẫu:</span>
                <strong className="text-emerald-700 font-medium">
                  {report?.isSmallSample ? 'Mẫu < 30 Lead' : 'Đủ cỡ mẫu'}
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 5: Chi phí Ads & CPL */}
          <Link
            href="/ads"
            className="rounded-xl bg-white border border-slate-200/90 p-3.5 shadow-2xs hover:border-violet-300 hover:shadow-xs transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Chi Phí Ads &amp; CPL
                </span>
                <div className="mt-1">
                  <strong className="font-display text-xl font-bold text-slate-900 tabular-nums block truncate">
                    {marketing?.totalAdsSpend
                      ? formatMoneyCompact(marketing.totalAdsSpend)
                      : '0 ₫'}
                  </strong>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-700 border border-violet-200/70 grid place-items-center shrink-0">
                <Target className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">CPL Thực tế (L3):</span>
                <strong className="text-violet-700 font-semibold tabular-nums">
                  {marketing?.cplEffective
                    ? formatMoneyCompact(marketing.cplEffective)
                    : 'Chưa tính'}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Lead từ Ads (L3):</span>
                <strong className="text-slate-800 font-semibold tabular-nums">
                  {marketing?.effectiveLeadsFromAds ?? 0} Lead
                </strong>
              </div>
            </div>
          </Link>

          {/* KPI 6: Phối cảnh 3D & SEO */}
          <Link
            href="/design"
            className="rounded-xl bg-white border border-slate-200/90 p-3.5 shadow-2xs hover:border-teal-300 hover:shadow-xs transition flex flex-col justify-between"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Phối Cảnh 3D &amp; SEO
                </span>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <strong className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                    {design?.totalRequests ?? 0}
                  </strong>
                  <span className="text-xs text-slate-500">bản vẽ AI</span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 border border-teal-200/70 grid place-items-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-slate-100 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Hoàn tất 3D / Banner:</span>
                <strong className="text-teal-700 font-semibold tabular-nums">
                  {design?.completed3dCount ?? 0} 3D · {design?.completedBannerCount ?? 0} Banner
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Bài SEO đã đăng:</span>
                <strong className="text-slate-800 font-semibold tabular-nums">
                  {marketing?.publishedSeoArticles ?? 0} bài ({marketing?.draftSeoArticles ?? 0} nháp)
                </strong>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. ROW 2: PHỄU PIPELINE & LỘ TRÌNH THEO DÕI DỰ ÁN B2B (Trái 7 cột) + VIỆC CẦN XỬ LÝ (Phải 5 cột) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Left 7 columns */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs flex flex-col justify-between">
          <div>
            <div className="bg-slate-50/70 border-b border-slate-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-100 grid place-items-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    Phễu Trạng Thái Pipeline &amp; Kế Hoạch Theo Dõi Dự Án B2B
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tỷ trọng từng giai đoạn và lộ trình chăm sóc các dự án có chu kỳ quyết định từ vài tuần đến nhiều tháng
                  </p>
                </div>
              </div>
              <Link
                href="/leads"
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1 transition"
              >
                <span>Mở danh sách Lead</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="p-4 space-y-4">
              {/* 5 Subtle-Accent Stage Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {[
                  {
                    status: 'new_lead',
                    step: 'Bước 1',
                    label: 'Vừa nhận thông tin',
                    count: overview.newLeadCount,
                    badgeCls: 'bg-violet-50 text-violet-700 border-violet-200',
                    barCol: 'bg-violet-500',
                    href: '/leads?status=new_lead',
                  },
                  {
                    status: 'quoting',
                    step: 'Bước 2',
                    label: 'Đang soạn báo giá',
                    count: overview.quotingCount,
                    badgeCls: 'bg-blue-50 text-blue-700 border-blue-200',
                    barCol: 'bg-blue-600',
                    href: '/leads?status=quoting',
                  },
                  {
                    status: 'quote_sent',
                    step: 'Bước 3',
                    label: 'Đã gửi báo giá',
                    count: overview.quoteSentCount,
                    badgeCls: 'bg-amber-50 text-amber-800 border-amber-200',
                    barCol: 'bg-amber-500',
                    href: '/leads?status=quote_sent',
                  },
                  {
                    status: 'won',
                    step: 'Bước 4',
                    label: 'Chốt thành công',
                    count: overview.wonCount,
                    badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    barCol: 'bg-emerald-600',
                    href: '/leads?status=won',
                  },
                  {
                    status: 'lost',
                    step: 'Bước 5',
                    label: 'Thất bại / Dừng',
                    count: overview.lostCount,
                    badgeCls: 'bg-slate-100 text-slate-600 border-slate-200',
                    barCol: 'bg-slate-400',
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
                      className="p-3 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/40 transition flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase ${stage.badgeCls}`}
                          >
                            {stage.step}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 tabular-nums">
                            {pct}%
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 mt-2 leading-snug">
                          {stage.label}
                        </p>
                      </div>
                      <div className="mt-2.5">
                        <div className="flex items-baseline justify-between">
                          <strong className="font-display text-2xl font-bold text-slate-900 tabular-nums">
                            {stage.count}
                          </strong>
                          <span className="text-[11px] text-slate-400">hồ sơ</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
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

              {/* Lộ trình Theo dõi Dự án Chu kỳ Dài hạn B2B */}
              <div className="rounded-xl bg-slate-50/70 border border-slate-200/90 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                      Kế Hoạch Theo Dõi Hồ Sơ Đã Báo Giá Theo Chu Kỳ Dự Án
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-medium text-slate-600">
                    Theo dõi theo mốc thời gian: Tuần đầu · 1 tháng · 2 tháng+
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Link
                    href="/leads?status=quote_sent"
                    className="p-2.5 rounded-lg bg-white border border-slate-200/90 hover:border-blue-300 transition"
                  >
                    <span className="text-[11px] font-semibold text-slate-600 block">
                      Đang tư vấn (&lt; 7 ngày)
                    </span>
                    <strong className="text-lg font-bold text-slate-900 tabular-nums">
                      {b2bFollowUpHorizonStats.activeUnder7d} hồ sơ
                    </strong>
                    <span className="text-[11px] text-blue-700 block mt-0.5">
                      Vừa gửi báo giá mới
                    </span>
                  </Link>

                  <Link
                    href="/leads?status=quote_sent&overdueOnly=true"
                    className="p-2.5 rounded-lg bg-white border border-slate-200/90 hover:border-amber-300 transition"
                  >
                    <span className="text-[11px] font-semibold text-slate-600 block">
                      Cần liên hệ lại (7–30 ngày)
                    </span>
                    <strong className="text-lg font-bold text-amber-700 tabular-nums">
                      {b2bFollowUpHorizonStats.followUp7to30d} hồ sơ
                    </strong>
                    <span className="text-[11px] text-amber-700 block mt-0.5">
                      Nhắc lịch phản hồi báo giá
                    </span>
                  </Link>

                  <Link
                    href="/leads?status=quote_sent&overdueOnly=true"
                    className="p-2.5 rounded-lg bg-white border border-slate-200/90 hover:border-indigo-300 transition"
                  >
                    <span className="text-[11px] font-semibold text-slate-600 block">
                      Theo dõi 1–2 tháng
                    </span>
                    <strong className="text-lg font-bold text-indigo-700 tabular-nums">
                      {b2bFollowUpHorizonStats.periodic1to2m} hồ sơ
                    </strong>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Chờ phê duyệt ngân sách
                    </span>
                  </Link>

                  <Link
                    href="/leads?status=quote_sent"
                    className="p-2.5 rounded-lg bg-white border border-slate-200/90 hover:border-violet-300 transition"
                  >
                    <span className="text-[11px] font-semibold text-slate-600 block">
                      Dự án dài hạn (&gt; 2 tháng)
                    </span>
                    <strong className="text-lg font-bold text-slate-900 tabular-nums">
                      {b2bFollowUpHorizonStats.longTermOver60d} hồ sơ
                    </strong>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Chờ tiến độ mặt bằng / quý tới
                    </span>
                  </Link>
                </div>
              </div>

              {/* Chronological Lead trend mini-chart */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-[#1E3A8A]" />
                    <span>Nhịp độ Tiếp nhận Lead &amp; Chốt Hợp đồng theo ngày</span>
                  </span>
                  <div className="flex items-center gap-3 text-[11px] font-medium">
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
                            <span className="text-[11px] font-semibold text-slate-700 tabular-nums">
                              {pt.totalL1}
                            </span>
                            <div className="w-full h-16 bg-slate-100 rounded-lg flex items-end p-1 gap-0.5">
                              <div
                                className="flex-1 rounded bg-[#1E3A8A]/85 transition-all"
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
                            <span className="text-[10px] font-medium text-slate-500 tabular-nums">
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
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs flex flex-col justify-between">
          <div>
            <div className="bg-slate-50/70 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/70 grid place-items-center shrink-0">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    Việc Cần Xử Lý &amp; Lịch Nhắc Liên Hệ Lại
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cảnh báo công việc theo phân quyền của {user?.roleName}
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shrink-0">
                {actionableTasks.filter((t) => t.count > 0).length} mục cần xử lý
              </span>
            </div>

            <div className="p-4 space-y-2.5">
              {actionableTasks.map((task) => {
                const hasWork = task.count > 0;
                const cardStyle = !hasWork
                  ? 'bg-white border-slate-200/80 border-l-2 border-l-emerald-500'
                  : task.severity === 'critical'
                    ? 'bg-white border-slate-200/90 border-l-2 border-l-rose-500 hover:bg-slate-50/60'
                    : 'bg-white border-slate-200/90 border-l-2 border-l-amber-500 hover:bg-slate-50/60';
                const badgeStyles = !hasWork
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : task.severity === 'critical'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200';

                return (
                  <Link
                    key={task.id}
                    href={task.href}
                    className={`block p-3 rounded-xl border transition ${cardStyle}`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {task.moduleLabel}
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">
                          {task.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                          {task.description}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums whitespace-nowrap ${badgeStyles}`}
                        >
                          {task.count === 0 ? 'Hoàn tất (0)' : `${task.count} hồ sơ`}
                        </span>
                        <span className="text-[11px] font-semibold text-[#1E3A8A] inline-flex items-center gap-0.5">
                          <span>Chi tiết</span>
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
                  <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>Hồ sơ đã gửi báo giá chờ phản hồi ({unansweredQuotes.length})</span>
                  </h3>
                  <Link
                    href="/leads?status=quote_sent"
                    className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                  >
                    Xem tất cả →
                  </Link>
                </div>

                {unansweredQuotes.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 text-center">
                    Tất cả hồ sơ báo giá đều đã được khách hàng phản hồi.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {unansweredQuotes.slice(0, 4).map((q) => (
                      <div
                        key={q.leadId}
                        className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/90 flex items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200/70 text-[#1E3A8A] text-[11px] font-bold tabular-nums">
                              {q.leadCode}
                            </span>
                            <strong className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                              {q.companyOrContact}
                            </strong>
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-1">
                            Sales: <strong className="text-slate-700">{q.assignedSalesName}</strong> ·{' '}
                            <span>{q.productSummary}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                              q.isOverdue7Days
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {q.isOverdue7Days ? `Chờ ${q.daysWaiting} ngày` : `${q.daysWaiting} ngày`}
                          </span>
                          <Link
                            href={`/leads?highlight=${q.leadId}`}
                            className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center"
                          >
                            Chi tiết
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

      {/* 4. ROW 3: BẢNG HIỆU SUẤT ĐỘI NGŨ KINH DOANH (Trái 7 cột) & NHU CẦU DÒNG SẢN PHẨM LED (Phải 5 cột) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Left 7 Cols: Sales Team Performance Table */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs flex flex-col">
          <div className="bg-slate-50/70 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-100 grid place-items-center shrink-0">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                  Hiệu Suất Xử Lý &amp; Phân Bổ Lead Theo Nhân Sự Kinh Doanh
                </h2>
                <p className="text-xs text-slate-500">
                  Trạng thái nhận Lead tự động (Round-Robin), hồ sơ đang theo dõi và tỷ lệ chốt thực tế
                </p>
              </div>
            </div>
            <Link
              href="/reports"
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
            >
              <span>Chi tiết Báo cáo</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50/90 text-slate-600 border-b border-slate-200/80 text-[11px] uppercase tracking-wider font-bold">
                  <th className="py-2.5 px-3.5 whitespace-nowrap">Nhân sự Sales</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Trạng thái</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Tổng</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Mới</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Đang BG</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Đã gửi BG</th>
                  <th className="py-2.5 px-2.5 text-center whitespace-nowrap">Chờ &gt;7d</th>
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
                    <tr key={sp.salesUserId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              sp.isOnline ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                          <span>{sp.salesFullName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            sp.isReceivingLeads
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {sp.isReceivingLeads ? 'Đang nhận' : 'Tạm ngưng'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-bold text-slate-900">
                        {sp.totalLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-medium text-slate-700">
                        {sp.newLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-medium text-blue-700">
                        {sp.quotingLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-medium text-amber-700">
                        {sp.quoteSentLeads}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums">
                        {sp.unansweredOverdue7d > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                            {sp.unansweredOverdue7d}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2.5 text-center tabular-nums font-bold text-emerald-700">
                        {sp.wonLeads}
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-bold text-xs">
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
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs flex flex-col justify-between">
          <div>
            <div className="bg-slate-50/70 border-b border-slate-200/80 px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/70 grid place-items-center shrink-0">
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                    Nhu Cầu Sản Phẩm LED &amp; Kênh Tiếp Nhận
                  </h2>
                  <p className="text-xs text-slate-500">
                    Top sản phẩm khách quan tâm báo giá &amp; tỷ trọng kênh liên hệ
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 text-xs font-semibold">
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
                        className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                                isLed
                                  ? 'bg-blue-50 text-[#1E3A8A] border border-blue-200/70'
                                  : 'bg-violet-50 text-violet-800 border border-violet-200/70'
                              }`}
                            >
                              {isLed ? 'Màn hình LED' : 'Bảng điện tử'}
                            </span>
                            <strong className="text-slate-900 font-semibold truncate">
                              {pi.productName}
                            </strong>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 tabular-nums">
                            <span className="text-slate-700 font-semibold">
                              {pi.inquiryCount} nhu cầu
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-[11px]">
                              {pi.wonCount} chốt
                            </span>
                          </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isLed ? 'bg-[#1E3A8A]' : 'bg-violet-600'
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
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-2">
                  Phân bổ theo Kênh khách hàng liên hệ
                </span>
                <div className="flex flex-wrap gap-2">
                  {byChannel.map((ch) => (
                    <div
                      key={ch.channel}
                      className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/90 flex items-center gap-2 text-xs"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-slate-500" />
                      <span className="font-medium text-slate-700">{ch.label}:</span>
                      <strong className="font-bold text-slate-900 tabular-nums">
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
          className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs"
        >
          <div className="bg-slate-50/70 border-b border-slate-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-700 border border-violet-200/70 grid place-items-center shrink-0">
                <Megaphone className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                  Đối Chiếu Hiệu Quả Chiến Dịch Quảng Cáo (Ads Nền Tảng vs Lead Thực Tế CRM)
                </h2>
                <p className="text-xs text-slate-500">
                  Minh bạch chi phí quảng cáo, chuyển đổi báo cáo từ Google/Facebook và Lead hợp lệ L2 / hiệu quả L3
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/tracking"
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
              >
                <span>Mở Tracking</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/ads"
                className="px-2.5 py-1 rounded-lg bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1"
              >
                <span>Quảng cáo &amp; SEO</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
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
                    <tr key={row.key} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            row.sourceName === 'Google Ads'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : row.sourceName === 'Facebook Ads'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {row.sourceName}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-slate-900">{row.campaignName}</td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatMoney(row.spend)}
                      </td>
                      <td className="py-2.5 px-3.5 text-center tabular-nums font-medium text-slate-600">
                        {row.platformConversions > 0 ? row.platformConversions : '—'}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-bold text-slate-900 tabular-nums">
                        {row.crmLeadsL1}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-medium text-blue-700 tabular-nums">
                        {row.crmValidL2}
                      </td>
                      <td className="py-2.5 px-3.5 text-center font-bold text-[#1E3A8A] tabular-nums">
                        {row.crmEffectiveL3}
                      </td>
                      <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-xs">
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

      {/* 6. ROW 5: BẢNG HỒ SƠ LEAD MỚI NHẤT ĐỒNG BỘ TRỰC TIẾP */}
      <section className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
        <div className="bg-slate-50/70 border-b border-slate-200/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-100 grid place-items-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                Danh Sách Hồ Sơ Lead Đồng Bộ Mới Nhất ({detailedLeads.length} hồ sơ)
              </h2>
              <p className="text-xs text-slate-500">
                Nhấn vào nút &ldquo;Chi tiết&rdquo; để xem hồ sơ và trực tiếp chỉnh sửa thông tin, báo giá hoặc lịch hẹn theo dõi
              </p>
            </div>
          </div>
          <Link
            href="/leads"
            className="px-3 py-1 rounded-lg bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1"
          >
            <span>Xem toàn bộ Lead</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/90 text-slate-600 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider">
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
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : isWon
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : isLost
                      ? 'bg-slate-100 text-slate-600 border border-slate-200'
                      : isQuoteSent
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : isQuoting
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-violet-50 text-violet-700 border border-violet-200';

                return (
                  <tr
                    key={row.leadCode}
                    className={
                      isSpam
                        ? 'bg-rose-50/30 hover:bg-rose-50/60 transition-colors'
                        : 'hover:bg-slate-50/80 transition-colors'
                    }
                  >
                    <td className="py-2.5 px-3.5 tabular-nums font-bold text-[#1E3A8A] whitespace-nowrap">
                      {row.leadCode}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-900">
                      {row.companyOrCustomer.replace(/\s*\(Dữ liệu tổng hợp\)/gi, '')}
                    </td>
                    <td className="py-2.5 px-3 tabular-nums font-medium text-slate-700 whitespace-nowrap">
                      {row.phone}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                        {row.contactChannel}
                      </span>
                      <span className="ml-1 px-2 py-0.5 rounded bg-blue-50/80 text-[#1E3A8A] text-xs font-medium">
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
                              className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200/80 text-slate-700 text-[11px] font-medium whitespace-nowrap"
                            >
                              {p}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap">
                      {row.assignedSalesName}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${statusPill}`}
                      >
                        {row.pipelineStatusLabel}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                      <Link
                        href={`/leads?search=${encodeURIComponent(row.leadCode)}`}
                        className="h-7 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A8A] text-xs font-semibold inline-flex items-center shadow-2xs transition"
                      >
                        Chi tiết
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
