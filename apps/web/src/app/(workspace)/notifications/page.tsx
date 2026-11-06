'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronRight,
  Inbox,
  Info,
  Palette,
  RefreshCw,
  Search,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationDto } from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

type FilterId = 'all' | 'unread' | 'leads' | 'alerts' | 'reports' | 'design' | 'system';
type CategoryKey = Exclude<FilterId, 'all' | 'unread'>;

interface CategoryVisual {
  key: CategoryKey;
  label: string;
  Icon: LucideIcon;
  iconClass: string;
}

const CATEGORY_VISUALS: Record<CategoryKey, CategoryVisual> = {
  leads: { key: 'leads', label: 'Lead', Icon: UserPlus, iconClass: 'bg-blue-50 text-[#1E3A8A]' },
  alerts: { key: 'alerts', label: 'Cảnh báo', Icon: AlertTriangle, iconClass: 'bg-amber-50 text-amber-700' },
  reports: { key: 'reports', label: 'Báo cáo', Icon: BarChart3, iconClass: 'bg-emerald-50 text-emerald-700' },
  design: { key: 'design', label: 'Thiết kế', Icon: Palette, iconClass: 'bg-violet-50 text-violet-700' },
  system: { key: 'system', label: 'Hệ thống', Icon: Info, iconClass: 'bg-slate-100 text-slate-600' },
};

function classify(item: NotificationDto): CategoryKey {
  const text = `${item.category} ${item.title}`.toLowerCase();
  if (text.includes('cảnh báo') || text.includes('dò giá') || text.includes('quá hạn') || text.includes('pipeline'))
    return 'alerts';
  if (text.includes('báo cáo') || text.includes('đồng bộ')) return 'reports';
  if (text.includes('thiết kế') || text.includes('phối cảnh')) return 'design';
  if (text.includes('lead') || text.includes('kinh doanh')) return 'leads';
  return 'system';
}

