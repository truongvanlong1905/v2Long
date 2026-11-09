'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Layers,
  MapPin,
  Phone,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CreateManualLeadSchema,
  HCM_DISTRICTS,
  PIPELINE_STATUS_LABELS,
  REASSIGN_REASONS,
  VIETNAM_PROVINCES,
  type LeadItemDto,
  type ProductCatalogDto,
  type SalesAssigneeOptionDto,
} from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';

interface ProductCheckboxGridProps {
  products: ProductCatalogDto[];
  selectedIds: number[];
  onToggleProduct: (id: number) => void;
  customItems: string[];
  onAddCustomItem: (item: string) => void;
  onRemoveCustomItem: (item: string) => void;
}

const CATEGORY_META: Record<
  ProductCatalogDto['category'],
  { title: string; badge: string; badgeClass: string }
> = {
  MAN_HINH_LED: {
    title: 'Màn hình LED Indoor & Outdoor',
    badge: 'LED Screen',
    badgeClass: 'bg-blue-50 text-[#1E3A8A] border-blue-200',
  },
  BANG_DIEN_TU: {
    title: 'Bảng điện tử & Hiển thị chuyên dụng',
    badge: 'Bảng điện tử',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  KHAC: {
    title: 'Khung giá đỡ, Cabin & Dịch vụ khác',
    badge: 'Dịch vụ / Khác',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

const UNIFIED_LEAD_SOURCES: Array<{
  label: string;
  channel: 'hotline' | 'zalo' | 'email' | 'form_web';
}> = [
  { label: 'SĐT / Hotline', channel: 'hotline' },
  { label: 'Zalo', channel: 'zalo' },
  { label: 'Website Toàn Trung', channel: 'form_web' },
  { label: 'Google Ads', channel: 'form_web' },
  { label: 'Fanpage Facebook', channel: 'zalo' },
  { label: 'Email Dự án', channel: 'email' },
  { label: 'Khách cũ / Giới thiệu', channel: 'hotline' },
  { label: 'Hồ sơ Đấu thầu', channel: 'email' },
];

function cleanProductLabel(name: string): string {
  return name
    .replace(/^Khác\s*\(([^)]+)\)$/i, '$1 khác')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
}

/**
 * Isolated memoized 3-column product grid synchronized with Lead Detail Modal.
 */
const ProductCheckboxGrid = memo(function ProductCheckboxGrid({
  products,
  selectedIds,
  onToggleProduct,
  customItems,
  onAddCustomItem,
  onRemoveCustomItem,
}: ProductCheckboxGridProps) {
  const [customDraft, setCustomDraft] = useState('');

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleCommitCustom = () => {
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    onAddCustomItem(trimmed);
    setCustomDraft('');
  };

  return (
    <div className="p-4 rounded-xl border border-slate-200/90 bg-white space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#1E3A8A]" />
          <span className="font-bold text-slate-900 text-sm">
            2. Danh mục sản phẩm &amp; dịch vụ *
          </span>
          <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-bold">
            Đã chọn {selectedIds.length + customItems.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {products
            .filter((p) => selectedSet.has(p.id))
            .map((sel) => (
              <span
                key={sel.id}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#1E3A8A] text-white text-xs font-medium"
              >
                <span>{cleanProductLabel(sel.productName)}</span>
                {selectedIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onToggleProduct(sel.id)}
                    className="hover:text-rose-200 ml-0.5"
                    title="Bỏ chọn"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          {customItems.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-600 text-white text-xs font-medium"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onRemoveCustomItem(item)}
                className="hover:text-rose-200 ml-0.5"
                title="Xóa mục này"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* 3-Column Synchronized Product & Custom Service Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {(
          [
            {
              category: 'MAN_HINH_LED' as const,
              title: 'Màn hình LED Indoor & Outdoor',
              dot: 'bg-blue-600',
              activeCls:
                'bg-blue-50 text-[#1E3A8A] border-blue-300 font-semibold shadow-2xs',
            },
            {
              category: 'BANG_DIEN_TU' as const,
              title: 'Bảng điện tử & Hiển thị số',
              dot: 'bg-emerald-600',
              activeCls:
                'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold shadow-2xs',
            },
            {
              category: 'KHAC' as const,
              title: 'Dịch vụ / Nhu cầu khác',
              dot: 'bg-amber-500',
              activeCls:
                'bg-amber-50 text-amber-900 border-amber-300 font-semibold shadow-2xs',
            },
          ]
        ).map((grp) => {
          const grpProducts = products.filter((p) => p.category === grp.category);
          return (
            <div
              key={grp.category}
              className="p-3 rounded-xl bg-slate-50/70 border border-slate-200/80 flex flex-col justify-between space-y-2.5"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <span className={`w-2 h-2 rounded-full ${grp.dot}`} />
                    <span>{grp.title}</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {grpProducts.length} mục
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {grpProducts.map((p) => {
                    const checked = selectedSet.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onToggleProduct(p.id)}
                        className={`px-2.5 py-1 rounded-lg border text-xs transition text-left ${
                          checked
                            ? grp.activeCls
                            : 'bg-white text-slate-600 border-slate-200/90 hover:border-slate-300 hover:text-slate-900'
                        }`}
                      >
                        {checked ? '✓ ' : '+ '}
                        {cleanProductLabel(p.productName)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {grp.category === 'KHAC' && (
                <div className="pt-2 border-t border-slate-200/80 space-y-2">
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={customDraft}
                      onChange={(e) => setCustomDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCommitCustom();
                        }
                      }}
                      placeholder="Nhập dịch vụ / nhu cầu khác..."
                      className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-amber-300 bg-white text-xs text-slate-800 focus:border-[#1E3A8A] outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCommitCustom}
                      className="h-8 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Thêm</span>
                    </button>
                  </div>

                  {customItems.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {customItems.map((item) => (
                        <span
                          key={item}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold"
                        >
                          <span>✓ {item}</span>
                          <button
                            type="button"
                            onClick={() => onRemoveCustomItem(item)}
                            className="text-amber-700 hover:text-red-600 ml-0.5"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

interface ManualLeadModalProps {
  open: boolean;
  onClose: () => void;
  products: ProductCatalogDto[];
  salesOptions: SalesAssigneeOptionDto[];
  existingLeads?: LeadItemDto[];
  onOpenExistingLead?: (leadId: number) => void;
  currentUserId?: number;
  csrfToken?: string;
  onCreatedSuccess: (leadCode: string, assignedMsg: string) => Promise<void>;
}

function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 10) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

export function ManualLeadModal({
  open,
  onClose,
  products,
  salesOptions,
  existingLeads = [],
  onOpenExistingLead,
  currentUserId,
  csrfToken,
  onCreatedSuccess,
}: ManualLeadModalProps) {
  // Uncontrolled form refs for zero-lag 60fps typing
  const formRef = useRef<HTMLFormElement | null>(null);
  const [selectedSource, setSelectedSource] = useState<string>('SĐT / Hotline');
  const [areaType, setAreaType] = useState<'hcm' | 'other_province'>('hcm');
  const [district, setDistrict] = useState<string>(HCM_DISTRICTS[0]);
  const [province, setProvince] = useState<string>(VIETNAM_PROVINCES[0]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([1]);
  const [customServiceItems, setCustomServiceItems] = useState<string[]>([]);
  const [tickReassign, setTickReassign] = useState(false);
  const [reassignSalesId, setReassignSalesId] = useState<number | ''>('');
  const [reassignReason, setReassignReason] = useState<string>(REASSIGN_REASONS[0]);
  const [tickSuspect, setTickSuspect] = useState(false);
  const [livePhone, setLivePhone] = useState('');
  const [liveCompany, setLiveCompany] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLivePhone('');
      setLiveCompany('');
    }
  }, [open]);

  const liveMatches = useMemo(() => {
    const normP = normalizePhoneDigits(livePhone);
    const normC = liveCompany.trim().toLowerCase();
    if (normP.length < 8 && normC.length < 5) return [];
    return existingLeads.filter((l) => {
      if (l.spamStatus !== 'NONE') return false;
      const lp = normalizePhoneDigits(l.phone || '');
      const phoneHit = normP.length >= 8 && lp && !lp.includes('*') && lp === normP;
      const compHit =
        normC.length >= 5 &&
        Boolean(l.companyName) &&
        (l.companyName || '').trim().toLowerCase() === normC;
      return phoneHit || compHit;
    });
  }, [existingLeads, livePhone, liveCompany]);

  const handleToggleProduct = useCallback((id: number) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const handleAddCustomItem = useCallback((item: string) => {
    setCustomServiceItems((prev) => (prev.includes(item) ? prev : [...prev, item]));
    // Ensure KHAC product id is also included if user only added a custom item
    const khacProd = products.find((p) => p.category === 'KHAC');
    if (khacProd) {
      setSelectedProductIds((prev) => (prev.includes(khacProd.id) ? prev : [...prev, khacProd.id]));
    }
  }, [products]);

  const handleRemoveCustomItem = useCallback((item: string) => {
    setCustomServiceItems((prev) => prev.filter((x) => x !== item));
  }, []);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRef.current || submitting) return;
    setValidationError(null);

    const fd = new FormData(formRef.current);
    const phone = String(fd.get('phone') || '').trim();
    const contactName = String(fd.get('contactName') || '').trim() || undefined;
    const companyName = String(fd.get('companyName') || '').trim() || undefined;
    const projectName = String(fd.get('projectName') || '').trim() || undefined;
    const email = String(fd.get('email') || '').trim() || undefined;
    const installationAddress = String(fd.get('installationAddress') || '').trim() || undefined;
    const rawCustomProductNote = String(fd.get('customProductNote') || '').trim();
    const combinedCustomNote = [
      ...customServiceItems.map((i) => `[Dịch vụ khác: ${i}]`),
      ...(rawCustomProductNote ? [rawCustomProductNote] : []),
    ]
      .join(' · ')
      .trim() || undefined;

    const rawInitialNote = String(fd.get('initialNote') || '').trim();
    const initialNote = [
      ...(tickSuspect ? ['[NGHI VẤN: Cần kiểm tra dò giá / trùng]'] : []),
      ...(rawInitialNote ? [rawInitialNote] : []),
    ]
      .join(' ')
      .trim() || undefined;

    const contactedAtRaw = String(fd.get('contactedAt') || '').trim();
    const contactedAt = contactedAtRaw ? new Date(contactedAtRaw).toISOString() : undefined;

    const matchedSource =
      UNIFIED_LEAD_SOURCES.find((s) => s.label === selectedSource) ?? UNIFIED_LEAD_SOURCES[0];

    const rawPayload = {
      contactChannel: matchedSource.channel,
      phone,
      contactName,
      companyName,
      projectName,
      email,
      selfReportedSource: matchedSource.label,
      contactedAt,
      areaType,
      hcmDistrict: areaType === 'hcm' ? district : undefined,
      province: areaType === 'other_province' ? province : undefined,
      installationAddress,
      productIds: selectedProductIds,
      customProductNote: combinedCustomNote,
      initialNote,
      reassignToSalesId:
        tickReassign && reassignSalesId ? Number(reassignSalesId) : undefined,
      reassignReason:
        tickReassign && reassignSalesId ? reassignReason : undefined,
    };

    const parsed = CreateManualLeadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message || 'Vui lòng kiểm tra lại SĐT và danh mục sản phẩm.',
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiRequest<{ id: number; leadCode: string }>('/api/v1/leads', {
        method: 'POST',
        csrfToken,
        body: parsed.data,
      });
      await onCreatedSuccess(
        created.leadCode,
        tickReassign && reassignSalesId
          ? 'Đã chuyển giao cho NVKD được chỉ định.'
          : 'Đã gán cho người tạo.',
      );
      onClose();
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Không thể tạo hồ sơ Lead mới.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-4xl max-h-[90vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Fixed Header */}
        <div className="px-6 py-3.5 bg-white border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#1E3A8A] text-white grid place-items-center shrink-0 shadow-xs">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-slate-900 text-base sm:text-lg truncate">
                Tạo Hồ sơ Lead
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Hệ thống tự động chuẩn hóa SĐT, phát hiện trùng và cảnh báo dò giá
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 grid place-items-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Uncontrolled Form Body — Synchronized with Hồ sơ Lead */}
        <form
          id="manual-lead-intake-form"
          ref={formRef}
          onSubmit={(e) => void handleSubmit(e)}
          className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-50/40 text-sm"
        >
          {validationError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 font-semibold">
              {validationError}
            </div>
          )}

          {/* Top Bar: Chuyển Lead & Tích nghi vấn + Thời điểm liên hệ */}
          <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Prominent Reassign Lead Toggle */}
                <label
                  className={`h-9 px-3.5 rounded-lg border inline-flex items-center gap-2 cursor-pointer select-none text-xs font-bold transition ${
                    tickReassign
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={tickReassign}
                    onChange={(e) => setTickReassign(e.target.checked)}
                    className="w-3.5 h-3.5 accent-white rounded"
                  />
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>Chuyển Lead cho NVKD khác</span>
                </label>

                {/* Single Suspect Flag Toggle */}
                <label
                  className={`h-9 px-3.5 rounded-lg border inline-flex items-center gap-2 cursor-pointer select-none text-xs font-bold transition ${
                    tickSuspect
                      ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={tickSuspect}
                    onChange={(e) => setTickSuspect(e.target.checked)}
                    className="w-3.5 h-3.5 accent-white rounded"
                  />
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Tích nghi vấn</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Thời điểm liên hệ:</span>
                <input
                  name="contactedAt"
                  type="datetime-local"
                  defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                    .toISOString()
                    .slice(0, 16)}
                  className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800"
                />
              </div>
            </div>

            {tickReassign && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-100 animate-in fade-in duration-150">
                <select
                  required
                  value={reassignSalesId}
                  onChange={(e) =>
                    setReassignSalesId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full h-9 px-3 rounded-lg border border-blue-300 bg-white text-xs font-semibold text-slate-800"
                >
                  <option value="">Chọn NVKD nhận bàn giao</option>
                  {salesOptions
                    .filter((s) => s.id !== currentUserId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} — {s.activeLeadCount} Lead
                      </option>
                    ))}
                </select>
                <select
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-blue-300 bg-white text-xs font-medium text-slate-800"
                >
                  {REASSIGN_REASONS.map((r) => (
                    <option key={r} value={r}>
                      Lý do: {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Block 1: Thông tin Khách hàng & Địa điểm Công trình (Đồng bộ 100% với Hồ sơ Lead) */}
          <div className="p-4 rounded-xl border border-slate-200/90 bg-white space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-slate-900 text-sm">
                1. Thông tin Khách hàng &amp; Địa điểm Công trình
              </span>
              <span className="text-xs font-semibold text-[#1E3A8A]">
                Nguồn: {selectedSource}
              </span>
            </div>

            {/* Phát cảnh báo lập tức khi nhập SĐT hoặc Công ty bị trùng */}
            {liveMatches.length > 0 && (
              <div className="space-y-2 animate-in fade-in duration-150">
                {liveMatches.slice(0, 3).map((m) => {
                  const isOpenLead =
                    m.pipelineStatus === 'new_lead' ||
                    m.pipelineStatus === 'quoting' ||
                    m.pipelineStatus === 'quote_sent';
                  const isWonLead = m.pipelineStatus === 'won';

                  const badgeText = isOpenLead
                    ? 'CẢNH BÁO TRÙNG LEAD ĐANG MỞ'
                    : isWonLead
                      ? 'KHÁCH CŨ QUAY LẠI'
                      : 'KHÁCH QUAY LẠI';

                  const boxStyle = isOpenLead
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : isWonLead
                      ? 'bg-blue-50 border-blue-300 text-slate-900'
                      : 'bg-amber-50 border-amber-300 text-amber-950';

                  const pillStyle = isOpenLead
                    ? 'bg-rose-600 text-white'
                    : isWonLead
                      ? 'bg-[#1E3A8A] text-white'
                      : 'bg-amber-600 text-white';

                  return (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${boxStyle}`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${pillStyle}`}>
                            {badgeText}
                          </span>
                          <span className="font-mono font-bold text-[#1E3A8A]">
                            {m.leadCode}
                          </span>
                          <span className="font-bold truncate">
                            · {m.companyName || m.contactName || m.phone}
                          </span>
                        </div>
                        <p className="text-[11px] opacity-90">
                          SĐT: <strong className="font-mono">{m.phone}</strong> · Trạng thái:{' '}
                          <strong>{PIPELINE_STATUS_LABELS[m.pipelineStatus]}</strong>
                          {m.lostReason ? ` (${m.lostReason})` : ''} · Phụ trách:{' '}
                          <strong>{m.assignedSalesName || 'Chưa phân bổ'}</strong>
                        </p>
                      </div>

                      {onOpenExistingLead && (
                        <button
                          type="button"
                          onClick={() => onOpenExistingLead(m.id)}
                          className="h-8 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-[#1E3A8A] font-bold shrink-0 shadow-2xs transition"
                        >
                          Xem hồ sơ này →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Row 1: Số điện thoại, Người liên hệ, Email */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Số điện thoại *
                </label>
                <input
                  name="phone"
                  type="tel"
                  required
                  defaultValue=""
                  onChange={(e) => setLivePhone(e.target.value)}
                  placeholder="0909 123 456"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono font-semibold text-[#1E3A8A] focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Người liên hệ
                </label>
                <input
                  name="contactName"
                  type="text"
                  defaultValue=""
                  placeholder="Họ tên khách hàng..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-medium text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Email
                </label>
                <input
                  name="email"
                  type="email"
                  defaultValue=""
                  placeholder="email@congty.vn"
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              {/* Row 2: Đơn vị / Công ty, Tên dự án, Nguồn dự án */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Đơn vị / Công ty
                </label>
                <input
                  name="companyName"
                  type="text"
                  defaultValue=""
                  onChange={(e) => setLiveCompany(e.target.value)}
                  placeholder="Tên doanh nghiệp / đơn vị..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-medium text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tên dự án / Công trình
                </label>
                <input
                  name="projectName"
                  type="text"
                  defaultValue=""
                  placeholder="VD: Màn hình LED Hội trường..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 font-medium text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nguồn dự án *
                </label>
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                >
                  {UNIFIED_LEAD_SOURCES.map((src) => (
                    <option key={src.label} value={src.label}>
                      {src.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 3: Khu vực công trình, Quận / Huyện, Địa chỉ chi tiết */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Khu vực công trình
                </label>
                <select
                  value={areaType}
                  onChange={(e) => setAreaType(e.target.value as 'hcm' | 'other_province')}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-800"
                >
                  <option value="hcm">Nội thành TP. Hồ Chí Minh</option>
                  <option value="other_province">Tỉnh / Thành phố khác</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {areaType === 'hcm' ? 'Quận / Huyện TP.HCM' : 'Tỉnh / Thành phố'}
                </label>
                {areaType === 'hcm' ? (
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-800"
                  >
                    {HCM_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-800"
                  >
                    {VIETNAM_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Địa chỉ lắp đặt chi tiết
                </label>
                <input
                  name="installationAddress"
                  type="text"
                  defaultValue=""
                  placeholder="Số nhà, đường, KCN..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>
          </div>

          {/* Block 2: Danh mục sản phẩm & Dịch vụ khác + Ghi chú */}
          <div className="space-y-3">
            <ProductCheckboxGrid
              products={products}
              selectedIds={selectedProductIds}
              onToggleProduct={handleToggleProduct}
              customItems={customServiceItems}
              onAddCustomItem={handleAddCustomItem}
              onRemoveCustomItem={handleRemoveCustomItem}
            />

            <div className="p-4 rounded-xl border border-slate-200/90 bg-white grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ghi chú kích thước / cấu hình kỹ thuật
                </label>
                <input
                  name="customProductNote"
                  type="text"
                  defaultValue=""
                  placeholder="VD: Kích thước 4m x 2.5m, lắp hội trường..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ghi chú tư vấn
                </label>
                <input
                  name="initialNote"
                  type="text"
                  defaultValue=""
                  placeholder="VD: Cần báo giá trong chiều nay..."
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Fixed Footer Actions */}
        <div className="shrink-0 px-6 py-3.5 border-t border-slate-200/80 bg-white flex items-center justify-end gap-2.5 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-4 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
          >
            Hủy bỏ
          </button>
          <button
            type="submit"
            form="manual-lead-intake-form"
            disabled={submitting || selectedProductIds.length === 0}
            className="h-10 px-5 rounded-xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white font-bold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>{submitting ? 'Đang lưu & kiểm tra trùng...' : 'Lưu Hồ sơ Lead'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

