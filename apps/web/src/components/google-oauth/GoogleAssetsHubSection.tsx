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
  activeUsers: number;
  pageViews: number;
  eventCount: number;
  topPages: Array<{ path: string; views: number; avgDurationSec: number }>;
}

export interface GoogleAssetSearchConsoleSite {
  siteUrl: string;
  domain: string;
  totalQueries: number;
  totalClicks: number;
  totalImpressions: number;
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
    status: 'ACTIVE_SPEND' | 'ZERO_SPEND_READY' | 'DISCONNECTED';
    activeCampaignsCount: number;
    totalSpendVnd: number;
    statusMessage: string;
  };
  googleTrends: {
    marketCluster: string;
    topics: GoogleTrendsTopic[];
  };
}

interface Props {
  hub?: GoogleAssetsHubDto;
}

export function GoogleAssetsHubSection({ hub }: Props) {
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
            <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
              Bảng Điều Khiển 4 Cột Trụ Google Thực Tế
              <span className="text-xs bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 px-2 py-0.5 rounded-full font-medium">
                100% Real Live Google Data
              </span>
            </h3>
            <p className="text-xs text-slate-300">
              Tài khoản kết nối: <strong>{hub.connectedEmail || 'Chưa kết nối'}</strong> • Phân loại rõ ràng: GA4 (4 Website) • Search Console • Google Trends • Google Ads
            </p>
          </div>
        </div>

        {/* 4 Tabs Navigation */}
        <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('GA4')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'GA4'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'SEARCH_CONSOLE'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'TRENDS'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'ADS'
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Google Ads</span>
          </button>
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
              return (
                <button
                  key={prop.id}
                  type="button"
                  onClick={() => setSelectedGa4Index(idx)}
                  className={`text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="font-bold text-xs sm:text-sm text-slate-800 truncate" title={prop.name}>
                      {prop.name}
                    </span>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                      ID: {prop.id}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[11px] text-slate-500 block">Người dùng</span>
                      <strong className="text-emerald-700 text-sm font-display font-bold">
                        {prop.activeUsers.toLocaleString('vi-VN')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">Lượt xem</span>
                      <strong className="text-ink text-sm font-display font-bold">
                        {prop.pageViews.toLocaleString('vi-VN')}
                      </strong>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

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
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    selectedScIndex === sIdx
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
              <div className="bg-slate-100/80 px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700">
                <span>Website: <strong>{currentSc.siteUrl}</strong></span>
                <span className="text-slate-500">
                  {currentSc.totalQueries} từ khóa • {currentSc.totalClicks} Lượt click • {currentSc.totalImpressions.toLocaleString('vi-VN')} Lượt hiển thị
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
              <span>Google Trends — Phân Tích Xu Hướng Ngành Hàng Màn Hình LED</span>
            </h4>
            <p className="text-xs text-slate-500">
              Đo lường mức độ quan tâm của thị trường Việt Nam đối với các dòng sản phẩm của Công ty Toàn Trung:
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hub.googleTrends.topics.map((t, tIdx) => (
              <div key={tIdx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-slate-800">{t.topic}</span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      t.trend === 'rising'
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
              <span className="text-xs text-slate-500 block">Chi phí Google Ads tháng này</span>
              <strong className="text-base font-bold text-slate-900 block mt-1">
                {hub.googleAds.totalSpendVnd.toLocaleString('vi-VN')} đ
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

