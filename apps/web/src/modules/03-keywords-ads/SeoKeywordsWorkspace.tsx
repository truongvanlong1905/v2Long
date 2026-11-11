'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  FileEdit,
  FileText,
  FolderUp,
  Globe,
  History,
  LayoutGrid,
  Layers,
  MousePointerClick,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Trash2,
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
import { GoogleOAuthManager } from '@/components/google-oauth/GoogleOAuthManager';

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

  // Navigation Tabs
  const [mainTab, setMainTab] = useState<'overview' | 'keywords' | 'content' | 'schedule'>('overview');
  const [contentSubTab, setContentSubTab] = useState<'compose' | 'review' | 'history'>('compose');
  const [scheduleSubTab, setScheduleSubTab] = useState<'calendar' | 'performance'>('calendar');
  const [showCampaignsTable, setShowCampaignsTable] = useState(false);

  // Direct Sync & Import Modal + Realtime Auto-Polling State
  const adsImportInputRef = useRef<HTMLInputElement | null>(null);
  const [showDirectSyncModal, setShowDirectSyncModal] = useState(false);
  const [directSyncTab, setDirectSyncTab] = useState<'gsheet' | 'ga4' | 'api'>('gsheet');
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [ga4PropertyId, setGa4PropertyId] = useState('');
  const [ga4AccessToken, setGa4AccessToken] = useState('');
  const [gadsCustomerId, setGadsCustomerId] = useState('');
  const [gadsLoginCustomerId, setGadsLoginCustomerId] = useState('');
  const [gadsDevToken, setGadsDevToken] = useState('');
  const [gadsClientId, setGadsClientId] = useState('');
  const [gadsClientSecret, setGadsClientSecret] = useState('');
  const [gadsRefreshToken, setGadsRefreshToken] = useState('');
  const [gadsAccessToken, setGadsAccessToken] = useState('');

  // Live Realtime Stream State (Auto-polling every 15s)
  const [realtimeAutoEnabled, setRealtimeAutoEnabled] = useState(true);
  const [realtimePolling, setRealtimePolling] = useState(false);
  const [lastRealtimeSyncAt, setLastRealtimeSyncAt] = useState<string | null>(null);
  const [realtimeActiveUsers30m, setRealtimeActiveUsers30m] = useState<number>(0);
  const [realtimeActivePages, setRealtimeActivePages] = useState<Array<{ page: string; users: number }>>([]);
  const [realtimeActiveEvents, setRealtimeActiveEvents] = useState<Array<{ event: string; count: number }>>([]);
  const [realtimeSources, setRealtimeSources] = useState<string[]>([]);

  // Tab 2: Keyword Form & Filter State
  const [editingKeywordId, setEditingKeywordId] = useState<number | null>(null);
  const [newKeywordText, setNewKeywordText] = useState('');
  const [newKeywordWebsite, setNewKeywordWebsite] = useState<TargetWebsite>('toantrung.com.vn');
  const [kwSearchVolume, setKwSearchVolume] = useState<string>('');
  const [kwAdsClicks, setKwAdsClicks] = useState<string>('');
  const [kwAdsSpendInput, setKwAdsSpendInput] = useState<string>('');
  const [kwAdsConvInput, setKwAdsConvInput] = useState<string>('');
  const [kwOrganicClicks, setKwOrganicClicks] = useState<string>('');
  const [kwAvgPosition, setKwAvgPosition] = useState<string>('');
  const [kwTrend, setKwTrend] = useState<'UP' | 'STABLE' | 'DOWN'>('UP');
  const [kwPublishSlot, setKwPublishSlot] = useState<string>('Thứ Ba / Thứ Năm 09:00 - 10:30');
  const [kwSearchFilter, setKwSearchFilter] = useState('');
  const [kwWebsiteFilter, setKwWebsiteFilter] = useState<string>('ALL');
  const [kwGroupFilter, setKwGroupFilter] = useState<string>('ALL');

  // Tab 3: SEO Content Compose / Edit State
  const [selectedKeywordId, setSelectedKeywordId] = useState<number>(0);
  const [draftWebsite, setDraftWebsite] = useState<TargetWebsite>('toantrung.com.vn');
  const [topicFocus, setTopicFocus] = useState('');
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editMeta, setEditMeta] = useState('');
  const [editContentHtml, setEditContentHtml] = useState('');
  const [editNote, setEditNote] = useState('');
  const [previewHtmlMode, setPreviewHtmlMode] = useState(false);
  const [reviewFilterStatus, setReviewFilterStatus] = useState<string>('ALL');

  // Tab 4: Schedule Form State
  const [scheduleArticleId, setScheduleArticleId] = useState<number>(0);
  const [scheduleWebsite, setScheduleWebsite] = useState<TargetWebsite>('toantrung.com.vn');
  const [scheduleDate, setScheduleDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().slice(0, 10);
  });
  const [scheduleTime, setScheduleTime] = useState('09:00');

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
      if (res.keywords && res.keywords.length > 0) {
        setSelectedKeywordId((prev) => prev || res.keywords[0].id);
      }
      if (res.articles && res.articles.length > 0) {
        setSelectedArticleId((prev) => prev ?? res.articles[0].id);
        setScheduleArticleId((prev) => prev || res.articles[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải dữ liệu Quảng cáo & Từ khóa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSeoData();
  }, [fetchSeoData]);

  const pollRealtimeData = useCallback(
    async (silent = true) => {
      if (!user) return;
      setRealtimePolling(true);
      try {
        const rt = await apiRequest<{
          connected: boolean;
          sources: string[];
          lastRealtimeSyncAt: string;
          activeUsers30m: number;
          activePages: Array<{ page: string; users: number }>;
          activeEvents: Array<{ event: string; count: number }>;
          importedCampaigns: number;
          importedKeywords: number;
          errors?: string[];
        }>('/api/v1/ads/export', {
          method: 'POST',
          csrfToken: user.csrfToken,
          body: {
            mode: 'poll_realtime',
          },
        });
        setLastRealtimeSyncAt(rt.lastRealtimeSyncAt);
        setRealtimeActiveUsers30m(rt.activeUsers30m || 0);
        setRealtimeActivePages(rt.activePages || []);
        setRealtimeActiveEvents(rt.activeEvents || []);
        setRealtimeSources(rt.sources || []);

        // Refresh workspace data silently from DB
        const res = await apiRequest<AdsWorkspacePayloadDto>('/api/v1/ads');
        setKpis(res.kpis);
        setCampaigns(res.campaigns || []);
        setPerformanceChart(res.performanceChart || []);
        setDemandBars(res.demandBars || []);
        setKeywords(res.keywords || []);
        setArticles(res.articles || []);

        if (!silent) {
          setFeedbackMsg(
            rt.sources?.length
              ? `⚡ Đã đồng bộ Realtime từ ${rt.sources.join(' & ')} lúc ${new Date(
                  rt.lastRealtimeSyncAt,
                ).toLocaleTimeString('vi-VN')}.`
              : `⚡ Đã làm mới dữ liệu Realtime từ Database lúc ${new Date().toLocaleTimeString('vi-VN')}.`,
          );
        }
      } catch {
        // silent background poll ignore
      } finally {
        setRealtimePolling(false);
      }
    },
    [user],
  );

  // Load saved realtime config on mount
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const cfg = await apiRequest<{
          hasGa4: boolean;
          hasGsheet: boolean;
          ga4PropertyId: string;
          gsheetUrl: string;
          autoRealtimeEnabled: boolean;
          lastRealtimeSyncAt: string | null;
          activeUsers30m: number;
          activePages: Array<{ page: string; users: number }>;
          activeEvents: Array<{ event: string; count: number }>;
        }>('/api/v1/ads/export', {
          method: 'POST',
          csrfToken: user.csrfToken,
          body: { mode: 'get_realtime_config' },
        });
        if (cfg.ga4PropertyId) setGa4PropertyId(cfg.ga4PropertyId);
        if (cfg.gsheetUrl) setGsheetUrl(cfg.gsheetUrl);
        if (cfg.lastRealtimeSyncAt) setLastRealtimeSyncAt(cfg.lastRealtimeSyncAt);
        setRealtimeActiveUsers30m(cfg.activeUsers30m || 0);
        setRealtimeActivePages(cfg.activePages || []);
        setRealtimeActiveEvents(cfg.activeEvents || []);
      } catch {
        // ignore
      }
    })();
  }, [user]);

  // Auto-poll every 15 seconds when realtimeAutoEnabled is true
  useEffect(() => {
    if (!realtimeAutoEnabled || !user) return;
    const timer = setInterval(() => {
      void pollRealtimeData(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [realtimeAutoEnabled, user, pollRealtimeData]);

  const selectedArticle = useMemo(
    () => articles.find((a) => a.id === selectedArticleId) || null,
    [articles, selectedArticleId],
  );

  const selectedKeywordObj = useMemo(
    () => keywords.find((k) => k.id === selectedKeywordId) || null,
    [keywords, selectedKeywordId],
  );

  useEffect(() => {
    if (selectedArticle) {
      setEditTitle(selectedArticle.title);
      setEditMeta(selectedArticle.metaDescription || '');
      setEditContentHtml(selectedArticle.contentHtml);
      setEditNote('');
      setDraftWebsite((selectedArticle.targetWebsite as TargetWebsite) || 'toantrung.com.vn');
      setSelectedKeywordId(selectedArticle.keywordId);
    }
  }, [selectedArticle]);

  const getKeywordRecommendation = useCallback((kw: SeoKeywordItemDto): {
    code: 'WRITE_NEW' | 'OPTIMIZE_OLD' | 'REDUCE_ADS' | 'MONITOR';
    label: string;
    badgeClass: string;
  } => {
    const pos = kw.cachedAvgPosition ?? 99;
    if ((kw.articlesCount || 0) === 0) {
      return {
        code: 'WRITE_NEW',
        label: 'Viết mới',
        badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
      };
    }
    if (pos <= 3.5 && kw.cachedAdsClicks >= 25) {
      return {
        code: 'REDUCE_ADS',
        label: 'Xem xét giảm Ads',
        badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
    if (pos > 5) {
      return {
        code: 'OPTIMIZE_OLD',
        label: 'Tối ưu bài cũ',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      };
    }
    return {
      code: 'MONITOR',
      label: 'Theo dõi',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }, []);

  const filteredKeywords = useMemo(() => {
    return keywords.filter((kw) => {
      if (kwSearchFilter.trim()) {
        const q = kwSearchFilter.toLowerCase().trim();
        if (!kw.keywordText.toLowerCase().includes(q)) return false;
      }
      if (kwWebsiteFilter !== 'ALL' && kw.targetWebsite !== kwWebsiteFilter) {
        return false;
      }
      if (kwGroupFilter !== 'ALL' && getKeywordRecommendation(kw).code !== kwGroupFilter) {
        return false;
      }
      return true;
    });
  }, [keywords, kwSearchFilter, kwWebsiteFilter, kwGroupFilter, getKeywordRecommendation]);

  const filteredReviewArticles = useMemo(() => {
    if (reviewFilterStatus === 'ALL') return articles;
    return articles.filter((a) => a.status === reviewFilterStatus);
  }, [articles, reviewFilterStatus]);

  const allRevisionsFlat = useMemo(() => {
    const list: Array<{
      articleId: number;
      articleTitle: string;
      keywordText: string;
      targetWebsite: string;
      approvedRevisionId: number | null;
      rev: NonNullable<SeoArticleItemDto['revisions']>[number];
    }> = [];
    for (const art of articles) {
      for (const rev of art.revisions || []) {
        list.push({
          articleId: art.id,
          articleTitle: art.title,
          keywordText: art.keywordText,
          targetWebsite: art.targetWebsite,
          approvedRevisionId: art.approvedRevisionId,
          rev,
        });
      }
    }
    return list.sort(
      (a, b) => new Date(b.rev.createdAt).getTime() - new Date(a.rev.createdAt).getTime(),
    );
  }, [articles]);

  // Aggregate metrics for Overview cards
  const totalSearchVolume = useMemo(
    () => keywords.reduce((acc, k) => acc + (k.cachedSearchVolume || 0), 0),
    [keywords],
  );
  const totalOrganicClicks = useMemo(
    () => keywords.reduce((acc, k) => acc + (k.cachedOrganicClicks || 0), 0),
    [keywords],
  );
  const organicCtrPct = useMemo(() => {
    if (!totalSearchVolume) return '0.00%';
    return `${((totalOrganicClicks / totalSearchVolume) * 100).toFixed(2)}%`;
  }, [totalOrganicClicks, totalSearchVolume]);

  const avgCpcText = useMemo(() => {
    if (!kpis?.totalClicks || !kpis?.totalSpendVndText) return '0 đ';
    const rawSpend = Number(kpis.totalSpendVndText.replace(/[^\d]/g, '')) || 0;
    if (!rawSpend) return '0 đ';
    const cpc = Math.round(rawSpend / kpis.totalClicks);
    return `${cpc.toLocaleString('vi-VN')} đ`;
  }, [kpis]);

  const handleAddOrUpdateKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newKeywordText.trim()) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/ads', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          action: 'upsert_keyword',
          keywordText: newKeywordText.trim(),
          targetWebsite: newKeywordWebsite,
          cachedSearchVolume: kwSearchVolume !== '' ? Number(kwSearchVolume) : undefined,
          cachedAdsClicks: kwAdsClicks !== '' ? Number(kwAdsClicks) : undefined,
          cachedOrganicClicks: kwOrganicClicks !== '' ? Number(kwOrganicClicks) : undefined,
          cachedAvgPosition: kwAvgPosition !== '' ? Number(kwAvgPosition) : undefined,
          trendDirection: kwTrend,
          recommendedPublishWindow: kwPublishSlot,
        },
      });
      setEditingKeywordId(null);
      setNewKeywordText('');
      setKwSearchVolume('');
      setKwAdsClicks('');
      setKwAdsSpendInput('');
      setKwAdsConvInput('');
      setKwOrganicClicks('');
      setKwAvgPosition('');
      setFeedbackMsg(
        editingKeywordId
          ? 'Đã cập nhật số liệu từ khóa thành công.'
          : 'Đã lưu từ khóa và số liệu vào cơ sở dữ liệu.',
      );
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lưu từ khóa.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteKeyword = async (kwId: number, kwName: string) => {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/ads', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          action: 'delete_keyword',
          keywordId: kwId,
        },
      });
      setFeedbackMsg(`Đã xoá từ khóa "${kwName}" khỏi hệ thống.`);
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xoá từ khóa.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateAiDraft = async () => {
    if (!user || !selectedKeywordId) return;
    const focusText =
      topicFocus.trim() ||
      `Phân tích giải pháp kỹ thuật, báo giá và kinh nghiệm lắp đặt ${
        selectedKeywordObj?.keywordText || 'màn hình LED'
      } chuẩn B2B Toàn Trung`;
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
          topicFocus: focusText,
          simulateAiFailure: false,
        },
      });
      setTopicFocus('');
      setFeedbackMsg(
        `✨ AI Gemini đã khởi tạo bản nháp "${created.title}" và nạp trực tiếp vào khung soạn thảo!`,
      );
      await fetchSeoData();
      setSelectedArticleId(created.id);
      setContentSubTab('compose');
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
            editorNote: editNote || 'Cập nhật nội dung chuẩn SEO trong trình biên tập',
          },
        },
      );
      setFeedbackMsg(`Đã lưu phiên bản biên tập #${res.revisionNumber} vào Database.`);
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lưu phiên bản chỉnh sửa.');
    } finally {
      setBusy(false);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetArt = articles.find((a) => a.id === scheduleArticleId) || selectedArticle;
    if (!user || !targetArt) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const isoDate = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
      await apiRequest(`/api/v1/ads/articles/${targetArt.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'approve_schedule',
          expectedVersion: targetArt.version,
          revisionId: targetArt.currentRevisionId || undefined,
          targetWebsite: scheduleWebsite,
          scheduledPublishAt: isoDate,
        },
      });
      setFeedbackMsg(
        `Đã duyệt và lưu lịch xuất bản cho bài "${targetArt.title}" vào lúc ${scheduleTime} ngày ${scheduleDate}.`,
      );
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lưu lịch xuất bản.');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdrawArticle = async (art: SeoArticleItemDto) => {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/ads/articles/${art.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'withdraw_approval',
          expectedVersion: art.version,
          reason: 'Rút duyệt về trạng thái Nháp để chỉnh sửa thêm nội dung',
        },
      });
      setFeedbackMsg(`Đã rút duyệt bài "${art.title}" về trạng thái Nháp.`);
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi rút duyệt.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmPublished = async (art: SeoArticleItemDto) => {
    if (!user) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ publishedUrl: string }>(`/api/v1/ads/articles/${art.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'publish_now',
          expectedVersion: art.version,
          simulateWebhookFailure: false,
        },
      });
      setFeedbackMsg(`Đã xác nhận trạng thái Đã đăng cho bài viết: ${res.publishedUrl}`);
      await fetchSeoData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi xác nhận đăng bài.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyArticleHtml = (title: string, meta: string | null, html: string) => {
    const fullCopy = `<!-- Tiêu đề SEO: ${title} -->\n<!-- Meta Description: ${meta || ''} -->\n${html}`;
    void navigator.clipboard.writeText(fullCopy);
    setFeedbackMsg(`Đã sao chép mã HTML chuẩn SEO của bài "${title}" vào bộ nhớ tạm!`);
  };

  const handleExportData = () => {
    window.open('/api/v1/ads/export', '_blank');
  };

  const maxClicksInChart = Math.max(
    ...performanceChart.map((p) => Math.max(p.clicks, p.conversions * 20)),
    100,
  );

  const tabTitles: Record<typeof mainTab, string> = {
    overview: 'Tổng quan',
    keywords: 'Từ khóa',
    content: 'Nội dung SEO',
    schedule: 'Lịch xuất bản & hiệu quả',
  };

  return (
    <div className="space-y-5 text-sm pb-8">
      {/* Hidden Excel/CSV file input */}
      <input
        ref={adsImportInputRef}
        type="file"
        accept=".xlsx,.csv,.tsv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !user) return;
          setBusy(true);
          setErrorMsg(null);
          void (async () => {
            try {
              const fd = new FormData();
              fd.append('file', file);
              const res = await apiRequest<{
                importedCampaigns: number;
                importedKeywords: number;
              }>('/api/v1/ads/export', {
                method: 'POST',
                csrfToken: user.csrfToken,
                isFormData: true,
                body: fd,
              });
              setFeedbackMsg(
                `Đã nhập file "${file.name}": cập nhật ${res.importedCampaigns} chiến dịch và ${res.importedKeywords} từ khóa vào Database.`,
              );
              await fetchSeoData();
            } catch (err) {
              setErrorMsg(
                err instanceof Error ? err.message : 'Không thể nhập file báo cáo Google Ads.',
              );
            } finally {
              setBusy(false);
              if (adsImportInputRef.current) {
                adsImportInputRef.current.value = '';
              }
            }
          })();
        }}
      />

      {/* ==================== TOP HEADER CARD + 4-TAB PILL NAVIGATION ==================== */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-widest text-blue-600">
              MODULE 03 / MARKETING WORKSPACE
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              Quảng cáo, Từ khóa &amp; SEO
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Đồng bộ số liệu Google Ads &amp; Search Console, phân tích từ khóa, soạn bài bằng AI Gemini và quản lý lịch xuất bản.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setRealtimeAutoEnabled((prev) => !prev)}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-bold transition ${
                realtimeAutoEnabled
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
              title="Bật/Tắt chế độ tự động đọc dữ liệu Realtime từ Google Analytics 4 & Google Sheets mỗi 15 giây"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  realtimeAutoEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>
                {realtimeAutoEnabled
                  ? `Đọc Realtime (15s)${realtimePolling ? ' • Đang quét...' : ''}`
                  : 'Realtime: Tạm dừng'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowDirectSyncModal(true)}
              className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy || realtimePolling ? 'animate-spin' : ''}`} />
              <span>Kết nối Google Ads &amp; GA4</span>
            </button>

            <button
              type="button"
              onClick={() => adsImportInputRef.current?.click()}
              className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <FolderUp className="w-3.5 h-3.5 text-slate-600" />
              <span>Nhập Excel/CSV</span>
            </button>

            <button
              type="button"
              onClick={handleExportData}
              className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Xuất báo cáo</span>
            </button>
          </div>
        </div>

        {/* Google OAuth 2.0 Fast Connect Banner (One-Click Connect for Module 03 & All Modules) */}
        <GoogleOAuthManager compact returnPath="/ads" onSyncCompleted={() => void fetchSeoData()} />

        {/* 4-Tab Pill Navigation Bar (Clean Soft Segmented Container) */}
        <div className="bg-slate-100/80 p-1.5 rounded-2xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
          {[
            {
              id: 'overview' as const,
              title: 'Tổng quan',
              subtitle: 'Bức tranh chung Ads & SEO',
              icon: LayoutGrid,
            },
            {
              id: 'keywords' as const,
              title: 'Từ khóa',
              subtitle: 'Dữ liệu và xu hướng tìm kiếm',
              icon: Search,
            },
            {
              id: 'content' as const,
              title: 'Nội dung SEO',
              subtitle: 'Soạn thảo và duyệt bài viết',
              icon: FileText,
            },
            {
              id: 'schedule' as const,
              title: 'Lịch xuất bản & hiệu quả',
              subtitle: 'Lịch đăng và theo dõi bài viết',
              icon: Calendar,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMainTab(tab.id)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                  active
                    ? 'bg-blue-50/95 border border-blue-200/90 shadow-2xs text-blue-700'
                    : 'bg-transparent border border-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-blue-600' : 'text-slate-500'
                  }`}
                />
                <div className="min-w-0">
                  <div
                    className={`text-sm font-bold truncate ${
                      active ? 'text-blue-700' : 'text-slate-800'
                    }`}
                  >
                    {tab.title}
                  </div>
                  <div className="text-xs text-slate-500 truncate mt-0.5">{tab.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Breadcrumb Sub-bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
        <div>
          <span>M03</span>
          <span className="mx-1.5">/</span>
          <strong className="text-slate-900 font-bold">{tabTitles[mainTab]}</strong>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Dữ liệu lưu trực tiếp trên PostgreSQL ({keywords.length} từ khóa • {articles.length} bài viết)
          </span>
          <button
            type="button"
            onClick={() => void fetchSeoData()}
            className="text-blue-600 font-semibold hover:underline inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* Feedback & Error Alerts */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="font-bold text-xs px-2.5 py-1 rounded-lg hover:bg-rose-100"
          >
            Đóng
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="font-bold text-xs px-2.5 py-1 rounded-lg hover:bg-emerald-100"
          >
            Đóng
          </button>
        </div>
      )}

      {/* ==================== MODAL ĐỒNG BỘ GOOGLE ADS ==================== */}
      {showDirectSyncModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display font-bold text-slate-900 text-lg">
                  ⚡ Kết nối Google Ads &amp; Google Analytics 4 (Quyền Chỉ xem)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tối ưu cho tài khoản có quyền Chỉ xem (Viewer / Read-Only) trên Google Ads &amp; Google Analytics
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDirectSyncModal(false)}
                className="px-2.5 py-1 rounded-lg text-slate-500 hover:bg-slate-200/60 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="px-6 pt-3 bg-slate-50/60 border-b border-slate-200 flex flex-wrap gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() => setDirectSyncTab('gsheet')}
                className={`px-3.5 py-2 rounded-t-xl border-b-2 transition ${
                  directSyncTab === 'gsheet'
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                1. Qua Google Sheets (Google Ads &amp; GA4 Chỉ xem)
              </button>
              <button
                type="button"
                onClick={() => setDirectSyncTab('ga4')}
                className={`px-3.5 py-2 rounded-t-xl border-b-2 transition ${
                  directSyncTab === 'ga4'
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                2. Google Analytics 4 API (Quyền Chỉ xem)
              </button>
              <button
                type="button"
                onClick={() => setDirectSyncTab('api')}
                className={`px-3.5 py-2 rounded-t-xl border-b-2 transition ${
                  directSyncTab === 'api'
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                3. Google Ads API (Developer Token)
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              {directSyncTab === 'gsheet' ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-xs text-slate-700 space-y-2 leading-relaxed">
                    <p className="font-bold text-blue-800">
                      Cách nhanh nhất khi tài khoản Google Ads &amp; Google Analytics đang ở quyền Chỉ xem (Viewer):
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>
                        <strong>Với Google Ads:</strong> Mở bảng <em>Chiến dịch</em> hoặc <em>Từ khóa</em> &rarr; bấm nút{' '}
                        <strong>Tải xuống (Download)</strong> &rarr; chọn <strong>Google Trang tính (Google Sheets)</strong> (hoặc bật <em>Lập lịch</em> tự động xuất mỗi ngày).
                      </li>
                      <li>
                        <strong>Với Google Analytics 4 (GA4):</strong> Vào <em>Báo cáo (Reports) &rarr; Thu nạp lưu lượng truy cập (Traffic acquisition)</em> &rarr; bấm biểu tượng <strong>Chia sẻ báo cáo này</strong> (góc phải trên) &rarr; <strong>Tải tệp xuống &rarr; Xuất sang Google Trang tính</strong>.
                      </li>
                      <li>
                        Mở file Google Sheets đó, bấm <strong>Chia sẻ (Share)</strong> &rarr; chọn{' '}
                        <strong>Bất kỳ ai có đường liên kết đều có thể xem</strong> rồi dán link vào dưới đây:
                      </li>
                    </ul>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Đường dẫn Google Sheets (Báo cáo Google Ads hoặc Google Analytics 4) *
                    </label>
                    <input
                      type="url"
                      value={gsheetUrl}
                      onChange={(e) => setGsheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit..."
                      className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-blue-600"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDirectSyncModal(false)}
                      className="h-9 px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      disabled={busy || !gsheetUrl.trim()}
                      onClick={() => {
                        if (!user || !gsheetUrl.trim()) return;
                        setBusy(true);
                        setErrorMsg(null);
                        void (async () => {
                          try {
                            const res = await apiRequest<{
                              importedCampaigns: number;
                              importedKeywords: number;
                            }>('/api/v1/ads/export', {
                              method: 'POST',
                              csrfToken: user.csrfToken,
                              body: {
                                mode: 'gsheet_url',
                                sheetUrl: gsheetUrl.trim(),
                              },
                            });
                            setShowDirectSyncModal(false);
                            setFeedbackMsg(
                              `Đã đồng bộ từ Google Sheets: cập nhật ${res.importedCampaigns} chiến dịch/nguồn lưu lượng và ${res.importedKeywords} từ khóa.`,
                            );
                            await fetchSeoData();
                          } catch (err) {
                            setErrorMsg(
                              err instanceof Error ? err.message : 'Lỗi đồng bộ từ Google Sheets.',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                      className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-40"
                    >
                      {busy ? 'Đang đồng bộ...' : '⚡ Đồng bộ trực tiếp ngay'}
                    </button>
                  </div>
                </div>
              ) : directSyncTab === 'ga4' ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs text-slate-700 space-y-1.5 leading-relaxed">
                    <p className="font-bold text-emerald-900">
                      Kết nối thẳng Google Analytics 4 Data API (Hoạt động 100% với tài khoản quyền Chỉ xem!):
                    </p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>
                        <strong>Lấy GA4 Property ID (9 chữ số):</strong> Mở Google Analytics &rarr; nhìn lên thanh địa chỉ URL thấy đoạn <code>.../p123456789/...</code> thì <code>123456789</code> chính là Property ID (hoặc vào <em>Quản trị &rarr; Thông tin thuộc tính</em>).
                      </li>
                      <li>
                        <strong>Lấy Access Token (15 giây):</strong> Mở{' '}
                        <a
                          href="https://developers.google.com/oauthplayground/?scope=https://www.googleapis.com/auth/analytics.readonly"
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 font-bold underline"
                        >
                          Google OAuth Playground (Analytics Read-Only)
                        </a>{' '}
                        &rarr; bấm <strong>Authorize APIs</strong> bằng Gmail đang có quyền Chỉ xem GA4 &rarr; bấm{' '}
                        <strong>Exchange authorization code for tokens</strong> &rarr; copy dòng <code>Access token</code> (bắt đầu bằng <code>ya29...</code>) dán vào ô dưới.
                      </li>
                    </ol>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        GA4 Property ID (Mã thuộc tính 9 số) *
                      </label>
                      <input
                        type="text"
                        value={ga4PropertyId}
                        onChange={(e) => setGa4PropertyId(e.target.value)}
                        placeholder="VD: 384920194"
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        OAuth Access Token (ya29...) *
                      </label>
                      <input
                        type="password"
                        value={ga4AccessToken}
                        onChange={(e) => setGa4AccessToken(e.target.value)}
                        placeholder="ya29.a0AfH6SM..."
                        className="w-full h-10 px-3.5 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                    <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDirectSyncModal(false)}
                      className="h-9 px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      disabled={busy || !ga4PropertyId.trim() || !ga4AccessToken.trim()}
                      onClick={() => {
                        if (!user) return;
                        setBusy(true);
                        setErrorMsg(null);
                        void (async () => {
                          try {
                            const res = await apiRequest<{
                              importedCampaigns: number;
                              importedKeywords: number;
                            }>('/api/v1/ads/export', {
                              method: 'POST',
                              csrfToken: user.csrfToken,
                              body: {
                                mode: 'ga4_api',
                                propertyId: ga4PropertyId.trim(),
                                accessToken: ga4AccessToken.trim(),
                              },
                            });
                            setShowDirectSyncModal(false);
                            setFeedbackMsg(
                              `Đã kéo trực tiếp dữ liệu 30 ngày từ Google Analytics 4 (Property ${ga4PropertyId}): cập nhật ${res.importedCampaigns} nguồn lưu lượng & chiến dịch!`,
                            );
                            await fetchSeoData();
                          } catch (err) {
                            setErrorMsg(
                              err instanceof Error ? err.message : 'Lỗi kết nối Google Analytics 4 API.',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                      className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-40"
                    >
                      {busy ? 'Đang kéo dữ liệu GA4...' : '⚡ Kéo trực tiếp từ Google Analytics 4'}
                    </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Customer ID *
                      </label>
                      <input
                        type="text"
                        value={gadsCustomerId}
                        onChange={(e) => setGadsCustomerId(e.target.value)}
                        placeholder="123-456-7890"
                        className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Developer Token *
                      </label>
                      <input
                        type="password"
                        value={gadsDevToken}
                        onChange={(e) => setGadsDevToken(e.target.value)}
                        placeholder="Developer Token..."
                        className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        MCC Login Customer ID
                      </label>
                      <input
                        type="text"
                        value={gadsLoginCustomerId}
                        onChange={(e) => setGadsLoginCustomerId(e.target.value)}
                        placeholder="Không bắt buộc"
                        className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        OAuth Access Token
                      </label>
                      <input
                        type="password"
                        value={gadsAccessToken}
                        onChange={(e) => setGadsAccessToken(e.target.value)}
                        placeholder="ya29.a0..."
                        className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        OAuth Client ID
                      </label>
                      <input
                        type="text"
                        value={gadsClientId}
                        onChange={(e) => setGadsClientId(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        OAuth Client Secret
                      </label>
                      <input
                        type="password"
                        value={gadsClientSecret}
                        onChange={(e) => setGadsClientSecret(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        OAuth Refresh Token
                      </label>
                      <input
                        type="password"
                        value={gadsRefreshToken}
                        onChange={(e) => setGadsRefreshToken(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-slate-300 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDirectSyncModal(false)}
                      className="h-9 px-4 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700"
                    >
                      Đóng
                    </button>
                    <button
                      type="button"
                      disabled={busy || !gadsCustomerId.trim() || !gadsDevToken.trim()}
                      onClick={() => {
                        if (!user) return;
                        setBusy(true);
                        setErrorMsg(null);
                        void (async () => {
                          try {
                            const res = await apiRequest<{
                              importedCampaigns: number;
                              importedKeywords: number;
                            }>('/api/v1/ads/export', {
                              method: 'POST',
                              csrfToken: user.csrfToken,
                              body: {
                                mode: 'google_ads_api',
                                customerId: gadsCustomerId.trim(),
                                loginCustomerId: gadsLoginCustomerId.trim(),
                                developerToken: gadsDevToken.trim(),
                                clientId: gadsClientId.trim(),
                                clientSecret: gadsClientSecret.trim(),
                                refreshToken: gadsRefreshToken.trim(),
                                accessToken: gadsAccessToken.trim(),
                              },
                            });
                            setShowDirectSyncModal(false);
                            setFeedbackMsg(
                              `Đã đồng bộ từ Google Ads API: cập nhật ${res.importedCampaigns} chiến dịch.`,
                            );
                            await fetchSeoData();
                          } catch (err) {
                            setErrorMsg(
                              err instanceof Error ? err.message : 'Lỗi kết nối Google Ads API.',
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                      className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-40"
                    >
                      {busy ? 'Đang gọi API...' : '⚡ Kéo dữ liệu từ Google Ads API'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 1: TỔNG QUAN (OVERVIEW)
         ===================================================================== */}
      {mainTab === 'overview' && (
        <div className="space-y-5">
          {/* Banner Trung tâm quản lý Ads & SEO + Trạng thái Realtime */}
          <div className="bg-blue-50/50 border border-blue-200/70 rounded-3xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-slate-900 font-display font-bold text-base">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Trung tâm quản lý Ads &amp; SEO (Realtime Stream)</span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                  <span>LIVE 15s</span>
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Tự động đọc dữ liệu Realtime từ Google Analytics 4 (runRealtimeReport &amp; runReport) và Google Sheets báo cáo Google Ads mỗi 15 giây.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {realtimeSources.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-white border border-emerald-200 text-emerald-700 text-xs font-bold">
                  {realtimeSources.join(' • ')}
                </span>
              )}
              {lastRealtimeSyncAt && (
                <span className="text-xs text-slate-500">
                  Cập nhật lúc:{' '}
                  <strong className="text-slate-800">
                    {new Date(lastRealtimeSyncAt).toLocaleTimeString('vi-VN')}
                  </strong>
                </span>
              )}
              <button
                type="button"
                disabled={realtimePolling}
                onClick={() => void pollRealtimeData(false)}
                className="h-9 px-3.5 rounded-xl bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${realtimePolling ? 'animate-spin' : ''}`} />
                <span>Quét Realtime ngay</span>
              </button>
            </div>
          </div>

          {/* Live GA4 Realtime Panel (Hiển thị khi có dữ liệu GA4 Realtime hoặc hướng dẫn kết nối nhanh) */}
          <div className="bg-white border border-emerald-200/90 rounded-3xl p-5 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="font-display font-bold text-slate-900 text-sm">
                  Giám sát Thời gian thực (Google Analytics 4 Realtime — 30 phút qua)
                </h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {ga4PropertyId ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-mono font-bold">
                    GA4 Property: {ga4PropertyId}
                  </span>
                ) : (
                  <a
                    href="/api/v1/auth/google/authorize?redirect=true&returnPath=%2Fads"
                    className="px-3.5 py-1.5 rounded-full bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold shadow-2xs transition inline-flex items-center gap-1.5"
                  >
                    <span>🔗 Đăng nhập Google (OAuth 2.0) để tải dữ liệu thật về máy này</span>
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
              <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex flex-col justify-between">
                <span className="text-xs font-bold text-emerald-800 uppercase">
                  NGƯỜI DÙNG ĐANG HOẠT ĐỘNG (30 PHÚT QUA)
                </span>
                <div className="font-display text-3xl font-bold text-emerald-700 mt-2">
                  {realtimeActiveUsers30m}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Đọc trực tiếp từ <code>analyticsdata.googleapis.com (:runRealtimeReport)</code>
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase">
                  TRANG ĐANG XEM TRỰC TIẾP
                </span>
                {realtimeActivePages.length === 0 ? (
                  <p className="text-xs text-slate-400 pt-2">
                    {ga4PropertyId
                      ? 'Chưa ghi nhận lượt xem trang mới trong 30 phút qua'
                      : 'Kết nối GA4 Property ID để xem trang khách đang truy cập trực tiếp'}
                  </p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {realtimeActivePages.slice(0, 4).map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 truncate max-w-[200px]">{p.page}</span>
                        <span className="font-mono font-bold text-emerald-700">{p.users} user</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/70 space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase">
                  SỰ KIỆN REALTIME (EVENTS)
                </span>
                {realtimeActiveEvents.length === 0 ? (
                  <p className="text-xs text-slate-400 pt-2">
                    {ga4PropertyId
                      ? 'Chưa có sự kiện mới trong 30 phút qua'
                      : 'Tự động ghi nhận page_view, click, form_submit, generate_lead'}
                  </p>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    {realtimeActiveEvents.slice(0, 4).map((ev, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-slate-700">{ev.event}</span>
                        <span className="font-mono font-bold text-blue-700">{ev.count} lần</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 6 Spacious KPI Cards (4 trên + 2 dưới giống hệt bố cục ảnh 1 & 2) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Từ khóa */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Từ khóa</span>
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 grid place-items-center">
                  <Search className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {keywords.length}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Đang theo dõi trên 3 website
                </p>
              </div>
            </div>

            {/* Card 2: Lượt nhấp Ads */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Lượt nhấp Ads</span>
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 grid place-items-center">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {(kpis?.totalClicks || 0).toLocaleString('vi-VN')}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Tổng từ {campaigns.length} chiến dịch Google Ads
                </p>
              </div>
            </div>

            {/* Card 3: Chi phí Ads */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Chi phí Ads</span>
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {kpis?.totalSpendVndText ? kpis.totalSpendVndText.replace(/\s*VND$/i, ' đ') : '0 đ'}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Tổng ngân sách ghi nhận từ Google Ads
                </p>
              </div>
            </div>

            {/* Card 4: Lượt hiển thị SEO */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Lượt hiển thị SEO</span>
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center">
                  <Eye className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {totalSearchVolume.toLocaleString('vi-VN')}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {totalOrganicClicks.toLocaleString('vi-VN')} lượt nhấp Search Console
                </p>
              </div>
            </div>

            {/* Card 5: CTR Search Console */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">CTR Search Console</span>
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center">
                  <Target className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {organicCtrPct}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Nhấp Search Console / lượt hiển thị
                </p>
              </div>
            </div>

            {/* Card 6: CPC Ads */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">CPC Ads trung bình</span>
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center">
                  <Activity className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {avgCpcText}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Chi phí Ads / lượt nhấp Ads (CTR: {kpis?.avgCtrPct || '0%'})
                </p>
              </div>
            </div>

            {/* Card 7: Bài viết SEO */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Bài viết chuẩn SEO</span>
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 grid place-items-center">
                  <FileText className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {articles.length}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {articles.filter((a) => a.status === 'PUBLISHED').length} đã đăng •{' '}
                  {articles.filter((a) => a.status === 'APPROVED_SCHEDULED').length} chờ lịch
                </p>
              </div>
            </div>

            {/* Card 8: Chuyển đổi chiến dịch */}
            <div className="bg-white border border-slate-200/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Chuyển đổi &amp; CPL</span>
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 grid place-items-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-3xl font-bold text-slate-900 tracking-tight">
                  {kpis?.totalConversions || 0} Leads
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  CPL trung bình: {kpis?.cplVndText || 'Chưa phát sinh'}
                </p>
              </div>
            </div>
          </div>

          {/* Expandable Campaign Performance Chart & Campaigns Table */}
          {(showCampaignsTable || campaigns.length > 0) && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-display text-base font-bold text-slate-900">
                        Biểu đồ Hiệu suất Chiến dịch Google Ads
                      </h3>
                      <p className="text-xs text-slate-500">
                        Tương quan Lượt nhấp (Clicks) và Chuyển đổi (Conversions)
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 pb-2 h-52 flex items-end justify-between gap-3 px-2">
                    {performanceChart.map((p, idx) => {
                      const clickHeight = Math.max(12, Math.round((p.clicks / maxClicksInChart) * 160));
                      const convHeight = Math.max(8, Math.round(((p.conversions * 20) / maxClicksInChart) * 160));
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex items-end justify-center gap-1.5 h-40">
                            <div
                              style={{ height: `${clickHeight}px` }}
                              className="w-1/2 max-w-[26px] rounded-t-md bg-blue-600"
                              title={`${p.clicks} clicks`}
                            />
                            <div
                              style={{ height: `${convHeight}px` }}
                              className="w-1/2 max-w-[26px] rounded-t-md bg-sky-400"
                              title={`${p.conversions} chuyển đổi`}
                            />
                          </div>
                          <span className="text-xs font-medium text-slate-600 mt-1">{p.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4">
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Nhu cầu tìm kiếm Từ khóa hàng đầu
                  </h3>
                  <div className="space-y-3.5">
                    {demandBars.map((bar) => (
                      <div key={bar.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">{bar.keywordText}</span>
                          <span className="font-mono text-slate-600">
                            {bar.searchVolume.toLocaleString('vi-VN')} lượt
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            style={{ width: `${bar.percentage}%` }}
                            className="h-full rounded-full bg-blue-600"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-2xs">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="font-display font-bold text-slate-900 text-base">
                    Danh sách Chiến dịch Quảng cáo ({campaigns.length})
                  </h3>
                  <span className="text-xs text-slate-500">Đồng bộ từ Google Ads</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-100 text-xs">
                        <th className="py-3.5 px-5 font-semibold">Chiến dịch</th>
                        <th className="py-3.5 px-3 font-semibold">Nền tảng</th>
                        <th className="py-3.5 px-3 font-semibold text-right">Ngân sách/ngày</th>
                        <th className="py-3.5 px-3 font-semibold text-right">Hiển thị</th>
                        <th className="py-3.5 px-3 font-semibold text-right">Lượt nhấp</th>
                        <th className="py-3.5 px-3 font-semibold text-center">CTR</th>
                        <th className="py-3.5 px-3 font-semibold text-right">Chi phí</th>
                        <th className="py-3.5 px-5 font-semibold text-center">Chuyển đổi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {campaigns.map((camp) => (
                        <tr key={camp.id} className="hover:bg-slate-50/60">
                          <td className="py-3.5 px-5">
                            <div className="font-bold text-slate-900">{camp.campaignName}</div>
                            <div className="text-xs text-slate-400">Mã: {camp.campaignCode}</div>
                          </td>
                          <td className="py-3.5 px-3 text-xs font-semibold text-blue-700">
                            {camp.platform}
                          </td>
                          <td className="py-3.5 px-3 text-right tabular-nums">
                            {camp.dailyBudgetVndText}
                          </td>
                          <td className="py-3.5 px-3 text-right tabular-nums">
                            {camp.impressions.toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3.5 px-3 text-right tabular-nums font-bold text-blue-700">
                            {camp.clicks.toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3.5 px-3 text-center tabular-nums">{camp.ctrPct}</td>
                          <td className="py-3.5 px-3 text-right tabular-nums font-bold">
                            {camp.spendVndText}
                          </td>
                          <td className="py-3.5 px-5 text-center font-bold text-emerald-700">
                            {camp.conversions}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: TỪ KHÓA (KEYWORDS & METRICS)
         ===================================================================== */}
      {mainTab === 'keywords' && (
        <div className="space-y-5">
          {/* Card 1: Form Nhập từ khóa và số liệu (Giống bố cục ảnh 3) */}
          {!isAdsReadOnly && (
            <form
              onSubmit={(e) => void handleAddOrUpdateKeyword(e)}
              className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 grid place-items-center">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-slate-900 text-base">
                      {editingKeywordId
                        ? 'Cập nhật từ khóa và số liệu'
                        : 'Nhập từ khóa và số liệu'}
                    </h2>
                    <p className="text-xs text-slate-500">
                      Để trống chỉ số chưa có; dữ liệu được lưu trực tiếp vào cơ sở dữ liệu hệ thống.
                    </p>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                  Lưu trực tiếp Database
                </span>
              </div>

              {/* Row 1: Từ khóa * + Website */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Từ khóa *
                  </label>
                  <input
                    type="text"
                    required
                    value={newKeywordText}
                    onChange={(e) => setNewKeywordText(e.target.value)}
                    placeholder="Ví dụ: màn hình LED trong nhà"
                    className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Website
                  </label>
                  <select
                    value={newKeywordWebsite}
                    onChange={(e) => setNewKeywordWebsite(e.target.value as TargetWebsite)}
                    className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-blue-500"
                  >
                    {TARGET_WEBSITES.map((w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Section: Số liệu Google Ads */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-slate-800">Số liệu Google Ads</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Lượt nhấp</label>
                    <input
                      type="number"
                      min={0}
                      value={kwAdsClicks}
                      onChange={(e) => setKwAdsClicks(e.target.value)}
                      placeholder="VD: 50"
                      className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Chi phí ước tính (đ)</label>
                    <input
                      type="number"
                      min={0}
                      value={kwAdsSpendInput}
                      onChange={(e) => setKwAdsSpendInput(e.target.value)}
                      placeholder="VD: 650000"
                      className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Chuyển đổi</label>
                    <input
                      type="number"
                      min={0}
                      value={kwAdsConvInput}
                      onChange={(e) => setKwAdsConvInput(e.target.value)}
                      placeholder="VD: 3"
                      className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Khung giờ xuất bản gợi ý
                    </label>
                    <input
                      type="text"
                      value={kwPublishSlot}
                      onChange={(e) => setKwPublishSlot(e.target.value)}
                      placeholder="Thứ Ba / Thứ Năm 09:00"
                      className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Số liệu Search Console */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-slate-800">Số liệu Search Console</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Lượt nhấp (Organic)</label>
                    <input
                      type="number"
                      min={0}
                      value={kwOrganicClicks}
                      onChange={(e) => setKwOrganicClicks(e.target.value)}
                      placeholder="VD: 140"
                      className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Lượt hiển thị / Volume tìm kiếm
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={kwSearchVolume}
                      onChange={(e) => setKwSearchVolume(e.target.value)}
                      placeholder="VD: 1200"
                      className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Vị trí trung bình</label>
                    <input
                      type="number"
                      step="0.1"
                      min={1}
                      max={100}
                      value={kwAvgPosition}
                      onChange={(e) => setKwAvgPosition(e.target.value)}
                      placeholder="VD: 2.4"
                      className="w-full h-10 px-3.5 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Row: Xu hướng + Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Xu hướng tìm kiếm
                  </label>
                  <select
                    value={kwTrend}
                    onChange={(e) => setKwTrend(e.target.value as 'UP' | 'STABLE' | 'DOWN')}
                    className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm bg-white"
                  >
                    <option value="UP">Tăng</option>
                    <option value="STABLE">Ổn định</option>
                    <option value="DOWN">Giảm</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2.5">
                  {editingKeywordId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingKeywordId(null);
                        setNewKeywordText('');
                        setKwSearchVolume('');
                        setKwAdsClicks('');
                        setKwOrganicClicks('');
                        setKwAvgPosition('');
                      }}
                      className="h-10 px-4 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                    >
                      Hủy sửa
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={busy}
                    className="h-10 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{editingKeywordId ? 'Lưu cập nhật từ khóa' : 'Lưu từ khóa'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Card 2: Bảng Danh sách từ khóa (Giống hệt ảnh 4) */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-medium text-slate-500">
                Hiển thị <strong className="text-slate-900">{filteredKeywords.length}</strong> /{' '}
                {keywords.length} từ khóa
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={kwSearchFilter}
                    onChange={(e) => setKwSearchFilter(e.target.value)}
                    placeholder="Tìm từ khóa..."
                    className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <select
                  value={kwWebsiteFilter}
                  onChange={(e) => setKwWebsiteFilter(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="ALL">Tất cả Website</option>
                  {TARGET_WEBSITES.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
                <select
                  value={kwGroupFilter}
                  onChange={(e) => setKwGroupFilter(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  <option value="ALL">Tất cả nhóm đề xuất</option>
                  <option value="WRITE_NEW">Viết mới</option>
                  <option value="OPTIMIZE_OLD">Tối ưu bài cũ</option>
                  <option value="REDUCE_ADS">Xem xét giảm Ads</option>
                  <option value="MONITOR">Theo dõi</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 text-slate-500 border-y border-slate-100 text-xs">
                    <th className="py-3.5 px-4 font-semibold min-w-[220px]">Từ khóa</th>
                    <th className="py-3.5 px-3 font-semibold whitespace-nowrap">Website</th>
                    <th className="py-3.5 px-3 font-semibold text-right whitespace-nowrap">Nhấp Ads</th>
                    <th className="py-3.5 px-3 font-semibold text-right whitespace-nowrap">Chi phí Ads</th>
                    <th className="py-3.5 px-3 font-semibold text-right whitespace-nowrap">Hiển thị SEO</th>
                    <th className="py-3.5 px-3 font-semibold text-center whitespace-nowrap">Vị trí TB</th>
                    <th className="py-3.5 px-3 font-semibold text-center whitespace-nowrap">Xu hướng</th>
                    <th className="py-3.5 px-3 font-semibold text-center whitespace-nowrap">Nhóm đề xuất</th>
                    <th className="py-3.5 px-4 font-semibold text-right whitespace-nowrap">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredKeywords.map((kw) => {
                    const rec = getKeywordRecommendation(kw);
                    const estSpend = (kw.cachedAdsClicks || 0) * 12000;
                    return (
                      <tr key={kw.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-4">
                          <div className="font-bold text-slate-900">{kw.keywordText}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {(kw.articlesCount || 0) > 0
                              ? `Đã có ${kw.articlesCount} bài viết`
                              : 'Chưa có bài viết'}
                          </div>
                        </td>
                        <td className="py-4 px-3 text-slate-600 whitespace-nowrap">
                          {kw.targetWebsite}
                        </td>
                        <td className="py-4 px-3 text-right tabular-nums text-slate-800">
                          {kw.cachedAdsClicks ? kw.cachedAdsClicks.toLocaleString('vi-VN') : '—'}
                        </td>
                        <td className="py-4 px-3 text-right tabular-nums text-slate-800 whitespace-nowrap">
                          {estSpend > 0 ? `${estSpend.toLocaleString('vi-VN')} đ` : '—'}
                        </td>
                        <td className="py-4 px-3 text-right tabular-nums text-slate-800">
                          {kw.cachedSearchVolume
                            ? kw.cachedSearchVolume.toLocaleString('vi-VN')
                            : '—'}
                        </td>
                        <td className="py-4 px-3 text-center tabular-nums text-slate-800">
                          {kw.cachedAvgPosition ? kw.cachedAvgPosition.toFixed(1) : '—'}
                        </td>
                        <td className="py-4 px-3 text-center whitespace-nowrap text-slate-700">
                          {kw.trendDirection === 'UP'
                            ? 'Tăng'
                            : kw.trendDirection === 'DOWN'
                              ? 'Giảm'
                              : 'Ổn định'}
                        </td>
                        <td className="py-4 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${rec.badgeClass}`}
                          >
                            {rec.label}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedKeywordId(kw.id);
                                setDraftWebsite(
                                  (kw.targetWebsite as TargetWebsite) || 'toantrung.com.vn',
                                );
                                setMainTab('content');
                                setContentSubTab('compose');
                              }}
                              className="h-8 px-3 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-bold transition"
                            >
                              Viết bài
                            </button>
                            {!isAdsReadOnly && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingKeywordId(kw.id);
                                    setNewKeywordText(kw.keywordText);
                                    setNewKeywordWebsite(
                                      (kw.targetWebsite as TargetWebsite) || 'toantrung.com.vn',
                                    );
                                    setKwSearchVolume(String(kw.cachedSearchVolume || 0));
                                    setKwAdsClicks(String(kw.cachedAdsClicks || 0));
                                    setKwOrganicClicks(String(kw.cachedOrganicClicks || 0));
                                    setKwAvgPosition(
                                      kw.cachedAvgPosition ? String(kw.cachedAvgPosition) : '',
                                    );
                                    setKwTrend(kw.trendDirection || 'STABLE');
                                    setKwPublishSlot(kw.suggestedPublishSlot || '');
                                    window.scrollTo({ top: 160, behavior: 'smooth' });
                                  }}
                                  className="h-8 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold"
                                >
                                  Sửa
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void handleDeleteKeyword(kw.id, kw.keywordText)}
                                  className="h-8 w-8 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 grid place-items-center"
                                  title="Xoá từ khóa"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottom 4 Summary Cards (Giống hệt ảnh 5: Viết mới | Tối ưu bài cũ | Xem xét giảm Ads | Theo dõi) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { code: 'WRITE_NEW' as const, label: 'Viết mới' },
              { code: 'OPTIMIZE_OLD' as const, label: 'Tối ưu bài cũ' },
              { code: 'REDUCE_ADS' as const, label: 'Xem xét giảm Ads' },
              { code: 'MONITOR' as const, label: 'Theo dõi' },
            ].map((item) => {
              const count = keywords.filter(
                (k) => getKeywordRecommendation(k).code === item.code,
              ).length;
              return (
                <div
                  key={item.code}
                  onClick={() =>
                    setKwGroupFilter((prev) => (prev === item.code ? 'ALL' : item.code))
                  }
                  className={`cursor-pointer bg-white border rounded-3xl p-5 shadow-2xs transition ${
                    kwGroupFilter === item.code
                      ? 'border-blue-400 ring-2 ring-blue-500/15'
                      : 'border-slate-200/80 hover:border-blue-200'
                  }`}
                >
                  <div className="text-sm font-medium text-slate-600">{item.label}</div>
                  <div className="font-display text-3xl font-bold text-slate-900 mt-3">
                    {count}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Từ khóa trong nhóm</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: NỘI DUNG SEO (CONTENT COMPOSE, REVIEW, REVISION HISTORY)
         ===================================================================== */}
      {mainTab === 'content' && (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-6">
          {/* Top Card Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 grid place-items-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-bold text-slate-900 text-base">
                  Quản lý nội dung SEO
                </h2>
                <p className="text-xs text-slate-500">
                  Soạn thảo, biên tập chuẩn SEO với AI Gemini, duyệt bài và xem lịch sử phiên bản.
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold">
              AI Gemini kết nối trực tiếp
            </span>
          </div>

          {/* Sub-tab Pill Bar: Soạn nội dung | Duyệt bài | Lịch sử phiên bản (Giống hệt ảnh 6 & 7) */}
          <div className="inline-flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl">
            {[
              { id: 'compose' as const, label: 'Soạn nội dung' },
              { id: 'review' as const, label: `Duyệt bài (${articles.length})` },
              {
                id: 'history' as const,
                label: `Lịch sử phiên bản (${allRevisionsFlat.length})`,
              },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setContentSubTab(st.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                  contentSubTab === st.id
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* SUB-TAB 3.1: SOẠN NỘI DUNG */}
          {contentSubTab === 'compose' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 8 Cols: Clean Form Editor */}
              <form
                onSubmit={(e) => void handleSaveRevision(e)}
                className="lg:col-span-8 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Chọn bài viết đang có để biên tập
                    </label>
                    <select
                      value={selectedArticleId || ''}
                      onChange={(e) => setSelectedArticleId(Number(e.target.value))}
                      className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm bg-white"
                    >
                      {articles.map((art) => (
                        <option key={art.id} value={art.id}>
                          #{art.id} • {art.title} ({SEO_ARTICLE_STATUS_LABELS[art.status]})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Chọn từ khóa đã nhập (để tạo bài mới bằng AI)
                    </label>
                    <select
                      value={selectedKeywordId}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        setSelectedKeywordId(id);
                        const found = keywords.find((k) => k.id === id);
                        if (found) {
                          setDraftWebsite(
                            (found.targetWebsite as TargetWebsite) || 'toantrung.com.vn',
                          );
                        }
                      }}
                      className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm bg-white"
                    >
                      {keywords.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.keywordText} ({k.targetWebsite})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Chủ đề bài viết (yêu cầu cho AI Gemini)
                    </label>
                    <input
                      type="text"
                      value={topicFocus}
                      onChange={(e) => setTopicFocus(e.target.value)}
                      placeholder="Nhập chủ đề cần triển khai (VD: Tư vấn màn hình LED P2.5 hội trường)..."
                      className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Website đích *
                    </label>
                    <select
                      value={draftWebsite}
                      onChange={(e) => setDraftWebsite(e.target.value as TargetWebsite)}
                      className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm bg-white"
                    >
                      {TARGET_WEBSITES.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tiêu đề SEO *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={selectedArticle?.status !== 'DRAFT'}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Tiêu đề bài viết chuẩn SEO..."
                    className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Meta description
                  </label>
                  <textarea
                    rows={2}
                    disabled={selectedArticle?.status !== 'DRAFT'}
                    value={editMeta}
                    onChange={(e) => setEditMeta(e.target.value)}
                    placeholder="Mô tả ngắn cho công cụ tìm kiếm (140 - 160 ký tự)..."
                    className="w-full p-3.5 rounded-2xl border border-slate-200 text-sm disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Nội dung bài viết *
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={selectedArticle?.status !== 'DRAFT'}
                        onClick={() =>
                          setEditContentHtml(
                            (prev) =>
                              `${prev}\n<h2>Tiêu đề phụ H2: ${
                                selectedKeywordObj?.keywordText || 'Giải pháp màn hình LED'
                              }</h2>\n<p>Nội dung phân tích chi tiết...</p>`,
                          )
                        }
                        className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-40"
                      >
                        Chèn H2
                      </button>
                      <button
                        type="button"
                        disabled={selectedArticle?.status !== 'DRAFT'}
                        onClick={() =>
                          setEditContentHtml(
                            (prev) =>
                              `${prev}\n<h3>Tiêu đề mục H3</h3>\n<ul><li>Thông số kỹ thuật 1</li><li>Thông số kỹ thuật 2</li></ul>`,
                          )
                        }
                        className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold disabled:opacity-40"
                      >
                        Chèn H3
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewHtmlMode((prev) => !prev)}
                        className="px-3 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold"
                      >
                        {previewHtmlMode ? 'Sửa mã HTML' : 'Xem trước hiển thị'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyArticleHtml(editTitle, editMeta, editContentHtml)
                        }
                        className="px-3 py-1 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy HTML</span>
                      </button>
                    </div>
                  </div>

                  {previewHtmlMode ? (
                    <div
                      className="w-full min-h-[260px] p-5 rounded-2xl border border-slate-200 bg-slate-50/50 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: editContentHtml }}
                    />
                  ) : (
                    <textarea
                      rows={10}
                      disabled={selectedArticle?.status !== 'DRAFT'}
                      value={editContentHtml}
                      onChange={(e) => setEditContentHtml(e.target.value)}
                      placeholder="Soạn nội dung chuẩn SEO..."
                      className="w-full p-4 rounded-2xl border border-slate-200 font-mono text-xs leading-relaxed disabled:bg-slate-50"
                    />
                  )}
                </div>

                {selectedArticle?.status === 'DRAFT' ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Ghi chú phiên bản chỉnh sửa (VD: Bổ sung bảng thông số P2.5)..."
                      className="flex-1 min-w-[220px] h-10 px-4 rounded-2xl border border-slate-200 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="h-10 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>Lưu phiên bản biên tập</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedArticle) {
                            setScheduleArticleId(selectedArticle.id);
                          }
                          setMainTab('schedule');
                        }}
                        className="h-10 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        <span>Duyệt &amp; Lập lịch đăng</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                    <span>
                      Bài viết này đang ở trạng thái{' '}
                      <strong>
                        {selectedArticle ? SEO_ARTICLE_STATUS_LABELS[selectedArticle.status] : ''}
                      </strong>{' '}
                      (đã khóa chỉnh sửa). Nếu muốn sửa lại, hãy bấm Rút duyệt về Nháp.
                    </span>
                    {selectedArticle && (
                      <button
                        type="button"
                        onClick={() => void handleWithdrawArticle(selectedArticle)}
                        className="px-3 py-1 rounded-xl bg-amber-600 text-white font-bold shrink-0"
                      >
                        Rút duyệt về Nháp
                      </button>
                    )}
                  </div>
                )}
              </form>

              {/* Right 4 Cols: ✨ Trợ lý SEO & Checklist On-page (Giống bố cục ảnh 6 & 7) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="rounded-3xl bg-purple-50/60 border border-purple-200/80 p-5 space-y-4">
                  <div className="flex items-center gap-2 text-purple-800 font-display font-bold text-sm">
                    <Sparkles className="w-4 h-4 text-purple-600" />
                    <span>Trợ lý SEO AI Gemini</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Khởi tạo bản nháp bài viết chuẩn SEO tự động từ từ khóa{' '}
                    <strong className="text-slate-900">
                      {selectedKeywordObj?.keywordText || 'đã chọn'}
                    </strong>{' '}
                    cho website <strong className="text-slate-900">{draftWebsite}</strong>.
                  </p>
                  <div className="p-3.5 rounded-2xl bg-white/90 border border-purple-100 text-xs text-slate-500 leading-relaxed">
                    Quyết định nội dung cuối cùng thuộc về Marketing. Không nhập thông tin nhạy cảm (SĐT/Email khách hàng) vào yêu cầu AI.
                  </div>
                  <button
                    type="button"
                    disabled={busy || !selectedKeywordId}
                    onClick={() => void handleGenerateAiDraft()}
                    className="w-full h-10 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-40"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>
                      {busy ? 'AI Gemini đang viết bài...' : '✨ Tạo bản nháp mới bằng AI Gemini'}
                    </span>
                  </button>
                </div>

                {/* Live On-page SEO Checklist */}
                {(() => {
                  const kwLower = (
                    selectedArticle?.keywordText ||
                    selectedKeywordObj?.keywordText ||
                    ''
                  )
                    .toLowerCase()
                    .trim();
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
                  const wordCount = plainText ? plainText.split(' ').length : 0;
                  const lengthOk = wordCount >= 120;
                  const passedCount = [titleOk, metaOk, h2Ok, lengthOk].filter(Boolean).length;

                  return (
                    <div className="rounded-3xl bg-white border border-slate-200/80 p-5 space-y-3.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">
                          Checklist Chuẩn SEO ({passedCount}/4)
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {wordCount} từ
                        </span>
                      </div>

                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          style={{ width: `${(passedCount / 4) * 100}%` }}
                          className="h-full rounded-full bg-emerald-500 transition-all"
                        />
                      </div>

                      <div className="space-y-2.5 text-xs">
                        {[
                          { ok: titleOk, label: 'Từ khóa có trong Tiêu đề SEO (H1)' },
                          { ok: metaOk, label: 'Từ khóa có trong Meta Description' },
                          { ok: h2Ok, label: 'Từ khóa có trong thẻ tiêu đề phụ <h2>' },
                          { ok: lengthOk, label: 'Độ dài nội dung tối thiểu (≥ 120 từ)' },
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <CheckCircle2
                              className={`w-4 h-4 shrink-0 ${
                                item.ok ? 'text-emerald-600' : 'text-slate-300'
                              }`}
                            />
                            <span
                              className={
                                item.ok ? 'text-slate-800 font-medium' : 'text-slate-400'
                              }
                            >
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* SUB-TAB 3.2: DUYỆT BÀI */}
          {contentSubTab === 'review' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-500">
                  Danh sách các bài viết SEO trong hệ thống ({filteredReviewArticles.length} bài)
                </div>
                <div className="flex items-center gap-1.5">
                  {[
                    { id: 'ALL', label: 'Tất cả' },
                    { id: 'DRAFT', label: 'Bản nháp' },
                    { id: 'APPROVED_SCHEDULED', label: 'Đã duyệt & Chờ lịch' },
                    { id: 'PUBLISHED', label: 'Đã đăng' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setReviewFilterStatus(f.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        reviewFilterStatus === f.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredReviewArticles.map((art) => (
                  <div
                    key={art.id}
                    className="p-5 rounded-3xl border border-slate-200/80 hover:border-blue-300 transition flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            art.status === 'PUBLISHED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : art.status === 'APPROVED_SCHEDULED'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {SEO_ARTICLE_STATUS_LABELS[art.status]}
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {art.targetWebsite} • v{art.version}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-slate-900 text-base">
                        {art.title}
                      </h3>
                      <p className="text-xs text-slate-500 line-clamp-2">
                        {art.metaDescription || 'Chưa có mô tả Meta Description'}
                      </p>
                      <div className="text-xs text-slate-500 pt-1">
                        Từ khóa: <strong className="text-slate-800">{art.keywordText}</strong> •{' '}
                        {art.revisions?.length || 1} phiên bản
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArticleId(art.id);
                            setContentSubTab('compose');
                          }}
                          className="h-8 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700"
                        >
                          Biên tập
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyArticleHtml(
                              art.title,
                              art.metaDescription,
                              art.contentHtml,
                            )
                          }
                          className="h-8 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700"
                        >
                          Copy HTML
                        </button>
                      </div>

                      {art.status === 'DRAFT' && (
                        <button
                          type="button"
                          onClick={() => {
                            setScheduleArticleId(art.id);
                            setScheduleWebsite(
                              (art.targetWebsite as TargetWebsite) || 'toantrung.com.vn',
                            );
                            setMainTab('schedule');
                            setScheduleSubTab('calendar');
                          }}
                          className="h-8 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                        >
                          Duyệt &amp; Lên lịch →
                        </button>
                      )}

                      {art.status === 'APPROVED_SCHEDULED' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleConfirmPublished(art)}
                            className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                          >
                            Xác nhận Đã đăng
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleWithdrawArticle(art)}
                            className="h-8 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold"
                          >
                            Rút duyệt
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SUB-TAB 3.3: LỊCH SỬ PHIÊN BẢN */}
          {contentSubTab === 'history' && (
            <div className="space-y-3">
              {allRevisionsFlat.map((item) => (
                <div
                  key={item.rev.id}
                  className="p-4 rounded-2xl border border-slate-200/80 hover:bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 font-mono text-xs font-bold">
                        Phiên bản #{item.rev.revisionNumber}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">
                        {item.articleTitle}
                      </span>
                      {item.approvedRevisionId === item.rev.id && (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                          Đã duyệt khóa
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Từ khóa: <strong>{item.keywordText}</strong> • Website:{' '}
                      <strong>{item.targetWebsite}</strong> •{' '}
                      {item.rev.isAiGenerated
                        ? 'Khởi tạo bởi AI Gemini'
                        : `Biên tập bởi ${item.rev.editedByName}`}
                    </p>
                    {item.rev.editorNote && (
                      <p className="text-xs text-slate-600 italic">“{item.rev.editorNote}”</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-400">
                      {new Date(item.rev.createdAt).toLocaleString('vi-VN')}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedArticleId(item.articleId);
                        setContentSubTab('compose');
                      }}
                      className="h-8 px-3 rounded-xl border border-slate-200 hover:bg-white text-xs font-bold text-slate-700"
                    >
                      Mở bài viết
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 4: LỊCH XUẤT BẢN & HIỆU QUẢ SEO (SCHEDULE & PERFORMANCE)
         ===================================================================== */}
      {mainTab === 'schedule' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-6">
            {/* Header + 2-Pill Sub-tab Switcher (Giống hệt ảnh 8: Lịch xuất bản | Hiệu quả SEO) */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 grid place-items-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-slate-900 text-base">
                    Lịch xuất bản &amp; hiệu quả SEO
                  </h2>
                  <p className="text-xs text-slate-500">
                    Quản lý lịch hẹn xuất bản nội bộ và theo dõi hiệu quả thứ hạng sau khi đăng bài.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setScheduleSubTab('calendar')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    scheduleSubTab === 'calendar'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Lịch xuất bản
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleSubTab('performance')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                    scheduleSubTab === 'performance'
                      ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hiệu quả SEO
                </button>
              </div>
            </div>

            {/* Notice Banner */}
            <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900">
              Lịch xuất bản được lưu trong Database để đội ngũ Marketing theo dõi tiến độ; hệ thống{' '}
              <strong>không tự động đẩy bài lên 3 website</strong>. Khi đến lịch, bạn bấm{' '}
              <strong>Copy HTML</strong> để đăng lên quản trị web và bấm{' '}
              <strong>Xác nhận Đã đăng</strong>.
            </div>

            {scheduleSubTab === 'calendar' ? (
              <div className="space-y-6">
                {/* Form Tạo lịch xuất bản (Giống hệt ảnh 8) */}
                <form
                  onSubmit={(e) => void handleScheduleSubmit(e)}
                  className="p-5 rounded-3xl border border-slate-200/80 space-y-4"
                >
                  <div className="text-sm font-bold text-slate-900">Tạo lịch xuất bản</div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                    <div className="md:col-span-6">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Bài viết cần lên lịch
                      </label>
                      <select
                        value={scheduleArticleId}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          setScheduleArticleId(id);
                          const art = articles.find((a) => a.id === id);
                          if (art) {
                            setScheduleWebsite(
                              (art.targetWebsite as TargetWebsite) || 'toantrung.com.vn',
                            );
                          }
                        }}
                        className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm bg-white"
                      >
                        {articles.map((a) => (
                          <option key={a.id} value={a.id}>
                            #{a.id} • {a.title} ({SEO_ARTICLE_STATUS_LABELS[a.status]})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Website đích
                      </label>
                      <select
                        value={scheduleWebsite}
                        onChange={(e) => setScheduleWebsite(e.target.value as TargetWebsite)}
                        className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm bg-white"
                      >
                        {TARGET_WEBSITES.map((w) => (
                          <option key={w} value={w}>
                            {w}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Ngày đăng
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="w-full sm:w-64">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Giờ đăng
                      </label>
                      <input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm"
                      />
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        disabled={busy || !scheduleArticleId}
                        className="h-10 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs disabled:opacity-40"
                      >
                        Lưu lịch xuất bản
                      </button>
                      <span className="text-xs text-slate-400">
                        {articles.filter((a) => a.status === 'DRAFT').length} bài nháp chờ lên lịch
                      </span>
                    </div>
                  </div>
                </form>

                {/* Danh sách lịch xuất bản */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-slate-900 text-sm">
                      Danh sách lịch xuất bản
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                      {
                        articles.filter(
                          (a) => a.status === 'APPROVED_SCHEDULED' || a.status === 'PUBLISHED',
                        ).length
                      }{' '}
                      lịch
                    </span>
                  </div>

                  {articles.filter(
                    (a) => a.status === 'APPROVED_SCHEDULED' || a.status === 'PUBLISHED',
                  ).length === 0 ? (
                    <div className="rounded-3xl bg-slate-50/70 border border-slate-200/70 p-10 text-center space-y-2">
                      <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 grid place-items-center mx-auto">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div className="font-bold text-slate-800 text-sm">Chưa có lịch xuất bản</div>
                      <p className="text-xs text-slate-500">
                        Chọn bài viết ở khung phía trên để duyệt và lập lịch xuất bản tại đây.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {articles
                        .filter(
                          (a) => a.status === 'APPROVED_SCHEDULED' || a.status === 'PUBLISHED',
                        )
                        .map((art) => (
                          <div
                            key={art.id}
                            className="p-4 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                    art.status === 'PUBLISHED'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {SEO_ARTICLE_STATUS_LABELS[art.status]}
                                </span>
                                <span className="font-bold text-slate-900 text-sm">
                                  {art.title}
                                </span>
                              </div>
                              <div className="text-xs text-slate-500">
                                Website đích: <strong>{art.targetWebsite}</strong> • Từ khóa:{' '}
                                <strong>{art.keywordText}</strong> •{' '}
                                {art.publishedAt
                                  ? `Đã đăng lúc: ${new Date(art.publishedAt).toLocaleString('vi-VN')}`
                                  : art.scheduledPublishAt
                                    ? `Lịch hẹn: ${new Date(art.scheduledPublishAt).toLocaleString('vi-VN')}`
                                    : ''}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyArticleHtml(
                                    art.title,
                                    art.metaDescription,
                                    art.contentHtml,
                                  )
                                }
                                className="h-8 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy HTML</span>
                              </button>

                              {art.status === 'APPROVED_SCHEDULED' && (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleConfirmPublished(art)}
                                    className="h-8 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                                  >
                                    Xác nhận Đã đăng
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void handleWithdrawArticle(art)}
                                    className="h-8 px-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold"
                                  >
                                    Rút duyệt
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* SUB-TAB 4.2: HIỆU QUẢ SEO SAU XUẤT BẢN */
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 text-slate-500 border-y border-slate-100 text-xs">
                        <th className="py-3.5 px-4 font-semibold min-w-[240px]">Bài viết SEO</th>
                        <th className="py-3.5 px-3 font-semibold">Website</th>
                        <th className="py-3.5 px-3 font-semibold text-center">Trạng thái</th>
                        <th className="py-3.5 px-3 font-semibold text-right">Click 30 ngày</th>
                        <th className="py-3.5 px-3 font-semibold text-center">Vị trí TB 30 ngày</th>
                        <th className="py-3.5 px-3 font-semibold text-center">Đánh giá tối ưu</th>
                        <th className="py-3.5 px-4 font-semibold text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {articles.map((art) => (
                        <tr key={art.id} className="hover:bg-slate-50/60">
                          <td className="py-4 px-4">
                            <div className="font-bold text-slate-900">{art.title}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Từ khóa: {art.keywordText}
                            </div>
                          </td>
                          <td className="py-4 px-3 text-slate-600">{art.targetWebsite}</td>
                          <td className="py-4 px-3 text-center">
                            <span
                              className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                art.status === 'PUBLISHED'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {SEO_ARTICLE_STATUS_LABELS[art.status]}
                            </span>
                          </td>
                          <td className="py-4 px-3 text-right tabular-nums font-bold text-emerald-700">
                            {(art.organicClicks30d || 0).toLocaleString('vi-VN')}
                          </td>
                          <td className="py-4 px-3 text-center tabular-nums font-semibold">
                            {art.avgPosition30d ? `#${art.avgPosition30d.toFixed(1)}` : '—'}
                          </td>
                          <td className="py-4 px-3 text-center">
                            {art.needsOptimization ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Cần tối ưu bài cũ (&gt;30 ngày)</span>
                              </span>
                            ) : art.status === 'PUBLISHED' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Thứ hạng tốt</span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Chưa đăng</span>
                            )}
                          </td>
                          <td className="py-4 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedArticleId(art.id);
                                setMainTab('content');
                                setContentSubTab('compose');
                              }}
                              className="h-8 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700"
                            >
                              Mở tối ưu bài
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Info Card: Quy trình vận hành thực tế (Giống bố cục ảnh 9) */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-sky-50 text-sky-600 grid place-items-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900 text-sm">
                  Cơ chế vận hành Lịch xuất bản &amp; Đồng bộ số liệu
                </h3>
                <p className="text-xs text-slate-500">
                  Đảm bảo an toàn tuyệt đối cho 3 website chính thức của Toàn Trung
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed pt-1">
              Lịch xuất bản được lưu trữ tập trung trên PostgreSQL để đội ngũ Marketing kiểm soát tiến độ nhưng không tự động đẩy bài trực tiếp ra ngoài website. Sau khi biên tập viên sao chép mã HTML chuẩn SEO đăng lên CMS của từng web và bấm &ldquo;Xác nhận Đã đăng&rdquo;, hệ thống sẽ bắt đầu chu kỳ 30 ngày theo dõi lượt nhấp Organic và vị trí trung bình để cảnh báo các bài cần tối ưu lại.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
