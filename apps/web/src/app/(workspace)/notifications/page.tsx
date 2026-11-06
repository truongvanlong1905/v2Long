'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  CheckCheck,
  Clock,
  FileSpreadsheet,
  Info,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { NotificationDto } from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

type FilterTab = 'all' | 'unread' | 'leads' | 'price_alerts' | 'reports';

function getCategoryVisual(category: string, isRead: boolean) {
  const normalized = category.trim().toLowerCase();
  if (
    normalized.includes('cảnh báo') ||
    normalized.includes('dò giá') ||
    normalized.includes('warning')
  ) {
    return {
      Icon: AlertTriangle,
      badgeClass: 'bg-amber-50 border border-amber-200 text-amber-800',
      iconBoxClass: 'bg-amber-50 text-amber-600 border border-amber-200/80',
    };
  }
  if (normalized.includes('báo cáo') || normalized.includes('report')) {
    return {
      Icon: BarChart3,
      badgeClass: 'bg-emerald-50 border border-emerald-200 text-emerald-800',
      iconBoxClass: isRead
        ? 'bg-slate-100 text-slate-500 border border-slate-200/70'
        : 'bg-emerald-50 text-emerald-600 border border-emerald-200/80',
    };
  }
  if (normalized.includes('lead') || normalized.includes('kinh doanh')) {
    return {
      Icon: FileSpreadsheet,
      badgeClass: 'bg-blue-50 border border-blue-200 text-[#1E3A8A]',
      iconBoxClass: isRead
        ? 'bg-slate-100 text-slate-500 border border-slate-200/70'
        : 'bg-blue-50 text-[#2563EB] border border-blue-200',
    };
  }
  if (normalized.includes('thiết kế') || normalized.includes('ai')) {
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
      : 'bg-blue-50 text-[#2563EB] border border-blue-200',
  };
}

