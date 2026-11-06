'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ReportPreset, ReportsDashboardDto } from '@toantrung/contracts';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  Layers,
  Palette,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { useSession } from '@/core/session/SessionContext';

const PERIODS: Array<{ label: string; value: ReportPreset }> = [
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
  { label: 'Tất cả', value: 'all' },
];

export default function DashboardPage() {
  const { user, branding } = useSession();
  const [preset, setPreset] = useState<ReportPreset>('all');
  const [report, setReport] = useState<ReportsDashboardDto | null>(null);
  const banner = branding.dashboardBanner;

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/reports?preset=${preset}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (active && (json.ok || json.data) && !json.error) {
          setReport(json.data);
        }
      })
      .catch(() => {
        // fallback gracefully
      });
    return () => {
      active = false;
    };
  }, [preset]);

  const overview = report?.overview ?? {
    totalLeadsL1: 0,
    validLeadsL2: 0,
    effectiveLeadsL3: 0,
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
  const unansweredQuotes = report?.unansweredQuotes || [];
  const urgentQuotes = unansweredQuotes.filter((q) => q.isOverdue7Days);

  const hasBannerContent =
    Boolean(banner.headline.trim()) ||
    Boolean(banner.description.trim()) ||
    (banner.showButton && Boolean(banner.buttonLabel.trim())) ||
    (banner.showImage && Boolean(banner.imageUrl));

  return (
    <div className="space-y-6">
      {/* Live Canonical Shared Database Notice */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-brand-soft border border-brand-border text-xs text-slate-700">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15 shrink-0" />
          <strong className="font-bold text-brand uppercase tracking-wide">
            Hệ thống Toàn Trung V2 · Dữ liệu đồng bộ trực tiếp từ Shared DB
          </strong>
          <span className="text-slate-600 hidden sm:inline">
            {report?.scopeDescription ??
              'Đồng bộ 5 phân hệ (M01 Lead, M02 Tracking, M03 Ads/SEO, M04 Báo cáo, M05 AI Thiết kế).'}
          </span>
        </div>
        {report?.lastSyncedAt && (
          <span className="text-[11px] text-slate-500">
            Lần đồng bộ gần nhất: <strong>{new Date(report.lastSyncedAt).toLocaleString('vi-VN')}</strong>
          </span>
        )}
      </div>

      {/* Page Heading & Period Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
            Tổng quan điều hành tác nghiệp
          </h1>
          <p className="text-[13px] text-ink-muted mt-1 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-brand" />
            <span>
              Điều phối công việc theo vai trò <strong>{user?.roleName}</strong>.
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200/90 shadow-sm">
            {PERIODS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setPreset(item.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  preset === item.value
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-slate-600 hover:text-ink'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Link
            href="/leads"
            className="h-9 px-4 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <span>Quản lý Lead</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Saved Dashboard Banner */}
      {hasBannerContent && (
        <section
          aria-label="Banner thông điệp hệ thống"
          className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#143B85] via-[#1E53A3] to-[#2B6CB8] text-white shadow-card border border-blue-900/20"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
            <div
              className={`${
                banner.showImage && banner.imageUrl ? 'lg:col-span-7' : 'lg:col-span-12'
              } p-6 sm:p-8 flex flex-col justify-center relative z-10`}
            >
              <p className="text-[10px] font-extrabold tracking-[0.14em] uppercase text-sky-200 flex items-center gap-2 mb-2.5">
                <span className="w-2 h-2 rounded-sm bg-amber-400" />
                <span>{branding.organizationName} · HỆ THỐNG QUẢN TRỊ NỘI BỘ</span>
              </p>

              {banner.headline.trim() && (
                <h2 className="font-display text-2xl sm:text-3xl font-bold leading-tight break-words">
                  {banner.headline}
                </h2>
              )}

              {banner.description.trim() && (
                <p className="text-xs sm:text-[13px] text-sky-100/90 mt-2.5 max-w-2xl leading-relaxed break-words">
                  {banner.description}
                </p>
              )}

              {banner.showButton && banner.buttonLabel.trim() && (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Link
                    href={banner.buttonHref || '/leads'}
                    className="px-4 py-2.5 rounded-xl bg-white text-brand font-bold text-xs inline-flex items-center gap-2 shadow-sm hover:bg-sky-50 transition-colors"
                  >
                    <span>{banner.buttonLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {banner.showImage && banner.imageUrl && (
              <div className="hidden lg:block lg:col-span-5 relative min-h-[210px]">
                <img
                  src={banner.imageUrl}
                  alt={banner.imageAlt}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      '/brand/showroom-toan-trung.webp';
                  }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#1E53A3] via-[#1E53A3]/45 to-transparent" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4 Semantic Colored KPI Cards */}
      <section aria-label="Chỉ số tổng quan hệ thống">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="relative rounded-2xl bg-gradient-to-br from-white via-white to-[#EFF5FF] border border-blue-200/70 p-5 shadow-card overflow-hidden">
            <div className="absolute top-0 left-5 right-16 h-[3px] rounded-b bg-gradient-to-r from-[#1553A2] to-sky-400" />
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] font-bold text-slate-700">Tổng Lead (L1 / L2 / L3)</span>
              <div className="w-10 h-10 rounded-xl bg-[#E6F0FF] text-[#1553A2] grid place-items-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <strong className="font-display text-3xl font-bold text-ink tabular-nums">
                {overview.totalLeadsL1}
              </strong>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/90 border border-blue-200 text-[#1553A2]">
                L2: {overview.validLeadsL2} · L3: {overview.effectiveLeadsL3}
              </span>
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              Dữ liệu trực tiếp theo phạm vi {user?.roleCode}
            </p>
          </div>

          <div className="relative rounded-2xl bg-gradient-to-br from-white via-white to-[#F7F4FF] border border-violet-200/70 p-5 shadow-card overflow-hidden">
            <div className="absolute top-0 left-5 right-16 h-[3px] rounded-b bg-gradient-to-r from-[#7846FF] to-purple-300" />
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] font-bold text-slate-700">Lead mới tiếp nhận</span>
              <div className="w-10 h-10 rounded-xl bg-[#EFEAFF] text-[#7846FF] grid place-items-center shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <strong className="font-display text-3xl font-bold text-ink tabular-nums">
                {overview.newLeadCount}
              </strong>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-white/90 border border-violet-200 text-[#7846FF]">
                Đang BG: {overview.quotingCount}
              </span>
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              Trạng thái Vừa nhận thông tin & Đang báo giá
            </p>
          </div>

          <div className="relative rounded-2xl bg-gradient-to-br from-white via-white to-[#FFFBEB] border border-amber-200/80 p-5 shadow-card overflow-hidden">
            <div className="absolute top-0 left-5 right-16 h-[3px] rounded-b bg-gradient-to-r from-[#F59E0B] to-amber-300" />
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] font-bold text-slate-700">Đã gửi báo giá</span>
              <div className="w-10 h-10 rounded-xl bg-[#FEF3C7] text-[#D97706] grid place-items-center shrink-0">
                <Send className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <strong className="font-display text-3xl font-bold text-ink tabular-nums">
                {overview.quoteSentCount}
              </strong>
              <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
                overview.overdue7DaysQuoteCount > 0
                  ? 'bg-rose-100 border border-rose-300 text-rose-800'
                  : 'bg-[#FFFBEB] border border-amber-300/80 text-amber-800'
              }`}>
                {overview.overdue7DaysQuoteCount} quá hạn &gt; 7 ngày
              </span>
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              Theo dõi nhắc phản hồi báo giá (UC02)
            </p>
          </div>

          <div className="relative rounded-2xl bg-gradient-to-br from-white via-white to-[#F0FDF7] border border-emerald-200/80 p-5 shadow-card overflow-hidden">
            <div className="absolute top-0 left-5 right-16 h-[3px] rounded-b bg-gradient-to-r from-[#0BAF7C] to-emerald-300" />
            <div className="flex items-start justify-between gap-3">
              <span className="text-[13px] font-bold text-slate-700">Chốt thành công</span>
              <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#0BAF7C] grid place-items-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline justify-between gap-2">
              <strong className="font-display text-3xl font-bold text-ink tabular-nums">
                {overview.wonCount}
              </strong>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#F0FDF7] border border-emerald-300/80 text-[#0BAF7C]">
                Win Rate: {overview.winRateText}
              </span>
            </div>
            <p className="mt-2.5 text-xs text-slate-500">
              Chỉ đếm số lượng hồ sơ, không tính doanh thu
            </p>
          </div>
        </div>
      </section>

      {/* Urgent Overdue Quotes Action Section (UC02 / M04) */}
      {urgentQuotes.length > 0 && (
        <section className="bg-rose-50/70 border border-rose-200 rounded-2xl p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-rose-200">
            <div className="flex items-center gap-2 text-rose-800">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <h2 className="font-display text-sm font-bold">
                Cảnh báo đôn đốc: Có {urgentQuotes.length} hồ sơ báo giá đã gửi quá 7 ngày chưa nhận phản hồi
              </h2>
            </div>
            <Link
              href="/reports"
              className="text-xs font-bold text-rose-700 hover:text-rose-900 inline-flex items-center gap-1"
            >
              <span>Xem toàn bộ báo cáo đôn đốc</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
            {urgentQuotes.slice(0, 3).map((q) => (
              <div
                key={q.leadId}
                className="bg-white rounded-xl p-3.5 border border-rose-200/80 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-brand">{q.leadCode}</span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px]">
                      {q.daysWaiting} ngày chờ
                    </span>
                  </div>
                  <p className="font-semibold text-xs text-ink mt-1 truncate">{q.companyOrContact}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                    Sales: <strong>{q.assignedSalesName}</strong> · SP: {q.productSummary}
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">
                    Gửi ngày {new Date(q.quoteSentAt).toLocaleDateString('vi-VN')}
                  </span>
                  <Link
                    href={`/leads?highlight=${q.leadId}`}
                    className="text-[11px] font-bold text-brand hover:underline inline-flex items-center gap-1"
                  >
                    <span>Xử lý Lead</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5-Module Operational Control Panel (Replacing developer Git branches with operational metrics) */}
      <section className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="w-4 h-4 text-brand" />
            <h2 className="font-display text-sm font-bold text-ink">
              Bảng điều hành tác nghiệp 5 phân hệ (Operational Workflow Status)
            </h2>
          </div>
          <Link href="/reports" className="text-xs font-bold text-brand hover:underline inline-flex items-center gap-1">
            <span>Báo cáo chi tiết & Xuất Excel</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80">
                <th className="py-3 px-5 font-bold">Mã</th>
                <th className="py-3 px-5 font-bold">Phân hệ nghiệp vụ</th>
                <th className="py-3 px-5 font-bold">Chỉ số tác nghiệp trọng tâm</th>
                <th className="py-3 px-5 font-bold">Trạng thái vận hành</th>
                <th className="py-3 px-5 font-bold text-right">Điều phối tác vụ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {/* M01 */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-5 font-mono font-bold text-brand">M01</td>
                <td className="py-3.5 px-5 font-semibold text-ink">
                  <div>Quản lý Lead & Pipeline</div>
                  <span className="text-[11px] font-normal text-slate-500">Tiếp nhận, thẩm định & đôn đốc báo giá</span>
                </td>
                <td className="py-3.5 px-5">
                  <div className="text-ink font-semibold">
                    {overview.newLeadCount + overview.quotingCount} hồ sơ đang xử lý
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {overview.unansweredQuoteCount} báo giá gửi đi ({overview.overdue7DaysQuoteCount} quá hạn &gt; 7 ngày)
                  </div>
                </td>
                <td className="py-3.5 px-5">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    overview.overdue7DaysQuoteCount > 0
                      ? 'bg-amber-50 border border-amber-300 text-amber-800'
                      : 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${overview.overdue7DaysQuoteCount > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                    {overview.overdue7DaysQuoteCount > 0 ? 'Cần đôn đốc báo giá' : 'Tiến độ bình thường'}
                  </span>
                </td>
                <td className="py-3.5 px-5 text-right">
                  <Link
                    href="/leads"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-brand font-bold inline-flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <span>Mở Lead</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>

              {/* M02 */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-5 font-mono font-bold text-brand">M02</td>
                <td className="py-3.5 px-5 font-semibold text-ink">
                  <div>Tracking & Đồng bộ Đa kênh</div>
                  <span className="text-[11px] font-normal text-slate-500">Thu nhận Webhook & đối soát GCLID/UTM</span>
                </td>
                <td className="py-3.5 px-5">
                  <div className="text-ink font-semibold">
                    Đồng bộ tự động 02:00 & 11:00
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Ghi nhận vào Kho D3 PlatformDailyMetric
                  </div>
                </td>
                <td className="py-3.5 px-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Kênh Webhook hoạt động
                  </span>
                </td>
                <td className="py-3.5 px-5 text-right">
                  <Link
                    href="/tracking"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-brand font-bold inline-flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <span>Kiểm tra Sync</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>

              {/* M03 */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-5 font-mono font-bold text-brand">M03</td>
                <td className="py-3.5 px-5 font-semibold text-ink">
                  <div>Quảng cáo, Từ khóa & SEO AI</div>
                  <span className="text-[11px] font-normal text-slate-500">Hiệu suất Google Ads & bài viết SEO</span>
                </td>
                <td className="py-3.5 px-5">
                  <div className="text-ink font-semibold">
                    Chi phí Ads: {marketing?.totalAdsSpend ? `${marketing.totalAdsSpend.formattedDecimal} ${marketing.totalAdsSpend.currency}` : '0 VND'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {marketing?.effectiveLeadsFromAds || 0} Lead hiệu quả · {marketing?.publishedSeoArticles || 0} bài SEO đã đăng
                  </div>
                </td>
                <td className="py-3.5 px-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Quảng cáo đang chạy
                  </span>
                </td>
                <td className="py-3.5 px-5 text-right">
                  <Link
                    href="/ads"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-brand font-bold inline-flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <span>Quản lý Ads</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>

              {/* M04 */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-5 font-mono font-bold text-brand">M04</td>
                <td className="py-3.5 px-5 font-semibold text-ink">
                  <div>Dashboard & Báo cáo Phân quyền</div>
                  <span className="text-[11px] font-normal text-slate-500">Thống kê D1–D6 & bảo vệ PII theo UC01/Q03</span>
                </td>
                <td className="py-3.5 px-5">
                  <div className="text-ink font-semibold">
                    Win Rate bán hàng: {overview.winRateText}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {overview.wonCount} hợp đồng thành công / {overview.validLeadsL2} Lead hợp lệ
                  </div>
                </td>
                <td className="py-3.5 px-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Phân quyền sẵn sàng
                  </span>
                </td>
                <td className="py-3.5 px-5 text-right">
                  <Link
                    href="/reports"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-brand font-bold inline-flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <span>Xem Báo cáo</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>

              {/* M05 */}
              <tr className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-5 font-mono font-bold text-brand">M05</td>
                <td className="py-3.5 px-5 font-semibold text-ink">
                  <div>AI Hỗ trợ Thiết kế (Giai đoạn 2)</div>
                  <span className="text-[11px] font-normal text-slate-500">Phối cảnh 3D LED & Banner Marketing</span>
                </td>
                <td className="py-3.5 px-5">
                  <div className="text-ink font-semibold">
                    {design?.totalRequests || 0} yêu cầu (3D: {design?.completed3dCount || 0} · Banner: {design?.completedBannerCount || 0})
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Thời gian AI xử lý TB: {design?.avgProcessingSecText || '0.0s'}
                  </div>
                </td>
                <td className="py-3.5 px-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    AI Engine sẵn sàng
                  </span>
                </td>
                <td className="py-3.5 px-5 text-right">
                  <Link
                    href="/design"
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-brand font-bold inline-flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <span>Thiết kế AI</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
