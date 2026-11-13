'use client';

import React, { useState } from 'react';
import {
  Globe,
  Search,
  TrendingUp,
  Target,
  ExternalLink,
  Users,
  Eye,
  Activity,
  MousePointerClick,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';

export interface GoogleAssetGa4Property {
  id: string;
  name: string;
  domain: string;
  url: string;
  activeUsers: number | null;
  pageViews: number | null;
  eventCount: number | null;
  status?:
    | 'HAS_DATA'
    | 'CONFIRMED_ZERO'
    | 'FAILED_SYNC'
    | 'STALE_DATA_WITH_ERROR'
    | 'LEGACY_UNVERIFIED'
    | 'NOT_SYNCED'
    | 'NOT_CONNECTED';
  statusMessage?: string;
  source?: string;
  reportingPeriod?: string;
  lastSyncAt?: string | null;
  isEstimatedPeriodUsers?: boolean;
  isPartialDay?: boolean;
  topPages: Array<{ path: string; views: number; avgDurationSec: number }>;
}

export interface GoogleAssetSearchConsoleSite {
  siteUrl: string;
  domain: string;
  totalQueries: number;
  totalClicks: number | null;
  totalImpressions: number | null;
  status?:
    | 'HAS_DATA'
    | 'CONFIRMED_ZERO'
    | 'KEYWORD_ONLY'
    | 'FAILED_SYNC'
    | 'STALE_DATA_WITH_ERROR'
    | 'NOT_SYNCED'
    | 'NOT_CONNECTED';
  statusMessage?: string;
  source?: string;
  reportingPeriod?: string;
  lastSyncAt?: string | null;
  topQueries: Array<{
    keyword: string;
    clicks: number;
    impressions: number;
    ctrText: string;
  }>;
}

export interface GoogleTrendsTopic {
  topic: string;
  interestScore: number;
  trend: 'rising' | 'stable' | 'declining';
  searchQuery: string;
}

export interface GoogleAssetsHubDto {
  connectedEmail: string | null;
  connectedName: string | null;
  lastSyncAt: string | null;
  ga4: {
    totalProperties: number;
    properties: GoogleAssetGa4Property[];
  };
  searchConsole: {
    totalSites: number;
    sites: GoogleAssetSearchConsoleSite[];
  };
  googleAds: {
    connectedEmail: string | null;
    customerId: string | null;
    status: 'ACTIVE_SPEND' | 'ZERO_SPEND_READY' | 'CONFIRMED_ZERO' | 'UNAVAILABLE' | 'UNCONFIGURED' | 'DISCONNECTED';
    activeCampaignsCount: number;
    totalSpendVnd: number | null;
    spendVndText?: string;
    statusMessage: string;
  };
  googleTrends: {
    marketCluster: string;
    topics: GoogleTrendsTopic[];
  };
}

interface Props {
  hub?: GoogleAssetsHubDto;
  periodDays?: number;
  onSelectPeriod?: (days: number) => void;
}

export function GoogleAssetsHubSection({ hub, periodDays = 30, onSelectPeriod }: Props) {
  const [activeTab, setActiveTab] = useState<'GA4' | 'SEARCH_CONSOLE' | 'TRENDS' | 'ADS'>('GA4');
  const [selectedGa4Index, setSelectedGa4Index] = useState(0);
  const [selectedScIndex, setSelectedScIndex] = useState(0);

  if (!hub) return null;

  const currentGa4 = hub.ga4.properties[selectedGa4Index] || hub.ga4.properties[0];
  const currentSc = hub.searchConsole.sites[selectedScIndex] || hub.searchConsole.sites[0];

  return (
    <div className="bg-white border-2 border-emerald-500/30 rounded-2xl shadow-sm overflow-hidden mb-6">
      {/* Header Hub Bar */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center font-bold text-lg text-emerald-300">
            G
          </div>
          <div>
            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2 flex-wrap">
              <span>Bảng Điều Khiển 4 Cột Trụ Google Thực Tế</span>
              <span className="inline-flex items-center gap-1.5 text-xs bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2.5 py-0.5 rounded-full font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                </span>
                <span>Dữ liệu GA4 & Search Console thực tế</span>
                <span className="flex items-end gap-0.5 h-3 ml-0.5">
                  <span className="w-0.5 bg-emerald-300 animate-equalizer-1" />
                  <span className="w-0.5 bg-emerald-300 animate-equalizer-2" />
                  <span className="w-0.5 bg-emerald-300 animate-equalizer-3" />
                </span>
              </span>
              <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-md font-bold font-mono">
                {periodDays} ngày qua
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              Tài khoản kết nối: <strong>{hub.connectedEmail || 'Chưa kết nối'}</strong> • Phân loại rõ ràng: GA4 (4 Website) • Search Console • Google Trends • Google Ads
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 4 Tabs Navigation */}
          <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('GA4')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'GA4'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>GA4 ({hub.ga4.totalProperties} Web)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('SEARCH_CONSOLE')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'SEARCH_CONSOLE'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Console ({hub.searchConsole.totalSites} Web)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('TRENDS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'TRENDS'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Google Trends</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ADS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${activeTab === 'ADS'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Google Ads</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tab 1: Google Analytics 4 (GA4) */}
      {activeTab === 'GA4' && (
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <span>Google Analytics 4 — Quản Lý Đa Website Công Ty Toàn Trung</span>
              </h4>
              <p className="text-xs text-slate-500">
                Nhấp vào từng trang web bên dưới để xem chi tiết lượng người dùng (Users), lượt xem trang (Pageviews) và Landing Pages thực tế:
              </p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md font-mono">
              Tổng cộng 4 thuộc tính GA4
            </span>
          </div>

          {/* 4 Websites Cards Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {hub.ga4.properties.map((prop, idx) => {
              const isSelected = selectedGa4Index === idx;
              const hasTraffic = (prop.activeUsers ?? (prop as any).sumDailyActiveUsers ?? 0) > 0;
              const isConfirmedZero = prop.status === 'CONFIRMED_ZERO';
              const isFailedSync = prop.status === 'FAILED_SYNC';
              const isStaleError = prop.status === 'STALE_DATA_WITH_ERROR';
              const isLegacySnapshot = prop.status === 'LEGACY_UNVERIFIED';
              const isNotSynced = prop.status === 'NOT_SYNCED';
              const isNotConnected = prop.status === 'NOT_CONNECTED';

              return (
                <button
                  key={prop.id}
                  type="button"
                  onClick={() => setSelectedGa4Index(idx)}
                  className={`relative text-left p-4 rounded-2xl border transition-all duration-200 transform ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/80 shadow-md ring-4 ring-emerald-500/15 scale-[1.01]'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="font-extrabold text-xs sm:text-sm text-slate-800 truncate" title={prop.name}>
                      {prop.name}
                    </span>
                    {isFailedSync ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold">
                        Lỗi đồng bộ
                      </span>
                    ) : isStaleError ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full font-bold">
                        Dữ liệu cũ (Lỗi)
                      </span>
                    ) : isLegacySnapshot ? (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                        Bản ghi lịch sử
                      </span>
                    ) : hasTraffic ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        GA4 Live
                      </span>
                    ) : isConfirmedZero ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
                        Xác nhận: 0
                      </span>
                    ) : isNotSynced ? (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                        Chưa đồng bộ
                      </span>
                    ) : isNotConnected ? (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        Chưa kết nối
                      </span>
                    ) : (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        ID: {prop.id}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Người dùng</span>
                      <strong className="text-emerald-700 text-base font-display font-extrabold">
                        {prop.activeUsers !== null ? prop.activeUsers.toLocaleString('vi-VN') : '--'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Lượt xem</span>
                      <strong className="text-slate-900 text-base font-display font-extrabold">
                        {prop.pageViews !== null ? prop.pageViews.toLocaleString('vi-VN') : '--'}
                      </strong>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Traceable Metadata & Explanation */}
          {currentGa4 && (
            <div className="text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2 px-1">
              <span>
                Nguồn: <strong>{currentGa4.source || `GA4 (${currentGa4.id})`}</strong> • Kỳ: <strong>{currentGa4.reportingPeriod || `${periodDays} ngày qua`}</strong> • {currentGa4.statusMessage}
              </span>
              {currentGa4.isEstimatedPeriodUsers && (
                <span className="text-amber-700 italic">
                  * Lượt người dùng hiển thị là tổng tích lũy daily active users (chưa khử trùng lặp khách ghé lại giữa các ngày)
                </span>
              )}
            </div>
          )}

          {/* Detailed Landing Pages for Selected GA4 Website */}
          {currentGa4 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-xs text-slate-700 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-600" />
                  Top trang được xem nhiều nhất trên <strong>{currentGa4.name}</strong>:
                </span>
                <a
                  href={currentGa4.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand hover:underline flex items-center gap-1"
                >
                  Mở trang web <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {currentGa4.topPages.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-2 px-3">Đường dẫn trang (Landing Page Path)</th>
                        <th className="py-2 px-3 text-right">Lượt xem thực tế</th>
                        <th className="py-2 px-3 text-right">Thời gian tương tác TB</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70">
                      {currentGa4.topPages.map((pg, pIdx) => (
                        <tr key={pIdx} className="hover:bg-white/60">
                          <td className="py-2 px-3 font-mono text-slate-700 max-w-xs truncate" title={pg.path}>
                            {pg.path}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-ink">
                            {pg.views.toLocaleString('vi-VN')}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">
                            {Math.round(pg.avgDurationSec)}s
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic py-2">
                  Thuộc tính này chưa có lượt xem trang trong kỳ 30 ngày qua hoặc đang trong giai đoạn khởi tạo.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Google Search Console */}
      {activeTab === 'SEARCH_CONSOLE' && (
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <span>Google Search Console — Từ Khóa & Lưu Lượng Tìm Kiếm Thực Tế</span>
              </h4>
              <p className="text-xs text-slate-500">
                Các từ khóa thực tế mà khách hàng tìm kiếm trên Google dẫn về các website của Toàn Trung:
              </p>
            </div>

            {/* Site selector pills */}
            <div className="flex items-center gap-1.5">
              {hub.searchConsole.sites.map((site, sIdx) => (
                <button
                  key={site.siteUrl}
                  type="button"
                  onClick={() => setSelectedScIndex(sIdx)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${selectedScIndex === sIdx
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                >
                  {site.domain}
                </button>
              ))}
            </div>
          </div>

          {currentSc && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-100/80 px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 flex-wrap gap-2">
                <span>Website: <strong>{currentSc.siteUrl}</strong> ({currentSc.source || 'Search Console API'})</span>
                <span className="text-slate-500">
                  {currentSc.totalQueries} từ khóa đã crawl • {
                    currentSc.totalClicks !== null
                      ? `${currentSc.totalClicks.toLocaleString('vi-VN')} Lượt click • ${(currentSc.totalImpressions ?? 0).toLocaleString('vi-VN')} Lượt hiển thị`
                      : currentSc.statusMessage || 'Chưa có bản ghi tổng site'
                  }
                </span>
              </div>

              <div className="overflow-x-auto max-h-72 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Từ khóa tìm kiếm (Search Query)</th>
                      <th className="py-2 px-3 text-right">Lượt Click Thật</th>
                      <th className="py-2 px-3 text-right">Lượt Hiển Thị</th>
                      <th className="py-2 px-3 text-right">Tỷ lệ CTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentSc.topQueries.map((q, qIdx) => (
                      <tr key={qIdx} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 font-medium text-slate-800">
                          {q.keyword}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-700">
                          {q.clicks}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-600">
                          {q.impressions.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                          {q.ctrText}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Google Trends */}
      {activeTab === 'TRENDS' && (
        <div className="p-5 space-y-4">
          <div>
            <h4 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-600" />
              <span>Google Trends — Phân Tích Xu Hướng Ngành Hàng</span>
            </h4>
            <p className="text-xs text-slate-500">
              Trạng thái tích hợp: {hub.googleTrends.marketCluster}
            </p>
          </div>

          {(!hub.googleTrends.topics || hub.googleTrends.topics.length === 0) ? (
            <div className="p-6 rounded-xl border border-slate-200 bg-slate-50/80 text-center space-y-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 text-slate-600 mb-1">
                <HelpCircle className="w-5 h-5" />
              </div>
              <h5 className="font-bold text-sm text-slate-800">Chưa kết nối Google Trends API chính thức</h5>
              <p className="text-xs text-slate-500 max-w-lg mx-auto">
                Google không cung cấp REST API công khai cho Google Trends qua xác thực OAuth thông thường. 
                Hệ thống chỉ báo cáo số liệu thực tế được xác minh từ Google Analytics 4 và Search Console, không tự động sinh dữ liệu xu hướng giả lập.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {hub.googleTrends.topics.map((t, tIdx) => (
                <div key={tIdx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-slate-800">{t.topic}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${t.trend === 'rising'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}
                    >
                      {t.trend === 'rising' ? '▲ Tăng trưởng' : '• Ổn định'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Mức độ quan tâm thị trường</span>
                      <strong className="text-ink font-bold">{t.interestScore}/100</strong>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-brand h-full rounded-full transition-all duration-500"
                        style={{ width: `${t.interestScore}%` }}
                      />
                    </div>
                  </div>

                  <span className="text-[11px] text-slate-500 block">
                    Cụm từ khóa đo lường: <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">{t.searchQuery}</code>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Google Ads */}
      {activeTab === 'ADS' && (
        <div className="p-5 space-y-4">
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-3 text-sm text-blue-900">
            <Target className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block text-blue-950 font-bold">
                Trạng thái tài khoản Google Ads:
              </strong>
              <p className="text-xs text-blue-800">
                {hub.googleAds.statusMessage}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500 block">Tài khoản kết nối</span>
              <strong className="text-sm font-bold text-slate-800 truncate block mt-1">
                {hub.googleAds.connectedEmail || 'Chưa kết nối'}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500 block">Chi phí Google Ads trong kỳ</span>
              <strong className="text-base font-bold text-slate-900 block mt-1">
                {hub.googleAds.totalSpendVnd !== null
                  ? `${hub.googleAds.totalSpendVnd.toLocaleString('vi-VN')} đ`
                  : (hub.googleAds.spendVndText || '—')}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500 block">Chiến dịch đang chạy</span>
              <strong className="text-base font-bold text-slate-900 block mt-1">
                {hub.googleAds.activeCampaignsCount} chiến dịch
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

