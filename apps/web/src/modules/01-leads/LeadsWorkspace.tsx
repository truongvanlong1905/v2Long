'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Lock,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Table2,
  Trash2,
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
import { ManualLeadModal } from './ManualLeadModal';

const STATUS_BADGE_STYLES: Record<PipelineStatus, string> = {
  new_lead: 'bg-violet-50 text-violet-700 border-violet-200',
  quoting: 'bg-blue-50 text-blue-700 border-blue-200',
  quote_sent: 'bg-amber-50 text-amber-800 border-amber-300',
  won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lost: 'bg-slate-100 text-slate-600 border-slate-200',
};

interface FraudEvaluationResult {
  phoneSubmitCount30d: number;
  hasDuplicatePhone: boolean;
  duplicateProjectName: string | null;
  duplicateProjectPartnerCode: string | null;
  hasPriceProbeBehavior: boolean;
  priceProbeReason: string | null;
  hasBlacklistedOrSpam: boolean;
  spamOrBurnerReason: string | null;
}

function evaluateLeadFraudCriteria(
  lead: LeadItemDto,
  allLeads: LeadItemDto[],
  priceAlerts: PriceCheckAlertDto[],
): FraudEvaluationResult {
  const nowMs = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const cleanPhone = lead.phone.replace(/\D/g, '');

  // Criteria 1: Duplicate Phone (>= 2 submissions within 30 days or backend duplicateType)
  const samePhoneWithin30d = allLeads.filter((other) => {
    const otherClean = other.phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.includes('*') || otherClean !== cleanPhone) return false;
    const diff = Math.abs(nowMs - new Date(other.contactedAt).getTime());
    return diff <= thirtyDaysMs;
  });
  const phoneSubmitCount30d = Math.max(
    samePhoneWithin30d.length,
    lead.duplicateType !== 'NONE' ? 3 : 1,
  );
  const hasDuplicatePhone = phoneSubmitCount30d >= 2 || lead.duplicateType !== 'NONE';

  // Criteria 2: Duplicate Project Name with differing contact details
  const normalizedProj = (lead.projectName || '').trim().toLowerCase();
  const matchingProjectLead =
    normalizedProj.length >= 4
      ? allLeads.find(
          (other) =>
            other.id !== lead.id &&
            (other.projectName || '').trim().toLowerCase() === normalizedProj &&
            other.phone !== lead.phone,
        )
      : undefined;
  const duplicateProjectName = matchingProjectLead
    ? lead.projectName || null
    : lead.duplicateType === 'PRIOR_LEAD' && lead.projectName
      ? lead.projectName
      : null;

  // Criteria 3: Price Probe Behavior (raw module unit pricing without installation address, or matched E5 alert)
  const noteText = `${lead.customProductNote || ''} ${lead.initialNote || ''}`.toLowerCase();
  const asksRawModuleOnly =
    !lead.installationAddress &&
    (noteText.includes('giá module') ||
      noteText.includes('báo giá gấp') ||
      noteText.includes('dò giá') ||
      noteText.includes('đơn giá') ||
      noteText.includes('kabinet'));
  const matchedAlert = priceAlerts.find(
    (a) =>
      a.leadId === lead.id ||
      a.phone === lead.phone ||
      (a.companyName && a.companyName === lead.companyName),
  );
  const hasPriceProbeBehavior = Boolean(
    lead.isPriceCheckSuspect || matchedAlert || asksRawModuleOnly,
  );
  const priceProbeReason =
    matchedAlert?.reasonEvidence ||
    (asksRawModuleOnly
      ? 'Hỏi giá vật tư / module rời nhưng từ chối cung cấp địa chỉ khảo sát lắp đặt thực tế.'
      : lead.isPriceCheckSuspect
        ? 'Trùng SĐT hoặc Tên đơn vị trong danh sách cảnh báo đối thủ dò giá (E5).'
        : null);

  // Criteria 4: Blacklisted Phone Prefix / Burner patterns / Spam
  const isBurnerPrefix =
    cleanPhone.startsWith('099') ||
    cleanPhone.startsWith('059') ||
    /(\d)\1{5,}/.test(cleanPhone) ||
    !lead.isPhoneNormalized;
  const hasBlacklistedOrSpam = lead.spamStatus !== 'NONE' || isBurnerPrefix;
  const spamOrBurnerReason =
    lead.spamReason ||
    (isBurnerPrefix
      ? 'Đầu số ảo / dãy số lặp bất thường hoặc SĐT chưa chuẩn hóa (Burner/Blacklist Pattern).'
      : null);

  return {
    phoneSubmitCount30d,
    hasDuplicatePhone,
    duplicateProjectName,
    duplicateProjectPartnerCode: matchingProjectLead?.leadCode || lead.duplicateOfLeadCode || null,
    hasPriceProbeBehavior,
    priceProbeReason,
    hasBlacklistedOrSpam,
    spamOrBurnerReason,
  };
}

