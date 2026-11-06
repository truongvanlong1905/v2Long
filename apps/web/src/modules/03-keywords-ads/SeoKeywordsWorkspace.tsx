'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileEdit,
  Globe,
  History,
  Layers,
  Lock,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  SEO_ARTICLE_STATUS_LABELS,
  TARGET_WEBSITES,
  type AdsCampaignItemDto,
  type AdsPerformancePointDto,
  type AdsWorkspacePayloadDto,
  type KeywordDemandBarDto,
  type SeoArticleItemDto,
  type SeoKeywordItemDto,
  type TargetWebsite,
} from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

export function SeoKeywordsWorkspace() {
  const { user } = useSession();
  const [isAdsReadOnly, setIsAdsReadOnly] = useState(false);
  const [kpis, setKpis] = useState<AdsWorkspacePayloadDto['kpis'] | null>(null);
  const [campaigns, setCampaigns] = useState<AdsCampaignItemDto[]>([]);
  const [performanceChart, setPerformanceChart] = useState<AdsPerformancePointDto[]>([]);
  const [demandBars, setDemandBars] = useState<KeywordDemandBarDto[]>([]);
  const [keywords, setKeywords] = useState<SeoKeywordItemDto[]>([]);
  const [articles, setArticles] = useState<SeoArticleItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<'campaigns' | 'seo'>('campaigns');

  // Add Keyword state
  const [newKeywordText, setNewKeywordText] = useState('');
  const [newKeywordWebsite, setNewKeywordWebsite] = useState<TargetWebsite>('toantrung.com.vn');

  // AI Draft Composer state
  const [selectedKeywordId, setSelectedKeywordId] = useState<number>(0);
  const [draftWebsite, setDraftWebsite] = useState<TargetWebsite>('toantrung.com.vn');
  const [topicFocus, setTopicFocus] = useState('');
  const [simulateAiFailure, setSimulateAiFailure] = useState(false);

  // Selected Article Editor state
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMeta, setEditMeta] = useState('');
  const [editContentHtml, setEditContentHtml] = useState('');
  const [editNote, setEditNote] = useState('');
  const [scheduleIso, setScheduleIso] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 16);
  });
  const [simulatePublishError, setSimulatePublishError] = useState(false);

  const fetchSeoData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<AdsWorkspacePayloadDto>('/api/v1/ads');
      setIsAdsReadOnly(res.isAdsReadOnly);
      setKpis(res.kpis);
      setCampaigns(res.campaigns || []);
      setPerformanceChart(res.performanceChart || []);
      setDemandBars(res.demandBars || []);
      setKeywords(res.keywords || []);
      setArticles(res.articles || []);
      if (res.keywords && res.keywords.length > 0 && !selectedKeywordId) {
        setSelectedKeywordId(res.keywords[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dữ liệu Quảng cáo & Từ khóa.');
    } finally {
      setLoading(false);
    }
  }, [selectedKeywordId]);

  useEffect(() => {
    void fetchSeoData();
  }, [fetchSeoData]);

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) || null,
    [articles, selectedArticleId],
  );

  useEffect(() => {
    if (selectedArticle) {
      setEditTitle(selectedArticle.title);
      setEditMeta(selectedArticle.metaDescription || '');
      setEditContentHtml(selectedArticle.contentHtml);
      setEditNote('');
    }
  }, [selectedArticle]);

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/ads', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          action: 'create_keyword',
          keywordText: newKeywordText,
          targetWebsite: newKeywordWebsite,
        },
      });
      setNewKeywordText('');
      setFeedbackMsg('Đã thêm từ khóa mục tiêu vào danh mục phân tích.');
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi thêm từ khóa.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateAiDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedKeywordId) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const created = await apiRequest<{ id: number; title: string }>('/api/v1/ads', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          action: 'generate_ai_draft',
          keywordId: selectedKeywordId,
          targetWebsite: draftWebsite,
          topicFocus,
          simulateAiFailure,
        },
      });
      setTopicFocus('');
      setFeedbackMsg(
        `AI đã khởi tạo bản nháp "${created.title}" ở trạng thái Nháp và ghi nhận token vào kho D5 (ai_usage_logs).`,
      );
      await fetchSeoData();
      setSelectedArticleId(created.id);
      setActiveBottomTab('seo');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tạo bản nháp AI.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRevision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedArticle) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ revisionNumber: number }>(
        `/api/v1/ads/articles/${selectedArticle.id}`,
        {
          method: 'PATCH',
          csrfToken: user.csrfToken,
          body: {
            action: 'update_draft',
            expectedVersion: selectedArticle.version,
            title: editTitle,
            metaDescription: editMeta,
            contentHtml: editContentHtml,
            editorNote: editNote || undefined,
          },
        },
      );
      setFeedbackMsg(`Đã lưu phiên bản biên tập v${res.revisionNumber} thành công.`);
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lưu phiên bản chỉnh sửa.');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveAndSchedule = async () => {
    if (!user || !selectedArticle) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const isoDate = new Date(scheduleIso).toISOString();
      await apiRequest(`/api/v1/ads/articles/${selectedArticle.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'approve_schedule',
          expectedVersion: selectedArticle.version,
          revisionId: selectedArticle.currentRevisionId || undefined,
          targetWebsite: (selectedArticle.targetWebsite as TargetWebsite) || 'toantrung.com.vn',
          scheduledPublishAt: isoDate,
        },
      });
      setFeedbackMsg(
        `Đã phê duyệt và khóa phiên bản bài viết #${selectedArticle.id}. Lịch hẹn đăng: ${new Date(
          isoDate,
        ).toLocaleString('vi-VN')}.`,
      );
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi phê duyệt bài viết.');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdrawApproval = async () => {
    if (!user || !selectedArticle) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/ads/articles/${selectedArticle.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'withdraw_approval',
          expectedVersion: selectedArticle.version,
          reason: 'Biên tập viên yêu cầu bổ sung thông tin trước khi lên bài chính thức',
        },
      });
      setFeedbackMsg(
        `Đã rút quyết định phê duyệt. Bài viết #${selectedArticle.id} đã chuyển về trạng thái Nháp.`,
      );
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi rút duyệt.');
    } finally {
      setBusy(false);
    }
  };

  const handlePublishNow = async () => {
    if (!user || !selectedArticle) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ publishedUrl: string }>(
        `/api/v1/ads/articles/${selectedArticle.id}`,
        {
          method: 'PATCH',
          csrfToken: user.csrfToken,
          body: {
            action: 'publish_now',
            expectedVersion: selectedArticle.version,
            simulateWebhookFailure: simulatePublishError,
          },
        },
      );
      setFeedbackMsg(`Đã xuất bản bài viết thành công: ${res.publishedUrl}`);
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đẩy bài lên website.');
      await fetchSeoData();
    } finally {
      setBusy(false);
    }
  };

  const handleExportData = () => {
    window.open('/api/v1/ads/export', '_blank');
  };

  // Performance chart calculations
  const maxClicksInChart = Math.max(
    ...performanceChart.map((p) => Math.max(p.clicks, p.conversions * 20)),
    100,
  );

  return (
    <div className="space-y-6 text-sm">
      {/* 1. Header */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-brand uppercase tracking-wider mb-1">
            <span>QUẢNG CÁO & SEO</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-600">Hiệu suất Chiến dịch & Từ khóa SEO</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">
            Quảng cáo & từ khóa
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Theo dõi hiệu suất chiến dịch Google Ads, phân tích nhu cầu tìm kiếm và quản lý nội dung SEO
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-brand text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-brand" />
            <span>Dữ liệu đồng bộ định kỳ</span>
          </span>

          <button
            type="button"
            onClick={handleExportData}
            className="h-9 px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
            title="Xuất danh sách Từ khóa SEO và Chiến dịch Ads ra file Excel chuẩn OpenXML"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span>Xuất Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchSeoData()}
            className="h-9 px-3.5 rounded-xl bg-brand hover:bg-brand-deep text-white text-sm font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Role Notice when logged in as ADS */}
      {isAdsReadOnly && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-3">
          <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Phân quyền Chuyên viên Quảng cáo (Ads):</strong> Tài khoản{' '}
            <strong>{user?.fullName}</strong> (Vai trò: {user?.roleName}) được tra cứu số liệu chiến dịch, bảng từ khóa và xu hướng tìm kiếm để phối hợp cùng Marketing. Các chức năng &ldquo;Tạo bài viết AI&rdquo;, &ldquo;Sửa bài&rdquo;, &ldquo;Duyệt bài&rdquo;, &ldquo;Lên lịch&rdquo; và &ldquo;Xem hiệu quả bài viết&rdquo; dành cho Nhân viên / Trưởng phòng Marketing.
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-bold hover:underline">
            Đóng
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button type="button" onClick={() => setFeedbackMsg(null)} className="font-bold hover:underline">
            Đóng
          </button>
        </div>
      )}

      {/* 2. 4 Semantic KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Lượt hiển thị */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              LƯỢT HIỂN THỊ
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-brand grid place-items-center">
              <Eye className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              {kpis?.totalImpressions ? kpis.totalImpressions.toLocaleString('vi-VN') : '0'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tổng lượt hiển thị chiến dịch trong kỳ
          </p>
        </div>

        {/* KPI 2: Lượt nhấp */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card hover:border-blue-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              LƯỢT NHẤP
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 grid place-items-center">
              <MousePointerClick className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              {kpis?.totalClicks ? kpis.totalClicks.toLocaleString('vi-VN') : '0'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span>Tỷ lệ CTR trung bình:</span>
            <strong className="text-brand font-bold">{kpis?.avgCtrPct || '0%'}</strong>
          </p>
        </div>

        {/* KPI 3: Chi phí quảng cáo */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card hover:border-amber-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              CHI PHÍ QUẢNG CÁO
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 grid place-items-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
              {kpis?.totalSpendVndText || '0 VND'}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tổng ngân sách ghi nhận từ Google & Facebook
          </p>
        </div>

        {/* KPI 4: Hiệu quả chiến dịch */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card hover:border-emerald-300 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">
              HIỆU QUẢ CHIẾN DỊCH
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 grid place-items-center">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl sm:text-3xl font-bold text-emerald-700 tracking-tight">
              {kpis?.avgCtrPct || '0.00%'} CTR
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
            <span>CPL:</span>
            <strong className="text-ink font-semibold">{kpis?.cplVndText || 'Chưa phát sinh'}</strong>
            <span>/ Lead</span>
          </p>
        </div>
      </div>

      {/* 3. Middle 2-Column Row (Campaign Performance Chart vs Keyword Search Demand) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Hiệu suất chiến dịch (Bar chart with Clicks & Conversions) */}
        <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-display text-base font-bold text-ink flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-brand" />
                  <span>Hiệu suất chiến dịch</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dữ liệu đồng bộ định kỳ từ tài khoản quảng cáo
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600" />
                  <span className="text-slate-600 font-medium">Lượt nhấp (Clicks)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-400" />
                  <span className="text-slate-600 font-medium">Chuyển đổi nền tảng</span>
                </span>
              </div>
            </div>

            {/* Visual Bar Chart */}
            <div className="pt-6 pb-2">
              <div className="h-52 flex items-end justify-between gap-3 px-2">
                {performanceChart.length === 0 ? (
                  <div className="w-full h-full grid place-items-center text-sm text-slate-400">
                    Chưa có đủ chu kỳ dữ liệu để vẽ biểu đồ
                  </div>
                ) : (
                  performanceChart.map((p, idx) => {
                    const clickHeight = Math.max(12, Math.round((p.clicks / maxClicksInChart) * 180));
                    const convHeight = Math.max(8, Math.round(((p.conversions * 20) / maxClicksInChart) * 180));

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1 group">
                        <div className="text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity font-mono">
                          {p.clicks} clicks / {p.conversions} conv
                        </div>
                        <div className="w-full flex items-end justify-center gap-1.5 h-44">
                          <div
                            style={{ height: `${clickHeight}px` }}
                            className="w-1/2 max-w-[28px] rounded-t-md bg-blue-600 hover:bg-blue-700 transition-all cursor-pointer relative group/bar"
                          >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-800 text-white text-xs font-mono opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                              {p.clicks}
                            </span>
                          </div>
                          <div
                            style={{ height: `${convHeight}px` }}
                            className="w-1/2 max-w-[28px] rounded-t-md bg-sky-400 hover:bg-sky-500 transition-all cursor-pointer relative group/bar"
                          >
                            <span className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-800 text-white text-xs font-mono opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                              {p.conversions}
                            </span>
                          </div>
                        </div>
                        <span className="text-xs font-medium text-slate-600 mt-2 truncate max-w-full text-center">
                          {p.label}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Chiến dịch chủ lực: Màn hình LED Hội trường & Ngoài trời</span>
            <span className="font-semibold text-brand">Chuyển đổi nền tảng báo: {kpis?.totalConversions || 0} lượt</span>
          </div>
        </div>

        {/* Right Column: Từ khóa & nội dung SEO (Horizontal Search Demand Progress Bars) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-display text-base font-bold text-ink flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>Từ khóa & nội dung SEO</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Khu vực phân tích nhu cầu tìm kiếm khách hàng tiềm năng B2B
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                GSC & Ads
              </span>
            </div>

            <div className="pt-4 space-y-4">
              {demandBars.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">
                  Chưa có dữ liệu từ khóa mục tiêu
                </div>
              ) : (
                demandBars.map((bar) => (
                  <div key={bar.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-ink text-sm">{bar.keywordText}</span>
                        {bar.trendDirection === 'UP' ? (
                          <span className="text-xs text-emerald-600 font-bold inline-flex items-center">
                            <TrendingUp className="w-3.5 h-3.5" />
                          </span>
                        ) : bar.trendDirection === 'DOWN' ? (
                          <span className="text-xs text-rose-500 font-bold inline-flex items-center">
                            <TrendingDown className="w-3.5 h-3.5" />
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-bold">→</span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-slate-600 font-semibold">
                        {bar.searchVolume.toLocaleString('vi-VN')} lượt
                      </span>
                    </div>

                    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        style={{ width: `${bar.percentage}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 via-sky-500 to-emerald-400 transition-all duration-500"
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4 flex items-center justify-between text-xs text-slate-500">
            <span>Dữ liệu tìm kiếm trung bình 30 ngày qua</span>
            <button
              type="button"
              onClick={() => setActiveBottomTab('seo')}
              className="text-brand font-bold hover:underline"
            >
              Xem chi tiết từ khóa →
            </button>
          </div>
        </div>
      </div>

      {/* 4. Bottom Tabbed Navigation: Campaigns List vs Full SEO Editor */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveBottomTab('campaigns')}
            className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all inline-flex items-center gap-2 ${
              activeBottomTab === 'campaigns'
                ? 'border-brand text-brand bg-brand-soft/30 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Danh sách chiến dịch ({campaigns.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveBottomTab('seo')}
            className={`px-4 py-2.5 font-bold text-sm border-b-2 transition-all inline-flex items-center gap-2 ${
              activeBottomTab === 'seo'
                ? 'border-brand text-brand bg-brand-soft/30 rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-ink'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Từ khóa & Soạn thảo SEO bằng AI ({articles.length} bài)</span>
          </button>
        </div>

        {/* TAB 1: Danh sách chiến dịch */}
        {activeBottomTab === 'campaigns' && (
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-card">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base font-bold text-ink">
                  Danh sách chiến dịch quảng cáo trực tuyến
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ghi nhận từ Google Ads & Facebook Ads liên kết nguồn tiếp nhận Lead
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-mono text-xs">
                {campaigns.length} chiến dịch đang kích hoạt
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 font-bold">Mã chiến dịch</th>
                    <th className="py-3 px-4 font-bold">Tên chiến dịch</th>
                    <th className="py-3 px-4 font-bold">Nền tảng</th>
                    <th className="py-3 px-4 font-bold text-center">Trạng thái</th>
                    <th className="py-3 px-4 font-bold text-right">Ngân sách/ngày</th>
                    <th className="py-3 px-4 font-bold text-right">Lượt hiển thị</th>
                    <th className="py-3 px-4 font-bold text-right">Lượt nhấp</th>
                    <th className="py-3 px-4 font-bold text-center">CTR</th>
                    <th className="py-3 px-4 font-bold text-right">Chi phí đã tiêu</th>
                    <th className="py-3 px-4 font-bold text-center">Chuyển đổi</th>
                    <th className="py-3 px-4 font-bold text-right">CPL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaigns.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400">
                        Chưa có chiến dịch quảng cáo nào trong hệ thống.
                      </td>
                    </tr>
                  ) : (
                    campaigns.map((camp) => (
                      <tr key={camp.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-brand">
                          {camp.campaignCode}
                        </td>
                        <td className="py-3 px-4 font-semibold text-ink">
                          {camp.campaignName}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded font-medium text-xs ${
                              camp.platform === 'Google Ads'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {camp.platform}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${
                              camp.isActive
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {camp.isActive ? 'Đang chạy' : 'Tạm dừng'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {camp.dailyBudgetVndText}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {camp.impressions.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-brand">
                          {camp.clicks.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-semibold">
                          {camp.ctrPct}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-ink">
                          {camp.spendVndText}
                        </td>
                        <td className="py-3 px-4 text-center font-mono font-bold text-emerald-700">
                          {camp.conversions}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700">
                          {camp.cplText}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Quản lý từ khóa & Soạn thảo SEO (AI Assistant) */}
        {activeBottomTab === 'seo' && (
          <div className="space-y-6">
            {/* 1. Bảng Từ khóa & Xu hướng tìm kiếm */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-brand" />
                  <h2 className="font-display text-base font-bold text-ink">
                    Bảng Phân tích Từ khóa & Xu hướng Tìm kiếm
                  </h2>
                </div>
                {keywords[0] && (
                  <span className="text-xs text-slate-500">
                    Nguồn: <code className="font-mono">{keywords[0].cacheSourceAccountKey}</code> · Kỳ:{' '}
                    {keywords[0].cacheWindowStartDate} &rarr; {keywords[0].cacheWindowEndDate}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3 font-bold">Từ khóa mục tiêu</th>
                      <th className="py-2.5 px-3 font-bold">Volume tìm kiếm</th>
                      <th className="py-2.5 px-3 font-bold">Click Google Ads</th>
                      <th className="py-2.5 px-3 font-bold">Click Organic (GSC)</th>
                      <th className="py-2.5 px-3 font-bold">Vị trí TB</th>
                      <th className="py-2.5 px-3 font-bold">Xu hướng</th>
                      <th className="py-2.5 px-3 font-bold">Khung giờ đăng gợi ý</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {keywords.map((kw) => (
                      <tr key={kw.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-bold text-ink">{kw.keywordText}</td>
                        <td className="py-2.5 px-3 font-mono">{kw.cachedSearchVolume}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-brand">
                          {kw.cachedAdsClicks}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                          {kw.cachedOrganicClicks}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {kw.cachedAvgPosition ? `#${kw.cachedAvgPosition.toFixed(1)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              kw.trendDirection === 'UP'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {kw.trendDirection === 'UP' ? 'Đang tăng trưởng ↑' : 'Ổn định'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{kw.suggestedPublishSlot}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!isAdsReadOnly && (
                <form
                  onSubmit={(e) => void handleAddKeyword(e)}
                  className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5"
                >
                  <input
                    type="text"
                    required
                    value={newKeywordText}
                    onChange={(e) => setNewKeywordText(e.target.value)}
                    placeholder="Thêm từ khóa mục tiêu mới (VD: màn hình led p3 ngoài trời)..."
                    className="flex-1 h-9 px-3 rounded-xl border border-slate-200 text-sm"
                  />
                  <select
                    value={newKeywordWebsite}
                    onChange={(e) => setNewKeywordWebsite(e.target.value as TargetWebsite)}
                    className="h-9 px-3 rounded-xl border border-slate-200 text-sm"
                  >
                    {TARGET_WEBSITES.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    disabled={busy}
                    className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm từ khóa</span>
                  </button>
                </form>
              )}
            </div>

            {/* Phân hệ Soạn thảo & Duyệt bài */}
            {!isAdsReadOnly && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Left 5 cols: AI Draft Composer + Article List */}
                <div className="lg:col-span-5 space-y-5">
                  <form
                    onSubmit={(e) => void handleGenerateAiDraft(e)}
                    className="bg-white border border-blue-200 rounded-2xl p-5 shadow-card space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-brand" />
                      <h2 className="font-display text-base font-bold text-ink">
                        Soạn Bản nháp Bài viết Chuẩn SEO bằng AI
                      </h2>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Chọn từ khóa mục tiêu *
                      </label>
                      <select
                        value={selectedKeywordId}
                        onChange={(e) => setSelectedKeywordId(Number(e.target.value))}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                      >
                        {keywords.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.keywordText} ({k.cachedOrganicClicks} organic clicks)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-semibold text-slate-700">
                          Website đích xuất bản *
                        </label>
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                          Chế độ Giả lập (Simulated)
                        </span>
                      </div>
                      <select
                        value={draftWebsite}
                        onChange={(e) => setDraftWebsite(e.target.value as TargetWebsite)}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm"
                      >
                        {TARGET_WEBSITES.map((w) => (
                          <option key={w} value={w}>
                            {w} (Giả lập nội bộ)
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Chủ đề & Yêu cầu nội dung (Không nhập SĐT/Email khách hàng) *
                      </label>
                      <textarea
                        required
                        rows={2}
                        value={topicFocus}
                        onChange={(e) => setTopicFocus(e.target.value)}
                        placeholder="VD: Phân tích khoảng cách nhìn tối ưu cho màn hình LED hội trường 300 chỗ ngồi..."
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={simulateAiFailure}
                        onChange={(e) => setSimulateAiFailure(e.target.checked)}
                      />
                      <span>Giả lập sự cố AI quá tải / Timeout để kiểm thử xử lý lỗi</span>
                    </label>

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full h-10 rounded-xl bg-brand hover:bg-brand-deep text-white text-sm font-bold inline-flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{busy ? 'AI đang soạn bản nháp...' : 'Tạo Bản nháp SEO bằng AI'}</span>
                    </button>
                  </form>

                  {/* Danh sách Bài viết & Cảnh báo tối ưu bài cũ (>30 ngày) */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-3">
                    <h2 className="font-display text-base font-bold text-ink">
                      Danh sách Bài viết SEO ({articles.length})
                    </h2>
                    <div className="space-y-2.5">
                      {articles.map((art) => (
                        <div
                          key={art.id}
                          onClick={() => setSelectedArticleId(art.id)}
                          className={`cursor-pointer p-3.5 rounded-xl border transition-all ${
                            selectedArticleId === art.id
                              ? 'bg-brand-soft/60 border-brand'
                              : 'bg-slate-50/70 border-slate-200 hover:border-brand'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-brand">
                              {SEO_ARTICLE_STATUS_LABELS[art.status]}
                            </span>
                            <span className="font-mono text-xs text-slate-500">
                              {art.targetWebsite} · v{art.version}
                            </span>
                          </div>
                          <p className="font-bold text-sm text-ink mt-1.5">{art.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Từ khóa: <strong>{art.keywordText}</strong> · {art.revisions?.length || 1} phiên bản
                          </p>
                          {art.needsOptimization && (
                            <div className="mt-2 px-2.5 py-1 rounded bg-amber-100 text-amber-900 font-bold text-xs inline-flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Cần rà soát tối ưu lại (&gt;30 ngày, vị trí #{art.avgPosition30d})</span>
                            </div>
                          )}
                          {art.publishErrorMessage && (
                            <div className="mt-2 px-2.5 py-1 rounded bg-red-100 text-red-800 font-bold text-xs">
                              Lỗi xuất bản: {art.publishErrorMessage}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right 7 cols: Biên tập, Phê duyệt, Rút duyệt, Xuất bản & Lịch sử Revision */}
                <div className="lg:col-span-7">
                  {selectedArticle ? (
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                          <span className="px-2.5 py-1 rounded-full bg-brand-soft text-brand font-bold text-xs">
                            {SEO_ARTICLE_STATUS_LABELS[selectedArticle.status]}
                          </span>
                          <span className="ml-2 text-xs text-slate-500 font-mono">
                            Website đích: {selectedArticle.targetWebsite} · Phiên bản khóa: rev#
                            {selectedArticle.approvedRevisionId || selectedArticle.currentRevisionId}
                          </span>
                        </div>
                        {selectedArticle.publishedUrl && (
                          <a
                            href={selectedArticle.publishedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand text-sm font-bold inline-flex items-center gap-1 hover:underline"
                          >
                            <Globe className="w-4 h-4" />
                            <span> Mở URL bài đã đăng</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {/* Form Biên tập Nội dung (chỉ cho sửa khi đang ở trạng thái Nháp) */}
                      <form onSubmit={(e) => void handleSaveRevision(e)} className="space-y-3">
                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">
                            Tiêu đề bài viết chuẩn SEO
                          </label>
                          <input
                            type="text"
                            disabled={selectedArticle.status !== 'DRAFT'}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm disabled:bg-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">
                            Thẻ Meta Description
                          </label>
                          <input
                            type="text"
                            disabled={selectedArticle.status !== 'DRAFT'}
                            value={editMeta}
                            onChange={(e) => setEditMeta(e.target.value)}
                            className="w-full h-9 px-3 rounded-xl border border-slate-200 text-sm disabled:bg-slate-100"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-bold text-slate-700 mb-1">
                            Nội dung HTML (Thẻ H2/H3, thân bài & hình ảnh thực tế)
                          </label>
                          <textarea
                            rows={6}
                            disabled={selectedArticle.status !== 'DRAFT'}
                            value={editContentHtml}
                            onChange={(e) => setEditContentHtml(e.target.value)}
                            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs disabled:bg-slate-100"
                          />
                        </div>

                        {selectedArticle.status === 'DRAFT' && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editNote}
                              onChange={(e) => setEditNote(e.target.value)}
                              placeholder="Ghi chú phiên bản chỉnh sửa (VD: Bổ sung ảnh công trình thực tế)..."
                              className="flex-1 h-9 px-3 rounded-xl border border-slate-200 text-sm"
                            />
                            <button
                              type="submit"
                              disabled={busy}
                              className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold inline-flex items-center gap-1.5"
                            >
                              <FileEdit className="w-4 h-4" />
                              <span>Lưu Phiên bản mới</span>
                            </button>
                          </div>
                        )}
                      </form>

                      {/* Checklist SEO Trực tiếp & Xem trước */}
                      {(() => {
                        const kwLower = (selectedArticle.keywordText || '').toLowerCase().trim();
                        const titleOk = kwLower ? editTitle.toLowerCase().includes(kwLower) : false;
                        const metaOk = kwLower ? editMeta.toLowerCase().includes(kwLower) : false;
                        const h2Matches = editContentHtml.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
                        const h2Ok = kwLower
                          ? h2Matches.some((h) => h.toLowerCase().includes(kwLower))
                          : false;
                        const plainText = editContentHtml
                          .replace(/<[^>]+>/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
                        const words = plainText ? plainText.split(' ') : [];
                        const wordCount = words.length;
                        const lengthOk = wordCount >= 120;
                        const kwOccurrences =
                          kwLower && plainText
                            ? Math.max(
                                0,
                                plainText.toLowerCase().split(kwLower).length - 1,
                              )
                            : 0;
                        const kwWords = kwLower ? kwLower.split(/\s+/).length : 1;
                        const densityPct =
                          wordCount > 0
                            ? Number((((kwOccurrences * kwWords) / wordCount) * 100).toFixed(1))
                            : 0;

                        return (
                          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-bold text-ink">
                                Checklist Chuẩn SEO On-page (Từ khóa:{' '}
                                <span className="text-brand">{selectedArticle.keywordText}</span>)
                              </span>
                              <span className="font-mono text-xs text-slate-600">
                                Độ dài: <strong>{wordCount}</strong> từ · Mật độ từ khóa:{' '}
                                <strong>{densityPct}%</strong> ({kwOccurrences} lần)
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2
                                  className={`w-4 h-4 ${
                                    titleOk ? 'text-emerald-600' : 'text-slate-300'
                                  }`}
                                />
                                <span className={titleOk ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                                  Từ khóa xuất hiện trong Tiêu đề (Title)
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2
                                  className={`w-4 h-4 ${
                                    metaOk ? 'text-emerald-600' : 'text-slate-300'
                                  }`}
                                />
                                <span className={metaOk ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                                  Từ khóa xuất hiện trong Meta Description
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2
                                  className={`w-4 h-4 ${
                                    h2Ok ? 'text-emerald-600' : 'text-slate-300'
                                  }`}
                                />
                                <span className={h2Ok ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                                  Từ khóa xuất hiện trong thẻ tiêu đề phụ (&lt;h2&gt;)
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2
                                  className={`w-4 h-4 ${
                                    lengthOk ? 'text-emerald-600' : 'text-slate-300'
                                  }`}
                                />
                                <span className={lengthOk ? 'text-slate-800 font-medium' : 'text-slate-500'}>
                                  Độ dài nội dung tối thiểu (&ge; 120 từ)
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Khối Duyệt bài, Hẹn giờ đăng, Rút duyệt & Đẩy bài lên Website */}
                      <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3">
                        <p className="text-sm font-bold text-ink flex items-center gap-1.5">
                          <CalendarClock className="w-4 h-4 text-brand" />
                          <span>Quy trình Duyệt bài, Lên lịch & Xuất bản lên Website</span>
                        </p>

                        {selectedArticle.status === 'DRAFT' && (
                          <div className="flex flex-wrap items-center gap-2.5">
                            <input
                              type="datetime-local"
                              value={scheduleIso}
                              onChange={(e) => setScheduleIso(e.target.value)}
                              className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-sm"
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleApproveAndSchedule()}
                              className="h-9 px-4 rounded-xl bg-brand hover:bg-brand-deep text-white text-sm font-bold inline-flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Duyệt bài & Hẹn giờ đăng</span>
                            </button>
                          </div>
                        )}

                        {(selectedArticle.status === 'APPROVED_SCHEDULED' ||
                          selectedArticle.status === 'PUBLISH_FAILED') && (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handlePublishNow()}
                                className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold inline-flex items-center gap-1.5"
                              >
                                <Send className="w-4 h-4" />
                                <span>Đẩy bài lên {selectedArticle.targetWebsite} ngay</span>
                              </button>

                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleWithdrawApproval()}
                                className="h-9 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold inline-flex items-center gap-1.5"
                              >
                                <RotateCcw className="w-4 h-4" />
                                <span>Rút duyệt về Nháp</span>
                              </button>
                            </div>

                            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={simulatePublishError}
                                onChange={(e) => setSimulatePublishError(e.target.checked)}
                              />
                              <span>
                                Giả lập lỗi API Website từ chối để kiểm thử luồng giữ trạng thái chờ đăng lại
                              </span>
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Lịch sử các phiên bản chỉnh sửa */}
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-ink flex items-center gap-1.5">
                          <History className="w-4 h-4 text-brand" />
                          <span>Lịch sử Phiên bản bài viết</span>
                        </p>
                        <div className="space-y-2">
                          {selectedArticle.revisions?.map((rev) => (
                            <div
                              key={rev.id}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3 text-sm"
                            >
                              <div>
                                <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-xs font-bold text-brand">
                                  Phiên bản #{rev.revisionNumber}
                                </span>
                                <span className="ml-2 font-semibold text-ink">
                                  {rev.isAiGenerated ? 'Khởi tạo bởi AI' : `Biên tập bởi ${rev.editedByName}`}
                                </span>
                                {selectedArticle.approvedRevisionId === rev.id && (
                                  <span className="ml-2 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-xs">
                                    Phiên bản đã duyệt khóa
                                  </span>
                                )}
                                <p className="text-xs text-slate-600 mt-1">{rev.editorNote}</p>
                              </div>
                              <span className="text-xs text-slate-400 whitespace-nowrap">
                                {new Date(rev.createdAt).toLocaleString('vi-VN')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
                      Chọn một bài viết SEO bên trái để biên tập, xem lịch sử phiên bản hoặc duyệt xuất bản.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
