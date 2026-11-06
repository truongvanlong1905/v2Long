'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Filter,
  FolderPlus,
  FolderUp,
  History,
  Info,
  Kanban,
  Layers,
  MapPin,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
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
import { LeadActivityTimeline } from './LeadActivityTimeline';

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
  // UI-03: A suspected price-shopping Lead is not automatically presented as Spam.
  const isPriceShoppingOnly =
    hasPriceProbeBehavior &&
    lead.spamStatus === 'PENDING_REVIEW' &&
    (!lead.spamReason ||
      lead.spamReason.toLowerCase().includes('khảo giá') ||
      lead.spamReason.toLowerCase().includes('dò giá'));
  const isBurnerPrefix =
    cleanPhone.startsWith('099') ||
    cleanPhone.startsWith('059') ||
    /(\d)\1{5,}/.test(cleanPhone) ||
    !lead.isPhoneNormalized;
  const hasBlacklistedOrSpam =
    (lead.spamStatus !== 'NONE' && !isPriceShoppingOnly) || isBurnerPrefix;
  const spamOrBurnerReason =
    !isPriceShoppingOnly && lead.spamReason
      ? lead.spamReason
      : isBurnerPrefix
        ? 'Đầu số ảo / dãy số lặp bất thường hoặc SĐT chưa chuẩn hóa (Burner/Blacklist Pattern).'
        : null;

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
  const [totalCount, setTotalCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
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
  const [includeSpam, setIncludeSpam] = useState(true);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unreceivedOnly, setUnreceivedOnly] = useState(false);
  const [showOptionalColumns, setShowOptionalColumns] = useState(false);
  const [isReceivingLeads, setIsReceivingLeads] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [leadDetailTab, setLeadDetailTab] = useState<
    'info' | 'pipeline' | 'attachments' | 'activity'
  >('info');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Sync initial filters from URL query params (?status=..., ?overdueOnly=true, ?unreceived=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const st = params.get('status');
    if (st && (st === 'all' || PIPELINE_STATUSES.includes(st as PipelineStatus))) {
      setStatusFilter(st);
    }
    if (params.get('overdueOnly') === 'true') {
      setOverdueOnly(true);
      setIncludeSpam(false);
    }
    if (params.get('unreceived') === '1' || params.get('unreceivedOnly') === 'true') {
      setUnreceivedOnly(true);
      setStatusFilter('new_lead');
      setIncludeSpam(false);
    }
  }, []);

  // Debounce search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1);
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
  const [attachmentType, setAttachmentType] = useState<'site_photo' | 'customer_drawing_doc'>(
    'site_photo',
  );
  const [bypassPriceCheckConfirmed, setBypassPriceCheckConfirmed] = useState<boolean>(false);

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
      if (overdueOnly) qs.set('overdueOnly', 'true');
      if (unreceivedOnly) qs.set('unreceived', '1');

      const data = await apiRequest<{
        leads: LeadItemDto[];
        totalCount?: number;
        products: ProductCatalogDto[];
        salesOptions: SalesAssigneeOptionDto[];
        priceCheckAlerts: PriceCheckAlertDto[];
        isReceivingLeads?: boolean;
      }>(`/api/v1/leads?${qs.toString()}`, { signal: controller.signal });

      setLeads(data.leads);
      setTotalCount(data.totalCount ?? data.leads.length);
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
  }, [statusFilter, debouncedSearchQuery, includeSpam, overdueOnly, unreceivedOnly]);

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

  const displayedLeads = useMemo(() => {
    let list = leads;
    if (overdueOnly) {
      list = list.filter((l) => l.isQuoteOverdue7Days && l.spamStatus === 'NONE');
    }
    if (unreceivedOnly) {
      list = list.filter(
        (l) => l.pipelineStatus === 'new_lead' && !l.receivedConfirmedAt && l.spamStatus === 'NONE'
      );
    }
    return list;
  }, [leads, overdueOnly, unreceivedOnly]);

  const totalFilteredCount = Math.max(displayedLeads.length, overdueOnly || unreceivedOnly ? displayedLeads.length : totalCount);
  const totalPages = Math.max(1, Math.ceil(displayedLeads.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return displayedLeads.slice(start, start + pageSize);
  }, [displayedLeads, safePage, pageSize]);

  const overdueCount = useMemo(
    () => leads.filter((l) => l.isQuoteOverdue7Days && l.spamStatus === 'NONE').length,
    [leads],
  );

  const unreceivedCount = useMemo(
    () =>
      leads.filter(
        (l) => l.pipelineStatus === 'new_lead' && !l.receivedConfirmedAt && l.spamStatus === 'NONE'
      ).length,
    [leads],
  );

  const exportHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (searchQuery.trim()) qs.set('search', searchQuery.trim());
    if (includeSpam && !overdueOnly && !unreceivedOnly) qs.set('includeSpam', 'true');
    if (overdueOnly) qs.set('overdueOnly', 'true');
    if (unreceivedOnly) qs.set('unreceived', '1');
    const queryStr = qs.toString();
    return queryStr ? `/api/v1/leads/export?${queryStr}` : '/api/v1/leads/export';
  }, [statusFilter, searchQuery, includeSpam, overdueOnly, unreceivedOnly]);

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
      setBypassPriceCheckConfirmed(false);
    }
  }, [selectedLead]);

  const canSeePrivateQuote = useMemo(() => {
    if (!user) return false;
    return ['BOD', 'ADMIN', 'SALES_LEAD', 'SALES'].includes(user.roleCode);
  }, [user]);

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
          bypassPriceCheckConfirmed,
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
    <div className="space-y-4">
      {/* Page Header (TYPE-01 / TYPE-02: 24px heading, no developer module/team labels) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
            Quản lý Lead & Pipeline Kinh doanh
          </h1>
          <p className="text-sm text-slate-600">
            Tiếp nhận, phân bổ tư vấn kỹ thuật LED, theo dõi báo giá và tiến độ chốt hợp đồng
          </p>
        </div>

        {/* Action Controls (14px standard controls) */}
        <div className="flex flex-wrap items-center gap-2.5">
          {user?.roleCode === 'SALES' && (
            <button
              type="button"
              onClick={() => void handleToggleReceivingStatus()}
              className={`h-10 px-3.5 rounded-xl border text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
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
              <span>{isReceivingLeads ? 'Đang nhận Lead' : 'Tạm ngưng nhận'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void fetchLeads()}
            className="h-10 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 inline-flex items-center gap-2 shadow-2xs"
          >
            <RefreshCw className="w-4 h-4 text-[#1E3A8A]" />
            <span>Làm mới</span>
          </button>

          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition ${
                viewMode === 'table'
                  ? 'bg-[#1E3A8A] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-4 h-4" />
              <span>Bảng danh sách</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 transition ${
                viewMode === 'kanban'
                  ? 'bg-[#1E3A8A] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-4 h-4" />
              <span>Bảng Kanban</span>
            </button>
          </div>

          <a
            href={exportHref}
            className="h-10 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center gap-2 shadow-2xs transition-colors"
            title="Xuất toàn bộ hồ sơ Lead theo bộ lọc hiện tại ra file Excel (.xlsx)"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Xuất Excel ({displayedLeads.length})</span>
          </a>

          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-10 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-sm font-semibold inline-flex items-center gap-2 shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Lead mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Role Anonymization Notice (Clean business wording) */}
      {leads.some((l) => l.isAnonymized) && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Chế độ bảo mật thông tin khách hàng:</strong> Tài khoản{' '}
            <strong>{user?.roleName}</strong> được phép theo dõi nguồn chiến dịch, dòng sản phẩm và tiến độ Pipeline, nhưng thông tin định danh khách hàng (SĐT, Email, Địa chỉ chi tiết, Tệp đính kèm) được ẩn theo quy định phân quyền.
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center justify-between"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-700 font-semibold"
          >
            Đóng
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-emerald-700 font-semibold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Filter Bar & Optional Columns Toggle */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <button
            type="button"
            onClick={() => {
              setOverdueOnly(false);
              setUnreceivedOnly(false);
              setStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
              statusFilter === 'all' && !overdueOnly && !unreceivedOnly
                ? 'bg-[#1E3A8A] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            Tất cả ({totalCount || leads.length})
          </button>
          {PIPELINE_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => {
                setOverdueOnly(false);
                setUnreceivedOnly(false);
                setStatusFilter(st);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                statusFilter === st && !overdueOnly && !unreceivedOnly
                  ? 'bg-[#1E3A8A] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              {PIPELINE_STATUS_LABELS[st]}
            </button>
          ))}
          {unreceivedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setOverdueOnly(false);
                setUnreceivedOnly((v) => !v);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                unreceivedOnly
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-blue-50 border border-blue-200 text-blue-900 hover:bg-blue-100'
              }`}
            >
              Chờ tiếp nhận ({unreceivedCount})
            </button>
          )}
          {overdueCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setUnreceivedOnly(false);
                setOverdueOnly((v) => !v);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                overdueOnly
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100'
              }`}
            >
              Quá hạn &gt;7 ngày ({overdueCount})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {viewMode === 'table' && (
            <button
              type="button"
              onClick={() => setShowOptionalColumns((prev) => !prev)}
              aria-pressed={showOptionalColumns}
              className={`h-10 px-3.5 rounded-xl border text-sm font-semibold inline-flex items-center gap-2 transition ${
                showOptionalColumns
                  ? 'bg-blue-50 border-blue-300 text-[#1E3A8A]'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Đang thu gọn 3 cột: Khu vực / Địa chỉ, Chi tiết UTM, Ghi chú. Bấm để xem."
            >
              <Layers className="w-4 h-4" />
              <span>{showOptionalColumns ? 'Ẩn 3 cột phụ' : 'Xem thêm 3 cột'}</span>
            </button>
          )}

          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm khách hàng, dự án, SĐT, mã Lead... (Phím /)"
              className="h-10 pl-9 pr-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1E3A8A] w-full sm:w-72"
            />
          </div>
        </div>
      </div>

      {/* Main Content: Table View vs Kanban View */}
      {loading ? (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-3 animate-pulse">
          <div className="h-10 bg-slate-100 rounded-xl w-full" />
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="h-14 bg-slate-50 rounded-xl w-full border border-slate-100" />
          ))}
        </div>
      ) : viewMode === 'table' ? (
        <>
          {/* Mobile Card-View Alternative (< 768px) */}
          <div className="md:hidden space-y-3">
            {paginatedLeads.map((lead) => {
              const cleanDigits = lead.phone.replace(/\D/g, '');
              const fraud = evaluateLeadFraudCriteria(lead, leads, priceCheckAlerts);
              const primaryProduct = lead.products[0];
              const extraProductsCount = Math.max(0, lead.products.length - 1);

              return (
                <div
                  key={lead.id}
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    setLeadDetailTab('info');
                  }}
                  className={`rounded-2xl border p-4 shadow-xs transition active:scale-[0.99] space-y-3 ${
                    lead.spamStatus !== 'NONE'
                      ? 'bg-red-50/70 border-red-300 border-l-4 border-l-red-600'
                      : 'bg-white border-slate-200/90'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 text-sm truncate">
                        {(lead.companyName || lead.contactName || 'Khách hàng mới').replace(
                          /\s*\(nghi (dò|khảo) giá\)/i,
                          '',
                        )}
                      </h3>
                      <p className="text-[13px] text-slate-600 truncate mt-0.5">
                        {lead.projectName ? `Dự án: ${lead.projectName}` : 'Chưa cập nhật tên dự án'}
                      </p>
                      <span className="font-mono text-xs text-slate-500 mt-0.5 block">
                        Mã hồ sơ: {lead.leadCode}
                      </span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg border text-xs font-semibold shrink-0 ${
                        STATUS_BADGE_STYLES[lead.pipelineStatus]
                      }`}
                    >
                      {PIPELINE_STATUS_LABELS[lead.pipelineStatus]}
                    </span>
                  </div>

                  {/* Separated Status & Restrained Warning Badges (UI-03) */}
                  <div className="flex flex-wrap gap-1.5">
                    {lead.spamStatus !== 'NONE' &&
                      !(
                        fraud.hasPriceProbeBehavior &&
                        lead.spamStatus === 'PENDING_REVIEW' &&
                        (!lead.spamReason ||
                          lead.spamReason.toLowerCase().includes('khảo giá') ||
                          lead.spamReason.toLowerCase().includes('dò giá'))
                      ) && (
                        <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-xs font-semibold inline-flex items-center gap-1">
                          <Ban className="w-3 h-3" />
                          Spam · {lead.spamStatus === 'CONFIRMED' ? 'Đã xác nhận' : 'Chờ duyệt'}
                        </span>
                      )}
                    {fraud.hasPriceProbeBehavior && (
                      <span className="px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 text-orange-800 text-xs font-semibold">
                        Nghi dò giá
                      </span>
                    )}
                    {(lead.isDuplicateAlert || fraud.hasDuplicatePhone || fraud.duplicateProjectName) && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                        Trùng lặp ({fraud.duplicateProjectName ? 'Dự án' : 'SĐT'})
                      </span>
                    )}
                    {lead.isQuoteOverdue7Days && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold">
                        Quá hạn &gt;7 ngày
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700">
                    <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-900">
                      <Phone className="w-4 h-4 text-[#1E3A8A]" />
                      <span>{lead.phone}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      Sales: <strong className="text-slate-800">{lead.assignedSalesName || 'Chưa giao'}</strong>
                    </span>
                  </div>

                  {/* Main Product + +N Indicator */}
                  {primaryProduct && (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-md bg-blue-50 text-[#1E3A8A] border border-blue-200 text-xs font-medium truncate">
                        {primaryProduct.productName}
                      </span>
                      {extraProductsCount > 0 && (
                        <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold shrink-0">
                          +{extraProductsCount}
                        </span>
                      )}
                    </div>
                  )}

                  <div
                    className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      {!lead.isAnonymized && cleanDigits.length >= 9 && (
                        <>
                          <a
                            href={`tel:${cleanDigits}`}
                            className="h-9 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Gọi</span>
                          </a>
                          <a
                            href={`https://zalo.me/${cleanDigits}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-9 px-3 rounded-xl bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-semibold inline-flex items-center gap-1.5"
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
                      className="h-9 px-3.5 rounded-xl bg-[#1E3A8A] text-white text-xs font-semibold"
                    >
                      Mở chi tiết
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* UI-01, UI-02, UI-03: Simplified 7-Column Default Desktop Table */}
          <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table
                className={`w-full text-left border-collapse text-sm ${
                  showOptionalColumns ? 'min-w-[1280px]' : 'table-fixed'
                }`}
              >
                <thead className="bg-slate-50 border-b border-slate-200/90 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3.5 w-[21%]">Khách hàng / Dự án</th>
                    <th className="py-3 px-3 w-[16%]">Liên hệ &amp; Nguồn / Kênh</th>
                    <th className="py-3 px-3 w-[14%]">Sản phẩm</th>
                    <th className="py-3 px-3 w-[15%]">Trạng thái Pipeline</th>
                    <th className="py-3 px-3 w-[11%]">Sales phụ trách</th>
                    <th className="py-3 px-3 w-[9%]">Ngày tiếp nhận</th>
                    {showOptionalColumns && (
                      <>
                        <th className="py-3 px-3 w-[140px]">Khu vực / Địa chỉ</th>
                        <th className="py-3 px-3 w-[120px]">Chi tiết UTM</th>
                        <th className="py-3 px-3 w-[160px]">Ghi chú</th>
                      </>
                    )}
                    <th className="py-3 px-3.5 text-right w-[14%]">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {paginatedLeads.length === 0 ? (
                    <tr>
                      <td
                        colSpan={showOptionalColumns ? 10 : 7}
                        className="py-10 px-4 text-center text-slate-500 text-sm"
                      >
                        Không tìm thấy hồ sơ Lead nào phù hợp với bộ lọc hiện tại.
                      </td>
                    </tr>
                  ) : (
                    paginatedLeads.map((lead) => {
                      const cleanDigits = lead.phone.replace(/\D/g, '');
                      const fraud = evaluateLeadFraudCriteria(lead, leads, priceCheckAlerts);
                      const primaryProduct = lead.products[0];
                      const extraProducts = lead.products.slice(1);
                      const isPriceShoppingReasonOnly =
                        fraud.hasPriceProbeBehavior &&
                        lead.spamStatus === 'PENDING_REVIEW' &&
                        (!lead.spamReason ||
                          lead.spamReason.toLowerCase().includes('khảo giá') ||
                          lead.spamReason.toLowerCase().includes('dò giá'));
                      const showSpamBadge = lead.spamStatus !== 'NONE' && !isPriceShoppingReasonOnly;
                      const hasAnyWarning =
                        showSpamBadge ||
                        fraud.hasPriceProbeBehavior ||
                        lead.isDuplicateAlert ||
                        fraud.hasDuplicatePhone ||
                        Boolean(fraud.duplicateProjectName);

                      const rawPrimaryName =
                        lead.companyName || lead.contactName || 'Khách hàng chưa cập nhật tên';
                      const primaryName = rawPrimaryName.replace(/\s*\(nghi (dò|khảo) giá\)/i, '');
                      const secondaryProject = lead.projectName
                        ? `Dự án: ${lead.projectName}`
                        : lead.areaType === 'hcm'
                          ? `Khu vực: TP.HCM · ${lead.hcmDistrict || ''}`
                          : lead.province
                            ? `Khu vực: ${lead.province}`
                            : 'Chưa cập nhật tên dự án';

                      const noteSummary =
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
                          className={`cursor-pointer transition-colors ${
                            showSpamBadge
                              ? 'bg-red-50/80 hover:bg-red-50 shadow-[inset_4px_0_0_#DC2626]'
                              : 'hover:bg-slate-50/90'
                          }`}
                        >
                          {/* Col 1: Customer / Project (UI-02 Hierarchy: Primary Name -> Secondary Project -> Supporting Lead Code) */}
                          <td className="py-3 px-3.5 align-middle overflow-hidden">
                            <div
                              className="font-semibold text-slate-900 text-sm truncate"
                              title={primaryName}
                            >
                              {primaryName}
                            </div>
                            <div
                              className="text-[13px] text-slate-600 truncate mt-0.5"
                              title={secondaryProject}
                            >
                              {secondaryProject}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 font-mono truncate">
                              <span className="truncate" title={lead.leadCode}>
                                {lead.leadCode}
                              </span>
                              {lead.attachmentsCount > 0 && (
                                <span className="inline-flex items-center gap-1 font-sans text-slate-500 shrink-0">
                                  · <FileText className="w-3 h-3 text-[#1E3A8A]" />
                                  {lead.attachmentsCount} tệp
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 2: Contact (Readable Name, Phone, Channel) */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <div className="font-semibold font-mono text-slate-900 text-sm flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-[#1E3A8A] shrink-0" />
                              <span>{lead.phone}</span>
                            </div>
                            <div className="text-[13px] text-slate-600 truncate max-w-[155px] mt-0.5">
                              {lead.contactName || 'Khách liên hệ'}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium truncate max-w-[155px]">
                                {lead.tracking?.marketingSource ||
                                  lead.selfReportedSource ||
                                  CONTACT_CHANNEL_LABELS[lead.contactChannel] ||
                                  lead.contactChannel}
                              </span>
                              {!lead.isPhoneNormalized && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
                                  SĐT cần chuẩn hóa
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 3: Products (Main Product + +N Indicator — UI-02) */}
                          <td className="py-3 px-3 align-middle max-w-[175px] xl:max-w-[215px]">
                            {primaryProduct ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="px-2 py-1 rounded-lg bg-blue-50/80 text-[#1E3A8A] border border-blue-200/90 text-xs font-medium truncate max-w-[135px] xl:max-w-[165px]"
                                  title={primaryProduct.productName}
                                >
                                  {primaryProduct.productName}
                                </span>
                                {extraProducts.length > 0 && (
                                  <span
                                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-semibold shrink-0"
                                    title={`Sản phẩm kèm theo: ${extraProducts
                                      .map((p) => p.productName)
                                      .join(', ')}`}
                                  >
                                    +{extraProducts.length}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Chưa chọn sản phẩm</span>
                            )}
                          </td>

                          {/* Col 4: Pipeline & Separate Restrained Warnings (UI-03) */}
                          <td className="py-3 px-3 align-middle">
                            <div className="flex flex-col items-start gap-1.5">
                              <span
                                className={`inline-flex px-2.5 py-1 rounded-lg border text-xs font-semibold whitespace-nowrap ${
                                  STATUS_BADGE_STYLES[lead.pipelineStatus]
                                }`}
                              >
                                {PIPELINE_STATUS_LABELS[lead.pipelineStatus]}
                              </span>

                              {/* Separate Restrained Warning Pills (Spam != Price-Shopping != Duplicate) */}
                              {(hasAnyWarning || lead.isQuoteOverdue7Days) && (
                                <div
                                  className="flex flex-wrap gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {showSpamBadge && (
                                    <button
                                      type="button"
                                      onClick={() => setInvestigativeLead(lead)}
                                      className="px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 border border-red-600 text-white text-xs font-semibold inline-flex items-center gap-1 transition"
                                      title={
                                        lead.spamReason
                                          ? `Lý do Spam: ${lead.spamReason}`
                                          : 'Xem chi tiết cờ Spam'
                                      }
                                    >
                                      <Ban className="w-3 h-3" />
                                      Spam · {lead.spamStatus === 'CONFIRMED' ? 'Đã duyệt' : 'Chờ duyệt'}
                                    </button>
                                  )}

                                  {fraud.hasPriceProbeBehavior && (
                                    <button
                                      type="button"
                                      onClick={() => setInvestigativeLead(lead)}
                                      className="px-2 py-0.5 rounded-md bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-800 text-xs font-medium transition"
                                      title={
                                        fraud.priceProbeReason ||
                                        'Xem bằng chứng nghi khảo giá / dò giá'
                                      }
                                    >
                                      Nghi dò giá
                                    </button>
                                  )}

                                  {(lead.isDuplicateAlert ||
                                    fraud.hasDuplicatePhone ||
                                    fraud.duplicateProjectName) && (
                                    <button
                                      type="button"
                                      onClick={() => setInvestigativeLead(lead)}
                                      className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-xs font-medium transition"
                                      title="Nhấn để xem đối chiếu hồ sơ trùng SĐT hoặc trùng tên dự án"
                                    >
                                      {fraud.duplicateProjectName
                                        ? 'Trùng tên dự án'
                                        : `Trùng SĐT (${fraud.phoneSubmitCount30d} lần)`}
                                    </button>
                                  )}

                                  {lead.isQuoteOverdue7Days && (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-amber-900 text-xs font-medium">
                                      Quá hạn BG &gt;7 ngày
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Col 5: Assigned Sales */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <div className="font-medium text-slate-900 text-sm">
                              {lead.assignedSalesName || 'Chưa phân bổ'}
                            </div>
                            <div className="mt-0.5">
                              {lead.receivedConfirmedAt ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Đã tiếp nhận</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-medium">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Chờ xác nhận</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 6: Received Date */}
                          <td className="py-3 px-3 align-middle whitespace-nowrap">
                            <div className="text-sm font-medium text-slate-800">
                              {new Date(lead.contactedAt).toLocaleDateString('vi-VN')}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {new Date(lead.contactedAt).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>

                          {/* Optional Columns when toggled on */}
                          {showOptionalColumns && (
                            <>
                              <td className="py-3 px-3 align-middle max-w-[180px]">
                                <div className="text-sm text-slate-800 truncate">
                                  {lead.areaType === 'hcm'
                                    ? `TP.HCM · ${lead.hcmDistrict || ''}`
                                    : lead.province || '—'}
                                </div>
                                {lead.installationAddress && (
                                  <div className="text-xs text-slate-500 truncate mt-0.5">
                                    {lead.installationAddress}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 align-middle whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                                  {lead.tracking?.marketingSource ||
                                    lead.selfReportedSource ||
                                    CONTACT_CHANNEL_LABELS[lead.contactChannel]}
                                </span>
                              </td>
                              <td className="py-3 px-3 align-middle max-w-[200px]">
                                <p className="text-xs text-slate-600 truncate" title={noteSummary}>
                                  {noteSummary}
                                </p>
                              </td>
                            </>
                          )}

                          {/* Col 7: Consolidated Row Actions (UI-01 & UI-02) */}
                          <td
                            className="py-3 px-3.5 align-middle text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              {!lead.isAnonymized && cleanDigits.length >= 9 && (
                                <>
                                  <a
                                    href={`tel:${cleanDigits}`}
                                    className="h-8 px-2 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200/80 text-xs font-semibold inline-flex items-center gap-1 transition"
                                    title={`Gọi ${lead.phone}`}
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                    <span>Gọi</span>
                                  </a>
                                  <a
                                    href={`https://zalo.me/${cleanDigits}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-8 px-2 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#1E3A8A] border border-slate-200/80 text-xs font-semibold inline-flex items-center transition"
                                    title="Nhắn Zalo"
                                  >
                                    Zalo
                                  </a>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLeadId(lead.id);
                                  setLeadDetailTab('info');
                                }}
                                className="h-8 px-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1E40AF] text-white text-xs font-semibold inline-flex items-center transition"
                              >
                                Chi tiết
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* DATA-02: Pagination Bar with Accurate Total and Bounded Page Size */}
            <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  Hiển thị{' '}
                  <strong className="text-slate-900">
                    {displayedLeads.length === 0 ? 0 : (safePage - 1) * pageSize + 1}
                  </strong>
                  –
                  <strong className="text-slate-900">
                    {Math.min(safePage * pageSize, displayedLeads.length)}
                  </strong>{' '}
                  trên tổng số{' '}
                  <strong className="text-[#1E3A8A]">{totalFilteredCount}</strong> hồ sơ Lead
                </span>

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                  <span>Số dòng/trang:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={250}>250</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  ← Trang trước
                </button>
                <span className="px-3 py-1 text-xs font-semibold text-slate-700">
                  Trang {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Trang sau →
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* UI-04: Standardized Kanban 5-Column View with Fixed Card Regions & Footer Alignment */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STATUSES.map((statusKey) => {
            const colLeads = displayedLeads.filter((l) => l.pipelineStatus === statusKey);
            return (
              <div
                key={statusKey}
                className="w-80 shrink-0 bg-slate-100/90 border border-slate-200/90 rounded-2xl p-3.5 flex flex-col gap-3 min-h-[520px]"
              >
                <div className="flex items-center justify-between px-1.5 py-1">
                  <span className="text-sm font-bold text-slate-900">
                    {PIPELINE_STATUS_LABELS[statusKey]}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-white border border-slate-200 text-xs font-bold text-[#1E3A8A] shadow-2xs">
                    {colLeads.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 flex flex-col">
                  {colLeads.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white/40">
                      <FolderPlus className="w-8 h-8 text-slate-300 mb-1.5" />
                      <p className="text-sm font-semibold text-slate-500">Chưa có hồ sơ</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Không có Lead ở giai đoạn này
                      </p>
                    </div>
                  ) : (
                    colLeads.map((lead) => {
                      const primaryProduct = lead.products[0];
                      const extraCount = Math.max(0, lead.products.length - 1);
                      const fraud = evaluateLeadFraudCriteria(lead, leads, priceCheckAlerts);
                      const isPriceShoppingReasonOnly =
                        fraud.hasPriceProbeBehavior &&
                        lead.spamStatus === 'PENDING_REVIEW' &&
                        (!lead.spamReason ||
                          lead.spamReason.toLowerCase().includes('khảo giá') ||
                          lead.spamReason.toLowerCase().includes('dò giá'));
                      const showSpamBadge = lead.spamStatus !== 'NONE' && !isPriceShoppingReasonOnly;

                      return (
                        <div
                          key={lead.id}
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setLeadDetailTab('info');
                          }}
                          className={`cursor-pointer rounded-xl p-4 border shadow-2xs hover:shadow-md transition-all flex flex-col justify-between min-h-[176px] ${
                            showSpamBadge
                              ? 'bg-red-50/70 border-red-300 border-l-4 border-l-red-600 hover:border-red-500'
                              : 'bg-white border-slate-200/90 hover:border-[#1E3A8A]'
                          }`}
                        >
                          {/* Card Region 1: Header (Code & Contact Channel) */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-500">
                                {lead.leadCode}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                                {CONTACT_CHANNEL_LABELS[lead.contactChannel]}
                              </span>
                            </div>

                            {/* Card Region 2: Primary Customer & Secondary Project with Predictable Height */}
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900 line-clamp-1">
                                {(lead.companyName || lead.contactName || lead.phone).replace(
                                  /\s*\(nghi (dò|khảo) giá\)/i,
                                  '',
                                )}
                              </h3>
                              <p className="text-xs text-slate-600 line-clamp-1 mt-0.5 min-h-[16px]">
                                {lead.projectName
                                  ? `Dự án: ${lead.projectName}`
                                  : lead.areaType === 'hcm'
                                    ? `TP.HCM · ${lead.hcmDistrict || ''}`
                                    : lead.province || 'Chưa cập nhật dự án'}
                              </p>
                            </div>

                            {/* Card Region 3: Product + +N & Separate Warnings */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {primaryProduct && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-[#1E3A8A] border border-blue-200/80 font-medium truncate max-w-[190px]">
                                  {primaryProduct.productName}
                                </span>
                              )}
                              {extraCount > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                                  +{extraCount}
                                </span>
                              )}
                              {showSpamBadge && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-red-600 text-white font-semibold inline-flex items-center gap-1">
                                  <Ban className="w-3 h-3" />
                                  Spam
                                </span>
                              )}
                              {fraud.hasPriceProbeBehavior && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200 font-medium">
                                  Nghi dò giá
                                </span>
                              )}
                              {lead.isDuplicateAlert && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                                  Trùng lặp
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Region 4: Aligned Footer */}
                          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="truncate font-medium text-slate-700">
                              {lead.assignedSalesName || 'Chưa phân bổ'}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {lead.isQuoteOverdue7Days ? (
                                <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                                  Quá hạn &gt;7 ngày
                                </span>
                              ) : (
                                <span>
                                  {new Date(lead.contactedAt).toLocaleDateString('vi-VN')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Tạo Lead Thủ Công */}
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

      {/* Investigative Popover for Separate Warnings (UI-03) */}
      {investigativeLead && (() => {
        const evalResult = evaluateLeadFraudCriteria(investigativeLead, leads, priceCheckAlerts);
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-150">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                <div>
                  <span className="font-mono text-xs font-bold text-[#1E3A8A]">
                    {investigativeLead.leadCode}
                  </span>
                  <h3 className="font-display font-bold text-slate-900 text-base mt-0.5">
                    Chi tiết Cảnh báo & Bằng chứng Đối chiếu
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
                {evalResult.hasPriceProbeBehavior && (
                  <div className="p-4 rounded-xl bg-orange-50 border border-orange-200 text-orange-950 space-y-1.5">
                    <strong className="font-bold block text-sm">
                      Nghi vấn khảo giá / dò giá (Không tự động quy kết là Spam)
                    </strong>
                    <p className="text-xs leading-relaxed">
                      {evalResult.priceProbeReason ||
                        'Hồ sơ có dấu hiệu hỏi đơn giá vật tư rời hoặc trùng thông tin trong danh sách cảnh báo dò giá nội bộ.'}
                    </p>
                  </div>
                )}

                {evalResult.hasDuplicatePhone && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                    <strong className="font-bold block text-sm">
                      Phát hiện trùng số điện thoại ({evalResult.phoneSubmitCount30d} lần trong 30 ngày)
                    </strong>
                    <p className="text-xs leading-relaxed">
                      Số điện thoại <strong>{investigativeLead.phone}</strong> đã gửi yêu cầu{' '}
                      <strong>{evalResult.phoneSubmitCount30d} lần</strong>
                      {investigativeLead.duplicateOfLeadCode
                        ? ` (Trùng với hồ sơ ${investigativeLead.duplicateOfLeadCode})`
                        : ''}
                      .
                    </p>
                  </div>
                )}

                {evalResult.duplicateProjectName && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                    <strong className="font-bold block text-sm">
                      Phát hiện trùng tên dự án: {evalResult.duplicateProjectName}
                    </strong>
                    <p className="text-xs leading-relaxed">
                      Tên công trình / dự án trùng khớp với hồ sơ{' '}
                      <strong className="font-mono text-[#1E3A8A]">
                        {evalResult.duplicateProjectPartnerCode || 'khác'}
                      </strong>{' '}
                      nhưng sử dụng thông tin liên hệ khác nhau.
                    </p>
                  </div>
                )}

                {evalResult.hasBlacklistedOrSpam && investigativeLead.spamStatus !== 'NONE' && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-1">
                    <strong className="font-bold block text-sm">
                      Cờ Spam ({investigativeLead.spamStatus === 'CONFIRMED' ? 'Đã xác nhận loại trừ' : 'Đang chờ duyệt'})
                    </strong>
                    <p className="text-xs leading-relaxed">
                      Lý do ghi nhận: <strong>{investigativeLead.spamReason || evalResult.spamOrBurnerReason || 'Chưa cập nhật'}</strong>
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
            {/* Header hồ sơ: tên khách hàng là thông tin chính, mã Lead & nguồn là thông tin phụ */}
            <div className="px-6 pt-5 pb-4 border-b border-slate-200 bg-white shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    aria-hidden="true"
                    className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 text-base font-bold ${
                      selectedLead.spamStatus !== 'NONE'
                        ? 'bg-red-600 text-white'
                        : 'bg-[#1E3A8A] text-white'
                    }`}
                  >
                    {(selectedLead.companyName || selectedLead.contactName || '?')
                      .replace(/^(công ty|cty)\s+/i, '')
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-lg font-semibold text-slate-900 truncate max-w-[520px]">
                        {selectedLead.companyName || selectedLead.contactName || selectedLead.phone}
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full border text-[13px] font-semibold shrink-0 ${
                          STATUS_BADGE_STYLES[selectedLead.pipelineStatus]
                        }`}
                      >
                        {PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}
                      </span>
                      {selectedLead.spamStatus !== 'NONE' && (
                        <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[13px] font-semibold inline-flex items-center gap-1 shrink-0">
                          <Ban className="w-3.5 h-3.5" />
                          Spam · {selectedLead.spamStatus === 'CONFIRMED' ? 'Đã xác nhận' : 'Chờ duyệt'}
                        </span>
                      )}
                    </div>
                    {selectedLead.projectName && (
                      <p className="text-sm text-slate-600 mt-0.5 truncate max-w-[640px]">
                        Dự án: {selectedLead.projectName}
                      </p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-500">
                      <span className="font-mono text-slate-600" title="Mã hồ sơ Lead">
                        {selectedLead.leadCode}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {selectedLead.phone}
                      </span>
                      <span>
                        {selectedLead.tracking?.marketingSource ||
                          CONTACT_CHANNEL_LABELS[selectedLead.contactChannel] ||
                          selectedLead.contactChannel}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(selectedLead.contactedAt).toLocaleString('vi-VN', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserCheck className="w-3.5 h-3.5" />
                        {selectedLead.assignedSalesName || 'Chưa phân bổ'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedLeadId(null)}
                  aria-label="Đóng chi tiết Lead"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {selectedLead.spamStatus !== 'NONE' && selectedLead.spamReason && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  <strong className="font-semibold">Lý do Spam:</strong> {selectedLead.spamReason}
                </div>
              )}
            </div>

            {/* Thanh tab: đúng 4 mục Thông tin / Tiến độ / Tệp đính kèm / Lịch sử */}
            <div
              role="tablist"
              aria-label="Chi tiết hồ sơ Lead"
              className="flex items-center px-6 border-b border-slate-200 bg-white shrink-0 gap-1 overflow-x-auto"
            >
              {(
                [
                  { id: 'info', label: 'Thông tin', icon: Info, count: null },
                  { id: 'pipeline', label: 'Tiến độ', icon: Activity, count: null },
                  {
                    id: 'attachments',
                    label: 'Tệp đính kèm',
                    icon: Paperclip,
                    count: selectedLead.attachments?.length || 0,
                  },
                  {
                    id: 'activity',
                    label: 'Lịch sử',
                    icon: History,
                    count: selectedLead.activities?.length || 0,
                  },
                ] as const
              ).map((tab) => {
                const isActive = leadDetailTab === tab.id;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setLeadDetailTab(tab.id)}
                    className={`relative inline-flex items-center gap-2 px-3.5 py-3 text-sm font-medium whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3A8A] ${
                      isActive ? 'text-[#1E3A8A]' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <TabIcon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {tab.count !== null && (
                      <span
                        className={`min-w-[22px] px-1.5 py-0.5 rounded-full text-xs font-semibold text-center ${
                          isActive ? 'bg-[#1E3A8A] text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-[#1E3A8A]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Tab Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* TAB 1: THÔNG TIN & NGUỒN LEAD */}
              {leadDetailTab === 'info' && (
                <div className="space-y-5 text-sm">
                  {/* Grid 2 Columns: Khách hàng vs Nguồn Tracking */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Customer Info Card */}
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <span className="font-bold text-slate-900 text-base">Hồ sơ khách hàng</span>
                        <span className="font-mono text-slate-500 text-xs">
                          {new Date(selectedLead.contactedAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="space-y-2 text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Số điện thoại:</span>
                          <span className="font-mono font-bold text-[#1E3A8A] text-sm">
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
                          <span className="font-semibold text-[#1E3A8A]">
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
                        <span className="font-bold text-slate-900 text-base">Nguồn Marketing & Chiến dịch</span>
                        <span className="px-2.5 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-bold">
                          {CONTACT_CHANNEL_LABELS[selectedLead.contactChannel]}
                        </span>
                      </div>
                      <div className="space-y-2 text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Nguồn Marketing:</span>
                          <strong className="text-[#1E3A8A]">
                            {selectedLead.tracking?.marketingSource || 'Trực tiếp'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Phương thức gắn nguồn:</span>
                          <code className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 text-xs">
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
                          <div className="text-amber-800 font-semibold bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-xs">
                            Tham số UTM và GCLID khác nhau (Hệ thống ưu tiên đối chiếu theo GCLID)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Products of Interest */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                    <span className="font-bold text-slate-900 text-base">Sản phẩm & Phương án quan tâm ({selectedLead.products.length})</span>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedLead.products.map((p) => (
                        <span
                          key={p.id}
                          className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#1E3A8A] font-semibold text-sm"
                        >
                          {p.productName}
                        </span>
                      ))}
                    </div>
                    {selectedLead.customProductNote && (
                      <p className="text-slate-700 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <strong>Ghi chú kỹ thuật:</strong> {selectedLead.customProductNote}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: TIẾN ĐỘ PIPELINE & BÀN GIAO */}
              {leadDetailTab === 'pipeline' && (
                <div className="space-y-5 text-sm">
                  {/* Current Assignee Card */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between">
                    <div>
                      <span className="text-slate-500 text-xs block">Nhân viên kinh doanh phụ trách hiện tại:</span>
                      <span className="text-base font-bold text-slate-900">
                        {selectedLead.assignedSalesName || 'Chưa phân công'}
                      </span>
                    </div>
                    {!selectedLead.receivedConfirmedAt && canUpdatePipeline && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleConfirmReceive(selectedLead)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <UserCheck className="w-4 h-4" />
                        <span>Xác nhận tiếp nhận Lead</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Chuyển trạng thái Pipeline 5 bước */}
                  {canUpdatePipeline && (
                    <form
                      onSubmit={(e) => void handleTransitionPipeline(e)}
                      className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200/80 space-y-4"
                    >
                      <p className="font-bold text-slate-900 flex items-center gap-2 text-base">
                        <CheckCircle2 className="w-4 h-4 text-[#1E3A8A]" />
                        <span>Cập nhật Tiến độ Pipeline (Phiên bản dữ liệu v{selectedLead.version})</span>
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
                        <div className="space-y-2">
                          <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={markQuoteResponded}
                              onChange={(e) => setMarkQuoteResponded(e.target.checked)}
                            />
                            <span>Đánh dấu khách hàng đã phản hồi báo giá (Tắt cảnh báo quá 7 ngày)</span>
                          </label>

                          {selectedLead.isPriceCheckSuspect && (
                            <div className="p-3.5 rounded-xl bg-orange-50 border border-orange-300 text-orange-950 space-y-1.5">
                              <p className="font-bold text-sm flex items-center gap-1.5">
                                <ShieldAlert className="w-4 h-4 text-orange-600 shrink-0" />
                                <span>
                                  Chốt chặn Bảo mật Giá: Hồ sơ đang có cảnh báo Nghi khảo giá / dò giá
                                </span>
                              </p>
                              <label className="inline-flex items-start gap-2 cursor-pointer text-xs font-semibold">
                                <input
                                  type="checkbox"
                                  checked={bypassPriceCheckConfirmed}
                                  onChange={(e) => setBypassPriceCheckConfirmed(e.target.checked)}
                                  className="mt-0.5"
                                />
                                <span>
                                  Tôi xác nhận đã thẩm tra địa chỉ khảo sát công trình thực tế hoặc đã được Trưởng phòng Kinh doanh phê duyệt gửi báo giá cho hồ sơ này.
                                </span>
                              </label>
                            </div>
                          )}
                        </div>
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
                          className="h-10 px-5 rounded-xl bg-[#1E3A8A] hover:bg-[#1E40AF] text-white font-semibold shrink-0 shadow-sm"
                        >
                          Cập nhật Pipeline
                        </button>
                      </div>
                    </form>
                  )}

                  {/* 2. Chuyển giao Kinh doanh */}
                  {canReassign && (
                    <form
                      onSubmit={(e) => void handleReassignSales(e)}
                      className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4"
                    >
                      <p className="font-bold text-slate-900 flex items-center gap-2 text-base">
                        <ArrowRightLeft className="w-4 h-4 text-[#1E3A8A]" />
                        <span>Chuyển giao Nhân viên Kinh doanh</span>
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
                          className="h-10 px-5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold shrink-0 shadow-sm"
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
                        className="p-4 rounded-xl bg-orange-50/70 border border-orange-200 space-y-2.5"
                      >
                        <p className="font-bold text-orange-900 text-sm">Đăng cảnh báo Nghi dò giá</p>
                        <input
                          type="text"
                          required
                          value={priceCheckReason}
                          onChange={(e) => setPriceCheckReason(e.target.value)}
                          placeholder="Căn cứ xác định đối thủ khảo giá..."
                          className="w-full h-10 px-3 rounded-lg border border-orange-200 bg-white text-sm"
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
                          className="w-full h-10 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm"
                        >
                          Phát cảnh báo dò giá
                        </button>
                      </form>

                      <form
                        onSubmit={(e) => void handleMarkSpam(e)}
                        className="p-4 rounded-xl bg-slate-100 border border-slate-200 space-y-2.5"
                      >
                        <p className="font-bold text-slate-800 text-sm">Đánh dấu Spam</p>
                        <select
                          value={spamReason}
                          onChange={(e) =>
                            setSpamReason(e.target.value as (typeof SPAM_REASONS)[number])
                          }
                          className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm"
                        >
                          {SPAM_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-slate-500">
                          SĐT sai/Nhầm máy tự loại khỏi báo cáo Ads; Đối thủ khảo giá vào diện chờ xác nhận.
                        </p>
                        <button
                          type="submit"
                          disabled={submitting}
                          className="w-full h-10 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm"
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

              {/* TAB 4: LỊCH SỬ — dòng thời gian theo ngày */}
              {leadDetailTab === 'activity' && (
                <LeadActivityTimeline activities={selectedLead.activities || []} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