export default function NotificationsPage() {
  const { user, setUnreadCountState } = useSession();
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | 'all' | 'batch' | null>(null);

  // Batch selection & Mobile swipe-to-dismiss state (Step 4.2)
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  const touchStartXRef = useRef<Record<number, number>>({});

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

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    setBusyId('batch');
    try {
      // Mark selected unread items as read on server & dismiss locally
      for (const id of selectedIds) {
        const target = items.find((i) => i.id === id);
        if (target && !target.isRead && user) {
          await apiRequest('/api/v1/notifications', {
            method: 'PATCH',
            csrfToken: user.csrfToken,
            body: { notificationId: id },
          });
        }
      }
      setDismissedIds((prev) => [...new Set([...prev, ...selectedIds])]);
      setSelectedIds([]);
      await loadNotifications();
    } finally {
      setBusyId(null);
    }
  };

  const visibleItems = items.filter((item) => !dismissedIds.includes(item.id));

  const filteredItems = visibleItems.filter((item) => {
    const cat = `${item.category} ${item.title}`.toLowerCase();
    if (filter === 'unread') return !item.isRead;
    if (filter === 'leads') return cat.includes('lead') || cat.includes('kinh doanh');
    if (filter === 'price_alerts')
      return cat.includes('cảnh báo') || cat.includes('dò giá') || cat.includes('quá hạn');
    if (filter === 'reports') return cat.includes('báo cáo') || cat.includes('đồng bộ');
    return true;
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Batch Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Trung tâm Thông báo
          </h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Cập nhật Lead mới, cảnh báo dò giá và báo cáo phân quyền thuộc tài khoản của bạn.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {selectedIds.length > 0 && (
            <button
              type="button"
              disabled={busyId !== null}
              onClick={() => void handleDeleteSelected()}
              className="h-10 px-4 rounded-xl bg-red-50 border border-red-200 hover:bg-red-600 text-red-700 hover:text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa đã chọn ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            disabled={busyId !== null || unreadCount === 0}
            onClick={() => void handleMarkRead(undefined, true)}
            className="h-10 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" />
            <span>{busyId === 'all' ? 'Đang xử lý...' : 'Đánh dấu tất cả đã đọc'}</span>
          </button>
        </div>
      </div>

      {/* Unread Summary Banner */}
      <section className="rounded-2xl bg-gradient-to-r from-[#1E3A8A] via-[#1E53A3] to-[#2563EB] text-white p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 shadow-card">
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
              Trên điện thoại, bạn có thể vuốt ngang thẻ thông báo để ẩn nhanh hoặc chạm để mở tác vụ.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-white/15 border border-white/20 font-semibold">
            Hiển thị: {visibleItems.length}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-white text-[#1E3A8A] font-bold">
            Chưa đọc: {unreadCount}
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Inbox Card */}
        <section className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden">
          {/* 5 Responsive Filter Tabs: "Tất cả", "Chưa đọc", "Lead mới", "Cảnh báo giá", "Báo cáo" */}
          <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div
              className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0"
              role="tablist"
              aria-label="Bộ lọc thông báo"
            >
              {[
                { id: 'all' as const, label: 'Tất cả' },
                { id: 'unread' as const, label: 'Chưa đọc' },
                { id: 'leads' as const, label: 'Lead mới' },
                { id: 'price_alerts' as const, label: 'Cảnh báo giá' },
                { id: 'reports' as const, label: 'Báo cáo' },
              ].map((tab) => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(tab.id)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                      active
                        ? 'bg-[#1E3A8A] text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {filteredItems.length > 0 && (
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    filteredItems.length > 0 &&
                    filteredItems.every((i) => selectedIds.includes(i.id))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(filteredItems.map((i) => i.id));
                    } else {
                      setSelectedIds([]);
                    }
                  }}
                />
                <span>Chọn tất cả</span>
              </label>
            )}
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
                <p className="text-sm font-bold text-slate-800">
                  Không có thông báo nào trong danh mục này
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Khi có cập nhật mới liên quan đến công việc của bạn, thông báo sẽ hiển thị tại đây.
                </p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const { Icon, badgeClass, iconBoxClass } = getCategoryVisual(
                  item.category,
                  item.isRead,
                );
                const checked = selectedIds.includes(item.id);
                return (
                  <article
                    key={item.id}
                    onTouchStart={(e) => {
                      touchStartXRef.current[item.id] = e.changedTouches[0]?.clientX ?? 0;
                    }}
                    onTouchEnd={(e) => {
                      const startX = touchStartXRef.current[item.id] ?? 0;
                      const endX = e.changedTouches[0]?.clientX ?? 0;
                      if (Math.abs(endX - startX) > 90) {
                        setDismissedIds((prev) => [...prev, item.id]);
                      }
                    }}
                    className={`relative px-4 sm:px-6 py-4 sm:py-5 transition-colors ${
                      item.isRead
                        ? 'bg-white hover:bg-slate-50/60'
                        : 'bg-blue-50/35 hover:bg-blue-50/60 border-l-4 border-l-[#2563EB]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3.5">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelect(item.id)}
                          aria-label={`Chọn thông báo ${item.title}`}
                          className="mt-2.5 rounded border-slate-300 text-[#2563EB]"
                        />

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
                                className="w-2.5 h-2.5 rounded-full bg-[#2563EB] ring-4 ring-blue-500/15 shrink-0"
                              />
                            )}
                            <h2
                              className={`text-sm leading-snug break-words ${
                                item.isRead
                                  ? 'font-semibold text-slate-700'
                                  : 'font-bold text-slate-900'
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
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-blue-200 text-[#1E3A8A] hover:bg-[#1E3A8A] hover:text-white text-[11px] font-bold transition-colors shadow-2xs"
                              >
                                <span>{item.actionLabel}</span>
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mark as Read Action */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0 pl-10 sm:pl-0">
                        {!item.isRead ? (
                          <button
                            type="button"
                            disabled={busyId !== null}
                            onClick={() => void handleMarkRead(item.id, false)}
                            className="h-8 px-3 rounded-lg bg-white border border-blue-200 hover:bg-blue-50 text-[#1E3A8A] text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
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
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E3A8A] grid place-items-center mb-3">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h3 className="font-display text-sm font-bold text-slate-900">
              Phạm vi thông báo theo RBAC
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
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
              <strong className="text-xs font-bold text-slate-900 block">
                Thao tác hàng loạt & Cử chỉ di động
              </strong>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Tích chọn nhiều thông báo để xóa nhanh hoặc vuốt ngang thẻ thông báo trên màn hình
                cảm ứng để ẩn khỏi danh sách.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