export function LeadsWorkspace() {
  const { user } = useSession();
  const [leads, setLeads] = useState<LeadItemDto[]>([]);
  const [products, setProducts] = useState<ProductCatalogDto[]>([]);
  const [salesOptions, setSalesOptions] = useState<SalesAssigneeOptionDto[]>([]);
  const [openRowMenuId, setOpenRowMenuId] = useState<number | null>(null);
  const [investigativeLead, setInvestigativeLead] = useState<LeadItemDto | null>(null);
  const [priceCheckAlerts, setPriceCheckAlerts] = useState<PriceCheckAlertDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [includeSpam] = useState(true);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isReceivingLeads, setIsReceivingLeads] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [leadDetailTab, setLeadDetailTab] = useState<'info' | 'pipeline' | 'attachments' | 'activity'>('info');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Debounce search query by 300ms (Mục 2.2)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcuts: '/' search, 'N' create lead, 'Esc' close popup (Mục 2.6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        if (showCreateModal) setShowCreateModal(false);
        else if (selectedLeadId !== null) setSelectedLeadId(null);
        return;
      }

      if (isInputFocused) return;

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'n' || e.key === 'N') {
        if (user && hasBaPermission(user.roleCode, 'LEAD_CREATE')) {
          e.preventDefault();
          setShowCreateModal(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal, selectedLeadId, user]);

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
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setErrorMsg(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (debouncedSearchQuery.trim()) qs.set('search', debouncedSearchQuery.trim());
      if (includeSpam) qs.set('includeSpam', 'true');

      const data = await apiRequest<{
        leads: LeadItemDto[];
        products: ProductCatalogDto[];
        salesOptions: SalesAssigneeOptionDto[];
        priceCheckAlerts: PriceCheckAlertDto[];
        isReceivingLeads?: boolean;
      }>(`/api/v1/leads?${qs.toString()}`, { signal: controller.signal });

      setLeads(data.leads);
      setProducts(data.products);
      setSalesOptions(data.salesOptions);
      setPriceCheckAlerts(data.priceCheckAlerts);
      if (typeof data.isReceivingLeads === 'boolean') {
        setIsReceivingLeads(data.isReceivingLeads);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải danh sách Lead.');
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [statusFilter, debouncedSearchQuery, includeSpam]);

  useEffect(() => {
    void fetchLeads();
    return () => abortControllerRef.current?.abort();
  }, [fetchLeads]);

  useEffect(() => {
    if (typeof window === 'undefined' || leads.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const highlightId = Number(params.get('highlight'));
    if (Number.isInteger(highlightId) && highlightId > 0) {
      const target = leads.find((l) => l.id === highlightId);
      if (target) {
        setSelectedLeadId(target.id);
        setLeadDetailTab('pipeline');
      }
    }
  }, [leads]);

  const displayedLeads = useMemo(
    () => (overdueOnly ? leads.filter((l) => l.isQuoteOverdue7Days) : leads),
    [leads, overdueOnly],
  );

  const overdueCount = useMemo(
    () => leads.filter((l) => l.isQuoteOverdue7Days).length,
    [leads],
  );

  const exportHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (searchQuery.trim()) qs.set('search', searchQuery.trim());
    if (includeSpam) qs.set('includeSpam', 'true');
    if (overdueOnly) qs.set('overdueOnly', 'true');
    const queryStr = qs.toString();
    return queryStr ? `/api/v1/leads/export?${queryStr}` : '/api/v1/leads/export';
  }, [statusFilter, searchQuery, includeSpam, overdueOnly]);

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
  const canAiDesign = user ? hasBaPermission(user.roleCode, 'AI_DESIGN') : false;

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

  const handleToggleReceivingStatus = async () => {
    if (!user) return;
    const nextVal = !isReceivingLeads;
    setIsReceivingLeads(nextVal);
    try {
      await apiRequest('/api/v1/leads', {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'set_receiving_status',
          isReceivingLeads: nextVal,
        },
      });
      setFeedbackMsg(
        nextVal
          ? 'Đã bật trạng thái: Sẵn sàng nhận Lead tự động (Round-Robin).'
          : 'Đã tạm ngưng nhận Lead tự động.',
      );
      await fetchLeads();
    } catch (err) {
      setIsReceivingLeads(!nextVal);
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi cập nhật trạng thái nhận Lead.');
    }
  };

  const handleReviewSpam = async (decision: 'confirm_spam' | 'restore_lead') => {
    if (!user || !selectedLead) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${selectedLead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'review_spam',
          decision,
          expectedVersion: selectedLead.version,
        },
      });
      setFeedbackMsg(
        decision === 'confirm_spam'
          ? `Đã duyệt loại trừ Spam khỏi báo cáo Ads cho ${selectedLead.leadCode}.`
          : `Đã khôi phục hồ sơ ${selectedLead.leadCode} về danh sách Lead hợp lệ.`,
      );
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi duyệt trạng thái Spam.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Unified Single-Row Header (Tightened Whitespace — Enhancement 2) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 mb-1">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Quản lý Lead & Pipeline Kinh doanh
          </h1>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[11px] font-bold text-[#1E3A8A]">
            Phân hệ 01 - Nhóm 1
          </span>
        </div>

        {/* Horizontal Action Pill Group */}
        <div className="flex flex-wrap items-center gap-2">
          {user?.roleCode === 'SALES' && (
            <button
              type="button"
              onClick={() => void handleToggleReceivingStatus()}
              className={`h-8 px-3 rounded-lg border text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                isReceivingLeads
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
              }`}
              title="Bật/tắt chế độ nhận phân bổ Lead tự động (Round-Robin)"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isReceivingLeads ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>{isReceivingLeads ? 'Đang nhận Lead' : 'Tạm ngưng'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void fetchLeads()}
            className="h-8 px-3 rounded-lg bg-white border border-slate-200 hover:border-blue-300 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </button>

          <div className="inline-flex p-0.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition ${
                viewMode === 'table' ? 'bg-[#1E3A8A] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Bảng CRM</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition ${
                viewMode === 'kanban' ? 'bg-[#1E3A8A] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban 5 Bước</span>
            </button>
          </div>

          <a
            href={exportHref}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition-colors"
            title="Xuất danh sách Lead theo bộ lọc hiện tại ra file Excel chuẩn OpenXML"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Xuất Excel</span>
          </a>

          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-8 px-3.5 rounded-lg bg-[#1E3A8A] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tạo Lead (Hotline/Zalo)</span>
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
            onClick={() => {
              setOverdueOnly(false);
              setStatusFilter('all');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              statusFilter === 'all' && !overdueOnly
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
              onClick={() => {
                setOverdueOnly(false);
                setStatusFilter(st);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                statusFilter === st && !overdueOnly
                  ? 'bg-brand text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-ink'
              }`}
            >
              {PIPELINE_STATUS_LABELS[st]}
            </button>
          ))}
          {overdueCount > 0 && (
            <button
              type="button"
              onClick={() => setOverdueOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                overdueOnly
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100'
              }`}
            >
              ⏰ Quá hạn &gt;7 ngày ({overdueCount})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-50 border border-red-200 text-red-700 text-[11px] font-semibold">
            <span>🚫 SPAM / Cảnh báo dò giá hiển thị trực tiếp</span>
          </span>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã Lead, công ty, SĐT... (Phím /)"
              className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-brand w-64"
            />
          </div>
        </div>
      </div>

      {/* Main Content: Table View vs Kanban View */}
      {loading ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-card space-y-3 animate-pulse">
          <div className="h-8 bg-slate-100 rounded-xl w-full" />
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="h-12 bg-slate-50 rounded-xl w-full border border-slate-100" />
          ))}
        </div>
      ) : viewMode === 'table' ? (
        <>
          {/* Mobile Card-View Alternative (< 768px) for Dense Data Table (Step 6.1) */}
          <div className="md:hidden space-y-3">
            {displayedLeads.map((lead, idx) => {
              const isRedDuplicate = lead.duplicateType === 'ACTIVE_RED';
              const cleanDigits = lead.phone.replace(/\D/g, '');
              return (
                <div
                  key={lead.id}
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    setLeadDetailTab('info');
                  }}
                  className={`rounded-2xl border p-4 shadow-xs transition active:scale-[0.99] ${
                    isRedDuplicate
                      ? 'bg-red-50/90 border-red-300'
                      : 'bg-white border-slate-200/90'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-black text-[#1E3A8A]">
                        #{idx + 1} · {lead.leadCode}
                      </span>
                      <h3 className="font-bold text-slate-900 text-sm mt-0.5">
                        {lead.companyName || lead.contactName || 'Khách hàng mới'}
                      </h3>
                      {lead.projectName && (
                        <p className="text-xs font-semibold text-[#2563EB] mt-0.5">
                          Dự án: {lead.projectName}
                        </p>
                      )}
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full border text-[10px] font-bold shrink-0 ${
                        STATUS_BADGE_STYLES[lead.pipelineStatus]
                      }`}
                    >
                      {PIPELINE_STATUS_LABELS[lead.pipelineStatus]}
                    </span>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-900">
                      <Phone className="w-3.5 h-3.5 text-[#2563EB]" />
                      <span>{lead.phone}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-[11px] font-semibold">
                      {lead.tracking?.marketingSource ||
                        CONTACT_CHANNEL_LABELS[lead.contactChannel] ||
                        lead.contactChannel}
                    </span>
                  </div>

                  {/* Product Category Tags */}
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {lead.products.slice(0, 3).map((p) => {
                      const isOutdoor = p.productName.toLowerCase().includes('outdoor') || p.productName.toLowerCase().includes('ngoài trời');
                      const isBoard = p.category === 'BANG_DIEN_TU';
                      return (
                        <span
                          key={p.id}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            isBoard
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isOutdoor
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-blue-50 text-[#1E3A8A] border-blue-200'
                          }`}
                        >
                          {isBoard ? 'BĐT' : isOutdoor ? 'Outdoor' : 'Indoor'} · {p.productName}
                        </span>
                      );
                    })}
                  </div>

                  {/* Quick Call / Zalo / Detail Actions (44px touch targets) */}
                  <div
                    className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5">
                      {!lead.isAnonymized && cleanDigits.length >= 9 && (
                        <>
                          <a
                            href={`tel:${cleanDigits}`}
                            className="min-h-[38px] px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Gọi</span>
                          </a>
                          <a
                            href={`https://zalo.me/${cleanDigits}`}
                            target="_blank"
                            rel="noreferrer"
                            className="min-h-[38px] px-3 rounded-xl bg-blue-50 border border-blue-200 text-[#2563EB] text-xs font-bold inline-flex items-center gap-1"
                          >
                            <span>Zalo</span>
                          </a>
                        </>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLeadId(lead.id);
                        setLeadDetailTab('info');
                      }}
                      className="min-h-[38px] px-3.5 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold"
                    >
                      Chi tiết & Xử lý
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop & Tablet Rich Data Table with Instant Row-Click Edit & Sticky First Column (Enhancement 1 & 3) */}
          <div className="hidden md:block bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto max-h-[calc(100vh-220px)] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-[#1E3A8A] text-white z-20 shadow-xs">
                  <tr>
                    <th className="py-3 px-3.5 font-bold sticky left-0 bg-[#1E3A8A] z-30">
                      STT / Khách hàng
                    </th>
                    <th className="py-3 px-3.5 font-bold">Nguồn</th>
                    <th className="py-3 px-3.5 font-bold">Người liên hệ & SĐT</th>
                    <th className="py-3 px-3.5 font-bold">Ngày nhận</th>
                    <th className="py-3 px-3.5 font-bold">Khu vực</th>
                    <th className="py-3 px-3.5 font-bold">Sản phẩm & Phân loại</th>
                    <th className="py-3 px-3.5 font-bold">Trạng thái</th>
                    <th className="py-3 px-3.5 font-bold">Ghi chú / Nguyên nhân</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedLeads.map((lead, idx) => {
                    const isRedDuplicate = lead.duplicateType === 'ACTIVE_RED';
                    const cleanDigits = lead.phone.replace(/\D/g, '');
                    const fraud = evaluateLeadFraudCriteria(lead, leads, priceCheckAlerts);
                    const isSpamOrFraud = Boolean(
                      lead.spamStatus !== 'NONE' ||
                        lead.spamReason ||
                        isRedDuplicate ||
                        fraud.hasPriceProbeBehavior ||
                        fraud.hasDuplicatePhone ||
                        fraud.duplicateProjectName ||
                        fraud.hasBlacklistedOrSpam,
                    );
                    const noteOrReason =
                      lead.lostReason ||
                      lead.reopenReason ||
                      lead.spamReason ||
                      lead.customProductNote ||
                      lead.initialNote ||
                      '—';

                    return (
                      <tr
                        key={lead.id}
                        onClick={() => {
                          setSelectedLeadId(lead.id);
                          setLeadDetailTab('info');
                        }}
                        title="Nhấp vào dòng bất kỳ để mở và sửa thông tin Lead"
                        className={`cursor-pointer transition-colors ${
                          isSpamOrFraud
                            ? 'bg-red-50/50 hover:bg-red-50/80 border-l-4 border-l-red-500'
                            : idx % 2 === 1
                              ? 'bg-slate-50/50 hover:bg-blue-50/40'
                              : 'bg-white hover:bg-blue-50/40'
                        }`}
                      >
                        {/* Sticky Column 1: STT + Customer + LeadCode + Prominent Red Spam/Fraud Tag */}
                        <td className="py-3 px-3.5 align-top sticky left-0 bg-inherit z-10 min-w-[260px] max-w-[310px] border-r border-slate-100">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[10px]">
                              #{idx + 1}
                            </span>
                            <span className="font-mono font-bold text-[#1E3A8A] hover:underline">
                              {lead.leadCode}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 text-[13px]">
                              {lead.companyName || lead.contactName || 'Chưa cập nhật tên'}
                            </span>
                            {isSpamOrFraud && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInvestigativeLead(lead);
                                }}
                                title="Nhấn để xem chi tiết phân tích SPAM / Cảnh báo dò giá"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200 hover:bg-red-200 transition-colors"
                              >
                                🚫 SPAM / Cảnh báo dò giá
                              </span>
                            )}
                          </div>

                          {lead.projectName && (
                            <div className="text-[11px] font-semibold text-[#2563EB] mt-0.5 truncate">
                              Dự án: {lead.projectName}
                            </div>
                          )}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            NVKD: <strong className="text-slate-600">{lead.assignedSalesName || 'Chưa giao'}</strong>
                          </div>

                          {/* Multi-Factor Sub-criteria Pills (Enhancement 3) */}
                          {(fraud.hasPriceProbeBehavior ||
                            fraud.hasDuplicatePhone ||
                            fraud.duplicateProjectName ||
                            fraud.hasBlacklistedOrSpam) && (
                            <div
                              className="mt-1.5 flex flex-wrap gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(fraud.hasPriceProbeBehavior || fraud.hasDuplicatePhone) && (
                                <button
                                  type="button"
                                  onClick={() => setInvestigativeLead(lead)}
                                  title="Nhấn để xem phân tích đa tiêu chí (Cảnh báo dò giá / Trùng SĐT)"
                                  className="px-2 py-0.5 rounded-md bg-red-100/80 hover:bg-red-200 border border-red-300 text-red-800 text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                                >
                                  <span>
                                    ⚠️ Trùng SĐT {fraud.phoneSubmitCount30d} lần
                                  </span>
                                </button>
                              )}
                              {fraud.duplicateProjectName && (
                                <button
                                  type="button"
                                  onClick={() => setInvestigativeLead(lead)}
                                  title="Nhấn để xem đối chiếu Trùng tên dự án"
                                  className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-[10px] font-bold inline-flex items-center gap-1 transition-colors"
                                >
                                  <span className="truncate max-w-[210px]">
                                    🔁 Trùng dự án - {fraud.duplicateProjectName}
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Nguồn */}
                        <td className="py-3 px-3.5 align-top whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-[#1E3A8A] border border-blue-200 font-bold text-[11px]">
                            {lead.tracking?.marketingSource ||
                              lead.selfReportedSource ||
                              CONTACT_CHANNEL_LABELS[lead.contactChannel]}
                          </span>
                          <div className="text-[11px] text-slate-500 mt-1">
                            Kênh: {CONTACT_CHANNEL_LABELS[lead.contactChannel] || lead.contactChannel}
                          </div>
                        </td>

                        {/* Người liên hệ & SĐT (với nút Gọi / Zalo nhanh cô lập stopPropagation) */}
                        <td className="py-3 px-3.5 align-top whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {lead.contactName || 'Khách liên hệ'}
                          </div>
                          <div className="font-mono font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3.5 h-3.5 text-[#2563EB] shrink-0" />
                            <span>{lead.phone}</span>
                          </div>
                          {!lead.isAnonymized && cleanDigits.length >= 9 && (
                            <div
                              className="flex items-center gap-1.5 mt-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <a
                                href={`tel:${cleanDigits}`}
                                className="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 text-[10px] font-bold transition"
                                title="Gọi nhanh"
                              >
                                Gọi ngay
                              </a>
                              <a
                                href={`https://zalo.me/${cleanDigits}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded bg-blue-50 hover:bg-[#2563EB] text-[#2563EB] hover:text-white border border-blue-200 text-[10px] font-bold transition"
                                title="Nhắn Zalo nhanh"
                              >
                                Zalo
                              </a>
                            </div>
                          )}
                          {!lead.isPhoneNormalized && (
                            <span className="inline-block mt-1 text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                              SĐT chưa chuẩn hóa (E2)
                            </span>
                          )}
                        </td>

                        {/* Ngày */}
                        <td className="py-3 px-3.5 align-top whitespace-nowrap">
                          <div className="font-semibold text-slate-800">
                            {new Date(lead.contactedAt).toLocaleDateString('vi-VN')}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {new Date(lead.contactedAt).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          {lead.receivedConfirmedAt ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Đã nhận
                            </span>
                          ) : (
                            <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" />
                              Chờ nhận
                            </span>
                          )}
                        </td>

                        {/* Khu vực */}
                        <td className="py-3 px-3.5 align-top max-w-[180px]">
                          <div className="font-semibold text-slate-800 flex items-center gap-1">
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

                        {/* Sản phẩm & Tag phân loại (Indoor / Outdoor / BĐT) */}
                        <td className="py-3 px-3.5 align-top max-w-[230px]">
                          <div className="flex flex-wrap gap-1">
                            {lead.products.map((p) => {
                              const lower = p.productName.toLowerCase();
                              const isOutdoor =
                                lower.includes('outdoor') || lower.includes('ngoài trời');
                              const isBoard = p.category === 'BANG_DIEN_TU';
                              const tagLabel = isBoard
                                ? 'BĐT'
                                : isOutdoor
                                  ? 'Outdoor'
                                  : 'Indoor';
                              const tagStyle = isBoard
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isOutdoor
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-blue-50 text-[#1E3A8A] border-blue-200';
                              return (
                                <span
                                  key={p.id}
                                  className={`px-2 py-0.5 rounded-md border font-semibold text-[10px] ${tagStyle}`}
                                >
                                  <strong>[{tagLabel}]</strong> {p.productName}
                                </span>
                              );
                            })}
                          </div>
                          {lead.attachmentsCount > 0 && (
                            <div className="mt-1 text-[10px] font-semibold text-slate-600 inline-flex items-center gap-1">
                              <FileText className="w-3 h-3 text-[#2563EB]" />
                              <span>{lead.attachmentsCount} tệp đính kèm</span>
                            </div>
                          )}
                        </td>

                        {/* Trạng thái (Màu Badge sắc nét) */}
                        <td className="py-3 px-3.5 align-top space-y-1 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full border text-[11px] font-bold ${
                              STATUS_BADGE_STYLES[lead.pipelineStatus]
                            }`}
                          >
                            {PIPELINE_STATUS_LABELS[lead.pipelineStatus]}
                          </span>

                          {lead.isQuoteOverdue7Days && (
                            <div className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
                              ⏰ Quá hạn báo giá &gt;7 ngày
                            </div>
                          )}
                        </td>

                        {/* Ghi chú / Nguyên nhân */}
                        <td className="py-3 px-3.5 align-top max-w-[220px]">
                          <p className="text-[11px] text-slate-600 line-clamp-3">{noteOrReason}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        /* Kanban 5 Columns View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STATUSES.map((statusKey) => {
            const colLeads = displayedLeads.filter((l) => l.pipelineStatus === statusKey);
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

      {/* Modal Tạo Lead Thủ Công Zero-Lag (Step 2) */}
      <ManualLeadModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        products={products}
        salesOptions={salesOptions}
        currentUserId={user?.id}
        csrfToken={user?.csrfToken}
        onCreatedSuccess={async (leadCode, assignedMsg) => {
          setFeedbackMsg(`Đã tạo thành công hồ sơ ${leadCode}. ${assignedMsg}`);
          await fetchLeads();
        }}
      />

      {/* Multi-Factor Fraud & Price-Probing Investigative Popover (Enhancement 3) */}
      {investigativeLead && (() => {
        const evalResult = evaluateLeadFraudCriteria(investigativeLead, leads, priceCheckAlerts);
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-150">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <span className="font-mono font-bold text-[#1E3A8A]">{investigativeLead.leadCode}</span>
                  <h3 className="font-display font-bold text-slate-900 text-sm mt-0.5">
                    Phân tích Đa tiêu chí Lọc Spam & Dò giá (Multi-Factor Engine)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setInvestigativeLead(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                {(evalResult.hasDuplicatePhone || evalResult.hasPriceProbeBehavior) && (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-1.5">
                    <strong className="font-bold block">
                      ⚠️ Tiêu chí 1 & 3: Cảnh báo dò giá - Trùng SĐT {evalResult.phoneSubmitCount30d} lần
                    </strong>
                    <p>
                      • Tần suất gửi SĐT (<strong>{investigativeLead.phone}</strong>) trong 30 ngày:{' '}
                      <strong>{evalResult.phoneSubmitCount30d} lần</strong>{' '}
                      {investigativeLead.duplicateOfLeadCode
                        ? `(Trùng với ${investigativeLead.duplicateOfLeadCode})`
                        : ''}
                      .
                    </p>
                    {evalResult.priceProbeReason && (
                      <p className="font-semibold text-red-800">
                        • Dấu hiệu hành vi dò giá: {evalResult.priceProbeReason}
                      </p>
                    )}
                  </div>
                )}

                {evalResult.duplicateProjectName && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                    <strong className="font-bold block">
                      🔁 Tiêu chí 2: Trùng dự án - {evalResult.duplicateProjectName}
                    </strong>
                    <p>
                      Phát hiện tên công trình / dự án trùng khớp với hồ sơ{' '}
                      <strong className="font-mono text-[#1E3A8A]">
                        {evalResult.duplicateProjectPartnerCode || 'khác'}
                      </strong>{' '}
                      nhưng sử dụng thông tin liên hệ khác nhau.
                    </p>
                  </div>
                )}

                {evalResult.hasBlacklistedOrSpam && (
                  <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 space-y-1">
                    <strong className="font-bold block">
                      🚫 Tiêu chí 4: Cờ Lead Spam / Đầu số Blacklist ({investigativeLead.spamStatus})
                    </strong>
                    <p>
                      Kết quả kiểm tra: <strong>{evalResult.spamOrBurnerReason}</strong>
                    </p>
                  </div>
                )}
              </div>

              <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInvestigativeLead(null)}
                  className="h-9 px-4 rounded-xl border border-slate-200 bg-white font-semibold text-slate-600"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const targetId = investigativeLead.id;
                    setInvestigativeLead(null);
                    setSelectedLeadId(targetId);
                    setLeadDetailTab('info');
                  }}
                  className="h-9 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white font-bold"
                >
                  Sửa thông tin Lead
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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
              <div className="flex items-center gap-2">
                {canAiDesign && (
                  <a
                    href={`/design?leadId=${selectedLead.id}`}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition"
                    title="Chuyển sang Studio Thiết kế & Phối cảnh 3D bằng AI cho hồ sơ Lead này"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Tạo Phối cảnh 3D AI</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLeadId(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
                                {s.fullName} ({s.activeLeadCount} Lead · Đang làm việc)
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

                  {/* 4. Duyệt Spam chờ xác nhận (Mục 3.2 - Quản lý/Admin) */}
                  {selectedLead.spamStatus !== 'NONE' && canReassign && (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="text-xs text-amber-900">
                        <p className="font-bold">Hồ sơ đang gắn cờ Spam ({selectedLead.spamReason || 'Chưa rõ lý do'})</p>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Quản lý có thể xác nhận loại trừ khỏi báo cáo Ads hoặc khôi phục lại Lead hợp lệ.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleReviewSpam('confirm_spam')}
                          className="h-9 px-3.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
                        >
                          Duyệt loại khỏi Ads
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleReviewSpam('restore_lead')}
                          className="h-9 px-3.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-bold"
                        >
                          Khôi phục Lead
                        </button>
                      </div>
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

