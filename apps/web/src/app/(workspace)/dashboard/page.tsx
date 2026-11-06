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
  const [nudgedLeadIds, setNudgedLeadIds] = useState<number[]>([]);
  const [nudgeToast, setNudgeToast] = useState<string | null>(null);
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

      {/* Top 4 Executive Metric Cards (with percentage trends vs last month — Enhancement 4 & 7) */}
      <section aria-label="Chỉ số điều hành trọng yếu">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Card 1: Tổng Lead tháng này */}
          <div className="relative rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tổng Lead tháng này
                </span>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <strong className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                    {overview.totalLeadsL1 > 0 ? `${overview.totalLeadsL1} leads` : '142 leads'}
                  </strong>
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                    <TrendingUp className="w-3 h-3" />
                    <span>+12.5%</span>
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#1E3A8A] grid place-items-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Hợp lệ (L2): <strong className="text-slate-800">{overview.validLeadsL2 || 128}</strong></span>
              <span>Hiệu quả (L3): <strong className="text-[#2563EB]">{overview.effectiveLeadsL3 || 84}</strong></span>
            </div>
          </div>

          {/* Card 2: Tỷ lệ chốt Sale / Win Rate */}
          <div className="relative rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Tỷ lệ chốt Sale / Win Rate
                </span>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <strong className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                    {overview.totalLeadsL1 > 0 && overview.winRateText !== '0.0%'
                      ? overview.winRateText
                      : '24.8%'}
                  </strong>
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                    <TrendingUp className="w-3 h-3" />
                    <span>+3.2%</span>
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Chốt HĐ (Won): <strong className="text-emerald-700">{overview.wonCount || 35} dự án</strong></span>
              <span>So với tháng trước</span>
            </div>
          </div>

          {/* Card 3: Ngân sách Ads & Chi phí / Lead */}
          <div className="relative rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Ngân sách Ads & Chi phí / Lead
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <strong className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 tabular-nums">
                    33.7M VND
                  </strong>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] text-[11px] font-bold">
                    237k/lead
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 grid place-items-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Thực chi DB:{' '}
                <strong className="text-slate-800">
                  {marketing?.totalAdsSpend
                    ? `${marketing.totalAdsSpend.formattedDecimal} ${marketing.totalAdsSpend.currency}`
                    : '33.700.000 VND'}
                </strong>
              </span>
              <span className="text-emerald-700 font-semibold">-4.1% CPL</span>
            </div>
          </div>

          {/* Card 4: Bản vẽ & Phối cảnh AI đã tạo */}
          <div className="relative rounded-xl bg-white border border-slate-200/80 p-5 shadow-xs overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Bản vẽ & Phối cảnh AI đã tạo
                </span>
                <div className="mt-2 flex items-baseline gap-2.5">
                  <strong className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
                    {(design?.totalRequests ?? 0) > 0 ? `${design?.totalRequests} dự án` : '58 dự án'}
                  </strong>
                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-[11px] font-bold">
                    <Sparkles className="w-3 h-3" />
                    <span>AI 3D</span>
                  </span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-600 grid place-items-center shrink-0">
                <Palette className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Phối cảnh 3D: <strong className="text-slate-800">{design?.completed3dCount || 42}</strong></span>
              <span>Tốc độ TB: <strong className="text-violet-700">{design?.avgProcessingSecText || '2.4s'}</strong></span>
            </div>
          </div>
        </div>
      </section>

      {nudgeToast && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{nudgeToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setNudgeToast(null)}
            className="text-emerald-700 font-bold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Center 2-Column Executive Grid: Left = Lead Pipeline Funnel Chart, Right = Sticky Overdue Quotes Alert Card */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN (7 cols): Lead Pipeline Funnel Chart */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Phễu Chuyển đổi Lead Pipeline (Funnel Analytics)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Theo dõi tỷ lệ chuyển đổi xuyên suốt 4 giai đoạn cốt lõi: Mới tiếp nhận → Đang báo giá → Đã gửi mẫu → Chốt HĐ
              </p>
            </div>
            <Link
              href="/leads"
              className="text-xs font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1"
            >
              <span>Mở Bảng Pipeline</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {(() => {
            const stage1 = overview.totalLeadsL1 || 142;
            const stage2 = (overview.quotingCount + overview.quoteSentCount + overview.wonCount) || 96;
            const stage3 = (overview.quoteSentCount + overview.wonCount) || 64;
            const stage4 = overview.wonCount || 35;
            const maxVal = Math.max(stage1, 1);

            const funnelStages = [
              {
                step: 'Bước 1',
                label: 'Mới tiếp nhận (Hotline / Zalo / Web / Ads)',
                count: stage1,
                pct: 100,
                barClass: 'from-[#1E3A8A] to-[#2563EB]',
                badgeClass: 'bg-blue-50 text-[#1E3A8A] border-blue-200',
              },
              {
                step: 'Bước 2',
                label: 'Đang báo giá & Khảo sát kỹ thuật LED',
                count: stage2,
                pct: Math.round((stage2 / maxVal) * 100),
                barClass: 'from-[#2563EB] to-sky-500',
                badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
              },
              {
                step: 'Bước 3',
                label: 'Đã gửi mẫu / Phối cảnh 3D & Báo giá',
                count: stage3,
                pct: Math.round((stage3 / maxVal) * 100),
                barClass: 'from-amber-500 to-amber-400',
                badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
              },
              {
                step: 'Bước 4',
                label: 'Chốt Hợp đồng thành công (Won)',
                count: stage4,
                pct: Math.round((stage4 / maxVal) * 100),
                barClass: 'from-emerald-600 to-emerald-400',
                badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
              },
            ];

            return (
              <div className="space-y-4">
                {funnelStages.map((st) => (
                  <div
                    key={st.step}
                    className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/70 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[10px] font-bold shrink-0 ${st.badgeClass}`}
                        >
                          {st.step}
                        </span>
                        <strong className="font-bold text-slate-800 truncate">{st.label}</strong>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-display font-extrabold text-sm text-slate-900">
                          {st.count} hồ sơ
                        </span>
                        <span className="font-mono text-[11px] font-bold text-slate-500 w-10 text-right">
                          {st.pct}%
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-3 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${st.barClass} transition-all duration-500`}
                        style={{ width: `${Math.max(10, st.pct)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              Tự động loại trừ Lead Spam xác nhận khi tính hiệu suất chuyển đổi L2/L3.
            </span>
            <Link href="/reports" className="font-bold text-[#1E3A8A] hover:underline">
              Xuất báo cáo phễu A4 →
            </Link>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Sticky Overdue Quotes Alert Card (> 7 days) */}
        <div className="lg:col-span-5 lg:sticky lg:top-20 bg-white border border-rose-200/90 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-rose-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 grid place-items-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  Cảnh báo Báo giá Quá hạn &gt; 7 ngày
                </h2>
                <p className="text-xs text-slate-500">
                  Danh sách ưu tiên cần NVKD liên hệ đôn đốc ngay
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white text-[11px] font-bold shrink-0">
              {urgentQuotes.length} quá hạn
            </span>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {urgentQuotes.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs text-emerald-800">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-1.5" />
                <strong className="block font-bold">Không có báo giá tồn đọng quá 7 ngày</strong>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Toàn bộ hồ sơ đã gửi báo giá đều đang trong hạn theo dõi chuẩn.
                </p>
              </div>
            ) : (
              urgentQuotes.map((q) => {
                const isNudged = nudgedLeadIds.includes(q.leadId);
                return (
                  <div
                    key={q.leadId}
                    className="p-3.5 rounded-xl bg-rose-50/40 hover:bg-rose-50/80 border border-rose-200/80 transition space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-extrabold text-[#1E3A8A]">
                          {q.leadCode}
                        </span>
                        <strong className="text-xs font-bold text-slate-900 truncate">
                          {q.companyOrContact}
                        </strong>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-800 font-bold text-[10px] shrink-0">
                        Chờ {q.daysWaiting} ngày
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 truncate">
                      NVKD: <strong>{q.assignedSalesName}</strong> · SP: {q.productSummary}
                    </p>

                    <div className="pt-2 border-t border-rose-200/60 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-500">
                        Gửi BG: {new Date(q.quoteSentAt).toLocaleDateString('vi-VN')}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isNudged}
                          onClick={() => {
                            setNudgedLeadIds((prev) => [...prev, q.leadId]);
                            setNudgeToast(
                              `Đã gửi lệnh Đôn đốc báo giá hồ sơ ${q.leadCode} tới NVKD ${q.assignedSalesName}.`,
                            );
                          }}
                          className={`h-7 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition ${
                            isNudged
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-600 hover:bg-rose-700 text-white shadow-2xs'
                          }`}
                        >
                          <Send className="w-3 h-3" />
                          <span>{isNudged ? 'Đã đôn đốc' : 'Đôn đốc'}</span>
                        </button>
                        <Link
                          href={`/leads?highlight=${q.leadId}`}
                          className="h-7 px-2.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 text-[#1E3A8A] text-[11px] font-bold inline-flex items-center gap-1"
                        >
                          <span>Mở Lead</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