function dayBucket(iso: string): 'today' | 'yesterday' | 'week' | 'older' {
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((start.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return 'week';
  return 'older';
}

const BUCKET_LABELS: Record<ReturnType<typeof dayBucket>, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  week: '7 ngày qua',
  older: 'Trước đó',
};

function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin} phút`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} ngày`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, setUnreadCountState } = useSession();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | 'all' | 'batch' | 'reload' | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const applyResponse = useCallback(
    (res: { items: NotificationDto[]; unreadCount: number }) => {
      setItems(res.items);
      setUnreadCount(res.unreadCount);
      setUnreadCountState(res.unreadCount);
    },
    [setUnreadCountState],
  );

  const loadNotifications = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiRequest<{ items: NotificationDto[]; unreadCount: number }>('/api/v1/notifications');
      applyResponse(res);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Không tải được thông báo.');
    } finally {
      setLoading(false);
    }
  }, [applyResponse]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markRead = useCallback(
    async (ids: number[] | 'all') => {
      if (!user) return;
      setActionError(null);
      setBusy(ids === 'all' ? 'all' : ids.length > 1 ? 'batch' : ids[0] ?? null);
      try {
        if (ids === 'all') {
          applyResponse(
            await apiRequest('/api/v1/notifications', {
              method: 'PATCH',
              csrfToken: user.csrfToken,
              body: { markAll: true },
            }),
          );
        } else {
          let last: { items: NotificationDto[]; unreadCount: number } | null = null;
          for (const id of ids) {
            last = await apiRequest('/api/v1/notifications', {
              method: 'PATCH',
              csrfToken: user.csrfToken,
              body: { notificationId: id },
            });
          }
          if (last) applyResponse(last);
        }
        setSelectedIds([]);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Không cập nhật được trạng thái đã đọc.');
      } finally {
        setBusy(null);
      }
    },
    [user, applyResponse],
  );

  const openItem = (item: NotificationDto) => {
    if (!item.isRead) void markRead([item.id]);
    if (item.actionUrl) router.push(item.actionUrl);
  };

  const enriched = useMemo(() => items.map((item) => ({ item, cat: classify(item) })), [items]);

  const counts = useMemo(() => {
    const c: Record<FilterId, number> = { all: 0, unread: 0, leads: 0, alerts: 0, reports: 0, design: 0, system: 0 };
    for (const { item, cat } of enriched) {
      c.all += 1;
      c[cat] += 1;
      if (!item.isRead) c.unread += 1;
    }
    return c;
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ item, cat }) => {
      if (filter === 'unread' && item.isRead) return false;
      if (filter !== 'all' && filter !== 'unread' && cat !== filter) return false;
      if (q && !`${item.title} ${item.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [enriched, filter, search]);

  const grouped = useMemo(() => {
    const order: Array<ReturnType<typeof dayBucket>> = ['today', 'yesterday', 'week', 'older'];
    const map = new Map<string, typeof filtered>();
    for (const entry of filtered) {
      const b = dayBucket(entry.item.createdAt);
      map.set(b, [...(map.get(b) || []), entry]);
    }
    return order.filter((b) => map.has(b)).map((b) => ({ bucket: b, entries: map.get(b)! }));
  }, [filtered]);

  const allVisibleSelected = filtered.length > 0 && filtered.every(({ item }) => selectedIds.includes(item.id));
  const selectedUnread = selectedIds.filter((id) => items.find((i) => i.id === id && !i.isRead));

  const FILTERS: Array<{ id: FilterId; label: string; Icon: LucideIcon }> = [
    { id: 'all', label: 'Tất cả', Icon: Inbox },
    { id: 'unread', label: 'Chưa đọc', Icon: Bell },
    { id: 'leads', label: 'Lead', Icon: UserPlus },
    { id: 'alerts', label: 'Cảnh báo', Icon: AlertTriangle },
    { id: 'reports', label: 'Báo cáo', Icon: BarChart3 },
    { id: 'design', label: 'Thiết kế', Icon: Palette },
    { id: 'system', label: 'Hệ thống', Icon: Info },
  ];

  return (
    <div className="space-y-5">
      {/* Tiêu đề trang gọn */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">Thông báo</h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading
              ? 'Đang tải…'
              : unreadCount > 0
                ? `${unreadCount} chưa đọc trong tổng số ${items.length} thông báo`
                : `Bạn đã đọc hết ${items.length} thông báo`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setBusy('reload');
              void loadNotifications().finally(() => setBusy(null));
            }}
            disabled={busy !== null}
            className="h-10 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 inline-flex items-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]"
          >
            <RefreshCw className={`w-4 h-4 ${busy === 'reload' ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
          <button
            type="button"
            disabled={busy !== null || unreadCount === 0}
            onClick={() => void markRead('all')}
            className="h-10 px-4 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E3A8A]"
          >
            <CheckCheck className="w-4 h-4" />
            {busy === 'all' ? 'Đang xử lý…' : 'Đánh dấu tất cả đã đọc'}
          </button>
        </div>
      </header>

      {actionError && (
        <div role="alert" className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-5 items-start">
        {/* Bộ lọc kiểu hộp thư */}
        <nav aria-label="Bộ lọc thông báo" className="lg:sticky lg:top-20">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto pb-1 lg:pb-0">
            {FILTERS.map(({ id, label, Icon }) => {
              const active = filter === id;
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      setFilter(id);
                      setSelectedIds([]);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] ${
                      active
                        ? 'bg-blue-50 text-[#1E3A8A] font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 text-left whitespace-nowrap">{label}</span>
                    {counts[id] > 0 && (
                      <span
                        className={`min-w-[24px] px-1.5 py-0.5 rounded-full text-xs font-semibold text-center ${
                          id === 'unread'
                            ? 'bg-[#1E3A8A] text-white'
                            : active
                              ? 'bg-white text-[#1E3A8A]'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {counts[id]}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Danh sách */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Thanh công cụ */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-200">
            <label className="inline-flex items-center" title="Chọn tất cả">
              <input
                type="checkbox"
                aria-label="Chọn tất cả thông báo đang hiển thị"
                checked={allVisibleSelected}
                disabled={filtered.length === 0}
                onChange={(e) =>
                  setSelectedIds(e.target.checked ? filtered.map(({ item }) => item.id) : [])
                }
                className="w-4 h-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
              />
            </label>
            {selectedIds.length > 0 ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-600">Đã chọn {selectedIds.length}</span>
                <button
                  type="button"
                  disabled={busy !== null || selectedUnread.length === 0}
                  onClick={() => void markRead(selectedUnread)}
                  className="h-8 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  Đánh dấu đã đọc
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="h-8 px-2 rounded-lg text-slate-500 hover:text-slate-800"
                >
                  Bỏ chọn
                </button>
              </div>
            ) : (
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm trong thông báo…"
                  aria-label="Tìm trong thông báo"
                  className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A8A]/30 focus:border-[#1E3A8A]"
                />
              </div>
            )}
          </div>

          {loading ? (
            <ul aria-busy="true" className="divide-y divide-slate-100">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="flex items-start gap-3 px-4 py-4 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-1/2 rounded bg-slate-100" />
                    <div className="h-3 w-4/5 rounded bg-slate-100" />
                  </div>
                </li>
              ))}
            </ul>
          ) : loadError ? (
            <div className="px-6 py-14 text-center">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
              <p className="mt-2 text-sm font-semibold text-slate-900">Không tải được thông báo</p>
              <p className="mt-1 text-sm text-slate-500">{loadError}</p>
              <button
                type="button"
                onClick={() => void loadNotifications()}
                className="mt-4 h-9 px-4 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50"
              >
                Thử lại
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <BellOff className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="mt-3 text-sm font-semibold text-slate-900">
                {search ? 'Không tìm thấy thông báo phù hợp' : 'Không có thông báo nào ở mục này'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {search
                  ? 'Thử từ khóa khác hoặc chọn mục "Tất cả".'
                  : 'Khi có việc mới liên quan đến bạn, thông báo sẽ xuất hiện tại đây.'}
              </p>
            </div>
          ) : (
            grouped.map(({ bucket, entries }) => (
              <div key={bucket}>
                <h2 className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[13px] font-semibold text-slate-500">
                  {BUCKET_LABELS[bucket]}
                </h2>
                <ul className="divide-y divide-slate-100">
                  {entries.map(({ item, cat }) => {
                    const visual = CATEGORY_VISUALS[cat];
                    const checked = selectedIds.includes(item.id);
                    const Icon = visual.Icon;
                    return (
                      <li
                        key={item.id}
                        className={`group relative flex items-start gap-3 px-4 py-3.5 transition-colors ${
                          checked ? 'bg-blue-50/70' : item.isRead ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/30 hover:bg-blue-50/60'
                        }`}
                      >
                        {!item.isRead && (
                          <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#1E3A8A]" />
                        )}
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(item.id) ? prev.filter((x) => x !== item.id) : [...prev, item.id],
                            )
                          }
                          aria-label={`Chọn thông báo: ${item.title}`}
                          className="mt-2.5 w-4 h-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A] shrink-0"
                        />
                        <span className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${visual.iconClass}`}>
                          <Icon className="w-4 h-4" />
                        </span>

                        <button
                          type="button"
                          onClick={() => openItem(item)}
                          className="flex-1 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] rounded-md"
                        >
                          <div className="flex items-baseline gap-2">
                            <p
                              className={`flex-1 min-w-0 text-[15px] leading-snug truncate ${
                                item.isRead ? 'text-slate-700' : 'font-semibold text-slate-900'
                              }`}
                            >
                              {item.title}
                            </p>
                            <time
                              dateTime={item.createdAt}
                              title={new Date(item.createdAt).toLocaleString('vi-VN')}
                              className={`text-[13px] whitespace-nowrap shrink-0 ${
                                item.isRead ? 'text-slate-400' : 'text-[#1E3A8A] font-medium'
                              }`}
                            >
                              {relativeTime(item.createdAt)}
                            </time>
                          </div>
                          <p className="mt-0.5 text-sm text-slate-600 line-clamp-2">{item.summary}</p>
                          <div className="mt-1.5 flex items-center gap-2 text-[13px]">
                            <span className="text-slate-500">{visual.label}</span>
                            {item.actionUrl && item.actionLabel && (
                              <span className="inline-flex items-center gap-0.5 text-[#1E3A8A] font-medium">
                                · {item.actionLabel}
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                        </button>

                        {!item.isRead && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void markRead([item.id])}
                            title="Đánh dấu đã đọc"
                            aria-label={`Đánh dấu đã đọc: ${item.title}`}
                            className="mt-1 p-2 rounded-lg text-slate-400 hover:text-[#1E3A8A] hover:bg-white opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
