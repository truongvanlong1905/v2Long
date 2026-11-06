'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  FolderPlus,
  FolderUp,
  Kanban,
  Layers,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Table2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  CONTACT_CHANNEL_LABELS,
  HCM_DISTRICTS,
  LOST_REASONS,
  PIPELINE_STATUSES,
  PIPELINE_STATUS_LABELS,
  REASSIGN_REASONS,
  SPAM_REASONS,
  VIETNAM_PROVINCES,
  hasBaPermission,
  type ContactChannel,
  type LeadItemDto,
  type PipelineStatus,
  type PriceCheckAlertDto,
  type ProductCatalogDto,
  type SalesAssigneeOptionDto,
} from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

const STATUS_BADGE_STYLES: Record<PipelineStatus, string> = {
  new_lead: 'bg-violet-50 text-violet-700 border-violet-200',
  quoting: 'bg-blue-50 text-blue-700 border-blue-200',
  quote_sent: 'bg-amber-50 text-amber-800 border-amber-300',
  won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lost: 'bg-slate-100 text-slate-600 border-slate-200',
};

export function LeadsWorkspace() {
  const { user } = useSession();
  const [leads, setLeads] = useState<LeadItemDto[]>([]);
  const [products, setProducts] = useState<ProductCatalogDto[]>([]);
  const [salesOptions, setSalesOptions] = useState<SalesAssigneeOptionDto[]>([]);
  const [priceCheckAlerts, setPriceCheckAlerts] = useState<PriceCheckAlertDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeSpam, setIncludeSpam] = useState(false);

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [leadDetailTab, setLeadDetailTab] = useState<'info' | 'pipeline' | 'attachments' | 'activity'>('info');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Create Lead form state
  const [createChannel, setCreateChannel] = useState<'hotline' | 'zalo' | 'email' | 'form_web'>('hotline');
  const [createPhone, setCreatePhone] = useState('');
  const [createContactName, setCreateContactName] = useState('');
  const [createCompanyName, setCreateCompanyName] = useState('');
  const [createProjectName, setCreateProjectName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createSelfSource, setCreateSelfSource] = useState('');
  const [createAreaType, setCreateAreaType] = useState<'hcm' | 'other_province'>('hcm');
  const [createDistrict, setCreateDistrict] = useState<string>(HCM_DISTRICTS[0]);
  const [createProvince, setCreateProvince] = useState<string>(VIETNAM_PROVINCES[0]);
  const [createAddress, setCreateAddress] = useState('');
  const [createProductIds, setCreateProductIds] = useState<number[]>([1]);
  const [createCustomProductNote, setCreateCustomProductNote] = useState('');
  const [createInitialNote, setCreateInitialNote] = useState('');
  const [tickReassignOnCreate, setTickReassignOnCreate] = useState(false);
  const [createReassignSalesId, setCreateReassignSalesId] = useState<number | ''>('');
  const [createReassignReason, setCreateReassignReason] = useState<string>(REASSIGN_REASONS[0]);
  const [submitting, setSubmitting] = useState(false);

  // Detail modal action states
  const [targetStatus, setTargetStatus] = useState<PipelineStatus>('quoting');
  const [statusReason, setStatusReason] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string>('');
  const [markQuoteResponded, setMarkQuoteResponded] = useState(false);

  const [reassignTargetId, setReassignTargetId] = useState<number | ''>('');
  const [reassignCategory, setReassignCategory] = useState<(typeof REASSIGN_REASONS)[number]>('Bận');
  const [reassignDetail, setReassignDetail] = useState('');

  const [spamReason, setSpamReason] = useState<(typeof SPAM_REASONS)[number]>(SPAM_REASONS[0]);
  const [priceCheckReason, setPriceCheckReason] = useState('');
  const [priceCheckFile, setPriceCheckFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentType, setAttachmentType] = useState<'site_photo' | 'customer_drawing_doc'>('site_photo');

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (searchQuery.trim()) qs.set('search', searchQuery.trim());
      if (includeSpam) qs.set('includeSpam', 'true');

      const data = await apiRequest<{
        leads: LeadItemDto[];
        products: ProductCatalogDto[];
        salesOptions: SalesAssigneeOptionDto[];
        priceCheckAlerts: PriceCheckAlertDto[];
      }>(`/api/v1/leads?${qs.toString()}`);

      setLeads(data.leads);
      setProducts(data.products);
      setSalesOptions(data.salesOptions);
      setPriceCheckAlerts(data.priceCheckAlerts);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải danh sách Lead.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery, includeSpam]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) || null,
    [leads, selectedLeadId],
  );

  useEffect(() => {
    if (selectedLead) {
      setTargetStatus(selectedLead.pipelineStatus);
      setStatusReason(selectedLead.lostReason || '');
      setStatusNote('');
      setMarkQuoteResponded(Boolean(selectedLead.quoteRespondedAt));
    }
  }, [selectedLead]);

  const canCreate = user ? hasBaPermission(user.roleCode, 'LEAD_CREATE') : false;
  const canUpdatePipeline = user ? hasBaPermission(user.roleCode, 'LEAD_UPDATE_PIPELINE') : false;
  const canReassign = user ? hasBaPermission(user.roleCode, 'LEAD_REASSIGN') : false;
  const canUploadAttachment = user ? hasBaPermission(user.roleCode, 'ATTACHMENT_UPLOAD_VIEW') : false;

  const groupedProducts = useMemo(() => {
    return {
      led: products.filter((p) => p.category === 'MAN_HINH_LED'),
      board: products.filter((p) => p.category === 'BANG_DIEN_TU'),
      other: products.filter((p) => p.category === 'KHAC'),
    };
  }, [products]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/leads', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          contactChannel: createChannel,
          phone: createPhone,
          contactName: createContactName || null,
          companyName: createCompanyName || null,
          projectName: createProjectName || null,
          email: createEmail || null,
          selfReportedSource: createSelfSource || null,
          areaType: createAreaType,
          hcmDistrict: createAreaType === 'hcm' ? createDistrict : null,
          province: createAreaType === 'other_province' ? createProvince : 'TP. Hồ Chí Minh',
          installationAddress: createAddress || null,
          productIds: createProductIds,
          customProductNote: createCustomProductNote || null,
          initialNote: createInitialNote || null,
          reassignToSalesId:
            tickReassignOnCreate && createReassignSalesId ? Number(createReassignSalesId) : null,
          reassignReason: tickReassignOnCreate ? createReassignReason : null,
        },
      });
      setShowCreateModal(false);
      setCreatePhone('');
      setCreateContactName('');
      setCreateCompanyName('');
      setCreateProjectName('');
      setCreateEmail('');
      setCreateAddress('');
      setCreateInitialNote('');
      setFeedbackMsg('Đã tiếp nhận hồ sơ Lead mới và kiểm tra trùng lặp / dò giá thành công.');
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo Lead mới.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmReceive = async (lead: LeadItemDto) => {
    if (!user) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'confirm_receive',
          expectedVersion: lead.version,
        },
      });
      setFeedbackMsg(`Đã xác nhận tiếp nhận Lead ${lead.leadCode} (giữ trạng thái Vừa nhận thông tin theo UC01).`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi xác nhận tiếp nhận.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransitionPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedLead) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${selectedLead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'transition_pipeline',
          expectedVersion: selectedLead.version,
          toStatus: targetStatus,
          reason: statusReason || null,
          noteContent: statusNote || null,
          markQuoteResponded,
        },
      });
      setFeedbackMsg(`Đã cập nhật trạng thái Pipeline của ${selectedLead.leadCode} sang "${PIPELINE_STATUS_LABELS[targetStatus]}".`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái Pipeline.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReassignSales = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedLead || !reassignTargetId) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${selectedLead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'reassign_sales',
          expectedVersion: selectedLead.version,
          toSalesId: Number(reassignTargetId),
          reasonCategory: reassignCategory,
          reasonDetail: reassignDetail || null,
        },
      });
      setFeedbackMsg(`Đã chuyển giao Lead ${selectedLead.leadCode} thành công.`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi chuyển giao Lead.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkSpam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedLead) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${selectedLead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'mark_spam',
          expectedVersion: selectedLead.version,
          spamReason,
        },
      });
      setFeedbackMsg(`Đã đánh dấu Spam cho ${selectedLead.leadCode} (${spamReason}).`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đánh dấu Spam.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePriceAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedLead) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('leadId', String(selectedLead.id));
      formData.append('reasonEvidence', priceCheckReason);
      if (priceCheckFile) {
        formData.append('screenshot', priceCheckFile);
      }
      await apiRequest('/api/v1/leads/price-check-alerts', {
        method: 'POST',
        csrfToken: user.csrfToken,
        isFormData: true,
        body: formData,
      });
      setPriceCheckReason('');
      setPriceCheckFile(null);
      setFeedbackMsg(`Đã đăng cảnh báo nghi đối thủ dò giá cho ${selectedLead.leadCode} và thông báo tới Sales/Marketing/Ads.`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đăng cảnh báo dò giá.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedLead || !attachmentFile) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', attachmentFile);
      formData.append('attachmentType', attachmentType);
      formData.append('folderPath', '/ho-so-cong-trinh');
      await apiRequest(`/api/v1/leads/${selectedLead.id}/attachments`, {
        method: 'POST',
        csrfToken: user.csrfToken,
        isFormData: true,
        body: formData,
      });
      setAttachmentFile(null);
      setFeedbackMsg(`Đã tải lên tệp "${attachmentFile.name}" vào kho lưu trữ riêng tư.`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải tệp đính kèm.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSalesForReassign = useMemo(() => {
    if (reassignCategory === 'Bận') {
      return salesOptions.filter((s) => s.eligibleForBusyTransfer);
    }
    return salesOptions.filter((s) => s.id !== user?.id);
  }, [salesOptions, reassignCategory, user?.id]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-brand-soft border border-brand-border text-[11px] font-bold text-brand mb-2">
            <span>Phân hệ 01 · Nhóm 1</span>
            <span>·</span>
            <span>UC01 & UC02 · Brief Mini CRM</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
            Quản lý Lead & Pipeline Kinh doanh
          </h1>
          <p className="text-xs sm:text-[13px] text-ink-muted mt-1">
            Tiếp nhận tự động & thủ công, kiểm tra trùng lặp (E0), cảnh báo dò giá (E5), vận hành 5 bước Pipeline và luân chuyển NVKD.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void fetchLeads()}
            className="h-9 px-3.5 rounded-xl bg-white border border-slate-200 hover:border-brand-border text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </button>

          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                viewMode === 'table' ? 'bg-brand text-white' : 'text-slate-600 hover:text-ink'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Bảng CRM</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 ${
                viewMode === 'kanban' ? 'bg-brand text-white' : 'text-slate-600 hover:text-ink'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban 5 Bước</span>
            </button>
          </div>

          <a
            href="/api/v1/leads/export"
            className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
            title="Xuất toàn bộ danh sách Lead ra file Excel chuẩn OpenXML"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Xuất Excel (.xlsx)</span>
          </a>

          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-9 px-4 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Lead (Hotline/Zalo)</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Anonymization Notice (UC01 & Q03) */}
      {leads.some((l) => l.isAnonymized) && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Chế độ xem Lead ẩn danh (UC01 · Quyết định mở Q03):</strong> Vai trò{' '}
            <strong>{user?.roleName}</strong> được xem nguồn, chiến dịch, sản phẩm và tiến độ Pipeline để tối ưu Marketing/Ads, nhưng thông tin định danh khách hàng (SĐT, Email, Địa chỉ chi tiết, Tệp đính kèm) được che bảo mật.
          </div>
        </div>
      )}

      {/* Active Competitor Price Check Alerts Banner (UC01 4.5) */}
      {priceCheckAlerts.length > 0 && (
        <div className="rounded-2xl bg-red-50/80 border border-red-200 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-red-800">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>
                Danh sách Cảnh báo Nghi đối thủ dò giá đang hoạt động ({priceCheckAlerts.length})
              </span>
            </div>
            <span className="text-[11px] text-red-700 font-medium">
              Tự động gắn nhãn &ldquo;Nghi dò giá&rdquo; khi trùng SĐT hoặc Tên công ty
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {priceCheckAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3 rounded-xl bg-white border border-red-200/80 text-xs flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-red-700">{alert.leadCode}</span>
                    <span className="font-semibold text-ink">
                      {alert.companyName || 'Chưa rõ tên đơn vị'}
                    </span>
                    <span className="font-mono text-slate-600">({alert.phone})</span>
                  </div>
                  <p className="text-slate-600">Căn cứ: {alert.reasonEvidence}</p>
                  <p className="text-[11px] text-slate-400">
                    Người đăng: {alert.reportedByName} ·{' '}
                    {new Date(alert.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                {alert.chatScreenshotDownloadUrl && (
                  <a
                    href={alert.chatScreenshotDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold text-[11px] shrink-0"
                  >
                    Ảnh chat
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-500 font-bold">
            Đóng
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-emerald-700 font-bold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-card flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-brand text-white'
                : 'bg-slate-100 text-slate-600 hover:text-ink'
            }`}
          >
            Tất cả ({leads.length})
          </button>
          {PIPELINE_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                statusFilter === st
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-ink'
              }`}
            >
              {PIPELINE_STATUS_LABELS[st]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSpam}
              onChange={(e) => setIncludeSpam(e.target.checked)}
              className="rounded border-slate-300 text-brand focus:ring-brand"
            />
            <span>Hiển thị cả Lead Spam</span>
          </label>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã Lead, công ty, dự án, SĐT..."
              className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-brand w-64"
            />
          </div>
        </div>
      </div>

      {/* Main Content: Table View vs Kanban View */}
      {loading ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center text-xs text-slate-500">
          Đang tải danh sách hồ sơ Lead...
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card">
          <div className="overflow-x-auto max-h-[calc(100vh-270px)] overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-xs z-10 border-b border-slate-200 shadow-xs">
                <tr className="text-slate-600">
                  <th className="py-3.5 px-4 font-bold">STT / Mã Lead</th>
                  <th className="py-3.5 px-4 font-bold">Thời gian nhận</th>
                  <th className="py-3.5 px-4 font-bold">Công ty / Dự án & Khách hàng</th>
                  <th className="py-3.5 px-4 font-bold">SĐT & Kênh / Nguồn</th>
                  <th className="py-3.5 px-4 font-bold">Địa chỉ lắp đặt</th>
                  <th className="py-3.5 px-4 font-bold">Sản phẩm quan tâm</th>
                  <th className="py-3.5 px-4 font-bold">Tiến độ & Cảnh báo</th>
                  <th className="py-3.5 px-4 font-bold">NVKD phụ trách</th>
                  <th className="py-3.5 px-4 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead, idx) => {
                  const isRedDuplicate = lead.duplicateType === 'ACTIVE_RED';
                  return (
                    <tr
                      key={lead.id}
                      className={`transition-colors ${
                        isRedDuplicate
                          ? 'bg-red-50/90 hover:bg-red-100/80'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-mono font-bold text-brand">
                          #{idx + 1} · {lead.leadCode}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          v{lead.version} · {lead.createdByActorType}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="font-semibold text-ink">
                          {new Date(lead.contactedAt).toLocaleDateString('vi-VN')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {new Date(lead.contactedAt).toLocaleTimeString('vi-VN')}
                        </div>
                        {lead.receivedConfirmedAt ? (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" />
                            Đã tiếp nhận
                          </span>
                        ) : (
                          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                            <Clock className="w-3 h-3" />
                            Chưa xác nhận nhận
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-[260px]">
                        <div className="font-bold text-slate-900 text-sm">
                          {lead.companyName || lead.contactName || 'Chưa cập nhật tên'}
                        </div>
                        {lead.projectName && (
                          <div className="text-xs font-semibold text-brand mt-0.5">
                            Dự án: {lead.projectName}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Liên hệ: {lead.contactName || 'Bổ sung sau'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top whitespace-nowrap">
                        <div className="font-mono font-bold text-ink flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-brand shrink-0" />
                          <span>{lead.phone}</span>
                        </div>
                        {!lead.isPhoneNormalized && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                            SĐT chưa chuẩn hóa (E2)
                          </span>
                        )}
                        <div className="text-[11px] text-slate-600 mt-1">
                          Kênh: <strong>{CONTACT_CHANNEL_LABELS[lead.contactChannel] || lead.contactChannel}</strong>
                        </div>
                        {lead.tracking && (
                          <div className="text-[11px] text-slate-500">
                            Nguồn MKT: <strong>{lead.tracking.marketingSource}</strong>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-[200px]">
                        <div className="font-semibold text-slate-700 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>
                            {lead.areaType === 'hcm'
                              ? `TP.HCM · ${lead.hcmDistrict || ''}`
                              : lead.province || 'Chưa chọn tỉnh'}
                          </span>
                        </div>
                        {lead.installationAddress && (
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                            {lead.installationAddress}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top max-w-[220px]">
                        <div className="flex flex-wrap gap-1">
                          {lead.products.map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 rounded-md bg-brand-soft text-brand font-semibold text-[11px]"
                            >
                              {p.productName}
                            </span>
                          ))}
                        </div>
                        {lead.customProductNote && (
                          <div className="text-[11px] text-slate-500 mt-1">
                            {lead.customProductNote}
                          </div>
                        )}
                        {lead.attachmentsCount > 0 && (
                          <div className="mt-1 text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1">
                            <FileText className="w-3 h-3 text-brand" />
                            <span>{lead.attachmentsCount} tệp hiện trạng</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top space-y-1">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                            STATUS_BADGE_STYLES[lead.pipelineStatus]
                          }`}
                        >
                          {PIPELINE_STATUS_LABELS[lead.pipelineStatus]}
                        </span>

                        {isRedDuplicate && (
                          <div className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">
                            TRÙNG LEAD ĐANG MỚI ({lead.duplicateOfLeadCode})
                          </div>
                        )}
                        {lead.duplicateType === 'PRIOR_LEAD' && (
                          <div className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200 text-[10px] font-bold">
                            Đã có Lead cũ ({lead.duplicateOfLeadCode})
                          </div>
                        )}
                        {lead.isPriceCheckSuspect && (
                          <div className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold">
                            ⚠ Nghi dò giá (E5)
                          </div>
                        )}
                        {lead.isQuoteOverdue7Days && (
                          <div className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                            ⏰ Báo giá quá 7 ngày chưa phản hồi
                          </div>
                        )}
                        {lead.spamStatus !== 'NONE' && (
                          <div className="px-2 py-0.5 rounded bg-slate-800 text-white text-[10px] font-bold">
                            SPAM ({lead.spamReason})
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 align-top">
                        <div className="font-semibold text-ink">
                          {lead.assignedSalesName || 'Chưa phân công'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 align-top text-right space-y-1.5">
                        {!lead.receivedConfirmedAt && canUpdatePipeline && (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleConfirmReceive(lead)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center justify-center gap-1"
                          >
                            <UserCheck className="w-3 h-3" />
                            <span>Xác nhận nhận</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setLeadDetailTab('info');
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-brand-soft hover:bg-brand text-brand hover:text-white text-[11px] font-bold transition-colors shadow-xs"
                        >
                          Chi tiết & Xử lý
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Kanban 5 Columns View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STATUSES.map((statusKey) => {
            const colLeads = leads.filter((l) => l.pipelineStatus === statusKey);
            return (
              <div
                key={statusKey}
                className="w-72 shrink-0 bg-slate-100/80 border border-slate-200/80 rounded-2xl p-3 flex flex-col gap-3 min-h-[480px]"
              >
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="text-xs font-bold text-ink">
                    {PIPELINE_STATUS_LABELS[statusKey]}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] font-bold text-brand shadow-xs">
                    {colLeads.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 flex flex-col">
                  {colLeads.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      <FolderPlus className="w-8 h-8 text-slate-300 mb-1" />
                      <p className="text-xs font-semibold text-slate-500">Chưa có hồ sơ</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Không có Lead ở giai đoạn này</p>
                    </div>
                  ) : (
                    colLeads.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setLeadDetailTab('info');
                        }}
                        className={`cursor-pointer rounded-xl p-3.5 border shadow-sm transition-all ${
                          lead.duplicateType === 'ACTIVE_RED'
                            ? 'bg-red-50 border-red-300'
                            : 'bg-white border-slate-200/90 hover:border-brand hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-bold text-brand">
                            {lead.leadCode}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                            {CONTACT_CHANNEL_LABELS[lead.contactChannel]}
                          </span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 mt-1.5 line-clamp-2">
                          {lead.companyName || lead.contactName || lead.phone}
                        </p>
                        {lead.projectName && (
                          <p className="text-[11px] text-brand font-medium mt-0.5 truncate">
                            {lead.projectName}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {lead.products.slice(0, 2).map((p) => (
                            <span
                              key={p.id}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-brand-soft text-brand font-semibold"
                            >
                              {p.productName}
                            </span>
                          ))}
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <span>{lead.assignedSalesName || 'Chưa giao'}</span>
                          {lead.isQuoteOverdue7Days && (
                            <span className="text-amber-700 font-bold">&gt;7 ngày</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Tạo Lead Thủ Công (Brief Mini CRM) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">
                  Tiếp nhận Hồ sơ Lead Thủ công (Hotline / Zalo)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chuẩn hóa theo Brief Mini CRM Toàn Trung · Tự động kiểm tra trùng lặp & cảnh báo dò giá
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateLead(e)} className="mt-4 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Kênh liên hệ *</label>
                  <select
                    value={createChannel}
                    onChange={(e) =>
                      setCreateChannel(e.target.value as 'hotline' | 'zalo' | 'email' | 'form_web')
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-200"
                  >
                    <option value="hotline">Hotline</option>
                    <option value="zalo">Zalo</option>
                    <option value="email">Email</option>
                    <option value="form_web">Điền form</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Số điện thoại liên hệ *
                  </label>
                  <input
                    type="text"
                    required
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    placeholder="VD: 0908100201"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Người liên hệ (tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={createContactName}
                    onChange={(e) => setCreateContactName(e.target.value)}
                    placeholder="Tên anh/chị liên hệ"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tên công ty / Chủ đầu tư
                  </label>
                  <input
                    type="text"
                    value={createCompanyName}
                    onChange={(e) => setCreateCompanyName(e.target.value)}
                    placeholder="Tên doanh nghiệp / cơ quan"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tên dự án / Công trình</label>
                  <input
                    type="text"
                    value={createProjectName}
                    onChange={(e) => setCreateProjectName(e.target.value)}
                    placeholder="VD: Hội trường tầng 3"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nguồn khách tự khai (UC03)
                  </label>
                  <input
                    type="text"
                    value={createSelfSource}
                    onChange={(e) => setCreateSelfSource(e.target.value)}
                    placeholder="VD: Thấy trên Google / Bạn giới thiệu"
                    className="w-full h-9 px-3 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Địa chỉ lắp đặt (TP.HCM vs 62 Tỉnh thành) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-4">
                  <span className="font-bold text-slate-700">Khu vực lắp đặt:</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={createAreaType === 'hcm'}
                      onChange={() => setCreateAreaType('hcm')}
                    />
                    <span>TP. Hồ Chí Minh (Chọn Quận/Huyện & TP. Thủ Đức)</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={createAreaType === 'other_province'}
                      onChange={() => setCreateAreaType('other_province')}
                    />
                    <span>62 Tỉnh / Thành khác</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {createAreaType === 'hcm' ? (
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Quận / Huyện / TP. Thủ Đức
                      </label>
                      <select
                        value={createDistrict}
                        onChange={(e) => setCreateDistrict(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
                      >
                        {HCM_DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block font-semibold text-slate-600 mb-1">
                        Tỉnh / Thành phố
                      </label>
                      <select
                        value={createProvince}
                        onChange={(e) => setCreateProvince(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
                      >
                        {VIETNAM_PROVINCES.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-slate-600 mb-1">
                      Địa chỉ công trình cụ thể
                    </label>
                    <input
                      type="text"
                      value={createAddress}
                      onChange={(e) => setCreateAddress(e.target.value)}
                      placeholder="Số nhà, tên đường, KCN, tòa nhà..."
                      className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 25 Sản phẩm chuẩn BA chia 3 nhóm */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-brand" />
                  <span>Sản phẩm quan tâm (25 sản phẩm chuẩn Brief Mini CRM)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-1">
                  <div>
                    <p className="font-bold text-brand mb-1.5">1. Màn hình LED (8)</p>
                    {groupedProducts.led.map((p) => (
                      <label key={p.id} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createProductIds.includes(p.id)}
                          onChange={(e) =>
                            setCreateProductIds((prev) =>
                              e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span>{p.productName}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <p className="font-bold text-brand mb-1.5">2. Bảng Điện Tử (12)</p>
                    {groupedProducts.board.map((p) => (
                      <label key={p.id} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createProductIds.includes(p.id)}
                          onChange={(e) =>
                            setCreateProductIds((prev) =>
                              e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span>{p.productName}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <p className="font-bold text-brand mb-1.5">3. Nhu cầu Khác (5)</p>
                    {groupedProducts.other.map((p) => (
                      <label key={p.id} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createProductIds.includes(p.id)}
                          onChange={(e) =>
                            setCreateProductIds((prev) =>
                              e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                            )
                          }
                        />
                        <span>{p.productName}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={createCustomProductNote}
                  onChange={(e) => setCreateCustomProductNote(e.target.value)}
                  placeholder="Kích thước yêu cầu / Chi tiết nhu cầu khác (VD: Ngang 6m x Cao 3.5m)..."
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
                />
              </div>

              {/* Mục Chuyển kinh doanh khác (UC02 5.2) */}
              <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-2.5">
                <label className="inline-flex items-center gap-2 font-bold text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tickReassignOnCreate}
                    onChange={(e) => setTickReassignOnCreate(e.target.checked)}
                  />
                  <span>Chuyển kinh doanh khác (Không bắt buộc tick · UC02 5.2)</span>
                </label>

                {tickReassignOnCreate && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Chọn NVKD nhận bàn giao *
                      </label>
                      <select
                        required
                        value={createReassignSalesId}
                        onChange={(e) =>
                          setCreateReassignSalesId(e.target.value ? Number(e.target.value) : '')
                        }
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
                      >
                        <option value="">-- Chọn Nhân viên Kinh doanh --</option>
                        {salesOptions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullName} ({s.activeLeadCount} Lead đang xử lý)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Lý do chuyển *
                      </label>
                      <select
                        value={createReassignReason}
                        onChange={(e) => setCreateReassignReason(e.target.value)}
                        className="w-full h-9 px-3 rounded-xl border border-slate-200 bg-white"
                      >
                        {REASSIGN_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú trao đổi ban đầu</label>
                <textarea
                  rows={2}
                  value={createInitialNote}
                  onChange={(e) => setCreateInitialNote(e.target.value)}
                  placeholder="Nội dung khách hàng trao đổi qua Hotline / Zalo..."
                  className="w-full p-3 rounded-xl border border-slate-200"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-9 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-5 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold"
                >
                  {submitting ? 'Đang lưu...' : 'Lưu Hồ sơ Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Dialog Chi tiết Lead & Vận hành Pipeline */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden">
          <div className="bg-white w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-150">
            {/* Top Identity & Status Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono font-black text-brand text-base tracking-tight shrink-0">
                  {selectedLead.leadCode}
                </span>
                <span
                  className={`px-3 py-1 rounded-full border text-xs font-bold shrink-0 ${
                    STATUS_BADGE_STYLES[selectedLead.pipelineStatus]
                  }`}
                >
                  {PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}
                </span>
                <span className="text-xs text-slate-400 font-mono hidden sm:inline shrink-0">
                  v{selectedLead.version} · {selectedLead.createdByActorType}
                </span>
                <div className="h-4 w-px bg-slate-300 hidden md:block" />
                <h2 className="font-bold text-slate-900 text-base truncate min-w-0">
                  {selectedLead.companyName || selectedLead.contactName || selectedLead.phone}
                </h2>
                {selectedLead.projectName && (
                  <span className="text-xs font-semibold text-brand bg-brand-soft px-2 py-0.5 rounded hidden lg:inline truncate">
                    {selectedLead.projectName}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedLeadId(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-Header Navigation Tabs */}
            <div className="flex items-center px-6 border-b border-slate-200 bg-white shrink-0 gap-6 text-xs font-bold">
              <button
                type="button"
                onClick={() => setLeadDetailTab('info')}
                className={`py-3 transition border-b-2 ${
                  leadDetailTab === 'info'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Thông tin & Nguồn Lead
              </button>
              <button
                type="button"
                onClick={() => setLeadDetailTab('pipeline')}
                className={`py-3 transition border-b-2 ${
                  leadDetailTab === 'pipeline'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Tiến độ Pipeline & Bàn giao
              </button>
              <button
                type="button"
                onClick={() => setLeadDetailTab('attachments')}
                className={`py-3 transition border-b-2 flex items-center gap-1.5 ${
                  leadDetailTab === 'attachments'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Tệp đính kèm</span>
                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] text-slate-600">
                  {selectedLead.attachments?.length || 0}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setLeadDetailTab('activity')}
                className={`py-3 transition border-b-2 flex items-center gap-1.5 ${
                  leadDetailTab === 'activity'
                    ? 'border-brand text-brand'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Lịch sử & Kiểm toán</span>
                <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] text-slate-600">
                  {selectedLead.activities?.length || 0}
                </span>
              </button>
            </div>

            {/* Scrollable Tab Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TAB 1: THÔNG TIN & NGUỒN LEAD */}
              {leadDetailTab === 'info' && (
                <div className="space-y-5 text-xs">
                  {/* Grid 2 Columns: Khách hàng vs Nguồn Tracking */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer Info Card */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <span className="font-bold text-slate-900 text-sm">Hồ sơ khách hàng</span>
                        <span className="font-mono text-slate-400 text-[11px]">
                          {new Date(selectedLead.contactedAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="space-y-2 text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Số điện thoại:</span>
                          <span className="font-mono font-bold text-brand text-sm">
                            {selectedLead.phone}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Người liên hệ:</span>
                          <span className="font-semibold text-slate-900">
                            {selectedLead.contactName || 'Chưa cập nhật'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Đơn vị / Công ty:</span>
                          <span className="font-semibold text-slate-900">
                            {selectedLead.companyName || 'Chưa cập nhật'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Tên dự án:</span>
                          <span className="font-semibold text-brand">
                            {selectedLead.projectName || 'Chưa có'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Khu vực lắp đặt:</span>
                          <span className="font-semibold">
                            {selectedLead.areaType === 'hcm'
                              ? `TP.HCM · ${selectedLead.hcmDistrict || ''}`
                              : selectedLead.province || 'Chưa chọn tỉnh'}
                          </span>
                        </div>
                        {selectedLead.installationAddress && (
                          <div className="pt-1 border-t border-slate-200/60">
                            <span className="text-slate-500 block mb-0.5">Địa chỉ chi tiết:</span>
                            <span className="text-slate-800 font-medium">{selectedLead.installationAddress}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Marketing & Attribution Card */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <span className="font-bold text-slate-900 text-sm">Nguồn Marketing & Tracking (UC03)</span>
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                          {CONTACT_CHANNEL_LABELS[selectedLead.contactChannel]}
                        </span>
                      </div>
                      <div className="space-y-2 text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Nguồn Marketing:</span>
                          <strong className="text-brand">
                            {selectedLead.tracking?.marketingSource || 'Trực tiếp'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Phương thức gắn nguồn:</span>
                          <code className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                            {selectedLead.tracking?.attributionMethod || 'NONE'}
                          </code>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Nguồn khách tự khai:</span>
                          <span className="font-semibold text-slate-800">
                            {selectedLead.selfReportedSource || 'Chưa ghi nhận'}
                          </span>
                        </div>
                        {selectedLead.tracking?.campaignName && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Chiến dịch Ads:</span>
                            <span className="font-semibold text-slate-900">
                              {selectedLead.tracking.campaignName}
                            </span>
                          </div>
                        )}
                        {selectedLead.tracking?.utmGclidMismatch && (
                          <div className="text-amber-800 font-bold bg-amber-100 px-2.5 py-1 rounded text-[11px]">
                            ⚠ Cờ BR4: UTM lệch gclid (Ưu tiên lấy chiến dịch theo gclid)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Products of Interest */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <span className="font-bold text-slate-900">Sản phẩm & Phương án quan tâm ({selectedLead.products.length})</span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedLead.products.map((p) => (
                        <span
                          key={p.id}
                          className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 text-brand font-semibold text-xs"
                        >
                          {p.productName}
                        </span>
                      ))}
                    </div>
                    {selectedLead.customProductNote && (
                      <p className="text-slate-600 mt-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <strong>Ghi chú kỹ thuật:</strong> {selectedLead.customProductNote}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TIẾN ĐỘ PIPELINE & BÀN GIAO */}
              {leadDetailTab === 'pipeline' && (
                <div className="space-y-5 text-xs">
                  {/* Current Assignee Card */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 text-[11px] block">Nhân viên kinh doanh phụ trách hiện tại:</span>
                      <span className="text-base font-bold text-slate-900">
                        {selectedLead.assignedSalesName || 'Chưa phân công'}
                      </span>
                    </div>
                    {!selectedLead.receivedConfirmedAt && canUpdatePipeline && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleConfirmReceive(selectedLead)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Xác nhận tiếp nhận Lead</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Chuyển trạng thái Pipeline 5 bước (UC02) */}
                  {canUpdatePipeline && (
                    <form
                      onSubmit={(e) => void handleTransitionPipeline(e)}
                      className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200/80 space-y-4"
                    >
                      <p className="font-bold text-ink flex items-center gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-brand" />
                        <span>Cập nhật Tiến độ Pipeline 5 bước (Kiểm soát đồng thời v{selectedLead.version})</span>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Trạng thái đích
                          </label>
                          <select
                            value={targetStatus}
                            onChange={(e) => setTargetStatus(e.target.value as PipelineStatus)}
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-medium"
                          >
                            {PIPELINE_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {PIPELINE_STATUS_LABELS[st]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            Lý do (Bắt buộc khi Thất bại hoặc Mở lại Lead)
                          </label>
                          <input
                            type="text"
                            list="lost-reasons-list"
                            value={statusReason}
                            onChange={(e) => setStatusReason(e.target.value)}
                            placeholder="Chọn hoặc nhập lý do..."
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white"
                          />
                          <datalist id="lost-reasons-list">
                            {LOST_REASONS.map((r) => (
                              <option key={r} value={r} />
                            ))}
                          </datalist>
                        </div>
                      </div>

                      {targetStatus === 'quote_sent' && (
                        <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={markQuoteResponded}
                            onChange={(e) => setMarkQuoteResponded(e.target.checked)}
                          />
                          <span>Đánh dấu khách hàng đã phản hồi báo giá (Tắt cảnh báo quá 7 ngày)</span>
                        </label>
                      )}

                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={statusNote}
                          onChange={(e) => setStatusNote(e.target.value)}
                          placeholder="Ghi chú tiến độ báo giá / phương án kỹ thuật..."
                          className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 bg-white"
                        />
                        <button
                          type="submit"
                          disabled={submitting}
                          className="h-10 px-5 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold shrink-0 shadow-sm"
                        >
                          Cập nhật Pipeline
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 2. Chuyển giao Kinh doanh (UC02 5.2) */}
                  {canReassign && (
                    <form
                      onSubmit={(e) => void handleReassignSales(e)}
                      className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4"
                    >
                      <p className="font-bold text-ink flex items-center gap-2 text-sm">
                        <ArrowRightLeft className="w-4 h-4 text-brand" />
                        <span>Chuyển giao Nhân viên Kinh doanh (UC02 5.2)</span>
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Lý do chuyển *</label>
                          <select
                            value={reassignCategory}
                            onChange={(e) =>
                              setReassignCategory(e.target.value as (typeof REASSIGN_REASONS)[number])
                            }
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-medium"
                          >
                            {REASSIGN_REASONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">
                            NVKD đủ điều kiện nhận *
                          </label>
                          <select
                            required
                            value={reassignTargetId}
                            onChange={(e) =>
                              setReassignTargetId(e.target.value ? Number(e.target.value) : '')
                            }
                            className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white font-medium"
                          >
                            <option value="">-- Chọn NVKD --</option>
                            {filteredSalesForReassign.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.fullName} ({s.activeLeadCount} Lead · {s.isOnline ? 'Online' : 'Offline'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={reassignDetail}
                          onChange={(e) => setReassignDetail(e.target.value)}
                          placeholder="Chi tiết bàn giao..."
                          className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 bg-white"
                        />
                        <button
                          type="submit"
                          disabled={submitting}
                          className="h-10 px-5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold shrink-0 shadow-sm"
                        >
                          Chuyển giao
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 3. Cảnh báo Dò giá & Đánh dấu Spam */}
                  {canUpdatePipeline && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <form
                        onSubmit={(e) => void handleCreatePriceAlert(e)}
                        className="p-4 rounded-xl bg-red-50/60 border border-red-200 space-y-2.5"
                      >
                        <p className="font-bold text-red-800 text-xs">Đăng cảnh báo Nghi dò giá (UC01 4.5)</p>
                        <input
                          type="text"
                          required
                          value={priceCheckReason}
                          onChange={(e) => setPriceCheckReason(e.target.value)}
                          placeholder="Căn cứ xác định đối thủ khảo giá..."
                          className="w-full h-9 px-3 rounded-lg border border-red-200 bg-white"
                        />
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => setPriceCheckFile(e.target.files?.[0] || null)}
                          className="text-xs w-full"
                        />
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full h-9 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold"
                        >
                          Phát cảnh báo dò giá
                        </button>
                      </form>

                      <form
                        onSubmit={(e) => void handleMarkSpam(e)}
                        className="p-4 rounded-xl bg-slate-100 border border-slate-200 space-y-2.5"
                      >
                        <p className="font-bold text-slate-800 text-xs">Đánh dấu Spam (UC01 4.4)</p>
                        <select
                          value={spamReason}
                          onChange={(e) =>
                            setSpamReason(e.target.value as (typeof SPAM_REASONS)[number])
                          }
                          className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white"
                        >
                          {SPAM_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-slate-500">
                          SĐT sai/Nhầm máy tự loại khỏi báo cáo Ads; Đối thủ khảo giá vào diện chờ xác nhận.
                        </p>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full h-9 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold"
                        >
                          Gắn cờ Spam
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: TỆP ĐÍNH KÈM */}
              {leadDetailTab === 'attachments' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">
                        Tệp đính kèm hiện trạng công trình & bản vẽ
                      </h3>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Lưu trữ an toàn trên máy chủ riêng tư Toàn Trung · Phân quyền truy cập theo vai trò
                      </p>
                    </div>
                  </div>

                  {selectedLead.attachments && selectedLead.attachments.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedLead.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-300 transition"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 block truncate">
                              {att.fileName}
                            </span>
                            <span className="text-[11px] text-slate-400 mt-0.5 block">
                              Người tải: {att.uploadedByName}
                            </span>
                          </div>
                          <a
                            href={att.downloadUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-brand-soft text-brand hover:bg-brand hover:text-white font-bold text-xs shrink-0 transition"
                          >
                            Xem / Tải về
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400">
                      <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-600">Chưa có tệp đính kèm nào</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Tải ảnh hiện trạng công trình hoặc bản vẽ CAD/PDF ở khung bên dưới
                      </p>
                    </div>
                  )}

                  {canUploadAttachment && !selectedLead.isAnonymized && (
                    <form
                      onSubmit={(e) => void handleUploadAttachment(e)}
                      className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/80 flex flex-wrap items-center gap-3 pt-4 mt-4"
                    >
                      <select
                        value={attachmentType}
                        onChange={(e) =>
                          setAttachmentType(
                            e.target.value as 'site_photo' | 'customer_drawing_doc',
                          )
                        }
                        className="h-10 px-3 rounded-xl border border-slate-200 bg-white font-medium"
                      >
                        <option value="site_photo">Ảnh hiện trạng công trình</option>
                        <option value="customer_drawing_doc">Bản vẽ / Tài liệu PDF</option>
                      </select>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                        className="text-xs flex-1"
                      />
                      <button
                        type="submit"
                        disabled={submitting || !attachmentFile}
                        className="h-10 px-5 rounded-xl bg-brand hover:bg-brand-deep text-white font-bold disabled:opacity-50 shadow-sm"
                      >
                        Tải lên máy chủ
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 4: LỊCH SỬ & KIỂM TOÁN */}
              {leadDetailTab === 'activity' && (
                <div className="space-y-4 text-xs">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Lịch sử tương tác & kiểm toán bất biến
                    </h3>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Ghi nhận tự động mọi thao tác chuyển trạng thái, bàn giao, cảnh báo và chỉnh sửa
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    {selectedLead.activities && selectedLead.activities.length > 0 ? (
                      selectedLead.activities.map((act) => (
                        <div
                          key={act.id}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 text-brand font-bold">
                                {act.actionType}
                              </span>
                              <span className="font-bold text-slate-900">{act.actorName}</span>
                            </div>
                            {act.noteContent && (
                              <p className="text-slate-600 mt-1.5 leading-relaxed">{act.noteContent}</p>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(act.createdAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400">
                        Chưa có hoạt động nào được ghi nhận.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

