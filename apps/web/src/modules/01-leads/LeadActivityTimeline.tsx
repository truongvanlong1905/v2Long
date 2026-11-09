'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  Calendar,
  CheckCircle2,
  Clock,
  FileCheck2,
  Inbox,
  Info,
  Paperclip,
  Palette,
  Pencil,
  RotateCcw,
  Search,
  StickyNote,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import {
  PIPELINE_STATUS_LABELS,
  type LeadActivityDto,
  type PipelineStatus,
} from '@toantrung/contracts';

interface ActivityMeta {
  label: string;
  icon: LucideIcon;
  /** Màu vòng tròn icon */
  dot: string;
  /** Màu nền thẻ (chỉ dùng cho sự kiện cần chú ý) */
  card?: string;
}

const ACTIVITY_META: Record<string, ActivityMeta> = {
  create_lead: { label: 'Tiếp nhận Lead mới', icon: Inbox, dot: 'bg-blue-600 text-white' },
  confirm_receive: { label: 'Xác nhận tiếp nhận', icon: UserCheck, dot: 'bg-emerald-600 text-white' },
  status_change: { label: 'Cập nhật trạng thái', icon: CheckCircle2, dot: 'bg-emerald-600 text-white' },
  reopen_lead: { label: 'Mở lại hồ sơ', icon: RotateCcw, dot: 'bg-violet-600 text-white' },
  reassign_sales: { label: 'Bàn giao Sales', icon: ArrowRightLeft, dot: 'bg-sky-600 text-white' },
  update_info: { label: 'Cập nhật thông tin', icon: Pencil, dot: 'bg-blue-600 text-white' },
  add_note: { label: 'Ghi chú phối hợp', icon: StickyNote, dot: 'bg-amber-500 text-white' },
  upload_attachment: { label: 'Tải tệp đính kèm', icon: Paperclip, dot: 'bg-slate-600 text-white' },
  quote_version: { label: 'Gửi báo giá', icon: FileCheck2, dot: 'bg-amber-600 text-white' },
  design_completed: { label: 'Hoàn thành thiết kế', icon: Palette, dot: 'bg-indigo-600 text-white' },
  mark_spam: {
    label: 'Đánh dấu Spam',
    icon: Ban,
    dot: 'bg-red-600 text-white',
    card: 'bg-red-50/70 border-red-200',
  },
  review_spam: {
    label: 'Duyệt cờ Spam',
    icon: Ban,
    dot: 'bg-red-600 text-white',
    card: 'bg-red-50/70 border-red-200',
  },
  price_check_alert: {
    label: 'Cảnh báo nghi dò giá',
    icon: AlertTriangle,
    dot: 'bg-orange-500 text-white',
    card: 'bg-orange-50/70 border-orange-200',
  },
};

const FALLBACK_META: ActivityMeta = { label: 'Hoạt động', icon: Info, dot: 'bg-violet-600 text-white' };

