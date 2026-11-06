'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  FileCheck2,
  Inbox,
  Paperclip,
  Palette,
  Pencil,
  RotateCcw,
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
  status_change: { label: 'Cập nhật trạng thái', icon: CheckCircle2, dot: 'bg-[#1E3A8A] text-white' },
  reopen_lead: { label: 'Mở lại hồ sơ', icon: RotateCcw, dot: 'bg-violet-600 text-white' },
  reassign_sales: { label: 'Bàn giao Sales', icon: ArrowRightLeft, dot: 'bg-sky-600 text-white' },
  update_info: { label: 'Cập nhật thông tin', icon: Pencil, dot: 'bg-slate-500 text-white' },
  add_note: { label: 'Ghi chú', icon: StickyNote, dot: 'bg-amber-500 text-white' },
  upload_attachment: { label: 'Tải tệp đính kèm', icon: Paperclip, dot: 'bg-slate-500 text-white' },
  quote_version: { label: 'Gửi báo giá', icon: FileCheck2, dot: 'bg-amber-600 text-white' },
  design_completed: { label: 'Hoàn thành thiết kế', icon: Palette, dot: 'bg-indigo-600 text-white' },
  mark_spam: {
    label: 'Đánh dấu Spam',
    icon: Ban,
    dot: 'bg-red-600 text-white',
    card: 'bg-red-50 border-red-200',
  },
  review_spam: {
    label: 'Duyệt cờ Spam',
    icon: Ban,
    dot: 'bg-red-600 text-white',
    card: 'bg-red-50 border-red-200',
  },
  price_check_alert: {
    label: 'Cảnh báo nghi dò giá',
    icon: AlertTriangle,
    dot: 'bg-orange-500 text-white',
    card: 'bg-orange-50 border-orange-200',
  },
};

const FALLBACK_META: ActivityMeta = { label: 'Hoạt động', icon: StickyNote, dot: 'bg-slate-400 text-white' };

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

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Hôm nay';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function relativeTime(iso: string): string {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'vừa xong';
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} giờ trước`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

export function LeadActivityTimeline({ activities }: { activities: LeadActivityDto[] }) {
  const groups = useMemo(() => {
    const sorted = [...activities].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const map = new Map<string, { heading: string; items: LeadActivityDto[] }>();
    for (const act of sorted) {
      const key = dayKey(act.createdAt);
      if (!map.has(key)) map.set(key, { heading: dayHeading(act.createdAt), items: [] });
      map.get(key)!.items.push(act);
    }
    return Array.from(map.values());
  }, [activities]);

  if (activities.length === 0) {
    return (
      <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl">
        <StickyNote className="w-8 h-8 text-slate-300 mx-auto" />
        <p className="text-sm text-slate-500 mt-2">Chưa có hoạt động nào được ghi nhận.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-base font-semibold text-slate-900">Lịch sử hoạt động</h3>
        <span className="text-[13px] text-slate-500">{activities.length} sự kiện · mới nhất ở trên</span>
      </div>

      {groups.map((group) => (
        <section key={group.heading} aria-label={group.heading}>
          <h4 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wide mb-3 first-letter:uppercase">
            {group.heading}
          </h4>
          <ol className="relative space-y-3 before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
            {group.items.map((act) => {
              const meta = ACTIVITY_META[act.actionType] || FALLBACK_META;
              const Icon = meta.icon;
              const fromLabel = statusLabel(act.fromStatus);
              const toLabel = statusLabel(act.toStatus);
              const showStatusChange = fromLabel && toLabel && act.fromStatus !== act.toStatus;
              const showReassign = act.fromSalesName || act.toSalesName;
              const note = cleanNote(act.noteContent);
              const reason = cleanNote(act.reason);
              return (
                <li key={act.id} className="relative flex gap-3.5">
                  <span
                    className={`relative z-10 w-9 h-9 rounded-full grid place-items-center shrink-0 ring-4 ring-white ${meta.dot}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div
                    className={`flex-1 min-w-0 rounded-xl border px-4 py-3 ${
                      meta.card || 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-sm text-slate-900">
                        <span className="font-semibold">{meta.label}</span>
                        <span className="text-slate-500"> · {act.actorName}</span>
                      </p>
                      <time
                        dateTime={act.createdAt}
                        title={new Date(act.createdAt).toLocaleString('vi-VN')}
                        className="text-[13px] text-slate-500 whitespace-nowrap"
                      >
                        {new Date(act.createdAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        · {relativeTime(act.createdAt)}
                      </time>
                    </div>

                    {showStatusChange && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{fromLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1E3A8A] font-medium">
                          {toLabel}
                        </span>
                      </div>
                    )}

                    {showReassign && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {act.fromSalesName || 'Chưa phân bổ'}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 font-medium">
                          {act.toSalesName || 'Chưa phân bổ'}
                        </span>
                      </div>
                    )}

                    {reason && (
                      <p className="mt-2 text-sm text-slate-700">
                        <span className="text-slate-500">Lý do:</span> {reason}
                      </p>
                    )}
                    {note && note !== reason && (
                      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{note}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

