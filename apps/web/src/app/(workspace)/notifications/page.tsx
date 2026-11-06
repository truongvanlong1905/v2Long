'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  Clock,
  FileSpreadsheet,
  Info,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { NotificationDto } from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

type FilterTab = 'all' | 'unread' | 'read';

function getCategoryVisual(category: string, isRead: boolean) {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('cảnh báo') || normalized.includes('warning')) {
    return {
      Icon: AlertTriangle,
      badgeClass: 'bg-amber-50 border border-amber-200 text-amber-800',
      iconBoxClass: 'bg-amber-50 text-amber-600 border border-amber-200/80',
    };
  }
  if (normalized.includes('bảo mật')) {
    return {
      Icon: ShieldCheck,
      badgeClass: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
      iconBoxClass: isRead
        ? 'bg-slate-100 text-slate-500 border border-slate-200/70'
        : 'bg-emerald-50 text-emerald-600 border border-emerald-200/80',
    };
  }
  if (normalized.includes('lead') || normalized.includes('kinh doanh')) {
    return {
      Icon: FileSpreadsheet,
      badgeClass: 'bg-brand-soft border border-brand-border text-brand',
      iconBoxClass: isRead
        ? 'bg-slate-100 text-slate-500 border border-slate-200/70'
        : 'bg-brand-soft text-brand border border-brand-border',
    };
  }
  if (normalized.includes('cập nhật')) {
    return {
      Icon: Sparkles,
      badgeClass: 'bg-violet-50 border border-violet-200 text-violet-700',
      iconBoxClass: isRead
        ? 'bg-slate-100 text-slate-500 border border-slate-200/70'
        : 'bg-violet-50 text-violet-600 border border-violet-200/80',
    };
  }
  return {
    Icon: Info,
    badgeClass: 'bg-slate-100 border border-slate-200 text-slate-700',
    iconBoxClass: isRead
      ? 'bg-slate-100 text-slate-500 border border-slate-200/70'
      : 'bg-brand-soft text-brand border border-brand-border',
  };
}