/** Bỏ mã nghiệp vụ nội bộ (UC01 4.4, E5...) khỏi nội dung hiển thị cho nhân viên. */
function cleanNote(text: string | null): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/\s*\((UC|BR|E)\d+[^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || null;
}

function statusLabel(status: string | null): string | null {
  if (!status) return null;
  return PIPELINE_STATUS_LABELS[status as PipelineStatus] || status;
}

function formatDateTimeBadge(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${time} · ${date}`;
}

export function LeadActivityTimeline({ activities }: { activities: LeadActivityDto[] }) {
  const [searchText, setSearchText] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [timeFilter, setTimeFilter] = useState<'ALL' | 'TODAY' | '7D' | '30D'>('ALL');

  const actors = useMemo(() => {
    const set = new Set<string>();
    for (const a of activities) {
      if (a.actorName && a.actorName.trim()) set.add(a.actorName.trim());
    }
    return Array.from(set);
  }, [activities]);

  const filteredActivities = useMemo(() => {
    const now = Date.now();
    const q = searchText.trim().toLowerCase();

    return [...activities]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((act) => {
        if (actionFilter !== 'ALL') {
          if (actionFilter === 'spam_risk') {
            if (
              act.actionType !== 'mark_spam' &&
              act.actionType !== 'review_spam' &&
              act.actionType !== 'price_check_alert'
            ) {
              return false;
            }
          } else if (act.actionType !== actionFilter) {
            return false;
          }
        }

        if (actorFilter !== 'ALL' && act.actorName !== actorFilter) {
          return false;
        }

        if (timeFilter !== 'ALL') {
          const createdMs = new Date(act.createdAt).getTime();
          const diffHours = (now - createdMs) / 3600000;
          if (timeFilter === 'TODAY' && diffHours > 24) return false;
          if (timeFilter === '7D' && diffHours > 24 * 7) return false;
          if (timeFilter === '30D' && diffHours > 24 * 30) return false;
        }

        if (q) {
          const meta = ACTIVITY_META[act.actionType] || FALLBACK_META;
          const fromLbl = statusLabel(act.fromStatus) || '';
          const toLbl = statusLabel(act.toStatus) || '';
          const haystack = [
            meta.label,
            act.actorName,
            act.noteContent || '',
            act.reason || '',
            fromLbl,
            toLbl,
            act.fromSalesName || '',
            act.toSalesName || '',
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        return true;
      });
  }, [activities, searchText, actionFilter, actorFilter, timeFilter]);

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#1E3A8A]" />
          <h3 className="font-display text-base font-bold text-slate-900">Lịch sử hoạt động</h3>
        </div>
        <span className="text-xs font-medium text-slate-500">
          {filteredActivities.length} sự kiện · Mới nhất ở trên
        </span>
      </div>

      {/* Filter Strip (Theo đúng chuẩn Ảnh 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
        <div className="sm:col-span-4 relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm kiếm trong lịch sử..."
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
          />
        </div>

        <div className="sm:col-span-3">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Loại hoạt động</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
          >
            <option value="ALL">Tất cả</option>
            <option value="status_change">Cập nhật trạng thái</option>
            <option value="create_lead">Tiếp nhận Lead mới</option>
            <option value="confirm_receive">Xác nhận tiếp nhận</option>
            <option value="update_info">Cập nhật thông tin</option>
            <option value="add_note">Ghi chú phối hợp</option>
            <option value="reassign_sales">Bàn giao Sales</option>
            <option value="upload_attachment">Tải tệp đính kèm</option>
            <option value="spam_risk">Cảnh báo / Spam</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Người thực hiện</label>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
          >
            <option value="ALL">Tất cả</option>
            {actors.map((actor) => (
              <option key={actor} value={actor}>
                {actor}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Khoảng thời gian</label>
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as 'ALL' | 'TODAY' | '7D' | '30D')}
            className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
          >
            <option value="ALL">Tất cả</option>
            <option value="TODAY">Hôm nay</option>
            <option value="7D">7 ngày qua</option>
            <option value="30D">30 ngày qua</option>
          </select>
        </div>

        <div className="sm:col-span-1">
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setActionFilter('ALL');
              setActorFilter('ALL');
              setTimeFilter('ALL');
            }}
            className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-[#1E3A8A] inline-flex items-center justify-center gap-1 transition"
            title="Đặt lại bộ lọc lịch sử"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="sm:hidden lg:inline">Đặt lại</span>
          </button>
        </div>
      </div>

      {/* Timeline List */}
      {filteredActivities.length === 0 ? (
        <div className="py-10 text-center border border-dashed border-slate-200 rounded-2xl">
          <StickyNote className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-xs text-slate-500 mt-2">
            Không tìm thấy sự kiện lịch sử nào khớp với bộ lọc hiện tại.
          </p>
        </div>
      ) : (
        <ol className="relative space-y-3 before:absolute before:left-[17px] before:top-3 before:bottom-3 before:w-px before:bg-slate-200">
          {filteredActivities.map((act, idx) => {
            const meta = ACTIVITY_META[act.actionType] || FALLBACK_META;
            // Alternate circle colors on status_change to match the visual rhythm in Image 4
            const dotClass =
              act.actionType === 'status_change'
                ? idx % 3 === 0
                  ? 'bg-blue-600 text-white'
                  : idx % 3 === 1
                    ? 'bg-emerald-600 text-white'
                    : 'bg-violet-600 text-white'
                : meta.dot;
            const Icon =
              act.actionType === 'status_change' && idx % 3 === 0
                ? Pencil
                : act.actionType === 'status_change' && idx % 3 === 2
                  ? Info
                  : meta.icon;

            const fromLabel = statusLabel(act.fromStatus);
            const toLabel = statusLabel(act.toStatus);
            const showStatusChange = fromLabel && toLabel && act.fromStatus !== act.toStatus;
            const showReassign = act.fromSalesName || act.toSalesName;
            const note = cleanNote(act.noteContent);
            const reason = cleanNote(act.reason);

            return (
              <li key={act.id} className="relative flex gap-3.5">
                <span
                  className={`relative z-10 w-9 h-9 rounded-full grid place-items-center shrink-0 ring-4 ring-white shadow-2xs ${dotClass}`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <div
                  className={`flex-1 min-w-0 rounded-xl border px-4 py-3 transition ${
                    meta.card || 'bg-white border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-xs sm:text-sm text-slate-900">
                      <span className="font-bold">{meta.label}</span>
                      <span className="text-slate-500 font-medium"> · {act.actorName}</span>
                    </p>
                    <time
                      dateTime={act.createdAt}
                      className="text-xs text-slate-500 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>{formatDateTimeBadge(act.createdAt)}</span>
                    </time>
                  </div>

                  {showStatusChange && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-medium">
                        {fromLabel}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="px-2.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-800 font-semibold">
                        {toLabel}
                      </span>
                    </div>
                  )}

                  {showReassign && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-medium">
                        {act.fromSalesName || 'Chưa phân bổ'}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-800 font-semibold">
                        {act.toSalesName || 'Chưa phân bổ'}
                      </span>
                    </div>
                  )}

                  {reason && (
                    <p className="mt-2 text-xs sm:text-sm text-slate-700">
                      <span className="text-slate-500 font-medium">Lý do:</span> {reason}
                    </p>
                  )}
                  {note && note !== reason && (
                    <p className="mt-1.5 text-xs sm:text-sm text-slate-700 leading-relaxed">{note}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
