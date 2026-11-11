'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crown,
  ExternalLink,
  Eye,
  FileText,
  FolderPlus,
  History,
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

const STATUS_BADGE_MAP: Record<string, string> = {
  new_lead: 'bg-blue-100 text-blue-900 border border-blue-200',
  quoting: 'bg-amber-100 text-amber-900 border border-amber-200',
  quote_sent: 'bg-purple-100 text-purple-900 border border-purple-200',
  won: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
  lost: 'bg-slate-100 text-slate-700 border border-slate-200',
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
  const [activeCategory, setActiveCategory] = useState<'MAN_HINH_LED' | 'BANG_DIEN_TU' | 'KHAC'>(
    'MAN_HINH_LED',
  );
  const [productSearch, setProductSearch] = useState('');
  const [customDraft, setCustomDraft] = useState('');

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const handleCommitCustom = () => {
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    onAddCustomItem(trimmed);
    setCustomDraft('');
  };

  const categoryDefs = [
    {
      category: 'MAN_HINH_LED' as const,
      title: 'Màn hình LED',
      count: products.filter((p) => p.category === 'MAN_HINH_LED').length,
    },
    {
      category: 'BANG_DIEN_TU' as const,
      title: 'Bảng điện tử & Hiển thị số',
      count: products.filter((p) => p.category === 'BANG_DIEN_TU').length,
    },
    {
      category: 'KHAC' as const,
      title: 'Dịch vụ / Nhu cầu khác',
      count: products.filter((p) => p.category === 'KHAC').length,
    },
  ];

  const visibleProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        return cleanProductLabel(p.productName).toLowerCase().includes(q);
      }
      return p.category === activeCategory;
    });
  }, [products, activeCategory, productSearch]);

  return (
    <div className="p-4 rounded-xl border border-slate-200/90 bg-white space-y-3">
      {/* Header: Sản phẩm quan tâm + Đã chọn N sản phẩm */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#1E3A8A]" />
          <span className="font-bold text-slate-900 text-sm">Sản phẩm quan tâm *</span>
        </div>
        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-bold">
          Đã chọn {selectedIds.length + customItems.length} sản phẩm
        </span>
      </div>

      {/* Thanh tìm sản phẩm + Các thẻ sản phẩm đã chọn */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-80 shrink-0">
          <input
            type="text"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            placeholder="Tìm sản phẩm (ví dụ: Màn hình LED, Bảng điện tử...)"
            className="w-full h-8 px-3 rounded-lg border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
          />
          {productSearch && (
            <button
              type="button"
              onClick={() => setProductSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {products
            .filter((p) => selectedSet.has(p.id))
            .map((sel) => (
              <span
                key={sel.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-semibold"
              >
                <span>{cleanProductLabel(sel.productName)}</span>
                {selectedIds.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onToggleProduct(sel.id)}
                    className="hover:text-rose-600 ml-0.5 font-bold"
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
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onRemoveCustomItem(item)}
                className="hover:text-rose-600 ml-0.5 font-bold"
                title="Xóa mục này"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Bố cục 2 cột: Cột trái chọn nhóm (Bấm mục nào sổ mục đó ra bên phải) */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start pt-1">
        {/* Cột trái: Danh mục nhóm */}
        <div className="sm:col-span-4 flex flex-col gap-1">
          {categoryDefs.map((cat) => {
            const isActive = !productSearch.trim() && activeCategory === cat.category;
            return (
              <button
                key={cat.category}
                type="button"
                onClick={() => {
                  setProductSearch('');
                  setActiveCategory(cat.category);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center justify-between ${
                  isActive
                    ? 'bg-blue-50/90 text-[#1E3A8A] font-bold border-l-4 border-l-[#2563EB]'
                    : 'text-slate-700 hover:bg-slate-50 font-medium'
                }`}
              >
                <span>{cat.title}</span>
                <span className="text-[11px] text-slate-400">({cat.count})</span>
              </button>
            );
          })}
        </div>

        {/* Cột phải: Chỉ hiển thị các sản phẩm của mục đang chọn */}
        <div className="sm:col-span-8 p-3 rounded-xl border border-slate-200/90 bg-slate-50/40 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {visibleProducts.map((p) => {
              const checked = selectedSet.has(p.id);
              return (
                <label
                  key={p.id}
                  onClick={() => onToggleProduct(p.id)}
                  className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                    checked
                      ? 'bg-blue-50/80 border-blue-300 text-[#1E3A8A] font-semibold'
                      : 'bg-white border-slate-200/80 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    className="w-4 h-4 accent-[#2563EB] rounded pointer-events-none"
                  />
                  <span className="truncate">{cleanProductLabel(p.productName)}</span>
                </label>
              );
            })}
          </div>

          {(activeCategory === 'KHAC' || productSearch.trim() !== '') && (
            <div className="pt-2 border-t border-slate-200/80 flex gap-1.5">
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
                placeholder="Nhập thêm dịch vụ / nhu cầu khác..."
                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-amber-300 bg-white text-xs text-slate-800 focus:border-[#1E3A8A] outline-none"
              />
              <button
                type="button"
                onClick={handleCommitCustom}
                className="h-8 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm</span>
              </button>
            </div>
          )}
        </div>
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
  const [previewLeadId, setPreviewLeadId] = useState<number | null>(null);
  const [leadActionChoice, setLeadActionChoice] = useState<'create_new' | 'work_on_existing'>('create_new');
  const [targetExistingLeadId, setTargetExistingLeadId] = useState<number | null>(null);
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null);

  const inheritCustomerInfo = useCallback((lead: LeadItemDto) => {
    if (!formRef.current) return;
    const form = formRef.current;
    const elements = form.elements as unknown as Record<string, HTMLInputElement | HTMLSelectElement>;
    if (lead.phone && elements.phone) {
      elements.phone.value = lead.phone;
      setLivePhone(lead.phone);
    }
    if (lead.contactName && elements.contactName) {
      elements.contactName.value = lead.contactName;
    }
    if (lead.companyName && elements.companyName) {
      elements.companyName.value = lead.companyName;
      setLiveCompany(lead.companyName);
    }
    if (lead.email && elements.email) {
      elements.email.value = lead.email;
    }
    if (lead.areaType) {
      setAreaType(lead.areaType === 'hcm' ? 'hcm' : 'other_province');
    }
    if (lead.province) {
      setProvince(lead.province);
    }
    if (lead.hcmDistrict) {
      setDistrict(lead.hcmDistrict);
    }
    if (lead.installationAddress && elements.installationAddress) {
      elements.installationAddress.value = lead.installationAddress;
    }
    if (lead.products && lead.products.length > 0) {
      setSelectedProductIds(lead.products.map((p) => p.id));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setLivePhone('');
      setLiveCompany('');
      setPreviewLeadId(null);
      setLeadActionChoice('create_new');
      setTargetExistingLeadId(null);
      setFeedbackNote(null);
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
      existingLeadAction: leadActionChoice,
      targetExistingLeadId: targetExistingLeadId || (liveMatches[0]?.id ?? undefined),
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

          {feedbackNote && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 font-semibold flex items-center justify-between gap-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs">{feedbackNote}</span>
              </div>
              <button
                type="button"
                onClick={() => setFeedbackNote(null)}
                className="text-emerald-700 hover:text-emerald-950 font-bold px-1"
              >
                ×
              </button>
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
              <div className="space-y-2.5 animate-in fade-in duration-150">
                {liveMatches.slice(0, 3).map((m) => {
                  const isOpenLead =
                    m.pipelineStatus === 'new_lead' ||
                    m.pipelineStatus === 'quoting' ||
                    m.pipelineStatus === 'quote_sent';
                  const isWonLead = m.pipelineStatus === 'won';

                  // TRƯỜNG HỢP 1: KHÁCH CŨ ĐÃ MUA THÀNH CÔNG (VIP)
                  if (isWonLead) {
                    return (
                      <div
                        key={m.id}
                        className="p-3.5 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50/90 via-yellow-50/70 to-emerald-50 text-slate-900 shadow-2xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2.5 py-1 rounded-md font-extrabold text-[11px] bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 inline-flex items-center gap-1 shadow-2xs">
                              <Crown className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                              <span>👑 KHÁCH CŨ ĐÃ TỪNG MUA THÀNH CÔNG (VIP)</span>
                            </span>
                            <span className="font-mono font-bold text-[#1E3A8A]">
                              {m.leadCode}
                            </span>
                            <span className="font-bold truncate">
                              · {m.companyName || m.contactName || m.phone}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-800">
                            Đã chốt hợp đồng · Hồ sơ cũ được bảo lưu 100%
                          </span>
                        </div>

                        <p className="text-xs text-slate-700">
                          Khách hàng SĐT <strong className="font-mono">{m.phone}</strong> đã từng chốt hợp đồng thành công
                          {m.projectName ? ` cho dự án: "${m.projectName}"` : ''} · NVKD phụ trách:{' '}
                          <strong>{m.assignedSalesName || 'Kinh doanh'}</strong>.
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-amber-200/80">
                          <span className="text-[11px] text-slate-500 font-medium">
                            Khách đã mua quay lại: Xem hồ sơ đã chốt và kế thừa thông tin tạo Lead mới
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewLeadId(m.id)}
                              className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-amber-300 text-amber-900 font-bold inline-flex items-center gap-1 shadow-2xs transition"
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-700" />
                              <span>Xem hồ sơ ({m.leadCode})</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                inheritCustomerInfo(m);
                                setTargetExistingLeadId(m.id);
                                setLeadActionChoice('create_new');
                                setFeedbackNote(
                                  `Đã kế thừa thông tin khách hàng từ hồ sơ đã chốt ${m.leadCode}. Bạn có thể chỉnh sửa thông tin dự án mới và lưu hồ sơ.`,
                                );
                              }}
                              className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold inline-flex items-center gap-1 shadow-2xs transition"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Kế thừa &amp; Tạo mới</span>
                            </button>
                            {onOpenExistingLead && (
                              <button
                                type="button"
                                onClick={() => onOpenExistingLead(m.id)}
                                className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold inline-flex items-center gap-1 text-xs transition"
                                title="Mở trực tiếp hồ sơ đã chốt trên màn hình chính"
                              >
                                <ExternalLink className="w-3 h-3 text-slate-500" />
                                <span>Mở hồ sơ</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // TRƯỜNG HỢP 2: KHÁCH CHƯA CHỐT (Đang mở hoặc Từng thất bại quay lại)
                  const badgeText = isOpenLead
                    ? 'CẢNH BÁO TRÙNG LEAD ĐANG MỞ'
                    : 'KHÁCH QUAY LẠI HỎI MUA (CHƯA CHỐT TRƯỚC ĐÂY)';
                  const boxStyle = isOpenLead
                    ? 'bg-rose-50 border-rose-300 text-rose-950'
                    : 'bg-blue-50 border-blue-300 text-slate-900';
                  const pillStyle = isOpenLead
                    ? 'bg-rose-600 text-white'
                    : 'bg-[#1E3A8A] text-white';

                  const isWorkingOnThis =
                    leadActionChoice === 'work_on_existing' &&
                    (targetExistingLeadId === m.id || (!targetExistingLeadId && m.id === liveMatches[0]?.id));

                  return (
                    <div
                      key={m.id}
                      className={`p-3.5 rounded-xl border flex flex-col gap-2.5 text-xs ${boxStyle}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewLeadId(m.id)}
                            className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-[#1E3A8A] font-bold inline-flex items-center gap-1 shadow-2xs transition"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#1E3A8A]" />
                            <span>Xem hồ sơ ({m.leadCode})</span>
                          </button>
                          {onOpenExistingLead && (
                            <button
                              type="button"
                              onClick={() => onOpenExistingLead(m.id)}
                              className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold inline-flex items-center gap-1 shadow-2xs transition"
                              title="Chuyển ngay sang làm việc trên Lead này tại màn hình chính"
                            >
                              <ExternalLink className="w-3 h-3 text-slate-500" />
                              <span>Mở làm việc ngay</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Lựa chọn xử lý: Trực tiếp làm việc trên Lead đó HOẶC Tạo Lead mới riêng */}
                      <div className="p-2 rounded-lg bg-white/80 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="font-medium text-slate-700">
                          Lựa chọn hành động cho hồ sơ chưa chốt này:
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setLeadActionChoice('work_on_existing');
                              setTargetExistingLeadId(m.id);
                              inheritCustomerInfo(m);
                              setFeedbackNote(
                                `Đã chọn: Làm việc trực tiếp trên hồ sơ ${m.leadCode}. Khi lưu, hệ thống sẽ mở lại / cập nhật hồ sơ này.`,
                              );
                            }}
                            className={`h-7 px-2.5 rounded-md text-xs font-bold transition inline-flex items-center gap-1 ${
                              isWorkingOnThis
                                ? 'bg-[#1E3A8A] text-white shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <Check className={`w-3 h-3 ${isWorkingOnThis ? 'opacity-100' : 'opacity-0'}`} />
                            <span>🎯 Trực tiếp làm việc trên Lead này</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setLeadActionChoice('create_new');
                              setTargetExistingLeadId(m.id);
                              setFeedbackNote(
                                `Đã chọn: Tạo Lead mới riêng cho khách hàng này (vẫn liên kết để xem hồ sơ cũ ${m.leadCode}).`,
                              );
                            }}
                            className={`h-7 px-2.5 rounded-md text-xs font-bold transition inline-flex items-center gap-1 ${
                              !isWorkingOnThis
                                ? 'bg-[#1E3A8A] text-white shadow-2xs'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            <Check className={`w-3 h-3 ${!isWorkingOnThis ? 'opacity-100' : 'opacity-0'}`} />
                            <span>➕ Tạo Lead mới riêng</span>
                          </button>
                        </div>
                      </div>
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
        <div className="shrink-0 px-6 py-3.5 border-t border-slate-200/80 bg-white flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="text-slate-500 font-medium">
            {leadActionChoice === 'work_on_existing' && targetExistingLeadId && (
              <span className="text-blue-800 font-semibold inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-blue-600" />
                <span>Chế độ: Cập nhật &amp; Làm việc trực tiếp trên Lead cũ</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
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
              <span>
                {submitting
                  ? 'Đang lưu & kiểm tra...'
                  : leadActionChoice === 'work_on_existing'
                    ? '🎯 Lưu & Làm việc trên Lead'
                    : 'Lưu Hồ sơ Lead'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Xem Nhanh Hồ Sơ Lead (Preview Drawer / Modal) để người dùng không mất form nhập liệu */}
      {previewLeadId && (() => {
        const previewLead = existingLeads.find((l) => l.id === previewLeadId);
        if (!previewLead) return null;
        const isWon = previewLead.pipelineStatus === 'won';

        return (
          <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-2xl max-h-[85vh] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#1E3A8A] text-white grid place-items-center shadow-xs">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#1E3A8A] text-sm">
                        {previewLead.leadCode}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          STATUS_BADGE_MAP[previewLead.pipelineStatus] || 'bg-slate-100 text-slate-800'
                        }`}
                      >
                        {PIPELINE_STATUS_LABELS[previewLead.pipelineStatus]}
                      </span>
                      {isWon && (
                        <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[11px] font-extrabold inline-flex items-center gap-1 shadow-2xs">
                          <Crown className="w-3 h-3 fill-slate-950 text-slate-950" />
                          <span>VIP ĐÃ MUA</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Xem nhanh hồ sơ để quyết định phương án làm việc mà không làm mất dữ liệu form đang tạo
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewLeadId(null)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 grid place-items-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 text-xs text-slate-700 bg-slate-50/40">
                {isWon && (
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-50/90 via-yellow-50/70 to-emerald-50 border border-amber-300 text-slate-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900 text-sm">
                      <Crown className="w-4 h-4 fill-amber-500 text-amber-600" />
                      <span>Khách hàng thân thiết · Đã từng chốt thành công hợp đồng</span>
                    </div>
                    <p className="text-[11px] text-slate-700 leading-relaxed">
                      Hồ sơ này đã chốt hợp đồng thành công. Khi bấm <strong>Kế thừa thông tin &amp; Tạo Lead mới</strong>, hệ thống sẽ bảo lưu 100% hồ sơ đã chốt và tự động điền sẵn các thông tin đơn vị, SĐT, địa chỉ vào form để bạn tiếp tục tạo hợp đồng cho dự án mới.
                    </p>
                  </div>
                )}

                {!isWon && (
                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-slate-800 space-y-1">
                    <div className="font-bold text-[#1E3A8A] text-sm">
                      Hồ sơ đang ở trạng thái: {PIPELINE_STATUS_LABELS[previewLead.pipelineStatus]}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Khách hàng đang có hồ sơ trong hệ thống. Bạn có thể chọn <strong>Làm việc trực tiếp trên Lead này</strong> để mở lại/chăm sóc tiếp, hoặc <strong>Tạo Lead mới riêng</strong> nếu đây là một dự án hoàn toàn độc lập.
                    </p>
                  </div>
                )}

                {/* Grid Chi tiết Khách hàng & Công trình */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3 shadow-2xs">
                  <span className="font-bold text-slate-900 text-xs block border-b border-slate-100 pb-1.5">
                    1. Chi tiết Khách hàng &amp; Địa điểm Công trình
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 block text-[11px]">Đơn vị / Công ty:</span>
                      <strong className="text-slate-900 font-semibold text-xs">
                        {previewLead.companyName || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Người liên hệ:</span>
                      <strong className="text-slate-900 font-semibold text-xs">
                        {previewLead.contactName || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Số điện thoại:</span>
                      <strong className="text-[#1E3A8A] font-mono font-bold text-xs">
                        {previewLead.phone}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Email:</span>
                      <strong className="text-slate-900 font-semibold text-xs">
                        {previewLead.email || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Tên dự án trước:</span>
                      <strong className="text-slate-900 font-semibold text-xs">
                        {previewLead.projectName || '—'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Địa chỉ công trình:</span>
                      <strong className="text-slate-900 font-semibold text-xs">
                        {previewLead.installationAddress || previewLead.province || '—'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Sản phẩm & Ghi chú */}
                <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs">
                  <span className="font-bold text-slate-900 text-xs block border-b border-slate-100 pb-1.5">
                    2. Sản phẩm LED &amp; Ghi chú kỹ thuật
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {previewLead.products.length > 0 ? (
                      previewLead.products.map((p) => (
                        <span
                          key={p.id}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#1E3A8A] font-semibold text-xs"
                        >
                          {p.productName}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400">Chưa chọn sản phẩm</span>
                    )}
                  </div>
                  {previewLead.customProductNote && (
                    <p className="text-slate-600 text-[11px] pt-1 border-t border-slate-100">
                      Ghi chú cấu hình: <strong>{previewLead.customProductNote}</strong>
                    </p>
                  )}
                  {previewLead.initialNote && (
                    <p className="text-slate-600 text-[11px]">
                      Ghi chú ban đầu: <strong>{previewLead.initialNote}</strong>
                    </p>
                  )}
                  {previewLead.lostReason && (
                    <p className="text-rose-700 text-[11px]">
                      Lý do thất bại lần trước: <strong>{previewLead.lostReason}</strong>
                    </p>
                  )}
                </div>

                {/* Thông tin phụ trách */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 px-2 py-1 bg-white rounded-lg border border-slate-200/80">
                  <span>Sales phụ trách: <strong className="text-slate-800">{previewLead.assignedSalesName || 'Chưa phân bổ'}</strong></span>
                  <span>Ngày liên hệ: <strong className="text-slate-800">{new Date(previewLead.contactedAt).toLocaleDateString('vi-VN')}</strong></span>
                </div>
              </div>

              {/* Footer Actions của Preview Modal */}
              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewLeadId(null)}
                  className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white text-slate-600 font-semibold hover:bg-slate-100 text-xs"
                >
                  Đóng xem nhanh
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {isWon ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          inheritCustomerInfo(previewLead);
                          setTargetExistingLeadId(previewLead.id);
                          setLeadActionChoice('create_new');
                          setFeedbackNote(
                            `Đã kế thừa thông tin từ hồ sơ đã chốt ${previewLead.leadCode}. Bạn hãy nhập tên dự án mới và lưu hồ sơ.`,
                          );
                          setPreviewLeadId(null);
                        }}
                        className="h-9 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold inline-flex items-center gap-1.5 text-xs shadow-2xs transition"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Kế thừa thông tin &amp; Tạo Lead mới</span>
                      </button>
                      {onOpenExistingLead && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewLeadId(null);
                            onOpenExistingLead(previewLead.id);
                          }}
                          className="h-9 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs transition"
                        >
                          Mở hồ sơ trên Workspace →
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setLeadActionChoice('work_on_existing');
                          setTargetExistingLeadId(previewLead.id);
                          inheritCustomerInfo(previewLead);
                          setFeedbackNote(`Đã chọn làm việc trực tiếp trên hồ sơ ${previewLead.leadCode}.`);
                          setPreviewLeadId(null);
                        }}
                        className="h-9 px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold inline-flex items-center gap-1.5 text-xs shadow-2xs transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Làm việc trực tiếp trên Lead này</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLeadActionChoice('create_new');
                          setTargetExistingLeadId(previewLead.id);
                          setFeedbackNote(`Đã chọn tạo Lead mới riêng cho khách này.`);
                          setPreviewLeadId(null);
                        }}
                        className="h-9 px-3.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold text-xs transition"
                      >
                        <span>➕ Tạo Lead mới riêng</span>
                      </button>
                      {onOpenExistingLead && (
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewLeadId(null);
                            onOpenExistingLead(previewLead.id);
                          }}
                          className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                          title="Chuyển ngay sang làm việc trên Lead này tại màn hình chính"
                        >
                          Mở ngay →
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

