'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Layers,
  MapPin,
  Phone,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CreateManualLeadSchema,
  HCM_DISTRICTS,
  REASSIGN_REASONS,
  VIETNAM_PROVINCES,
  type ProductCatalogDto,
  type SalesAssigneeOptionDto,
} from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';

interface ProductCheckboxGridProps {
  products: ProductCatalogDto[];
  selectedIds: number[];
  onToggleProduct: (id: number) => void;
}

const CATEGORY_META: Record<
  ProductCatalogDto['category'],
  { title: string; badge: string; badgeClass: string }
> = {
  MAN_HINH_LED: {
    title: 'Màn hình LED (Indoor / Outdoor)',
    badge: 'LED Screen',
    badgeClass: 'bg-blue-50 text-[#1E3A8A] border-blue-200',
  },
  BANG_DIEN_TU: {
    title: 'Bảng điện tử & Hiển thị chuyên dụng',
    badge: 'Bảng điện tử',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  KHAC: {
    title: 'Khung giá đỡ, Cabin & Dịch vụ kỹ thuật',
    badge: 'Dịch vụ / Khác',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

/**
 * Isolated memoized product grid so typing in uncontrolled text inputs
 * causes zero re-renders across the 25+ BA product checkboxes (60fps keystrokes).
 */
const ProductCheckboxGrid = memo(function ProductCheckboxGrid({
  products,
  selectedIds,
  onToggleProduct,
}: ProductCheckboxGridProps) {
  const [filterInput, setFilterInput] = useState('');
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    MAN_HINH_LED: true,
    BANG_DIEN_TU: true,
    KHAC: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilter(filterInput.trim().toLowerCase()), 200);
    return () => clearTimeout(timer);
  }, [filterInput]);

  const grouped = useMemo(() => {
    const map: Record<ProductCatalogDto['category'], ProductCatalogDto[]> = {
      MAN_HINH_LED: [],
      BANG_DIEN_TU: [],
      KHAC: [],
    };
    for (const p of products) {
      if (
        debouncedFilter &&
        !p.productName.toLowerCase().includes(debouncedFilter) &&
        !p.productCode.toLowerCase().includes(debouncedFilter)
      ) {
        continue;
      }
      map[p.category]?.push(p);
    }
    return map;
  }, [products, debouncedFilter]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleGroup = (cat: string) => {
    setOpenGroups((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#2563EB]" />
          <span className="font-bold text-slate-800 text-sm">
            Danh mục sản phẩm & dịch vụ (Đã chọn:{' '}
            <strong className="text-[#2563EB]">{selectedIds.length}</strong>) *
          </span>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterInput}
            onChange={(e) => setFilterInput(e.target.value)}
            placeholder="Lọc nhanh P2.5, P3, Outdoor, BĐT..."
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-sm"
          />
        </div>
      </div>

      {/* Responsive Category Accordions */}
      <div className="space-y-2.5">
        {(['MAN_HINH_LED', 'BANG_DIEN_TU', 'KHAC'] as const).map((cat) => {
          const list = grouped[cat];
          if (list.length === 0) return null;
          const meta = CATEGORY_META[cat];
          const isOpen = openGroups[cat] ?? true;
          const selectedInCat = list.filter((p) => selectedSet.has(p.id)).length;

          return (
            <div
              key={cat}
              className="rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleGroup(cat)}
                className="w-full px-3.5 py-2.5 flex items-center justify-between bg-white hover:bg-slate-50 text-left border-b border-slate-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-2 py-0.5 rounded-md border text-xs font-bold shrink-0 ${meta.badgeClass}`}
                  >
                    {meta.badge}
                  </span>
                  <span className="font-bold text-sm text-slate-800 truncate">{meta.title}</span>
                  {selectedInCat > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#2563EB] text-white text-xs font-bold">
                      {selectedInCat}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-slate-500 text-xs">
                  <span>{list.length} SP</span>
                  {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {isOpen && (
                <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                  {list.map((p) => {
                    const checked = selectedSet.has(p.id);
                    return (
                      <label
                        key={p.id}
                        onClick={() => onToggleProduct(p.id)}
                        className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer select-none transition-colors min-h-[42px] ${
                          checked
                            ? 'bg-blue-50/90 border-[#2563EB] text-[#1E3A8A] font-semibold shadow-2xs'
                            : 'bg-white border-slate-200/80 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <span
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-[#2563EB] border-[#2563EB] text-white'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" />}
                        </span>
                        <span className="text-xs leading-snug break-words">
                          {p.productName}
                        </span>
                      </label>
                    );
                  })}
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
  currentUserId?: number;
  csrfToken?: string;
  onCreatedSuccess: (leadCode: string, assignedMsg: string) => Promise<void>;
}

export function ManualLeadModal({
  open,
  onClose,
  products,
  salesOptions,
  currentUserId,
  csrfToken,
  onCreatedSuccess,
}: ManualLeadModalProps) {
  // Uncontrolled form refs for zero-lag 60fps typing
  const formRef = useRef<HTMLFormElement | null>(null);
  const [channel, setChannel] = useState<'hotline' | 'zalo' | 'email' | 'form_web'>('hotline');
  const [areaType, setAreaType] = useState<'hcm' | 'other_province'>('hcm');
  const [district, setDistrict] = useState<string>(HCM_DISTRICTS[0]);
  const [province, setProvince] = useState<string>(VIETNAM_PROVINCES[0]);
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([1]);
  const [tickReassign, setTickReassign] = useState(false);
  const [reassignSalesId, setReassignSalesId] = useState<number | ''>('');
  const [reassignReason, setReassignReason] = useState<string>(REASSIGN_REASONS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleToggleProduct = useCallback((id: number) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
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
    const selfReportedSource = String(fd.get('selfReportedSource') || '').trim() || undefined;
    const installationAddress = String(fd.get('installationAddress') || '').trim() || undefined;
    const customProductNote = String(fd.get('customProductNote') || '').trim() || undefined;
    const initialNote = String(fd.get('initialNote') || '').trim() || undefined;
    const contactedAtRaw = String(fd.get('contactedAt') || '').trim();
    const contactedAt = contactedAtRaw ? new Date(contactedAtRaw).toISOString() : undefined;

    const rawPayload = {
      contactChannel: channel,
      phone,
      contactName,
      companyName,
      projectName,
      email,
      selfReportedSource,
      contactedAt,
      areaType,
      hcmDistrict: areaType === 'hcm' ? district : undefined,
      province: areaType === 'other_province' ? province : undefined,
      installationAddress,
      productIds: selectedProductIds,
      customProductNote,
      initialNote,
      reassignToSalesId:
        tickReassign && reassignSalesId ? Number(reassignSalesId) : undefined,
      reassignReason:
        tickReassign && reassignSalesId ? reassignReason : undefined,
    };

    const parsed = CreateManualLeadSchema.safeParse(rawPayload);
    if (!parsed.success) {
      setValidationError(
        parsed.error.issues[0]?.message || 'Vui lòng kiểm tra lại SĐT và mặt hàng LED.',
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
          : 'Mặc định gán cho người tạo (hoặc phân bổ Round-Robin).',
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
      <div className="bg-white w-full sm:max-w-3xl max-h-[88vh] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
        {/* Fixed Header */}
        <div className="px-6 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#1E3A8A] text-white grid place-items-center shrink-0 shadow-xs">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display font-bold text-slate-900 text-base sm:text-lg truncate">
                Tiếp nhận Hồ sơ Lead mới
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Chuẩn hóa số điện thoại, kiểm tra trùng lặp và đối chiếu cảnh báo dò giá tự động
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

        {/* Scrollable Uncontrolled Form Body */}
        <form
          id="manual-lead-intake-form"
          ref={formRef}
          onSubmit={(e) => void handleSubmit(e)}
          className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4 text-sm"
        >
          {validationError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 font-semibold">
              {validationError}
            </div>
          )}

          {/* Grid Row 1: Contact Source, Phone, Contact Name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Nguồn / Kênh liên hệ *</label>
              <select
                value={channel}
                onChange={(e) =>
                  setChannel(e.target.value as 'hotline' | 'zalo' | 'email' | 'form_web')
                }
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800"
              >
                <option value="hotline">Hotline (Đã tiếp nhận ngay)</option>
                <option value="zalo">Zalo OA / Cá nhân (Đã tiếp nhận ngay)</option>
                <option value="email">Email nhận Lead</option>
                <option value="form_web">Form Website</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Số điện thoại * <span className="text-slate-400 font-normal">(Tự chuẩn hóa E2)</span>
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  name="phone"
                  type="tel"
                  required
                  defaultValue=""
                  placeholder="0909 123 456"
                  className="w-full h-10 pl-8 pr-3 rounded-xl border border-slate-200 font-mono font-bold text-slate-900 focus:border-[#2563EB] outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Người liên hệ</label>
              <input
                name="contactName"
                type="text"
                defaultValue=""
                placeholder="VD: Anh Minh - Trưởng phòng Mua hàng"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-[#2563EB] outline-none"
              />
            </div>
          </div>

          {/* Grid Row 2: Company, Project, Email */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Đơn vị / Công ty
              </label>
              <input
                name="companyName"
                type="text"
                defaultValue=""
                placeholder="VD: Công ty Sự kiện Ánh Dương"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-[#2563EB] outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Tên dự án / Công trình</label>
              <input
                name="projectName"
                type="text"
                defaultValue=""
                placeholder="VD: Màn hình LED Hội trường Tầng 5"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-[#2563EB] outline-none"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Email nhận báo giá
              </label>
              <input
                name="email"
                type="email"
                defaultValue=""
                placeholder="khachhang@congty.vn"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 focus:border-[#2563EB] outline-none"
              />
            </div>
          </div>

          {/* Grid Row 2.5 (UC01 2.1): Thời điểm khách liên hệ & Kênh biết đến */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3 rounded-xl bg-blue-50/40 border border-blue-100">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Thời điểm khách liên hệ <span className="text-xs font-normal text-slate-500">(Theo nhật ký cuộc gọi / Zalo — UC01 2.1)</span>
              </label>
              <input
                name="contactedAt"
                type="datetime-local"
                defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Kênh biết đến Toàn Trung <span className="text-xs font-normal text-slate-500">(Hỏi khách khi tư vấn — UC01 2.1)</span>
              </label>
              <input
                name="selfReportedSource"
                type="text"
                list="manual-self-reported-sources"
                defaultValue=""
                placeholder="Chọn hoặc nhập: Tìm Google, Bạn bè giới thiệu, Bảng hiệu..."
                className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
              />
              <datalist id="manual-self-reported-sources">
                <option value="Tìm trên Google" />
                <option value="Bạn bè / Đối tác giới thiệu" />
                <option value="Thấy bảng hiệu / Showroom Toàn Trung" />
                <option value="Zalo / Facebook Toàn Trung" />
                <option value="Khách hàng cũ quay lại" />
                <option value="Hội thảo / Triển lãm" />
              </datalist>
            </div>
          </div>

          {/* Grid Row 3: Location Selector (HCM District vs Province) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-800 inline-flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#2563EB]" />
                <span>Khu vực khảo sát & Lắp đặt</span>
              </span>
              <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setAreaType('hcm')}
                  className={`px-2.5 py-1 rounded-md font-bold transition ${
                    areaType === 'hcm' ? 'bg-[#1E3A8A] text-white' : 'text-slate-600'
                  }`}
                >
                  TP. Hồ Chí Minh
                </button>
                <button
                  type="button"
                  onClick={() => setAreaType('other_province')}
                  className={`px-2.5 py-1 rounded-md font-bold transition ${
                    areaType === 'other_province' ? 'bg-[#1E3A8A] text-white' : 'text-slate-600'
                  }`}
                >
                  Tỉnh / Thành khác
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">
                  {areaType === 'hcm' ? 'Quận / Huyện TP.HCM' : 'Tỉnh / Thành phố'}
                </label>
                {areaType === 'hcm' ? (
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-medium"
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
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white font-medium"
                  >
                    {VIETNAM_PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 mb-1">
                  Địa chỉ lắp đặt chi tiết
                </label>
                <input
                  name="installationAddress"
                  type="text"
                  defaultValue=""
                  placeholder="Số nhà, tên đường, tòa nhà / khu công nghiệp..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Memoized 25-Product Grid */}
          <ProductCheckboxGrid
            products={products}
            selectedIds={selectedProductIds}
            onToggleProduct={handleToggleProduct}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Quy cách kích thước / Ghi chú sản phẩm khác
              </label>
              <input
                name="customProductNote"
                type="text"
                defaultValue=""
                placeholder="VD: Ngang 5m x Cao 3m, cần khung treo gia cố..."
                className="w-full h-9 px-3 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Ghi chú tư vấn ban đầu
              </label>
              <input
                name="initialNote"
                type="text"
                defaultValue=""
                placeholder="VD: Khách cần báo giá gấp trong chiều nay..."
                className="w-full h-9 px-3 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          {/* Optional Reassign on Create (UC01 4.1) */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
            <label className="inline-flex items-center gap-2 font-bold text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={tickReassign}
                onChange={(e) => setTickReassign(e.target.checked)}
              />
              <span>
                Tích chọn chuyển Lead ngay cho NVKD khác (Mặc định không tích sẽ gán cho người tạo)
              </span>
            </label>

            {tickReassign && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <select
                  required
                  value={reassignSalesId}
                  onChange={(e) =>
                    setReassignSalesId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full h-9 px-3 rounded-xl border border-amber-300 bg-white"
                >
                  <option value="">-- Chọn NVKD nhận bàn giao --</option>
                  {salesOptions
                    .filter((s) => s.id !== currentUserId)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} ({s.activeLeadCount} Lead đang xử lý)
                      </option>
                    ))}
                </select>
                <select
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-amber-300 bg-white"
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

