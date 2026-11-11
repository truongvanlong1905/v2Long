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
  const [mainTab, setMainTab] = useState<'overview' | 'keywords' | 'content'>('overview');
  const [wordViewMode, setWordViewMode] = useState<'preview' | 'editor'>('preview');
  const [contentSubTab, setContentSubTab] = useState<'compose' | 'review' | 'history'>('compose');
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

  const topSearchConsoleKeywords = useMemo(() => {
    return [...keywords]
      .filter((k) => (k.cachedOrganicClicks || 0) > 0 || (k.cachedSearchVolume || 0) > 0)
      .sort((a, b) => {
        const clickDiff = (b.cachedOrganicClicks || 0) - (a.cachedOrganicClicks || 0);
        if (clickDiff !== 0) return clickDiff;
        return (b.cachedSearchVolume || 0) - (a.cachedSearchVolume || 0);
      });
  }, [keywords]);

  const handleSelectKeywordForWordStudio = (kw: SeoKeywordItemDto) => {
    setSelectedKeywordId(kw.id);
    setDraftWebsite((kw.targetWebsite as TargetWebsite) || 'toantrung.com.vn');
    setTopicFocus(`Tư vấn thông số kỹ thuật, ứng dụng và báo giá ${kw.keywordText}`);
    setMainTab('content');
    setContentSubTab('compose');
    setWordViewMode('preview');
    const existingArt = articles.find(
      (a) => a.keywordId === kw.id || a.keywordText === kw.keywordText,
    );
    if (existingArt) {
      setSelectedArticleId(existingArt.id);
    }
    setFeedbackMsg(`🎯 Đã chọn từ khóa "${kw.keywordText}" cho xưởng soạn thảo Word!`);
  };

  const handleDownloadWordDoc = () => {
    const title = editTitle.trim() || selectedArticle?.title || 'Tài liệu chuẩn SEO Toàn Trung';
    const keyword = selectedArticle?.keywordText || selectedKeywordObj?.keywordText || 'Màn hình LED';
    const website = draftWebsite || 'toantrung.com.vn';
    const meta = editMeta.trim() || selectedArticle?.metaDescription || 'Tài liệu kỹ thuật và bài viết SEO B2B Toàn Trung.';
    const content = editContentHtml || selectedArticle?.contentHtml || '<p>Nội dung bài viết chưa được khởi tạo.</p>';

    const fullHtml = `<!DOCTYPE html>
<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${title}</title>
<style>
  @page {
    size: 21cm 29.7cm;
    margin: 2.5cm 2.5cm 2.5cm 2.5cm;
    mso-page-orientation: portrait;
  }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 13pt;
    line-height: 1.6;
    color: #1a1a1a;
  }
  .header-table {
    width: 100%;
    border-bottom: 2pt solid #0f172a;
    padding-bottom: 8pt;
    margin-bottom: 18pt;
  }
  .company-title {
    font-size: 11pt;
    font-weight: bold;
    color: #0f172a;
    text-transform: uppercase;
  }
  .company-sub {
    font-size: 9pt;
    color: #475569;
  }
  h1 {
    font-size: 18pt;
    font-weight: bold;
    color: #0f172a;
    text-align: center;
    margin-top: 14pt;
    margin-bottom: 12pt;
    line-height: 1.3;
  }
  h2 {
    font-size: 14pt;
    font-weight: bold;
    color: #1e3a8a;
    margin-top: 16pt;
    margin-bottom: 6pt;
    border-bottom: 1pt solid #cbd5e1;
    padding-bottom: 3pt;
  }
  h3 {
    font-size: 13pt;
    font-weight: bold;
    color: #334155;
    margin-top: 12pt;
    margin-bottom: 4pt;
  }
  p {
    margin: 6pt 0;
    text-align: justify;
    text-justify: inter-word;
  }
  .meta-box {
    background-color: #f8fafc;
    border: 1pt solid #cbd5e1;
    padding: 10pt 12pt;
    margin-bottom: 16pt;
    font-size: 10.5pt;
  }
  table.content-table, table {
    border-collapse: collapse;
    width: 100%;
    margin: 12pt 0;
  }
  table th, table td {
    border: 1pt solid #94a3b8;
    padding: 6pt 8pt;
    font-size: 11pt;
  }
  table th {
    background-color: #f1f5f9;
    font-weight: bold;
  }
  ul, ol {
    margin: 6pt 0;
    padding-left: 20pt;
  }
  li {
    margin-bottom: 4pt;
  }
  .footer-note {
    margin-top: 30pt;
    border-top: 1pt solid #cbd5e1;
    padding-top: 8pt;
    font-size: 9pt;
    color: #64748b;
    text-align: center;
  }
</style>
</head>
<body>
  <table class="header-table" style="width: 100%; border-collapse: collapse; border: none;">
    <tr>
      <td style="border: none; vertical-align: top;">
        <div class="company-title">CÔNG TY CỔ PHẦN ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG</div>
        <div class="company-sub">61 Hoàng Hoa Thám, P.13, Q.Tân Bình, TP. Hồ Chí Minh • Hotline: (028) 38 123 456</div>
      </td>
      <td style="border: none; text-align: right; vertical-align: top;">
        <div style="font-size: 9.5pt; font-weight: bold; color: #1e3a8a;">TÀI LIỆU NỘI DUNG SEO B2B</div>
        <div style="font-size: 8.5pt; color: #64748b;">Ngày tạo: ${new Date().toLocaleDateString('vi-VN')}</div>
      </td>
    </tr>
  </table>

  <h1>${title}</h1>

  <div class="meta-box">
    <div><strong>Từ khóa mục tiêu:</strong> ${keyword}</div>
    <div><strong>Website mục tiêu:</strong> ${website}</div>
    <div><strong>Mô tả Meta Description:</strong> ${meta}</div>
  </div>

  <div>
    ${content}
  </div>

  <div class="footer-note">
    Toàn Trung Telecom &amp; Electronics JSC — Tài liệu nội dung số lưu hành nội bộ — https://${website}
  </div>
</body>
</html>`;

    const blob = new Blob(['\ufeff', fullHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = title
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);
    a.download = `${safeTitle || 'Bai_viet_SEO'}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setFeedbackMsg(`📥 Đã tải file Microsoft Word "${a.download}" thành công!`);
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
    overview: 'Báo cáo Top Từ khóa',
    keywords: 'Danh sách Từ khóa SEO',
    content: 'Soạn bài AI & Xem trước Word',
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

      {/* ==================== TOP HEADER CARD + 3-TAB PILL NAVIGATION ==================== */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              Quảng cáo, Từ khóa &amp; Báo cáo SEO
            </h1>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
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

        {/* 3-Tab Pill Navigation Bar (Clean Soft Segmented Container) */}
        <div className="bg-slate-100/80 p-1.5 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {[
            {
              id: 'overview' as const,
              title: 'Báo cáo Top Từ khóa',
              subtitle: 'Lượt tìm kiếm Search Console',
              icon: BarChart3,
            },
            {
              id: 'keywords' as const,
              title: 'Danh sách Từ khóa SEO',
              subtitle: 'Kho từ khóa & Chỉ số chi tiết',
              icon: Search,
            },
            {
              id: 'content' as const,
              title: 'Soạn bài AI & Xem trước Word',
              subtitle: 'Tự động viết, chỉnh sửa & tải .doc',
              icon: FileText,
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

          {/* ================= BÁO CÁO TOP TỪ KHÓA TÌM KIẾM NHIỀU NHẤT (SEARCH CONSOLE) ================= */}
          <div className="bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-2xs space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 grid place-items-center">
                  <Target className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-slate-900 text-base">
                    Báo cáo Top Từ khóa Được Tìm Kiếm &amp; Nhấp Nhiều Nhất (Google Search Console)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Dữ liệu thực tế từ Google Search Console các website Toàn Trung (toantrung.com.vn, manhinhled.net.vn, bangled.vn)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
                  {topSearchConsoleKeywords.length} từ khóa ghi nhận lưu lượng thực tế
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs">
                    <th className="py-3 px-3 font-bold text-center w-12">#</th>
                    <th className="py-3 px-4 font-bold">Từ khóa tìm kiếm (Search Query)</th>
                    <th className="py-3 px-3 font-bold">Website đích</th>
                    <th className="py-3 px-3 font-bold text-right">Lượt Click thật</th>
                    <th className="py-3 px-3 font-bold text-right">Lượt Hiển thị</th>
                    <th className="py-3 px-3 font-bold text-center">Tỷ lệ CTR</th>
                    <th className="py-3 px-3 font-bold text-center">Vị trí TB</th>
                    <th className="py-3 px-4 font-bold text-center">Hành động Soạn thảo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topSearchConsoleKeywords.slice(0, 15).map((kw, idx) => {
                    const ctr =
                      kw.cachedSearchVolume && kw.cachedOrganicClicks
                        ? `${((kw.cachedOrganicClicks / kw.cachedSearchVolume) * 100).toFixed(1)}%`
                        : '—';
                    return (
                      <tr key={kw.id} className="hover:bg-blue-50/40 transition">
                        <td className="py-3 px-3 text-center text-xs font-mono font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-slate-900">{kw.keywordText}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-medium">
                            {kw.targetWebsite}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            {(kw.cachedOrganicClicks || 0).toLocaleString('vi-VN')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-slate-700">
                          {(kw.cachedSearchVolume || 0).toLocaleString('vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-xs text-blue-700 font-semibold">
                          {ctr}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-xs text-slate-600">
                          {kw.cachedAvgPosition ? `#${kw.cachedAvgPosition.toFixed(1)}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleSelectKeywordForWordStudio(kw)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-2xs"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>✨ Soạn bài AI Word</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
          TAB 3: SOẠN BÀI AI & XEM TRƯỚC WORD (AI GENERATION & MICROSOFT WORD PREVIEW)
         ===================================================================== */}
      {mainTab === 'content' && (
        <div className="space-y-6">
          {/* Top Control Bar: Keyword Selection, AI Trigger, Mode Switcher, Word Download */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-700 grid place-items-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-slate-900 text-base">
                    Xưởng Soạn Thảo Chuẩn SEO &amp; Bản Xem Trước Microsoft Word
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tự động tạo bài viết chuẩn SEO bằng AI Gemini, xem trước trang Word A4 thực tế và tải file .doc
                  </p>
                </div>
              </div>

              {/* View Mode Toggle: [📄 Xem trang Word] vs [✏️ Sửa văn bản] */}
              <div className="inline-flex items-center gap-1 bg-slate-100/90 p-1.5 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setWordViewMode('preview')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                    wordViewMode === 'preview'
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>📄 Xem trước trang Word</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWordViewMode('editor')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition ${
                    wordViewMode === 'editor'
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileEdit className="w-3.5 h-3.5" />
                  <span>✏️ Chỉnh sửa văn bản</span>
                </button>
              </div>
            </div>

            {/* Row: Quick AI Generator Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end">
              <div className="sm:col-span-4">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Chọn từ khóa Search Console / Database
                </label>
                <select
                  value={selectedKeywordId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setSelectedKeywordId(id);
                    const found = keywords.find((k) => k.id === id);
                    if (found) {
                      setDraftWebsite((found.targetWebsite as TargetWebsite) || 'toantrung.com.vn');
                    }
                  }}
                  className="w-full h-11 px-3.5 rounded-2xl border border-slate-200 text-sm bg-white font-medium"
                >
                  {keywords.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.keywordText} ({k.targetWebsite} • {k.cachedOrganicClicks || 0} clicks)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Website đích
                </label>
                <select
                  value={draftWebsite}
                  onChange={(e) => setDraftWebsite(e.target.value as TargetWebsite)}
                  className="w-full h-11 px-3.5 rounded-2xl border border-slate-200 text-sm bg-white font-medium"
                >
                  {TARGET_WEBSITES.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Chủ đề / Yêu cầu AI (tùy chọn)
                </label>
                <input
                  type="text"
                  value={topicFocus}
                  onChange={(e) => setTopicFocus(e.target.value)}
                  placeholder="VD: Báo giá & hướng dẫn chọn LED..."
                  className="w-full h-11 px-3.5 rounded-2xl border border-slate-200 text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="button"
                  disabled={busy || !selectedKeywordId}
                  onClick={() => void handleGenerateAiDraft()}
                  className="w-full h-11 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition disabled:opacity-40"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{busy ? 'Đang viết bài...' : '✨ AI Viết tự động'}</span>
                </button>
              </div>
            </div>

            {/* Quick Export & Management Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Bài viết đang chọn:</span>
                <select
                  value={selectedArticleId || ''}
                  onChange={(e) => setSelectedArticleId(Number(e.target.value))}
                  className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-bold bg-white max-w-[280px] truncate"
                >
                  {articles.map((art) => (
                    <option key={art.id} value={art.id}>
                      #{art.id} • {art.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadWordDoc}
                  className="h-9 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition"
                >
                  <Download className="w-3.5 h-3.5 text-blue-300" />
                  <span>Tải file Word (.doc)</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyArticleHtml(editTitle, editMeta, editContentHtml)}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-600" />
                  <span>Sao chép nội dung</span>
                </button>
              </div>
            </div>
          </div>

          {/* ================= VIEW MODE 1: MICROSOFT WORD A4 PREVIEW ================= */}
          {wordViewMode === 'preview' && (
            <div className="space-y-4">
              {/* Word Desktop Canvas */}
              <div className="bg-slate-200/90 py-10 px-2 sm:px-6 flex justify-center rounded-3xl border border-slate-300 overflow-x-auto shadow-inner">
                {/* White A4 Sheet */}
                <div className="bg-white w-full max-w-[820px] min-h-[1120px] shadow-2xl p-10 sm:p-16 border border-slate-300 relative text-slate-800 font-serif leading-relaxed">
                  {/* Top Letterhead */}
                  <div className="border-b-2 border-slate-900 pb-3 mb-6 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-900">
                        CÔNG TY CỔ PHẦN ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG
                      </div>
                      <div className="text-[11px] text-slate-500 font-sans mt-0.5">
                        61 Hoàng Hoa Thám, P.13, Q. Tân Bình, TP.HCM • Hotline: (028) 38 123 456
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-blue-900 font-sans uppercase">
                        Tài liệu SEO B2B
                      </div>
                      <div className="text-[11px] text-slate-500 font-sans">
                        Ngày: {new Date().toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  {/* Document Title */}
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center my-6 leading-snug">
                    {editTitle || 'TIÊU ĐỀ BÀI VIẾT CHUẨN SEO'}
                  </h1>

                  {/* Meta Callout Box */}
                  <div className="bg-slate-50 border border-slate-300 p-4 rounded-lg my-6 text-xs sm:text-sm font-sans space-y-1.5 text-slate-700">
                    <div>
                      <span className="font-bold text-slate-900">Từ khóa SEO chính:</span>{' '}
                      <span className="text-blue-800 font-semibold">
                        {selectedArticle?.keywordText || selectedKeywordObj?.keywordText || 'Chưa chọn'}
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">Website mục tiêu:</span>{' '}
                      <span>{draftWebsite}</span>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900">Meta Description:</span>{' '}
                      <span className="italic">
                        {editMeta || 'Chưa có mô tả ngắn Meta Description.'}
                      </span>
                    </div>
                  </div>

                  {/* Body Content */}
                  <div
                    className="prose prose-slate max-w-none text-slate-800 text-justify text-sm sm:text-base leading-relaxed [&>h2]:text-xl [&>h2]:font-bold [&>h2]:text-slate-900 [&>h2]:border-b [&>h2]:border-slate-200 [&>h2]:pb-1.5 [&>h2]:mt-6 [&>h2]:mb-3 [&>h3]:text-base [&>h3]:font-bold [&>h3]:text-slate-800 [&>h3]:mt-4 [&>h3]:mb-2 [&>p]:my-3 [&>table]:w-full [&>table]:border-collapse [&>table]:my-4 [&>table_th]:border [&>table_th]:border-slate-300 [&>table_th]:p-2.5 [&>table_th]:bg-slate-100 [&>table_th]:font-bold [&>table_td]:border [&>table_td]:border-slate-300 [&>table_td]:p-2.5"
                    dangerouslySetInnerHTML={{
                      __html:
                        editContentHtml ||
                        '<p>Chưa có nội dung bài viết. Hãy bấm "✨ AI Viết tự động" để AI tạo bài viết hoàn chỉnh.</p>',
                    }}
                  />

                  {/* Footer of the Word Page */}
                  <div className="mt-16 pt-4 border-t border-slate-300 text-[11px] font-sans text-slate-500 text-center">
                    Trang 1 / 1 • Lưu hành nội bộ Công ty Cổ phần Điện tử Viễn thông Toàn Trung — https://{draftWebsite}
                  </div>
                </div>
              </div>

              {/* Floating Quick Action Bar below Word Preview */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setWordViewMode('editor')}
                  className="h-10 px-5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold inline-flex items-center gap-2 shadow-xs"
                >
                  <FileEdit className="w-4 h-4 text-blue-600" />
                  <span>Chuyển sang chế độ Sửa nội dung</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownloadWordDoc}
                  className="h-10 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-2 shadow-xs"
                >
                  <Download className="w-4 h-4 text-blue-300" />
                  <span>Tải file Word (.doc) về máy</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= VIEW MODE 2: DIRECT EDITOR ================= */}
          {wordViewMode === 'editor' && (
            <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-2xs space-y-5">
              <form onSubmit={(e) => void handleSaveRevision(e)} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Tiêu đề bài viết (H1) *
                  </label>
                  <input
                    type="text"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Tiêu đề bài viết..."
                    className="w-full h-11 px-4 rounded-2xl border border-slate-200 text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Meta Description
                  </label>
                  <textarea
                    rows={2}
                    value={editMeta}
                    onChange={(e) => setEditMeta(e.target.value)}
                    placeholder="Mô tả tóm tắt cho công cụ tìm kiếm..."
                    className="w-full p-3.5 rounded-2xl border border-slate-200 text-sm"
                  />
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="block text-xs font-bold text-slate-700">
                      Nội dung chi tiết (HTML / Văn bản) *
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditContentHtml(
                            (prev) =>
                              `${prev}\n<h2>Tiêu đề phụ H2: ${
                                selectedKeywordObj?.keywordText || 'Giải pháp màn hình LED'
                              }</h2>\n<p>Nội dung phân tích chi tiết...</p>`,
                          )
                        }
                        className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                      >
                        + Chèn H2
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditContentHtml(
                            (prev) =>
                              `${prev}\n<h3>Tiêu đề mục H3</h3>\n<ul><li>Thông số kỹ thuật 1</li><li>Thông số kỹ thuật 2</li></ul>`,
                          )
                        }
                        className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                      >
                        + Chèn H3
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditContentHtml(
                            (prev) =>
                              `${prev}\n<table class="content-table"><thead><tr><th>Thông số</th><th>Mô tả chi tiết</th></tr></thead><tbody><tr><td>Khoảng cách điểm ảnh</td><td>P2.5 mm</td></tr><tr><td>Độ sáng</td><td>&ge; 800 cd/m&sup2;</td></tr><tr><td>Tần số quét</td><td>3840 Hz</td></tr></tbody></table>`,
                          )
                        }
                        className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                      >
                        + Chèn Bảng kỹ thuật
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={14}
                    value={editContentHtml}
                    onChange={(e) => setEditContentHtml(e.target.value)}
                    placeholder="Soạn nội dung bài viết..."
                    className="w-full p-4 rounded-2xl border border-slate-200 font-mono text-xs leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Ghi chú phiên bản (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    placeholder="VD: Cập nhật thông số P2.5, sửa bảng giá..."
                    className="w-full h-10 px-4 rounded-2xl border border-slate-200 text-xs"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setWordViewMode('preview')}
                    className="h-10 px-5 rounded-2xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem lại trang Word</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="h-10 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
                    >
                      <FileEdit className="w-3.5 h-3.5" />
                      <span>{busy ? 'Đang lưu...' : 'Lưu phiên bản chỉnh sửa'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadWordDoc}
                      className="h-10 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs"
                    >
                      <Download className="w-3.5 h-3.5 text-white" />
                      <span>Tải file Word (.doc)</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    
</div>
  );
}