export default function NotificationsPage() {
  const { user, setUnreadCountState } = useSession();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | 'all' | null>(null);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: NotificationDto[]; unreadCount: number }>(
        '/api/v1/notifications',
      );
      setItems(res.items);
      setUnreadCount(res.unreadCount);
      setUnreadCountState(res.unreadCount);
    } catch {
      // Keep current state
    } finally {
      setLoading(false);
    }
  }, [setUnreadCountState]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (notificationId?: number, markAll?: boolean) => {
    if (!user) return;
    setBusyId(markAll ? 'all' : (notificationId ?? null));
    try {
      const res = await apiRequest<{ items: NotificationDto[]; unreadCount: number }>(
        '/api/v1/notifications',
        {
          method: 'PATCH',
          csrfToken: user.csrfToken,
          body: markAll ? { markAll: true } : { notificationId },
        },
      );
      setItems(res.items);
      setUnreadCount(res.unreadCount);
      setUnreadCountState(res.unreadCount);
    } finally {
      setBusyId(null);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filter === 'unread') return !item.isRead;
    if (filter === 'read') return item.isRead;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header — No decorative "Không gian làm việc" eyebrow */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
            Thông báo
          </h1>
          <p className="text-[13px] text-ink-muted mt-1">
            Cập nhật công việc và hệ thống thuộc phạm vi tài khoản của bạn.
          </p>
        </div>

        <button
          type="button"
          disabled={busyId !== null || unreadCount === 0}
          onClick={() => void handleMarkRead(undefined, true)}
          className="self-start sm:self-auto h-10 px-4 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
        >
          <CheckCheck className="w-4 h-4" />
          <span>
            {busyId === 'all' ? 'Đang xử lý...' : 'Đánh dấu tất cả đã đọc'}
          </span>
        </button>
      </div>

      {/* Unread Summary Banner */}
      <section className="rounded-2xl bg-gradient-to-r from-[#143B85] via-[#1E53A3] to-[#3273C2] text-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-card">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-white/15 border border-white/25 grid place-items-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <strong className="font-display text-lg sm:text-xl font-bold block">
              {unreadCount > 0
                ? `Bạn có ${unreadCount} thông báo chưa đọc`
                : 'Bạn đã xem hết tất cả thông báo'}
            </strong>
            <p className="text-xs text-sky-100/90 mt-1">
              Các thông báo mới được làm nổi bật để bạn ưu tiên kiểm tra và mở nhanh tác vụ liên quan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-white/15 border border-white/20 font-semibold">
            Tổng số: {items.length}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-white text-brand font-bold">
            Chưa đọc: {unreadCount}
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Inbox Card */}
        <section className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          {/* Filter Tabs ("Tất cả", "Chưa đọc", "Đã đọc") */}
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2" role="tablist" aria-label="Bộ lọc thông báo">
              {[
                { id: 'all' as const, label: 'Tất cả', count: items.length },
                { id: 'unread' as const, label: 'Chưa đọc', count: unreadCount },
                { id: 'read' as const, label: 'Đã đọc', count: items.length - unreadCount },
              ].map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors ${
                      active
                        ? 'bg-brand text-white shadow-sm'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-ink'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] ${
                        active ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification Items List */}
          <div className="divide-y divide-slate-100">
            {loading ? (
              <div className="p-10 text-center text-xs text-slate-400">
                Đang tải danh sách thông báo...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 grid place-items-center mx-auto mb-3">
                  <Bell className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-ink">
                  {filter === 'unread'
                    ? 'Không còn thông báo chưa đọc'
                    : 'Không có thông báo nào trong mục này'}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  Khi có cập nhật mới liên quan đến công việc của bạn, thông báo sẽ hiển thị tại đây.
                </p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const { Icon, badgeClass, iconBoxClass } = getCategoryVisual(
                  item.category,
                  item.isRead,
                );
                return (
                  <article
                    key={item.id}
                    className={`relative px-5 sm:px-6 py-4 sm:py-5 transition-colors ${
                      item.isRead
                        ? 'bg-white hover:bg-slate-50/60'
                        : 'bg-brand-soft/40 hover:bg-brand-soft/60 border-l-4 border-l-brand'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5">
                      <div className="flex items-start gap-3.5 min-w-0 flex-1">
                        {/* Category Icon */}
                        <div
                          className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 mt-0.5 ${iconBoxClass}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          {/* Title & Category Badge */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {!item.isRead && (
                              <span
                                aria-label="Chưa đọc"
                                className="w-2.5 h-2.5 rounded-full bg-brand ring-4 ring-brand/15 shrink-0"
                              />
                            )}
                            <h2
                              className={`text-sm leading-snug break-words ${
                                item.isRead
                                  ? 'font-semibold text-slate-700'
                                  : 'font-bold text-ink'
                              }`}
                            >
                              {item.title}
                            </h2>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badgeClass}`}
                            >
                              {item.category}
                            </span>
                          </div>

                          {/* Short Description */}
                          <p
                            className={`text-xs mt-1.5 leading-relaxed break-words ${
                              item.isRead ? 'text-slate-500' : 'text-slate-700'
                            }`}
                          >
                            {item.summary}
                          </p>

                          {/* Timestamp & Related Resource Action */}
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                              <Clock className="w-3.5 h-3.5" />
                              <time dateTime={item.createdAt}>
                                {new Date(item.createdAt).toLocaleDateString('vi-VN', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </time>
                            </span>

                            {item.actionUrl && item.actionLabel && (
                              <Link
                                href={item.actionUrl}
                                onClick={() => {
                                  if (!item.isRead) {
                                    void handleMarkRead(item.id, false);
                                  }
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-brand-border text-brand hover:bg-brand hover:text-white text-[11px] font-bold transition-colors shadow-sm"
                              >
                                <span>{item.actionLabel}</span>
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mark as Read Action */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0 pl-13 sm:pl-0">
                        {!item.isRead ? (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => void handleMarkRead(item.id, false)}
                            className="h-8 px-3 rounded-lg bg-white border border-brand-border hover:bg-brand-soft text-brand text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Đánh dấu đã đọc</span>
                          </button>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-400 inline-flex items-center gap-1">
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Đã xem</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Right Side Info Cards */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-card">
            <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand grid place-items-center mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-ink">Phạm vi thông báo cá nhân</h3>
            <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
              Mỗi tài khoản chỉ nhận và thao tác trên thông báo thuộc phạm vi công việc và vai trò{' '}
              <strong>{user?.roleName}</strong> của mình. Các liên kết mở tác vụ đều kiểm tra quyền
              truy cập trước khi hiển thị.
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-card flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 grid place-items-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <strong className="text-xs font-bold text-ink block">Phân cấp trực quan</strong>
              <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                Thông báo chưa đọc có viền xanh bên trái, nền xanh nhạt và chấm tròn nhận diện rõ
                ràng; màu cam chỉ xuất hiện khi dữ liệu thực sự là trạng thái cảnh báo.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
