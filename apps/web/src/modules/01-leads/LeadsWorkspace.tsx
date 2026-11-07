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
  new_lead: 'bg-violet-50 text-violet-700 border-violet-200 font-semibold',
  quoting: 'bg-blue-50 text-blue-700 border-blue-200 font-semibold',
  quote_sent: 'bg-amber-50 text-amber-800 border-amber-300 font-semibold',
  won: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold',
  lost: 'bg-slate-100 text-slate-600 border-slate-200 font-semibold',
};

const STATUS_ROW_ACCENTS: Record<PipelineStatus, string> = {
  new_lead: 'border-l-2 border-l-violet-400',
  quoting: 'border-l-2 border-l-blue-400',
  quote_sent: 'border-l-2 border-l-amber-400',
  won: 'border-l-2 border-l-emerald-400',
  lost: 'border-l-2 border-l-slate-300',
};

const KANBAN_COLUMN_THEMES: Record<
  PipelineStatus,
  { wrap: string; headerBg: string; badge: string }
> = {
  new_lead: {
    wrap: 'bg-slate-50/70 border-slate-200/90',
    headerBg: 'bg-white border border-slate-200/80 text-slate-900',
    badge: 'bg-violet-50 text-violet-700 border border-violet-200',
  },
  quoting: {
    wrap: 'bg-slate-50/70 border-slate-200/90',
    headerBg: 'bg-white border border-slate-200/80 text-slate-900',
    badge: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  quote_sent: {
    wrap: 'bg-slate-50/70 border-slate-200/90',
    headerBg: 'bg-white border border-slate-200/80 text-slate-900',
    badge: 'bg-amber-50 text-amber-800 border border-amber-300',
  },
  won: {
    wrap: 'bg-slate-50/70 border-slate-200/90',
    headerBg: 'bg-white border border-slate-200/80 text-slate-900',
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  lost: {
    wrap: 'bg-slate-50/70 border-slate-200/90',
    headerBg: 'bg-white border border-slate-200/80 text-slate-900',
    badge: 'bg-slate-100 text-slate-600 border border-slate-200',
  },
};

export type B2bFollowUpHorizonKey =
  | 'none'
  | 'hot_under_7d'
  | 'remind_7_14d'
  | 'monthly_15_45d'
  | 'longterm_next_year';

export const B2B_HORIZON_OPTIONS: {
  key: B2bFollowUpHorizonKey;
  tag: string;
  legacyTags: string[];
  label: string;
  shortLabel: string;
  badgeClass: string;
}[] = [
  {
    key: 'hot_under_7d',
    tag: '[THEO DÕI DỰ ÁN: ĐANG TƯ VẤN < 7 NGÀY]',
    legacyTags: ['[CHU KỲ B2B: TƯƠNG TÁC NÓNG 3-7 NGÀY]'],
    label: 'Đang tư vấn ngắn hạn (Theo dõi sát trong 3–7 ngày đầu)',
    shortLabel: 'Đang tư vấn (< 7 ngày)',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key: 'remind_7_14d',
    tag: '[THEO DÕI DỰ ÁN: LIÊN HỆ LẠI 7-30 NGÀY]',
    legacyTags: ['[CHU KỲ B2B: HỎI GIÁ ĐỂ ĐÓ 7-14 NGÀY]'],
    label: 'Cần liên hệ lại (7–30 ngày — Khách đang cân nhắc phương án)',
    shortLabel: 'Cần liên hệ lại (7–30 ngày)',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    key: 'monthly_15_45d',
    tag: '[THEO DÕI DỰ ÁN: ĐỊNH KỲ 1-2 THÁNG]',
    legacyTags: ['[CHU KỲ B2B: NGÂM HÀNG THÁNG 15-45 NGÀY]'],
    label: 'Theo dõi định kỳ 1–2 tháng (Chờ trình duyệt ngân sách / đấu thầu)',
    shortLabel: 'Theo dõi 1–2 tháng',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    key: 'longterm_next_year',
    tag: '[THEO DÕI DỰ ÁN: DÀI HẠN > 2 THÁNG]',
    legacyTags: ['[CHU KỲ B2B: DỰ ÁN DÀI HẠN / NĂM SAU CHỐT]'],
    label: 'Dự án dài hạn (> 2 tháng — Chờ tiến độ công trình / kỳ kế hoạch mới)',
    shortLabel: 'Dự án dài hạn (> 2 tháng)',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
];

function extractScheduledFollowUpDate(noteText: string): string {
  const match = noteText.match(/\[HẸN LIÊN HỆ:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\]/);
  return match ? match[1] : '';
}

function formatIsoDateVi(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getB2bFollowUpHorizon(lead: LeadItemDto): {
  key: B2bFollowUpHorizonKey;
  shortLabel: string;
  badgeClass: string;
  waitingDays: number;
  scheduledDate: string;
} {
  const combinedNote = `${lead.customProductNote || ''} ${lead.initialNote || ''}`;
  const scheduledDate = extractScheduledFollowUpDate(combinedNote);
  const refDateStr = lead.quoteSentAt || lead.contactedAt;
  const waitingDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(refDateStr).getTime()) / (24 * 60 * 60 * 1000)),
  );

  for (const opt of B2B_HORIZON_OPTIONS) {
    if (
      combinedNote.includes(opt.tag) ||
      opt.legacyTags.some((t) => combinedNote.includes(t))
    ) {
      return {
        key: opt.key,
        shortLabel: scheduledDate
          ? `${opt.shortLabel} · Hẹn ${formatIsoDateVi(scheduledDate)}`
          : opt.shortLabel,
        badgeClass: opt.badgeClass,
        waitingDays,
        scheduledDate,
      };
    }
  }

  if (
    combinedNote.toLowerCase().includes('năm sau') ||
    combinedNote.toLowerCase().includes('quý tới') ||
    combinedNote.toLowerCase().includes('dài hạn')
  ) {
    return {
      key: 'longterm_next_year',
      shortLabel: scheduledDate
        ? `Dự án dài hạn · Hẹn ${formatIsoDateVi(scheduledDate)}`
        : 'Dự án dài hạn (> 2 tháng)',
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
      waitingDays,
      scheduledDate,
    };
  }

  if (lead.pipelineStatus !== 'quote_sent' && lead.pipelineStatus !== 'quoting') {
    return {
      key: scheduledDate ? 'remind_7_14d' : 'none',
      shortLabel: scheduledDate ? `Hẹn liên hệ: ${formatIsoDateVi(scheduledDate)}` : '',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      waitingDays,
      scheduledDate,
    };
  }

  if (waitingDays > 45) {
    return {
      key: 'longterm_next_year',
      shortLabel: scheduledDate
        ? `Hẹn ${formatIsoDateVi(scheduledDate)} · Dự án dài hạn`
        : `Theo dõi ${waitingDays} ngày · Dự án dài hạn`,
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
      waitingDays,
      scheduledDate,
    };
  }
  if (waitingDays >= 15) {
    return {
      key: 'monthly_15_45d',
      shortLabel: scheduledDate
        ? `Hẹn ${formatIsoDateVi(scheduledDate)} · Theo dõi 1–2 tháng`
        : `Theo dõi ${waitingDays} ngày · Định kỳ 1–2 tháng`,
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      waitingDays,
      scheduledDate,
    };
  }
  if (waitingDays >= 7 || lead.isQuoteOverdue7Days) {
    return {
      key: 'remind_7_14d',
      shortLabel: scheduledDate
        ? `Hẹn ${formatIsoDateVi(scheduledDate)} · Cần liên hệ lại`
        : `Đã gửi ${Math.max(waitingDays, 7)} ngày · Cần liên hệ lại`,
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      waitingDays: Math.max(waitingDays, 7),
      scheduledDate,
    };
  }
  return {
    key: 'hot_under_7d',
    shortLabel: scheduledDate
      ? `Hẹn ${formatIsoDateVi(scheduledDate)} · Đang tư vấn`
      : `Mới ${waitingDays} ngày · Đang tư vấn`,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    waitingDays,
    scheduledDate,
  };
}

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
  const [b2bHorizonFilter, setB2bHorizonFilter] = useState<string>('all');
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

  // Sync initial filters from URL query params (?status=..., ?overdueOnly=true, ?unreceived=1, ?search=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const st = params.get('status');
    if (st && (st === 'all' || PIPELINE_STATUSES.includes(st as PipelineStatus))) {
      setStatusFilter(st);
    }
    const q = params.get('search');
    if (q && q.trim()) {
      setSearchQuery(q.trim());
      setDebouncedSearchQuery(q.trim());
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

  // Direct Inline Edit Lead form state (Tab 1: Mở chi tiết sửa trực tiếp theo phân quyền)
  const [editPhone, setEditPhone] = useState('');
  const [editContactName, setEditContactName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSelfSource, setEditSelfSource] = useState('');
  const [editAreaType, setEditAreaType] = useState<'hcm' | 'other_province'>('hcm');
  const [editDistrict, setEditDistrict] = useState<string>(HCM_DISTRICTS[0]);
  const [editProvince, setEditProvince] = useState<string>(VIETNAM_PROVINCES[0]);
  const [editAddress, setEditAddress] = useState('');
  const [editProductIds, setEditProductIds] = useState<number[]>([]);
  const [editCustomProductNote, setEditCustomProductNote] = useState('');
  const [editB2bHorizon, setEditB2bHorizon] = useState<B2bFollowUpHorizonKey>('none');
  const [editFollowUpDate, setEditFollowUpDate] = useState('');
  const [editUpdateNote, setEditUpdateNote] = useState('');

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
        setLeadDetailTab('info');
        return;
      }
    }
    const q = params.get('search');
    if (q && q.trim()) {
      const matched = leads.find(
        (l) => l.leadCode.toLowerCase() === q.trim().toLowerCase(),
      );
      if (matched && selectedLeadId === null) {
        setSelectedLeadId(matched.id);
        setLeadDetailTab('info');
      }
    }
  }, [leads, selectedLeadId]);

  const displayedLeads = useMemo(() => {
    let list = leads;
    if (overdueOnly) {
      list = list.filter((l) => l.isQuoteOverdue7Days && l.spamStatus === 'NONE');
    }
    if (unreceivedOnly) {
      list = list.filter(
        (l) => l.pipelineStatus === 'new_lead' && !l.receivedConfirmedAt && l.spamStatus === 'NONE',
      );
    }
    if (b2bHorizonFilter !== 'all') {
      list = list.filter((l) => {
        if (l.spamStatus !== 'NONE') return false;
        const horizon = getB2bFollowUpHorizon(l);
        if (b2bHorizonFilter === 'any_long_cycle') {
          return (
            horizon.key === 'remind_7_14d' ||
            horizon.key === 'monthly_15_45d' ||
            horizon.key === 'longterm_next_year'
          );
        }
        return horizon.key === b2bHorizonFilter;
      });
    }
    return list;
  }, [leads, overdueOnly, unreceivedOnly, b2bHorizonFilter]);

  const totalFilteredCount = Math.max(
    displayedLeads.length,
    overdueOnly || unreceivedOnly || b2bHorizonFilter !== 'all'
      ? displayedLeads.length
      : totalCount,
  );
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
        (l) => l.pipelineStatus === 'new_lead' && !l.receivedConfirmedAt && l.spamStatus === 'NONE',
      ).length,
    [leads],
  );

  const b2bSummaryCounts = useMemo(() => {
    const valid = leads.filter((l) => l.spamStatus === 'NONE');
    let newLeadCount = 0;
    let quotingCount = 0;
    let hotQuoteCount = 0;
    let longCycleCount = 0;
    let wonCount = 0;

    for (const l of valid) {
      if (l.pipelineStatus === 'new_lead') newLeadCount += 1;
      if (l.pipelineStatus === 'quoting') quotingCount += 1;
      if (l.pipelineStatus === 'won') wonCount += 1;
      const h = getB2bFollowUpHorizon(l);
      if (l.pipelineStatus === 'quote_sent' && h.key === 'hot_under_7d') {
        hotQuoteCount += 1;
      }
      if (
        h.key === 'remind_7_14d' ||
        h.key === 'monthly_15_45d' ||
        h.key === 'longterm_next_year'
      ) {
        longCycleCount += 1;
      }
    }

    return {
      validTotal: valid.length,
      newLeadCount,
      quotingCount,
      hotQuoteCount,
      longCycleCount,
      wonCount,
    };
  }, [leads]);

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

  const canEditLead = useCallback(
    (lead: LeadItemDto | null): boolean => {
      if (!lead || !user || lead.isAnonymized) return false;
      if (!hasBaPermission(user.roleCode, 'LEAD_UPDATE_PIPELINE')) return false;
      if (hasBaPermission(user.roleCode, 'LEAD_VIEW_ALL')) return true;
      return lead.assignedSalesId === user.id || lead.createdByName === user.fullName;
    },
    [user],
  );

  const canEditSelectedLead = useMemo(
    () => canEditLead(selectedLead),
    [canEditLead, selectedLead],
  );

  useEffect(() => {
    if (selectedLead) {
      setTargetStatus(selectedLead.pipelineStatus);
      setStatusReason(selectedLead.lostReason || '');
      setStatusNote('');
      setMarkQuoteResponded(Boolean(selectedLead.quoteRespondedAt));
      setBypassPriceCheckConfirmed(false);

      // Populate Direct Inline Edit form
      setEditPhone(selectedLead.phone || '');
      setEditContactName(selectedLead.contactName || '');
      setEditCompanyName(selectedLead.companyName || '');
      setEditProjectName(selectedLead.projectName || '');
      setEditEmail(selectedLead.email || '');
      setEditSelfSource(selectedLead.selfReportedSource || '');
      setEditAreaType(selectedLead.areaType === 'other_province' ? 'other_province' : 'hcm');
      setEditDistrict(selectedLead.hcmDistrict || HCM_DISTRICTS[0]);
      setEditProvince(
        selectedLead.province && selectedLead.province !== 'TP. Hồ Chí Minh'
          ? selectedLead.province
          : VIETNAM_PROVINCES[0],
      );
      setEditAddress(selectedLead.installationAddress || '');
      setEditProductIds(selectedLead.products.map((p) => p.id));

      const rawCustomNote = selectedLead.customProductNote || '';
      const existingScheduledDate = extractScheduledFollowUpDate(rawCustomNote);
      setEditFollowUpDate(existingScheduledDate);
      let cleanCustomNote = rawCustomNote.replace(/\[HẸN LIÊN HỆ:\s*[^\]]+\]/g, '').trim();
      for (const opt of B2B_HORIZON_OPTIONS) {
        cleanCustomNote = cleanCustomNote.replace(opt.tag, '').trim();
        for (const legacyTag of opt.legacyTags) {
          cleanCustomNote = cleanCustomNote.replace(legacyTag, '').trim();
        }
      }
      setEditCustomProductNote(cleanCustomNote);
      const detectedHorizon = getB2bFollowUpHorizon(selectedLead);
      setEditB2bHorizon(detectedHorizon.key);
      setEditUpdateNote('');
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

  const handleUpdateLeadInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedLead || !canEditSelectedLead) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const horizonOpt = B2B_HORIZON_OPTIONS.find((o) => o.key === editB2bHorizon);
      const followUpTag = editFollowUpDate.trim()
        ? `[HẸN LIÊN HỆ: ${editFollowUpDate.trim()}]`
        : '';
      const composedCustomNote = [
        horizonOpt ? horizonOpt.tag : '',
        followUpTag,
        editCustomProductNote.trim(),
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      await apiRequest(`/api/v1/leads/${selectedLead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'update_info',
          expectedVersion: selectedLead.version,
          phone: editPhone.trim(),
          contactName: editContactName.trim() || null,
          companyName: editCompanyName.trim() || null,
          projectName: editProjectName.trim() || null,
          email: editEmail.trim() || null,
          selfReportedSource: editSelfSource.trim() || null,
          areaType: editAreaType,
          hcmDistrict: editAreaType === 'hcm' ? editDistrict : null,
          province: editAreaType === 'other_province' ? editProvince : 'TP. Hồ Chí Minh',
          installationAddress: editAddress.trim() || null,
          productIds: editProductIds.length > 0 ? editProductIds : selectedLead.products.map((p) => p.id),
          customProductNote: composedCustomNote || null,
          note:
            editUpdateNote.trim() ||
            (horizonOpt || editFollowUpDate
              ? `Cập nhật hồ sơ Lead${horizonOpt ? ` · Lộ trình: ${horizonOpt.shortLabel}` : ''}${editFollowUpDate ? ` · Hẹn liên hệ: ${formatIsoDateVi(editFollowUpDate)}` : ''}`
              : 'Cập nhật trực tiếp thông tin hồ sơ Lead tại màn hình Chi tiết.'),
        },
      });
      setFeedbackMsg(
        `Đã lưu cập nhật trực tiếp thông tin hồ sơ ${selectedLead.leadCode} thành công.`,
      );
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi cập nhật thông tin Lead.');
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
    <div className="space-y-3.5">
      {/* Page Header — Clean Modern White Card */}
      <div className="rounded-2xl bg-white text-slate-900 p-4 shadow-2xs border border-slate-200/90 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Quản lý Lead &amp; Pipeline Kinh doanh B2B
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200/80 text-xs font-semibold text-[#1E3A8A]">
              Theo dõi lộ trình dự án &amp; Lịch hẹn chăm sóc
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            Tiếp nhận, mở chi tiết để xem và chỉnh sửa trực tiếp theo phân quyền, đặt lịch hẹn theo dõi dự án 1–2 tháng hoặc dài hạn
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {user?.roleCode === 'SALES' && (
            <button
              type="button"
              onClick={() => void handleToggleReceivingStatus()}
              className={`h-9 px-3 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors ${
                isReceivingLeads
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100/70'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/70'
              }`}
              title="Bật/tắt chế độ nhận phân bổ Lead tự động (Round-Robin)"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isReceivingLeads ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <span>{isReceivingLeads ? 'Đang nhận Lead' : 'Tạm ngưng nhận'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void fetchLeads()}
            className="h-9 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs sm:text-sm font-semibold text-slate-700 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Làm mới</span>
          </button>

          <div className="inline-flex p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition ${
                viewMode === 'table'
                  ? 'bg-white text-[#1E3A8A] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Bảng danh sách</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition ${
                viewMode === 'kanban'
                  ? 'bg-white text-[#1E3A8A] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Bảng Kanban</span>
            </button>
          </div>

          <a
            href={exportHref}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors"
            title="Xuất toàn bộ hồ sơ Lead theo bộ lọc hiện tại ra file Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Xuất Excel ({displayedLeads.length})</span>
          </a>

          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="h-9 px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo Lead mới</span>
            </button>
          )}
        </div>
      </div>

      {/* 6-Card Clean White Pipeline & Project Follow-Up Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => {
            setStatusFilter('all');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            statusFilter === 'all' && b2bHorizonFilter === 'all' && !overdueOnly && !unreceivedOnly
              ? 'bg-blue-50/50 border-blue-300 ring-1 ring-blue-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            Tổng Lead Hợp Lệ
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.validTotal}
            </span>
            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
              Toàn phễu
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('new_lead');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            statusFilter === 'new_lead'
              ? 'bg-violet-50/50 border-violet-300 ring-1 ring-violet-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            1. Vừa Nhận Thông Tin
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.newLeadCount}
            </span>
            <span className="text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200/70 px-1.5 py-0.5 rounded">
              {unreceivedCount} chờ nhận
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('quoting');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            statusFilter === 'quoting'
              ? 'bg-blue-50/50 border-blue-300 ring-1 ring-blue-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            2. Đang Soạn Báo Giá
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.quotingCount}
            </span>
            <span className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200/70 px-1.5 py-0.5 rounded">
              Khảo sát / CAD
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('quote_sent');
            setB2bHorizonFilter('hot_under_7d');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            b2bHorizonFilter === 'hot_under_7d'
              ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            3A. Báo Giá Mới (&lt;7 ngày)
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.hotQuoteCount}
            </span>
            <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
              Đang tư vấn
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('all');
            setB2bHorizonFilter(
              b2bHorizonFilter === 'any_long_cycle' ? 'all' : 'any_long_cycle',
            );
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            b2bHorizonFilter === 'any_long_cycle'
              ? 'bg-indigo-50/50 border-indigo-300 ring-1 ring-indigo-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            3B. Theo Dõi Dài Hạn
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.longCycleCount}
            </span>
            <span className="text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-1.5 py-0.5 rounded">
              1–2 tháng+
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setStatusFilter('won');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            statusFilter === 'won'
              ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            4. Chốt Thành Công
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.wonCount}
            </span>
            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/70 px-1.5 py-0.5 rounded">
              Hợp đồng LED
            </span>
          </div>
        </button>
      </div>

      {/* Role Anonymization Notice (Clean business wording) */}
      {leads.some((l) => l.isAnonymized) && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs sm:text-sm text-amber-900 flex items-start gap-2.5">
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
          className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center justify-between"
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
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center justify-between">
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

      {/* Filter Bar & Project Follow-Up Plan Filter Pills */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs space-y-2.5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400 shrink-0 mr-0.5" />
            <button
              type="button"
              onClick={() => {
                setOverdueOnly(false);
                setUnreceivedOnly(false);
                setB2bHorizonFilter('all');
                setStatusFilter('all');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                statusFilter === 'all' &&
                b2bHorizonFilter === 'all' &&
                !overdueOnly &&
                !unreceivedOnly
                  ? 'bg-[#1E3A8A] text-white shadow-2xs'
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
                  setB2bHorizonFilter('all');
                  setStatusFilter(st);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-colors ${
                  statusFilter === st && !overdueOnly && !unreceivedOnly
                    ? STATUS_BADGE_STYLES[st]
                    : 'bg-slate-100 border-transparent text-slate-700 font-medium hover:bg-slate-200/70'
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
                  setB2bHorizonFilter('all');
                  setUnreceivedOnly((v) => !v);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                  unreceivedOnly
                    ? 'bg-blue-700 text-white shadow-2xs'
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
                  setB2bHorizonFilter('all');
                  setOverdueOnly((v) => !v);
                  setCurrentPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                  overdueOnly
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 border border-amber-200 text-amber-900 hover:bg-amber-100'
                }`}
              >
                Cần nhắc &gt;7 ngày ({overdueCount})
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'table' && (
              <button
                type="button"
                onClick={() => setShowOptionalColumns((prev) => !prev)}
                aria-pressed={showOptionalColumns}
                className={`h-9 px-3 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition ${
                  showOptionalColumns
                    ? 'bg-blue-50 border-blue-300 text-[#1E3A8A]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title="Đang thu gọn 3 cột: Khu vực / Địa chỉ, Chi tiết UTM, Ghi chú. Bấm để xem."
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{showOptionalColumns ? 'Ẩn 3 cột phụ' : 'Xem thêm 3 cột'}</span>
              </button>
            )}

            <div className="relative flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm khách hàng, dự án, SĐT, mã Lead... (Phím /)"
                className="h-9 pl-9 pr-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1E3A8A] w-full sm:w-72"
              />
            </div>
          </div>
        </div>

        {/* Project Follow-Up Plan Filter Strip */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-600 mr-1 inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#1E3A8A]" />
            <span>Lộ trình theo dõi dự án:</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setB2bHorizonFilter('all');
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg font-medium border transition ${
              b2bHorizonFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Tất cả lộ trình
          </button>
          <button
            type="button"
            onClick={() => {
              setB2bHorizonFilter(
                b2bHorizonFilter === 'any_long_cycle' ? 'all' : 'any_long_cycle',
              );
              setCurrentPage(1);
            }}
            className={`px-2.5 py-1 rounded-lg font-medium border transition ${
              b2bHorizonFilter === 'any_long_cycle'
                ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Cần theo dõi định kỳ ({b2bSummaryCounts.longCycleCount})
          </button>
          {B2B_HORIZON_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setB2bHorizonFilter(b2bHorizonFilter === opt.key ? 'all' : opt.key);
                setCurrentPage(1);
              }}
              className={`px-2.5 py-1 rounded-lg font-medium border transition ${
                b2bHorizonFilter === opt.key
                  ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {opt.shortLabel}
            </button>
          ))}
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
          <div className="md:hidden space-y-2.5">
            {paginatedLeads.map((lead) => {
              const cleanDigits = lead.phone.replace(/\D/g, '');
              const fraud = evaluateLeadFraudCriteria(lead, leads, priceCheckAlerts);
              const primaryProduct = lead.products[0];
              const extraProductsCount = Math.max(0, lead.products.length - 1);
              const horizon = getB2bFollowUpHorizon(lead);
              const editable = canEditLead(lead);

              return (
                <div
                  key={lead.id}
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                    setLeadDetailTab('info');
                  }}
                  className={`rounded-2xl border p-3.5 shadow-xs transition active:scale-[0.99] space-y-2.5 ${
                    lead.spamStatus !== 'NONE'
                      ? 'bg-red-50/70 border-red-300 border-l-4 border-l-red-600'
                      : `bg-white border-slate-200/90 ${STATUS_ROW_ACCENTS[lead.pipelineStatus]}`
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
                      className={`px-2.5 py-1 rounded-lg border text-xs shrink-0 ${
                        STATUS_BADGE_STYLES[lead.pipelineStatus]
                      }`}
                    >
                      {PIPELINE_STATUS_LABELS[lead.pipelineStatus]}
                    </span>
                  </div>

                  {/* Separated Status & B2B Horizon & Warning Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {horizon.key !== 'none' && (
                      <span
                        className={`px-2 py-0.5 rounded-md border text-xs font-bold ${horizon.badgeClass}`}
                      >
                        {horizon.shortLabel}
                      </span>
                    )}
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
                            className="h-8 px-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold inline-flex items-center gap-1.5"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>Gọi</span>
                          </a>
                          <a
                            href={`https://zalo.me/${cleanDigits}`}
                            target="_blank"
                            rel="noreferrer"
                            className="h-8 px-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-semibold inline-flex items-center gap-1.5"
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
                      className="h-8 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A8A] text-xs font-semibold inline-flex items-center shadow-2xs transition"
                    >
                      <span>Chi tiết</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* UI-01, UI-02, UI-03: Simplified 7-Column Default Desktop Table with Subtle Row Accents */}
          <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table
                className={`w-full text-left border-collapse text-sm ${
                  showOptionalColumns ? 'min-w-[1280px]' : 'table-fixed'
                }`}
              >
                <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200/80 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3.5 w-[21%]">Khách hàng / Dự án</th>
                    <th className="py-3 px-3 w-[15%]">Liên hệ &amp; Nguồn / Kênh</th>
                    <th className="py-3 px-3 w-[14%]">Sản phẩm LED</th>
                    <th className="py-3 px-3 w-[18%]">Trạng thái &amp; Lịch theo dõi</th>
                    <th className="py-3 px-3 w-[10%]">Sales phụ trách</th>
                    <th className="py-3 px-3 w-[8%]">Ngày nhận</th>
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
                      const horizon = getB2bFollowUpHorizon(lead);
                      const editable = canEditLead(lead);

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
                              ? 'bg-red-50/85 hover:bg-red-100/70 border-l-4 border-l-red-600'
                              : `${STATUS_ROW_ACCENTS[lead.pipelineStatus]} hover:bg-blue-50/35`
                          }`}
                        >
                          {/* Col 1: Customer / Project */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div
                              className="font-bold text-slate-900 text-sm truncate"
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
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 font-mono truncate">
                              <span className="truncate font-semibold text-[#1E3A8A]" title={lead.leadCode}>
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
                          <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                            <div className="font-bold font-mono text-slate-900 text-sm flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-[#1E3A8A] shrink-0" />
                              <span>{lead.phone}</span>
                            </div>
                            <div className="text-[13px] text-slate-600 truncate max-w-[155px] mt-0.5">
                              {lead.contactName || 'Khách liên hệ'}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200/70 text-xs font-semibold truncate max-w-[155px]">
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

                          {/* Col 3: Products */}
                          <td className="py-2.5 px-3 align-middle max-w-[175px] xl:max-w-[215px]">
                            {primaryProduct ? (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="px-2 py-1 rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-200 text-xs font-semibold truncate max-w-[135px] xl:max-w-[165px]"
                                  title={primaryProduct.productName}
                                >
                                  {primaryProduct.productName}
                                </span>
                                {extraProducts.length > 0 && (
                                  <span
                                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold shrink-0"
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

                          {/* Col 4: Bold Pipeline Status & B2B Long-Cycle Nurturing Tier & Warnings */}
                          <td className="py-2.5 px-3 align-middle">
                            <div className="flex flex-col items-start gap-1">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs whitespace-nowrap ${
                                  STATUS_BADGE_STYLES[lead.pipelineStatus]
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-85" />
                                <span>{PIPELINE_STATUS_LABELS[lead.pipelineStatus]}</span>
                              </span>

                              {/* B2B Follow-up Horizon Badge (Khách hỏi giá để đó vài ngày / hàng tháng / năm sau chốt) */}
                              {horizon.key !== 'none' && (
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${horizon.badgeClass}`}
                                >
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span>{horizon.shortLabel}</span>
                                </span>
                              )}

                              {/* Separate Restrained Warning Pills */}
                              {hasAnyWarning && (
                                <div
                                  className="flex flex-wrap gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {showSpamBadge && (
                                    <button
                                      type="button"
                                      onClick={() => setInvestigativeLead(lead)}
                                      className="px-2 py-0.5 rounded-md bg-red-600 hover:bg-red-700 border border-red-600 text-white text-[11px] font-bold inline-flex items-center gap-1 transition"
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
                                      className="px-2 py-0.5 rounded-md bg-orange-100 hover:bg-orange-200 border border-orange-300 text-orange-900 text-[11px] font-bold transition"
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
                                      className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 text-[11px] font-bold transition"
                                      title="Nhấn để xem đối chiếu hồ sơ trùng SĐT hoặc trùng tên dự án"
                                    >
                                      {fraud.duplicateProjectName
                                        ? 'Trùng tên dự án'
                                        : `Trùng SĐT (${fraud.phoneSubmitCount30d} lần)`}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Col 5: Assigned Sales */}
                          <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                            <div className="font-semibold text-slate-900 text-sm">
                              {lead.assignedSalesName || 'Chưa phân bổ'}
                            </div>
                            <div className="mt-0.5">
                              {lead.receivedConfirmedAt ? (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Đã tiếp nhận</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-semibold">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Chờ xác nhận</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 6: Received Date */}
                          <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                            <div className="text-sm font-semibold text-slate-800">
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
                              <td className="py-2.5 px-3 align-middle max-w-[180px]">
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
                              <td className="py-2.5 px-3 align-middle whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-medium">
                                  {lead.tracking?.marketingSource ||
                                    lead.selfReportedSource ||
                                    CONTACT_CHANNEL_LABELS[lead.contactChannel]}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 align-middle max-w-[200px]">
                                <p className="text-xs text-slate-600 truncate" title={noteSummary}>
                                  {noteSummary}
                                </p>
                              </td>
                            </>
                          )}

                          {/* Col 7: Consolidated Row Actions with Direct Edit ("Sửa / Chi tiết") */}
                          <td
                            className="py-2.5 px-3.5 align-middle text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              {!lead.isAnonymized && cleanDigits.length >= 9 && (
                                <>
                                  <a
                                    href={`tel:${cleanDigits}`}
                                    className="h-8 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1 transition"
                                    title={`Gọi ${lead.phone}`}
                                  >
                                    <Phone className="w-3.5 h-3.5" />
                                    <span>Gọi</span>
                                  </a>
                                  <a
                                    href={`https://zalo.me/${cleanDigits}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-8 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E3A8A] border border-blue-200 text-xs font-bold inline-flex items-center transition"
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
                                className="h-8 px-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A8A] text-xs font-semibold inline-flex items-center shadow-2xs transition"
                                title={
                                  editable
                                    ? 'Mở chi tiết để xem và chỉnh sửa trực tiếp thông tin Lead'
                                    : 'Mở xem chi tiết hồ sơ Lead'
                                }
                              >
                                <span>Chi tiết</span>
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
            <div className="px-4 py-2.5 bg-slate-50/90 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-sm text-slate-600">
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
        /* UI-04: Standardized Kanban 5-Column View with Distinct Color Themes */
        <div className="flex gap-3.5 overflow-x-auto pb-3">
          {PIPELINE_STATUSES.map((statusKey) => {
            const colLeads = displayedLeads.filter((l) => l.pipelineStatus === statusKey);
            const theme = KANBAN_COLUMN_THEMES[statusKey];
            return (
              <div
                key={statusKey}
                className={`w-80 shrink-0 border rounded-2xl p-3 flex flex-col gap-2.5 min-h-[520px] ${theme.wrap}`}
              >
                <div
                  className={`flex items-center justify-between px-3 py-2 rounded-xl ${theme.headerBg}`}
                >
                  <span className="text-sm font-extrabold">
                    {PIPELINE_STATUS_LABELS[statusKey]}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold shadow-2xs ${theme.badge}`}
                  >
                    {colLeads.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 flex flex-col">
                  {colLeads.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 border border-dashed border-slate-300/80 rounded-xl bg-white/60">
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
                      const horizon = getB2bFollowUpHorizon(lead);
                      const editable = canEditLead(lead);
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
                          className={`cursor-pointer rounded-xl p-3.5 border shadow-2xs hover:shadow-md transition-all flex flex-col justify-between min-h-[172px] ${
                            showSpamBadge
                              ? 'bg-red-50/70 border-red-300 border-l-4 border-l-red-600 hover:border-red-500'
                              : `bg-white border-slate-200/90 ${STATUS_ROW_ACCENTS[lead.pipelineStatus]} hover:border-[#1E3A8A]`
                          }`}
                        >
                          {/* Card Region 1: Header (Code & Contact Channel) */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-[#1E3A8A]">
                                {lead.leadCode}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                                {CONTACT_CHANNEL_LABELS[lead.contactChannel]}
                              </span>
                            </div>

                            {/* Card Region 2: Primary Customer & Secondary Project */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 line-clamp-1">
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

                            {/* Card Region 3: Product + B2B Horizon + Warnings */}
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {primaryProduct && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-blue-50 text-[#1E3A8A] border border-blue-200/80 font-semibold truncate max-w-[190px]">
                                  {primaryProduct.productName}
                                </span>
                              )}
                              {extraCount > 0 && (
                                <span className="text-xs px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                                  +{extraCount}
                                </span>
                              )}
                              {horizon.key !== 'none' && (
                                <span
                                  className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${horizon.badgeClass}`}
                                >
                                  {horizon.shortLabel}
                                </span>
                              )}
                              {showSpamBadge && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-red-600 text-white font-semibold inline-flex items-center gap-1">
                                  <Ban className="w-3 h-3" />
                                  Spam
                                </span>
                              )}
                              {fraud.hasPriceProbeBehavior && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200 font-semibold">
                                  Nghi dò giá
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Card Region 4: Aligned Footer */}
                          <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="truncate font-semibold text-slate-700">
                              {lead.assignedSalesName || 'Chưa phân bổ'}
                            </span>
                            <span className="inline-flex items-center gap-1 font-semibold text-[#1E3A8A]">
                              <span>Chi tiết</span>
                            </span>
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

      {/* Modal / Dialog Chi tiết Lead & Chỉnh sửa Trực tiếp theo Phân quyền */}
      {selectedLead && (() => {
        const selectedHorizon = getB2bFollowUpHorizon(selectedLead);
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-5 overflow-hidden">
            <div className="bg-white w-full max-w-5xl h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-150">
              {/* Header hồ sơ: Color-accented Navy/Slate banner + Quick Status & RBAC Indicator */}
              <div className="px-5 pt-4 pb-3.5 border-b border-slate-200 bg-linear-to-r from-slate-50 via-blue-50/50 to-indigo-50/40 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div
                      aria-hidden="true"
                      className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 text-base font-extrabold shadow-xs ${
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
                        <h2 className="font-display text-lg font-bold text-slate-900 truncate max-w-[480px]">
                          {selectedLead.companyName || selectedLead.contactName || selectedLead.phone}
                        </h2>
                        <span
                          className={`px-3 py-0.5 rounded-full border text-xs shrink-0 ${
                            STATUS_BADGE_STYLES[selectedLead.pipelineStatus]
                          }`}
                        >
                          {PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}
                        </span>
                        {selectedHorizon.key !== 'none' && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full border text-xs font-bold shrink-0 ${selectedHorizon.badgeClass}`}
                          >
                            {selectedHorizon.shortLabel}
                          </span>
                        )}
                        {selectedLead.spamStatus !== 'NONE' && (
                          <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0">
                            <Ban className="w-3.5 h-3.5" />
                            Spam · {selectedLead.spamStatus === 'CONFIRMED' ? 'Đã xác nhận' : 'Chờ duyệt'}
                          </span>
                        )}
                      </div>
                      {selectedLead.projectName && (
                        <p className="text-sm font-medium text-[#1E3A8A] mt-0.5 truncate max-w-[640px]">
                          Dự án: {selectedLead.projectName}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                        <span className="font-mono font-bold text-slate-800" title="Mã hồ sơ Lead">
                          {selectedLead.leadCode}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-800">
                          <Phone className="w-3.5 h-3.5 text-[#1E3A8A]" />
                          {selectedLead.phone}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-700">
                          {selectedLead.tracking?.marketingSource ||
                            CONTACT_CHANNEL_LABELS[selectedLead.contactChannel] ||
                            selectedLead.contactChannel}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {new Date(selectedLead.contactedAt).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          Sales: {selectedLead.assignedSalesName || 'Chưa phân bổ'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedLeadId(null)}
                    aria-label="Đóng chi tiết Lead"
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                {selectedLead.spamStatus !== 'NONE' && selectedLead.spamReason && (
                  <div className="mt-2.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                    <strong className="font-semibold">Lý do Spam:</strong> {selectedLead.spamReason}
                  </div>
                )}
              </div>

              {/* Thanh tab: 4 mục Thông tin & Sửa trực tiếp / Tiến độ / Tệp đính kèm / Lịch sử */}
              <div
                role="tablist"
                aria-label="Chi tiết hồ sơ Lead"
                className="flex items-center justify-between px-5 border-b border-slate-200 bg-white shrink-0 gap-2 overflow-x-auto"
              >
                <div className="flex items-center gap-1">
                  {(
                    [
                      {
                        id: 'info',
                        label: canEditSelectedLead ? 'Thông tin & Sửa trực tiếp' : 'Thông tin Lead',
                        icon: canEditSelectedLead ? Pencil : Info,
                        count: null,
                      },
                      { id: 'pipeline', label: 'Tiến độ & Bàn giao', icon: Activity, count: null },
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
                        className={`relative inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-bold whitespace-nowrap transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1E3A8A] ${
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

                {/* RBAC Permission Pill in Tab Bar */}
                <div className="hidden md:flex items-center gap-2 py-1.5">
                  {canEditSelectedLead ? (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5">
                      <Pencil className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Quyền sửa trực tiếp ({user?.roleName})</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
                      <span>Chỉ xem theo phân quyền ({user?.roleName})</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Scrollable Tab Body */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/40">
                {/* TAB 1: THÔNG TIN & CHỈNH SỬA TRỰC TIẾP THEO PHÂN QUYỀN */}
                {leadDetailTab === 'info' && (
                  <div className="space-y-4 text-sm">
                    {/* Clear RBAC Banner */}
                    {canEditSelectedLead ? (
                      <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <Pencil className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>
                            <strong>Chế độ Xem &amp; Chỉnh sửa Trực tiếp ({user?.roleName}):</strong> Bạn có thể cập nhật ngay thông tin khách hàng, dự án, khu vực, sản phẩm, đặt <strong>Lịch hẹn liên hệ lại / Kế hoạch theo dõi dự án</strong> và bấm <strong>Lưu cập nhật Hồ sơ Lead</strong> bên dưới.
                          </span>
                        </div>
                        {!selectedLead.receivedConfirmedAt && (
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() => void handleConfirmReceive(selectedLead)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold shrink-0 inline-flex items-center gap-1 shadow-2xs"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Xác nhận tiếp nhận Lead</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-center gap-2 text-xs">
                        <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          <strong>Chế độ Chỉ xem theo Phân quyền ({user?.roleName}):</strong> Chỉ Nhân viên Kinh doanh phụ trách trực tiếp hồ sơ này ({selectedLead.assignedSalesName || 'Chưa phân bổ'}), Trưởng nhóm Kinh doanh hoặc Quản trị viên mới được phép chỉnh sửa thông tin Lead.
                        </span>
                      </div>
                    )}

                    {/* Quick Inline Pipeline Status Bar right inside Tab 1 for Authorized Users */}
                    {canEditSelectedLead && (
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 border-l-2 border-l-[#1E3A8A] shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A] block">
                            Chuyển nhanh Trạng thái Pipeline
                          </span>
                          <span className="text-xs text-slate-500">
                            Đổi trạng thái ngay tại đây (Hiện tại:{' '}
                            <strong className="text-slate-800">{PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}</strong>)
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {PIPELINE_STATUSES.map((st) => {
                            const isCurrent = selectedLead.pipelineStatus === st;
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={submitting}
                                onClick={() => {
                                  if (st === 'lost' || selectedLead.pipelineStatus === 'lost') {
                                    setTargetStatus(st);
                                    setLeadDetailTab('pipeline');
                                    return;
                                  }
                                  setTargetStatus(st);
                                  void (async () => {
                                    if (!user) return;
                                    setSubmitting(true);
                                    setErrorMsg(null);
                                    try {
                                      await apiRequest(`/api/v1/leads/${selectedLead.id}`, {
                                        method: 'PATCH',
                                        csrfToken: user.csrfToken,
                                        body: {
                                          action: 'transition_pipeline',
                                          expectedVersion: selectedLead.version,
                                          toStatus: st,
                                          reason: null,
                                          noteContent: `Chuyển nhanh trạng thái sang ${PIPELINE_STATUS_LABELS[st]}`,
                                          markQuoteResponded: st === 'won',
                                          bypassPriceCheckConfirmed: true,
                                        },
                                      });
                                      setFeedbackMsg(
                                        `Đã cập nhật nhanh trạng thái ${selectedLead.leadCode} sang "${PIPELINE_STATUS_LABELS[st]}".`,
                                      );
                                      await fetchLeads();
                                    } catch (err) {
                                      setErrorMsg(
                                        err instanceof Error
                                          ? err.message
                                          : 'Lỗi chuyển trạng thái nhanh.',
                                      );
                                    } finally {
                                      setSubmitting(false);
                                    }
                                  })();
                                }}
                                className={`px-3 py-1.5 rounded-lg border text-xs transition ${
                                  isCurrent
                                    ? `${STATUS_BADGE_STYLES[st]} ring-1 ring-blue-500/40`
                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-medium'
                                }`}
                              >
                                {PIPELINE_STATUS_LABELS[st]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* DIRECT INLINE EDIT FORM (for Authorized Users) OR READ-ONLY CARDS */}
                    {canEditSelectedLead ? (
                      <form onSubmit={(e) => void handleUpdateLeadInfo(e)} className="space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                          {/* Left 7 cols: Editable Customer, Project & Location */}
                          <div className="lg:col-span-7 p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3.5">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <span className="font-bold text-slate-900 text-base flex items-center gap-2">
                                <Pencil className="w-4 h-4 text-[#1E3A8A]" />
                                <span>Thông tin Khách hàng &amp; Dự án (Sửa trực tiếp)</span>
                              </span>
                              <span className="font-mono text-xs text-slate-500">
                                Phiên bản v{selectedLead.version}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Số điện thoại khách hàng *
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={editPhone}
                                  onChange={(e) => setEditPhone(e.target.value)}
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 font-mono font-bold text-[#1E3A8A] focus:outline-none focus:border-[#1E3A8A]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Người liên hệ
                                </label>
                                <input
                                  type="text"
                                  value={editContactName}
                                  onChange={(e) => setEditContactName(e.target.value)}
                                  placeholder="Họ tên người liên hệ..."
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 font-semibold text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Đơn vị / Công ty / Chủ đầu tư
                                </label>
                                <input
                                  type="text"
                                  value={editCompanyName}
                                  onChange={(e) => setEditCompanyName(e.target.value)}
                                  placeholder="Tên công ty / đơn vị..."
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 font-semibold text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Tên dự án / Công trình lắp đặt
                                </label>
                                <input
                                  type="text"
                                  value={editProjectName}
                                  onChange={(e) => setEditProjectName(e.target.value)}
                                  placeholder="VD: Màn hình LED Hội trường 300 chỗ..."
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 font-semibold text-[#1E3A8A] focus:outline-none focus:border-[#1E3A8A]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Email nhận báo giá
                                </label>
                                <input
                                  type="email"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  placeholder="email@congty.vn"
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Nguồn khách tự khai
                                </label>
                                <input
                                  type="text"
                                  value={editSelfSource}
                                  onChange={(e) => setEditSelfSource(e.target.value)}
                                  placeholder="VD: Tìm Google, đối tác giới thiệu..."
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Vùng địa lý công trình
                                </label>
                                <select
                                  value={editAreaType}
                                  onChange={(e) =>
                                    setEditAreaType(e.target.value as 'hcm' | 'other_province')
                                  }
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white font-semibold"
                                >
                                  <option value="hcm">Nội thành TP. Hồ Chí Minh</option>
                                  <option value="other_province">Tỉnh / Thành phố khác</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  {editAreaType === 'hcm' ? 'Quận / Huyện TP.HCM' : 'Tỉnh / Thành phố'}
                                </label>
                                {editAreaType === 'hcm' ? (
                                  <select
                                    value={editDistrict}
                                    onChange={(e) => setEditDistrict(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white font-semibold"
                                  >
                                    {HCM_DISTRICTS.map((d) => (
                                      <option key={d} value={d}>
                                        {d}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <select
                                    value={editProvince}
                                    onChange={(e) => setEditProvince(e.target.value)}
                                    className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white font-semibold"
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
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Địa chỉ khảo sát / lắp đặt chi tiết
                                </label>
                                <input
                                  type="text"
                                  value={editAddress}
                                  onChange={(e) => setEditAddress(e.target.value)}
                                  placeholder="Số nhà, đường, KCN, tòa nhà khảo sát..."
                                  className="w-full h-9 px-3 rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Right 5 cols: Project Follow-Up Plan + Next Contact Date & Attribution */}
                          <div className="lg:col-span-5 space-y-4">
                            {/* B2B Follow-Up & Next Contact Date Card */}
                            <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                  <Clock className="w-4 h-4 text-[#1E3A8A]" />
                                  <span>Kế hoạch Theo dõi &amp; Lịch hẹn Liên hệ</span>
                                </span>
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-[#1E3A8A] border border-blue-200/70">
                                  Dự án B2B
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 leading-relaxed">
                                Với các dự án khách hàng cần 1–2 tháng hoặc sang quý/năm sau mới triển khai, chọn mốc lịch hẹn và giai đoạn theo dõi để quản lý chủ động:
                              </p>

                              {/* Quick Schedule Follow-Up Date Picker */}
                              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <label className="text-xs font-semibold text-slate-700">
                                    Ngày hẹn liên hệ tiếp theo:
                                  </label>
                                  <input
                                    type="date"
                                    value={editFollowUpDate}
                                    onChange={(e) => setEditFollowUpDate(e.target.value)}
                                    className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                                  />
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {[
                                    { label: '+7 ngày', days: 7, horizon: 'remind_7_14d' as const },
                                    { label: '+15 ngày', days: 15, horizon: 'remind_7_14d' as const },
                                    { label: '+1 tháng', days: 30, horizon: 'monthly_15_45d' as const },
                                    { label: '+2 tháng', days: 60, horizon: 'monthly_15_45d' as const },
                                    { label: '+Quý tới', days: 90, horizon: 'longterm_next_year' as const },
                                  ].map((presetItem) => (
                                    <button
                                      key={presetItem.label}
                                      type="button"
                                      onClick={() => {
                                        const dt = new Date(Date.now() + presetItem.days * 86400000);
                                        setEditFollowUpDate(dt.toISOString().slice(0, 10));
                                        setEditB2bHorizon(presetItem.horizon);
                                      }}
                                      className="px-2 py-1 rounded-md bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-[11px] font-semibold text-slate-700 hover:text-[#1E3A8A] transition"
                                    >
                                      {presetItem.label}
                                    </button>
                                  ))}
                                  {editFollowUpDate && (
                                    <button
                                      type="button"
                                      onClick={() => setEditFollowUpDate('')}
                                      className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[11px] text-slate-600"
                                    >
                                      Xóa lịch
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                {B2B_HORIZON_OPTIONS.map((opt) => (
                                  <label
                                    key={opt.key}
                                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-xs transition ${
                                      editB2bHorizon === opt.key
                                        ? `${opt.badgeClass} font-semibold`
                                        : 'bg-slate-50/70 border-slate-200 text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name="editB2bHorizon"
                                      checked={editB2bHorizon === opt.key}
                                      onChange={() => setEditB2bHorizon(opt.key)}
                                      className="mt-0.5"
                                    />
                                    <span>{opt.label}</span>
                                  </label>
                                ))}
                              </div>
                            </div>

                            {/* Attribution Read-only Card */}
                            <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-2 text-xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                <span className="font-bold text-slate-900 text-sm">
                                  Nguồn Marketing &amp; Chiến dịch
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                                  {CONTACT_CHANNEL_LABELS[selectedLead.contactChannel]}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Nguồn Marketing:</span>
                                <strong className="text-[#1E3A8A]">
                                  {selectedLead.tracking?.marketingSource || 'Trực tiếp'}
                                </strong>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Phương thức gắn nguồn:</span>
                                <code className="font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  {selectedLead.tracking?.attributionMethod || 'NONE'}
                                </code>
                              </div>
                              {selectedLead.tracking?.campaignName && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-500">Chiến dịch Ads:</span>
                                  <span className="font-semibold text-slate-900">
                                    {selectedLead.tracking.campaignName}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Products Selection & Technical Note */}
                        <div className="p-4 rounded-xl border border-slate-200/90 bg-white shadow-2xs space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-sm">
                              Sản phẩm Màn hình LED / Bảng điện tử quan tâm ({editProductIds.length} đã chọn)
                            </span>
                            <span className="text-xs text-slate-500">
                              Bấm vào sản phẩm để chọn / bỏ chọn
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1">
                            {products.map((p) => {
                              const checked = editProductIds.includes(p.id);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setEditProductIds((prev) =>
                                      prev.includes(p.id)
                                        ? prev.length > 1
                                          ? prev.filter((id) => id !== p.id)
                                          : prev
                                        : [...prev, p.id],
                                    );
                                  }}
                                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition ${
                                    checked
                                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A] shadow-2xs'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {checked ? '✓ ' : '+ '}
                                  {p.productName}
                                </button>
                              );
                            })}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Ghi chú kích thước / cấu hình kỹ thuật &amp; Hẹn chăm sóc B2B
                              </label>
                              <input
                                type="text"
                                value={editCustomProductNote}
                                onChange={(e) => setEditCustomProductNote(e.target.value)}
                                placeholder="VD: Kích thước 4m x 2.5m, khách hẹn đầu quý sau duyệt ngân sách..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Ghi chú nhật ký cập nhật lần này
                              </label>
                              <input
                                type="text"
                                value={editUpdateNote}
                                onChange={(e) => setEditUpdateNote(e.target.value)}
                                placeholder="VD: Đã gọi lại xác nhận tên dự án & hẹn gửi lại phương án..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                          </div>

                          <div className="pt-2 flex items-center justify-end gap-2.5">
                            <button
                              type="submit"
                              disabled={submitting}
                              className="h-10 px-5 rounded-xl bg-[#1E3A8A] hover:bg-[#1E40AF] text-white font-bold inline-flex items-center gap-2 shadow-sm transition"
                            >
                              <Pencil className="w-4 h-4" />
                              <span>
                                {submitting
                                  ? 'Đang lưu cập nhật...'
                                  : 'Lưu cập nhật Hồ sơ Lead'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </form>
                    ) : (
                      /* Read-Only View for BOD / Marketing / Ads / Designer / Unassigned Sales */
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-4 rounded-xl border border-slate-200 border-t-4 border-t-[#1E3A8A] bg-white space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                              <span className="font-bold text-slate-900 text-base">
                                Hồ sơ khách hàng
                              </span>
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
                                  <span className="text-slate-500 block mb-0.5">
                                    Địa chỉ chi tiết:
                                  </span>
                                  <span className="text-slate-800 font-medium">
                                    {selectedLead.installationAddress}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="p-4 rounded-xl border border-slate-200 border-t-4 border-t-teal-600 bg-white space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                              <span className="font-bold text-slate-900 text-base">
                                Nguồn Marketing &amp; Chu kỳ B2B
                              </span>
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
                                <code className="font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-200 text-xs">
                                  {selectedLead.tracking?.attributionMethod || 'NONE'}
                                </code>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-500">Nguồn khách tự khai:</span>
                                <span className="font-semibold text-slate-800">
                                  {selectedLead.selfReportedSource || 'Chưa ghi nhận'}
                                </span>
                              </div>
                              {selectedHorizon.key !== 'none' && (
                                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                                  <span className="text-slate-500">Chu kỳ theo dõi B2B:</span>
                                  <span
                                    className={`px-2 py-0.5 rounded border text-xs font-bold ${selectedHorizon.badgeClass}`}
                                  >
                                    {selectedHorizon.shortLabel}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-slate-200 border-t-4 border-t-amber-500 bg-white space-y-2">
                          <span className="font-bold text-slate-900 text-base">
                            Sản phẩm &amp; Phương án quan tâm ({selectedLead.products.length})
                          </span>
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
                              <strong>Ghi chú kỹ thuật &amp; chăm sóc:</strong>{' '}
                              {selectedLead.customProductNote}
                            </p>
                          )}
                        </div>
                      </>
                    )}
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
                    {!selectedLead.receivedConfirmedAt && canEditSelectedLead && (
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
                  {canEditSelectedLead && (
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
                  {canEditSelectedLead && (
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
        );
      })()}
    </div>
  );
}

