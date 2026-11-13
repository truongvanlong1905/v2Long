'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crown,
  Download,
  FileText,
  Filter,
  FolderPlus,
  FolderUp,
  History,
  Info,
  Kanban,
  Layers,
  Mail,
  MapPin,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
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
import { apiRequest, peekApiCache } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import { ManualLeadModal } from './ManualLeadModal';
import { GmailSyncModal } from './GmailSyncModal';
import { LeadActivityTimeline } from './LeadActivityTimeline';
import { StandardDateRangeDropdown, type StandardDatePreset } from '@/components/common/StandardDateRangeDropdown';
import { RealtimeLiveMotionIndicator } from '@/components/common/RealtimeLiveMotionIndicator';

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
    tag: '[NHU CẦU KHÁCH: ĐANG CẦN GẤP]',
    legacyTags: [
      '[NHU CẦU KHÁCH: CẦN TRIỂN KHAI SỚM]',
      '[THEO DÕI DỰ ÁN: ĐANG TƯ VẤN < 7 NGÀY]',
      '[CHU KỲ B2B: TƯƠNG TÁC NÓNG 3-7 NGÀY]',
    ],
    label: 'Khách có nhu cầu thực tế, cần tư vấn & triển khai sớm',
    shortLabel: 'Đang cần gấp',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    key: 'remind_7_14d',
    tag: '[NHU CẦU KHÁCH: ĐANG CÂN NHẮC PHƯƠNG ÁN]',
    legacyTags: [
      '[NHU CẦU KHÁCH: ĐANG THAM KHẢO BÁO GIÁ]',
      '[THEO DÕI DỰ ÁN: LIÊN HỆ LẠI 7-30 NGÀY]',
      '[CHU KỲ B2B: HỎI GIÁ ĐỂ ĐÓ 7-14 NGÀY]',
    ],
    label: 'Khách đã nhận tư vấn, đang xem xét & so sánh phương án',
    shortLabel: 'Đang cân nhắc',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    key: 'monthly_15_45d',
    tag: '[NHU CẦU KHÁCH: ĐANG THAM KHẢO THÔNG TIN]',
    legacyTags: [
      '[NHU CẦU KHÁCH: CHỜ TRÌNH DUYỆT NGÂN SÁCH]',
      '[THEO DÕI DỰ ÁN: ĐỊNH KỲ 1-2 THÁNG]',
      '[CHU KỲ B2B: NGÂM HÀNG THÁNG 15-45 NGÀY]',
    ],
    label: 'Khách mới tìm hiểu sản phẩm, hỏi thông số để tham khảo',
    shortLabel: 'Đang tham khảo',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    key: 'longterm_next_year',
    tag: '[NHU CẦU KHÁCH: CHỜ MẶT BẰNG / DỰ ÁN TƯƠNG LAI]',
    legacyTags: [
      '[NHU CẦU KHÁCH: DỰ ÁN CHUẨN BỊ / TƯƠNG LAI]',
      '[THEO DÕI DỰ ÁN: DÀI HẠN > 2 THÁNG]',
      '[CHU KỲ B2B: DỰ ÁN DÀI HẠN / NĂM SAU CHỐT]',
    ],
    label: 'Công trình đang xây dựng hoặc kế hoạch lắp đặt sau',
    shortLabel: 'Chờ mặt bằng / Dự án sau',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
];

function extractScheduledFollowUpDate(noteText: string): string {
  const match = noteText.match(/\[HẸN (?:LIÊN HỆ|GỌI LẠI):\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\]/);
  return match ? match[1] : '';
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
        shortLabel: opt.shortLabel,
        badgeClass: opt.badgeClass,
        waitingDays,
        scheduledDate,
      };
    }
  }

  if (
    combinedNote.toLowerCase().includes('năm sau') ||
    combinedNote.toLowerCase().includes('quý tới') ||
    combinedNote.toLowerCase().includes('tương lai')
  ) {
    return {
      key: 'longterm_next_year',
      shortLabel: 'Chờ mặt bằng / Dự án sau',
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
      waitingDays,
      scheduledDate,
    };
  }

  if (lead.pipelineStatus !== 'quote_sent' && lead.pipelineStatus !== 'quoting') {
    return {
      key: 'none',
      shortLabel: '',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      waitingDays,
      scheduledDate,
    };
  }

  if (waitingDays > 45) {
    return {
      key: 'longterm_next_year',
      shortLabel: 'Chờ mặt bằng / Dự án sau',
      badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
      waitingDays,
      scheduledDate,
    };
  }
  if (waitingDays >= 15) {
    return {
      key: 'monthly_15_45d',
      shortLabel: 'Đang tham khảo',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      waitingDays,
      scheduledDate,
    };
  }
  if (waitingDays >= 7 || lead.isQuoteOverdue7Days) {
    return {
      key: 'remind_7_14d',
      shortLabel: 'Đang cân nhắc',
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      waitingDays: Math.max(waitingDays, 7),
      scheduledDate,
    };
  }
  return {
    key: 'hot_under_7d',
    shortLabel: 'Đang cần gấp',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
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
  // UC01 1.5 — 4 Kịch bản Kiểm tra Trùng Lead thực tế (phân biệt Khách cũ đã mua vs Khách thất bại quay lại)
  duplicateScenario:
    | 'NONE'
    | 'SCENARIO_1_ACTIVE_DUP'
    | 'SCENARIO_2_WON_RETURNING'
    | 'SCENARIO_2_LOST_RETURNING'
    | 'SCENARIO_3_MULTI_CONTRACTOR';
  matchedCustomerLead: LeadItemDto | null;
  isCustomerWonVIP: boolean;
  projectContractors: Array<{
    leadId: number;
    leadCode: string;
    companyName: string;
    assignedSalesName: string;
    pipelineStatus: PipelineStatus;
  }>;
  transferredFromSalesName: string | null;
  transferCount: number;
}

function isInvalidClosedLead(l: LeadItemDto): boolean {
  if (l.spamStatus !== 'NONE') return true;
  if (l.pipelineStatus !== 'lost') return false;
  const r = (l.lostReason || '').toLowerCase();
  return (
    r.includes('sai số') ||
    r.includes('nhầm máy') ||
    r.includes('không tồn tại') ||
    r.includes('trùng lead') ||
    r.includes('spam')
  );
}

function evaluateLeadFraudCriteria(
  lead: LeadItemDto,
  allLeads: LeadItemDto[],
  priceAlerts: PriceCheckAlertDto[],
): FraudEvaluationResult {
  const nowMs = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const cleanPhone = lead.phone.replace(/\D/g, '');
  const normCompany = (lead.companyName || '').trim().toLowerCase();
  const normEmail = (lead.email || '').trim().toLowerCase();

  // UC01 4.5: Kiểm tra lịch sử chuyển giao Lead ("Chuyển từ [tên]")
  const transferActivities = (lead.activities || []).filter(
    (act) => act.actionType === 'reassign_sales',
  );
  const latestTransfer = transferActivities[0] || null;
  const transferredFromSalesName = latestTransfer?.fromSalesName || null;
  const transferCount = transferActivities.length;

  // Tìm hồ sơ được liên kết trực tiếp qua duplicateOfLeadId:
  const explicitLinkedLead = lead.duplicateOfLeadId
    ? allLeads.find((o) => o.id === lead.duplicateOfLeadId)
    : null;

  // Criteria 1: Duplicate Phone (>= 2 submissions within 30 days or backend duplicateType)
  // Chỉ đếm các hồ sơ tạo trước hoặc tại thời điểm hồ sơ hiện tại (other.id <= lead.id) để Hồ sơ gốc ban đầu không bị báo trùng ngược
  const samePhoneWithin30d = allLeads.filter((other) => {
    if (isInvalidClosedLead(other)) return false;
    if (other.id > lead.id) return false;
    const otherClean = other.phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.includes('*') || otherClean !== cleanPhone) return false;
    const diff = Math.abs(nowMs - new Date(other.contactedAt).getTime());
    return diff <= thirtyDaysMs;
  });
  const isCurrentLeadClosed =
    lead.pipelineStatus === 'won' || lead.pipelineStatus === 'lost';

  // Tìm tất cả các hồ sơ của cùng một khách hàng (cùng SĐT, Email hoặc Công ty):
  const allRelatedCustomerLeads = allLeads.filter((other) => {
    if (other.id === lead.id || isInvalidClosedLead(other)) return false;
    const otherClean = other.phone.replace(/\D/g, '');
    const phoneMatch = cleanPhone && !cleanPhone.includes('*') && otherClean === cleanPhone;
    const emailMatch =
      normEmail && !normEmail.includes('*') && (other.email || '').trim().toLowerCase() === normEmail;
    const companyMatch =
      normCompany.length >= 5 && (other.companyName || '').trim().toLowerCase() === normCompany;
    return Boolean(phoneMatch || emailMatch || companyMatch);
  });

  const wonCustomerLead =
    (explicitLinkedLead?.pipelineStatus === 'won' ? explicitLinkedLead : null) ||
    allRelatedCustomerLeads.find((o) => o.pipelineStatus === 'won') ||
    null;

  const isCustomerWonVIP =
    lead.pipelineStatus === 'won' ||
    Boolean(wonCustomerLead) ||
    lead.duplicateOfLeadStatus === 'won' ||
    Boolean(lead.reopenReason && lead.reopenReason.includes('đã từng chốt hợp đồng'));

  // Tìm các Lead trùng Khách hàng tạo TRƯỚC hồ sơ này (other.id < lead.id):
  const sameCustomerLeads = allRelatedCustomerLeads.filter((other) => other.id < lead.id);

  const phoneSubmitCount30d = isCurrentLeadClosed
    ? 1
    : Math.max(samePhoneWithin30d.length, lead.duplicateType !== 'NONE' ? 2 : 1);
  const hasDuplicatePhone = !isCurrentLeadClosed && (phoneSubmitCount30d >= 2 || lead.duplicateType !== 'NONE');

  // Tìm các nhà thầu khác nhau cùng hỏi 1 Dự án / Địa chỉ lắp đặt (Kịch bản 3: [DỰ ÁN NHIỀU BÊN HỎI GIÁ])
  const normalizedProj = (lead.projectName || '').trim().toLowerCase();
  const normalizedAddr = (lead.installationAddress || '').trim().toLowerCase();
  const multiContractorLeads = allLeads.filter((other) => {
    if (other.id === lead.id || isInvalidClosedLead(other)) return false;
    if (isCurrentLeadClosed) return false;
    const otherClean = other.phone.replace(/\D/g, '');
    const otherComp = (other.companyName || '').trim().toLowerCase();
    // Phải khác SĐT và khác Công ty (khác nhà thầu)
    if (cleanPhone && otherClean === cleanPhone) return false;
    if (normCompany && otherComp && normCompany === otherComp) return false;

    const projMatch =
      normalizedProj.length >= 5 &&
      (other.projectName || '').trim().toLowerCase() === normalizedProj;
    const addrMatch =
      normalizedAddr.length >= 10 &&
      !normalizedAddr.includes('ẩn địa chỉ') &&
      (other.installationAddress || '').trim().toLowerCase() === normalizedAddr;
    return projMatch || addrMatch;
  });

  const projectContractors = multiContractorLeads.map((c) => ({
    leadId: c.id,
    leadCode: c.leadCode,
    companyName: c.companyName || c.contactName || `Nhà thầu (${c.leadCode})`,
    assignedSalesName: c.assignedSalesName || 'Chưa phân bổ',
    pipelineStatus: c.pipelineStatus,
  }));

  const matchingProjectLead = multiContractorLeads[0];
  const duplicateProjectName = matchingProjectLead
    ? lead.projectName || lead.installationAddress || null
    : null;

  // Phân loại 3 Kịch bản Trùng Lead:
  let duplicateScenario: FraudEvaluationResult['duplicateScenario'] = 'NONE';
  let matchedCustomerLead: LeadItemDto | null = null;

  if (!isCurrentLeadClosed) {
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    const currentCreatedMs = new Date(lead.contactedAt).getTime();

    // 1. Trùng với Lead đang mở gần đây (<= 14 ngày): Khách gửi nhiều kênh cùng lúc
    const openSameCustomerLead = allRelatedCustomerLeads.find((other) => {
      const isOpen =
        other.pipelineStatus === 'new_lead' ||
        other.pipelineStatus === 'quoting' ||
        other.pipelineStatus === 'quote_sent';
      if (!isOpen) return false;
      const diffMs = Math.abs(currentCreatedMs - new Date(other.contactedAt).getTime());
      return diffMs <= fourteenDaysMs;
    });

    // 2. Khách đã từng Chốt thành công (won) trước đây -> Chỉ trường hợp này mới hiện "KHÁCH CŨ QUAY LẠI"
    const wonSameCustomerLead = wonCustomerLead || allRelatedCustomerLeads.find(
      (other) => other.pipelineStatus === 'won',
    );

    // 3. Khách từng hỏi trước đây nhưng chưa chốt (đã đóng Thất bại HOẶC hồ sơ cũ > 14 ngày / vài tháng / năm trước chưa chốt) nay hỏi lại
    const lostOrPriorUnclosedLead = allRelatedCustomerLeads.find((other) => {
      if (other.pipelineStatus === 'lost') return true;
      const isOpen =
        other.pipelineStatus === 'new_lead' ||
        other.pipelineStatus === 'quoting' ||
        other.pipelineStatus === 'quote_sent';
      if (!isOpen) return false;
      const diffMs = Math.abs(currentCreatedMs - new Date(other.contactedAt).getTime());
      return diffMs > fourteenDaysMs;
    });

    if (openSameCustomerLead) {
      duplicateScenario = 'SCENARIO_1_ACTIVE_DUP';
      matchedCustomerLead = explicitLinkedLead || openSameCustomerLead;
    } else if (wonSameCustomerLead || lead.duplicateOfLeadStatus === 'won' || isCustomerWonVIP) {
      duplicateScenario = 'SCENARIO_2_WON_RETURNING';
      matchedCustomerLead = wonSameCustomerLead || explicitLinkedLead || null;
    } else if (
      lostOrPriorUnclosedLead ||
      lead.duplicateOfLeadStatus === 'lost' ||
      lead.duplicateType === 'PRIOR_LEAD' ||
      lead.isRepeatLead ||
      explicitLinkedLead
    ) {
      duplicateScenario = 'SCENARIO_2_LOST_RETURNING';
      matchedCustomerLead = explicitLinkedLead || lostOrPriorUnclosedLead || sameCustomerLeads[0] || allRelatedCustomerLeads[0] || null;
    } else if (lead.duplicateType === 'ACTIVE_RED') {
      duplicateScenario = 'SCENARIO_1_ACTIVE_DUP';
      matchedCustomerLead = explicitLinkedLead || sameCustomerLeads[0] || allRelatedCustomerLeads[0] || null;
    } else if (projectContractors.length > 0) {
      duplicateScenario = 'SCENARIO_3_MULTI_CONTRACTOR';
    }
  }

  // Criteria 3: Price Probe Behavior (raw module unit pricing without installation address, or matched ACTIVE E5 alert)
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
      a.status === 'ACTIVE' &&
      (a.leadId === lead.id ||
        a.phone === lead.phone ||
        (a.companyName && a.companyName === lead.companyName)),
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
    duplicateScenario,
    matchedCustomerLead,
    isCustomerWonVIP,
    projectContractors,
    transferredFromSalesName,
    transferCount,
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
  const [showPriceAlertDirectory, setShowPriceAlertDirectory] = useState(false);
  const [alertStatusFilter, setAlertStatusFilter] = useState<'ACTIVE' | 'DISMISSED' | 'ALL'>('ACTIVE');
  const [alertSearchQuery, setAlertSearchQuery] = useState('');
  const [dismissingAlert, setDismissingAlert] = useState<PriceCheckAlertDto | null>(null);
  const [dismissAlertReason, setDismissAlertReason] = useState('');
  const [competitorPromptLead, setCompetitorPromptLead] = useState<LeadItemDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'table' | 'kanban' | 'reminders'>('table');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [specialAlertFilter, setSpecialAlertFilter] = useState<
    'none' | 'all_alerts' | 'active_dup' | 'won_returning' | 'lost_returning' | 'spam_probe'
  >('none');
  const [reminderFilter, setReminderFilter] = useState<
    'none' | 'all_reminders' | 'unreceived' | 'stagnant_3d' | 'quote_unresponded' | 'scheduled_due'
  >('none');
  const [highlightTableReminders, setHighlightTableReminders] = useState<boolean>(true);
  const [slaUnreceivedHours, setSlaUnreceivedHours] = useState<number>(2);
  const [slaStagnantDays, setSlaStagnantDays] = useState<number>(3);
  const [showSlaRuleSettings, setShowSlaRuleSettings] = useState<boolean>(false);
  const [reminderSalesFilterId, setReminderSalesFilterId] = useState<number | 'all'>('all');
  const [reminderQuoteCycleFilter, setReminderQuoteCycleFilter] = useState<
    'all' | '1d' | '7d' | '30d'
  >('all');
  const [quickReminderNotes, setQuickReminderNotes] = useState<Record<number, string>>({});
  const [collabNoteDraft, setCollabNoteDraft] = useState('');
  const [dateRangePreset, setDateRangePreset] = useState<'ALL' | 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM'>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [editActiveProductCategory, setEditActiveProductCategory] = useState<
    'MAN_HINH_LED' | 'BANG_DIEN_TU' | 'KHAC'
  >('MAN_HINH_LED');
  const [editProductSearch, setEditProductSearch] = useState('');
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
  const [showGmailSyncModal, setShowGmailSyncModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<
    Array<{
      rowNumber: number;
      phone: string;
      contactName: string;
      companyName: string;
      projectName: string;
      email: string;
      source: string;
      region: string;
      address: string;
      productsText: string;
      note: string;
    }>
  >([]);
  const [importParsing, setImportParsing] = useState(false);
  const [importCommitting, setImportCommitting] = useState(false);
  const [importSkipOpenDup, setImportSkipOpenDup] = useState(true);
  const [importPastedText, setImportPastedText] = useState('');
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Listen to global search bar from WorkspaceShell topbar
  useEffect(() => {
    const handleGlobalSearch = (e: Event) => {
      const custom = e as CustomEvent<string>;
      const val = typeof custom.detail === 'string' ? custom.detail : '';
      if (
        user?.email &&
        val.trim().toLowerCase() === user.email.trim().toLowerCase()
      ) {
        return;
      }
      setSearchQuery(val);
    };
    window.addEventListener('tt-lead-search', handleGlobalSearch as EventListener);
    window.addEventListener('tt-global-search', handleGlobalSearch as EventListener);
    return () => {
      window.removeEventListener('tt-lead-search', handleGlobalSearch as EventListener);
      window.removeEventListener('tt-global-search', handleGlobalSearch as EventListener);
    };
  }, [user?.email]);

  // Broadcast active sub-section scope to WorkspaceShell top search bar
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let scopeLabel = 'Leads › Tổng Lead hợp lệ';
    if (reminderFilter !== 'none') {
      scopeLabel = 'Leads › Nhắc việc tự động';
    } else if (specialAlertFilter !== 'none') {
      scopeLabel = 'Leads › 6. Lưu ý (Trùng / Spam)';
    } else if (statusFilter === 'new_lead') {
      scopeLabel = 'Leads › 1. Vừa nhận thông tin';
    } else if (statusFilter === 'quoting') {
      scopeLabel = 'Leads › 2. Đang soạn báo giá';
    } else if (statusFilter === 'quote_sent') {
      scopeLabel = 'Leads › 3. Đã gửi báo giá';
    } else if (statusFilter === 'won') {
      scopeLabel = 'Leads › 4. Chốt thành công';
    } else if (statusFilter === 'lost') {
      scopeLabel = 'Leads › 5. Thất bại';
    }
    window.dispatchEvent(
      new CustomEvent('tt-search-scope-change', { detail: { label: scopeLabel } }),
    );
  }, [statusFilter, specialAlertFilter, reminderFilter]);

  // Debounce search query by 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1);
    }, 200);
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
  const [editCustomServiceItems, setEditCustomServiceItems] = useState<string[]>([]);
  const [editCustomServiceDraft, setEditCustomServiceDraft] = useState('');
  const [editTickReassign, setEditTickReassign] = useState(false);
  const [editTickSuspect, setEditTickSuspect] = useState(false);
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
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [attachmentType, setAttachmentType] = useState<'site_photo' | 'customer_drawing_doc' | 'other'>(
    'site_photo',
  );
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [editingAttachmentId, setEditingAttachmentId] = useState<number | null>(null);
  const [editingAttachmentName, setEditingAttachmentName] = useState<string>('');
  const [editingAttachmentType, setEditingAttachmentType] = useState<
    'site_photo' | 'customer_drawing_doc' | 'other'
  >('site_photo');
  const [editingAttachmentReplaceFile, setEditingAttachmentReplaceFile] = useState<File | null>(null);
  const [bypassPriceCheckConfirmed, setBypassPriceCheckConfirmed] = useState<boolean>(false);
  const [isLeadsPolling, setIsLeadsPolling] = useState<boolean>(false);
  const [lastLeadsPolledAt, setLastLeadsPolledAt] = useState<Date>(new Date());

  const fetchLeads = useCallback(async (forceFresh = false) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const qs = new URLSearchParams();
    if (includeSpam) qs.set('includeSpam', 'true');
    const url = `/api/v1/leads?${qs.toString()}`;

    if (!forceFresh) {
      const cached = peekApiCache<{
        leads: LeadItemDto[];
        totalCount?: number;
        products: ProductCatalogDto[];
        salesOptions: SalesAssigneeOptionDto[];
        priceCheckAlerts: PriceCheckAlertDto[];
        isReceivingLeads?: boolean;
      }>(url);

      if (cached) {
        setLeads(cached.leads);
        setTotalCount(cached.totalCount ?? cached.leads.length);
        setProducts(cached.products);
        setSalesOptions(cached.salesOptions);
        setPriceCheckAlerts(cached.priceCheckAlerts);
        if (typeof cached.isReceivingLeads === 'boolean') {
          setIsReceivingLeads(cached.isReceivingLeads);
        }
        setLoading(false);
      } else {
        setLoading((prev) => (leads.length === 0 ? true : prev));
      }
    } else {
      setIsLeadsPolling(true);
    }

    setErrorMsg(null);
    try {
      const data = await apiRequest<{
        leads: LeadItemDto[];
        totalCount?: number;
        products: ProductCatalogDto[];
        salesOptions: SalesAssigneeOptionDto[];
        priceCheckAlerts: PriceCheckAlertDto[];
        isReceivingLeads?: boolean;
      }>(url, { signal: controller.signal, skipCache: forceFresh });

      setLeads(data.leads);
      setTotalCount(data.totalCount ?? data.leads.length);
      setProducts(data.products);
      setSalesOptions(data.salesOptions);
      setPriceCheckAlerts(data.priceCheckAlerts);
      if (typeof data.isReceivingLeads === 'boolean') {
        setIsReceivingLeads(data.isReceivingLeads);
      }
      setLastLeadsPolledAt(new Date());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải danh sách Lead.');
    } finally {
      setIsLeadsPolling(false);
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [debouncedSearchQuery, includeSpam, leads.length]);

  useEffect(() => {
    void fetchLeads();
    // Continuous Realtime Live Auto-Polling (every 15s) with live motion updates
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void fetchLeads(true);
      }
    }, 15000);
    return () => {
      clearInterval(interval);
      abortControllerRef.current?.abort();
    };
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

  const fraudByLeadId = useMemo(() => {
    const map = new Map<number, FraudEvaluationResult>();
    for (const l of leads) {
      map.set(l.id, evaluateLeadFraudCriteria(l, leads, priceCheckAlerts));
    }
    return map;
  }, [leads, priceCheckAlerts]);

  const classifyLeadAlertBucket = useCallback(
    (
      l: LeadItemDto,
    ): 'none' | 'active_dup' | 'won_returning' | 'lost_returning' | 'spam_probe' => {
      const fraud = fraudByLeadId.get(l.id);
      if (!fraud) return 'none';
      if (l.spamStatus !== 'NONE' || fraud.hasBlacklistedOrSpam || fraud.hasPriceProbeBehavior) {
        return 'spam_probe';
      }
      if (
        fraud.duplicateScenario === 'SCENARIO_1_ACTIVE_DUP' ||
        fraud.duplicateScenario === 'SCENARIO_3_MULTI_CONTRACTOR'
      ) {
        return 'active_dup';
      }
      if (fraud.duplicateScenario === 'SCENARIO_2_WON_RETURNING') {
        return 'won_returning';
      }
      if (fraud.duplicateScenario === 'SCENARIO_2_LOST_RETURNING') {
        return 'lost_returning';
      }
      return 'none';
    },
    [fraudByLeadId],
  );

  const classifyReminderCategories = useCallback(
    (l: LeadItemDto) => {
      if (l.spamStatus !== 'NONE' || l.pipelineStatus === 'won' || l.pipelineStatus === 'lost') {
        return {
          isUnreceived: false,
          unreceivedHours: 0,
          isStagnant3d: false,
          daysSinceLastActivity: 0,
          isQuoteUnresponded: false,
          quoteDays: 0,
          quoteAgeBucket: 'none' as 'none' | '1d' | '7d' | '30d',
          isScheduledDue: false,
          hasAnyReminder: false,
          urgencyLevel: 'none' as 'critical' | 'high' | 'medium' | 'none',
          primaryBadgeText: '',
          primaryActionHint: '',
          suggestedZaloScript: '',
        };
      }

      const now = Date.now();
      const contactedMs = new Date(l.contactedAt).getTime();
      const unreceivedHours = Math.max(0, (now - contactedMs) / (1000 * 60 * 60));

      // 1. Chưa tiếp nhận: Lead mới quá hạn / chưa xác nhận tiếp nhận
      const isUnreceived =
        l.pipelineStatus === 'new_lead' &&
        !l.receivedConfirmedAt &&
        unreceivedHours >= Math.max(0, slaUnreceivedHours - 1.9);

      // 2. Lead đứng yên: Đang mở (new_lead / quoting) và > slaStagnantDays ngày không có hoạt động mới
      const latestActivityMs =
        l.activities && l.activities.length > 0
          ? Math.max(...l.activities.map((a) => new Date(a.createdAt).getTime()))
          : contactedMs;
      const daysSinceLastActivity = Math.max(0, (now - latestActivityMs) / (1000 * 60 * 60 * 24));
      const isStagnant3d =
        (l.pipelineStatus === 'new_lead' || l.pipelineStatus === 'quoting') &&
        daysSinceLastActivity >= slaStagnantDays;

      // 3. Báo giá chưa phản hồi: Đã gửi báo giá nhưng chưa phản hồi (1 ngày, 1 tuần, > 1 tháng)
      const isQuoteUnresponded = l.pipelineStatus === 'quote_sent' && !l.quoteRespondedAt;
      let quoteAgeBucket: 'none' | '1d' | '7d' | '30d' = 'none';
      let quoteDays = 0;
      if (isQuoteUnresponded) {
        const sentMs = l.quoteSentAt ? new Date(l.quoteSentAt).getTime() : contactedMs;
        quoteDays = Math.max(1, (now - sentMs) / (1000 * 60 * 60 * 24));
        if (quoteDays >= 30) quoteAgeBucket = '30d';
        else if (quoteDays >= 7 || l.isQuoteOverdue7Days) quoteAgeBucket = '7d';
        else quoteAgeBucket = '1d';
      }

      // 4. Đến lịch hẹn: Có lịch chăm sóc B2B / ngày hẹn nhắc lại
      const schedDate = extractScheduledFollowUpDate(l.customProductNote || '');
      const horizon = getB2bFollowUpHorizon(l);
      const isScheduledDue = Boolean(schedDate) || horizon.key !== 'none';

      const hasAnyReminder = isUnreceived || isStagnant3d || isQuoteUnresponded || isScheduledDue;

      let urgencyLevel: 'critical' | 'high' | 'medium' | 'none' = 'none';
      if (isUnreceived || quoteAgeBucket === '30d' || daysSinceLastActivity >= 7) {
        urgencyLevel = 'critical';
      } else if (quoteAgeBucket === '7d' || isStagnant3d) {
        urgencyLevel = 'high';
      } else if (quoteAgeBucket === '1d' || isScheduledDue) {
        urgencyLevel = 'medium';
      }

      const custName = l.contactName || l.companyName || 'Anh/Chị';
      const prodName = l.products[0]?.productName || 'hệ thống màn hình LED';
      const projName = l.projectName ? `dự án "${l.projectName}"` : `hạng mục ${prodName}`;

      let primaryBadgeText = '';
      let primaryActionHint = '';
      let suggestedZaloScript = '';

      if (isUnreceived) {
        const hrsText =
          unreceivedHours >= 24
            ? `${Math.floor(unreceivedHours / 24)} ngày`
            : `${Math.max(1, Math.round(unreceivedHours))} giờ`;
        primaryBadgeText = `🔔 Chưa tiếp nhận (${hrsText})`;
        primaryActionHint = 'Xác nhận tiếp nhận & gọi tư vấn khách ngay';
        suggestedZaloScript = `Dạ chào ${custName}, em bên Toàn Trung LED đã nhận được thông tin cần tư vấn ${projName}. Em xin phép kết nối hỗ trợ báo giá & phương án kỹ thuật cho mình ngay ạ!`;
      } else if (isQuoteUnresponded) {
        const dInt = Math.max(1, Math.floor(quoteDays));
        if (quoteAgeBucket === '30d') {
          primaryBadgeText = `📨 Báo giá > 30 ngày (${dInt} ngày)`;
          primaryActionHint = 'Đánh thức dự án dài hạn · Hỏi lịch triển khai mới';
          suggestedZaloScript = `Chào ${custName}, bên Toàn Trung LED xin phép hỏi thăm tiến độ ${projName} bên mình đã có kế hoạch khởi công trong giai đoạn tới chưa ạ? Nếu cần cập nhật lại cấu hình hoặc ưu đãi giá mới nhất em gửi lại mình nhé!`;
        } else if (quoteAgeBucket === '7d') {
          primaryBadgeText = `📨 Báo giá 7 ngày chưa PH (${dInt} ngày)`;
          primaryActionHint = 'Hỏi kết quả duyệt ngân sách & phương án kỹ thuật';
          suggestedZaloScript = `Dạ chào ${custName}, tuần trước em có gửi bảng báo giá ${projName}. Không biết bên mình đã xem qua phương án kỹ thuật và trình duyệt ngân sách thuận lợi chưa, có cần em điều chỉnh cấu hình nào không ạ?`;
        } else {
          primaryBadgeText = `📨 Báo giá 24h chưa PH`;
          primaryActionHint = 'Xác nhận khách đã mở được file báo giá & CAD';
          suggestedZaloScript = `Dạ chào ${custName}, em đã gửi bảng báo giá chi tiết cho ${projName}. Anh/Chị kiểm tra giúp em xem đã mở được file chưa và có điểm nào cần em giải thích thêm về thông số kỹ thuật không ạ?`;
        }
      } else if (isStagnant3d) {
        const dInt = Math.max(slaStagnantDays, Math.floor(daysSinceLastActivity));
        primaryBadgeText = `⏳ Đứng yên ${dInt} ngày`;
        primaryActionHint =
          l.pipelineStatus === 'quoting'
            ? 'Hoàn tất khảo sát / gửi báo giá ngay'
            : 'Cập nhật kết quả liên hệ & đẩy sang soạn báo giá';
        suggestedZaloScript = `Dạ chào ${custName}, em bên Toàn Trung LED xin phép cập nhật thêm thông tin kích thước mặt bằng cho ${projName} để bộ phận kỹ thuật lên phương án và báo giá chuẩn nhất gửi mình hôm nay ạ!`;
      } else if (isScheduledDue) {
        primaryBadgeText = `📅 Hẹn chăm sóc: ${horizon.shortLabel}`;
        primaryActionHint = 'Theo dõi đúng lịch hẹn dự án B2B';
        suggestedZaloScript = `Dạ chào ${custName}, theo lịch hẹn trao đổi về ${projName}, em xin phép nhắn hỏi thăm tiến độ hiện tại của bên mình để Toàn Trung chuẩn bị phương án hỗ trợ kịp thời ạ!`;
      }

      return {
        isUnreceived,
        unreceivedHours,
        isStagnant3d,
        daysSinceLastActivity,
        isQuoteUnresponded,
        quoteDays,
        quoteAgeBucket,
        isScheduledDue,
        hasAnyReminder,
        urgencyLevel,
        primaryBadgeText,
        primaryActionHint,
        suggestedZaloScript,
      };
    },
    [slaUnreceivedHours, slaStagnantDays],
  );

  const timeFilteredLeads = useMemo(() => {
    if (dateRangePreset === 'ALL' && !customStartDate && !customEndDate) {
      return leads;
    }
    const now = Date.now();
    return leads.filter((l) => {
      const t = new Date(l.contactedAt).getTime();
      if (dateRangePreset === 'TODAY') {
        const d1 = new Date(l.contactedAt);
        const d2 = new Date();
        return (
          d1.getFullYear() === d2.getFullYear() &&
          d1.getMonth() === d2.getMonth() &&
          d1.getDate() === d2.getDate()
        );
      }
      if (dateRangePreset === '7D') {
        return now - t <= 7 * 24 * 60 * 60 * 1000;
      }
      if (dateRangePreset === '30D') {
        return now - t <= 30 * 24 * 60 * 60 * 1000;
      }
      if (dateRangePreset === 'THIS_MONTH') {
        const d1 = new Date(l.contactedAt);
        const d2 = new Date();
        return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
      }
      if (customStartDate) {
        const startMs = new Date(`${customStartDate}T00:00:00`).getTime();
        if (t < startMs) return false;
      }
      if (customEndDate) {
        const endMs = new Date(`${customEndDate}T23:59:59`).getTime();
        if (t > endMs) return false;
      }
      return true;
    });
  }, [leads, dateRangePreset, customStartDate, customEndDate]);

  const reminderStats = useMemo(() => {
    let unreceived = 0;
    let stagnant3d = 0;
    let quoteUnresponded = 0;
    let quote1d = 0;
    let quote7d = 0;
    let quote30d = 0;
    let scheduledDue = 0;
    let totalLeadsWithReminder = 0;

    for (const l of timeFilteredLeads) {
      const r = classifyReminderCategories(l);
      if (r.isUnreceived) unreceived += 1;
      if (r.isStagnant3d) stagnant3d += 1;
      if (r.isQuoteUnresponded) {
        quoteUnresponded += 1;
        if (r.quoteAgeBucket === '1d') quote1d += 1;
        else if (r.quoteAgeBucket === '7d') quote7d += 1;
        else if (r.quoteAgeBucket === '30d') quote30d += 1;
      }
      if (r.isScheduledDue) scheduledDue += 1;
      if (r.hasAnyReminder) totalLeadsWithReminder += 1;
    }

    return {
      unreceived,
      stagnant3d,
      quoteUnresponded,
      quote1d,
      quote7d,
      quote30d,
      scheduledDue,
      totalLeadsWithReminder,
    };
  }, [timeFilteredLeads, classifyReminderCategories]);

  const salesSlaStats = useMemo(() => {
    const map = new Map<
      number,
      {
        salesId: number;
        salesName: string;
        totalActive: number;
        unreceivedCount: number;
        stagnantCount: number;
        quotePendingCount: number;
        reminderTotal: number;
        slaCompliancePct: number;
      }
    >();

    for (const l of timeFilteredLeads) {
      if (l.spamStatus !== 'NONE' || l.pipelineStatus === 'won' || l.pipelineStatus === 'lost') {
        continue;
      }
      const sid = l.assignedSalesId || 0;
      const sname = l.assignedSalesName || 'Chưa giao Sales';
      const entry = map.get(sid) || {
        salesId: sid,
        salesName: sname,
        totalActive: 0,
        unreceivedCount: 0,
        stagnantCount: 0,
        quotePendingCount: 0,
        reminderTotal: 0,
        slaCompliancePct: 100,
      };
      entry.totalActive += 1;
      const r = classifyReminderCategories(l);
      if (r.isUnreceived) entry.unreceivedCount += 1;
      if (r.isStagnant3d) entry.stagnantCount += 1;
      if (r.isQuoteUnresponded) entry.quotePendingCount += 1;
      if (r.hasAnyReminder) entry.reminderTotal += 1;
      entry.slaCompliancePct =
        entry.totalActive > 0
          ? Math.max(
              0,
              Math.round(((entry.totalActive - entry.reminderTotal) / entry.totalActive) * 100),
            )
          : 100;
      map.set(sid, entry);
    }

    return Array.from(map.values()).sort((a, b) => b.reminderTotal - a.reminderTotal);
  }, [timeFilteredLeads, classifyReminderCategories]);

  const displayedLeads = useMemo(() => {
    let list = timeFilteredLeads;
    if (reminderFilter !== 'none') {
      list = list.filter((l) => {
        const r = classifyReminderCategories(l);
        if (reminderFilter === 'all_reminders') return r.hasAnyReminder;
        if (reminderFilter === 'unreceived') return r.isUnreceived;
        if (reminderFilter === 'stagnant_3d') return r.isStagnant3d;
        if (reminderFilter === 'quote_unresponded') return r.isQuoteUnresponded;
        if (reminderFilter === 'scheduled_due') return r.isScheduledDue;
        return r.hasAnyReminder;
      });
    } else if (specialAlertFilter !== 'none') {
      list = list.filter((l) => {
        const bucket = classifyLeadAlertBucket(l);
        if (bucket === 'none') return false;
        if (specialAlertFilter === 'all_alerts') return true;
        return bucket === specialAlertFilter;
      });
    } else {
      // Ở chế độ Tổng Lead Hợp Lệ và các cột 1..5: Chỉ hiển thị Lead hợp lệ (loại trừ Spam để khớp 100% với số trên thẻ KPI)
      list = list.filter((l) => l.spamStatus === 'NONE');
      if (statusFilter !== 'all') {
        list = list.filter((l) => l.pipelineStatus === statusFilter);
      }
    }
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
    // Scoped search strictly inside the currently selected Lead sub-section / tab
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, '');
      list = list.filter((l) => {
        const haystack = [
          l.leadCode,
          l.phone,
          l.contactName,
          l.companyName,
          l.projectName,
          l.email,
          l.hcmDistrict,
          l.province,
          l.installationAddress,
          l.assignedSalesName,
          l.selfReportedSource,
          l.tracking?.marketingSource,
          l.customProductNote,
          l.initialNote,
          l.lostReason,
          l.reopenReason,
          ...l.products.map((p) => p.productName),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (haystack.includes(q)) return true;
        if (qDigits.length >= 3 && l.phone.replace(/\D/g, '').includes(qDigits)) return true;
        return false;
      });
    }
    return list;
  }, [
    timeFilteredLeads,
    classifyReminderCategories,
    reminderFilter,
    classifyLeadAlertBucket,
    specialAlertFilter,
    statusFilter,
    overdueOnly,
    unreceivedOnly,
    b2bHorizonFilter,
    searchQuery,
  ]);

  const totalFilteredCount = displayedLeads.length;
  const totalPages = Math.max(1, Math.ceil(displayedLeads.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return displayedLeads.slice(start, start + pageSize);
  }, [displayedLeads, safePage, pageSize]);

  const overdueCount = useMemo(
    () => timeFilteredLeads.filter((l) => l.isQuoteOverdue7Days && l.spamStatus === 'NONE').length,
    [timeFilteredLeads],
  );

  const unreceivedCount = useMemo(
    () =>
      timeFilteredLeads.filter(
        (l) => l.pipelineStatus === 'new_lead' && !l.receivedConfirmedAt && l.spamStatus === 'NONE',
      ).length,
    [timeFilteredLeads],
  );

  const b2bSummaryCounts = useMemo(() => {
    const valid = timeFilteredLeads.filter((l) => l.spamStatus === 'NONE');
    let newLeadCount = 0;
    let quotingCount = 0;
    let quoteSentCount = 0;
    let wonCount = 0;
    let lostCount = 0;

    let activeDupCount = 0;
    let wonReturningCount = 0;
    let lostReturningCount = 0;
    let spamProbeCount = 0;
    let alertAllCount = 0;

    for (const l of valid) {
      if (l.pipelineStatus === 'new_lead') newLeadCount += 1;
      if (l.pipelineStatus === 'quoting') quotingCount += 1;
      if (l.pipelineStatus === 'quote_sent') quoteSentCount += 1;
      if (l.pipelineStatus === 'won') wonCount += 1;
      if (l.pipelineStatus === 'lost') lostCount += 1;
    }

    for (const l of timeFilteredLeads) {
      const bucket = classifyLeadAlertBucket(l);
      if (bucket === 'active_dup') activeDupCount += 1;
      else if (bucket === 'won_returning') wonReturningCount += 1;
      else if (bucket === 'lost_returning') lostReturningCount += 1;
      else if (bucket === 'spam_probe') spamProbeCount += 1;

      if (bucket !== 'none') {
        alertAllCount += 1;
      }
    }

    return {
      validTotal: valid.length,
      newLeadCount,
      quotingCount,
      quoteSentCount,
      wonCount,
      lostCount,
      activeDupCount,
      wonReturningCount,
      lostReturningCount,
      returningTotalCount: wonReturningCount + lostReturningCount,
      spamProbeCount,
      alertAllCount,
    };
  }, [timeFilteredLeads, classifyLeadAlertBucket]);

  const exportHref = useMemo(() => {
    const qs = new URLSearchParams();
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (searchQuery.trim()) qs.set('search', searchQuery.trim());
    if (specialAlertFilter !== 'none') qs.set('includeSpam', 'true');
    if (overdueOnly) qs.set('overdueOnly', 'true');
    if (unreceivedOnly) qs.set('unreceived', '1');
    const queryStr = qs.toString();
    return queryStr ? `/api/v1/leads/export?${queryStr}` : '/api/v1/leads/export';
  }, [statusFilter, searchQuery, specialAlertFilter, overdueOnly, unreceivedOnly]);

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
      setEditTickReassign(false);
      setEditTickSuspect(Boolean(selectedLead.isPriceCheckSuspect));

      const rawCustomNote = selectedLead.customProductNote || '';
      const existingScheduledDate = extractScheduledFollowUpDate(rawCustomNote);
      setEditFollowUpDate(existingScheduledDate);
      const extractedCustomItems = Array.from(
        rawCustomNote.matchAll(/\[Dịch vụ khác:\s*([^\]]+)\]/g),
      ).map((m) => m[1].trim());
      setEditCustomServiceItems(extractedCustomItems);
      setEditCustomServiceDraft('');

      let cleanCustomNote = rawCustomNote
        .replace(/\[HẸN LIÊN HỆ:\s*[^\]]+\]/g, '')
        .replace(/\[Dịch vụ khác:\s*[^\]]+\]\s*·?\s*/g, '')
        .trim();
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
      const composedCustomNote = [
        horizonOpt ? horizonOpt.tag : '',
        ...editCustomServiceItems.map((i) => `[Dịch vụ khác: ${i}]`),
        editCustomProductNote.trim(),
      ]
        .filter(Boolean)
        .join(' · ')
        .trim();

      const suspectTag = editTickSuspect
        ? '[NGHI VẤN: Đánh dấu kiểm tra dò giá / trùng]'
        : selectedLead.isPriceCheckSuspect
          ? '[BỎ NGHI VẤN]'
          : '';

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
            [
              suspectTag,
              editUpdateNote.trim() ||
                (horizonOpt
                  ? `Cập nhật hồ sơ Lead · Tình trạng nhu cầu: ${horizonOpt.shortLabel}`
                  : 'Cập nhật thông tin hồ sơ Lead.'),
            ]
              .filter(Boolean)
              .join(' '),
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
      // UC01 4.6f: Nếu lý do Thất bại là "Đối thủ khảo giá", hỏi NVKD có muốn đăng cảnh báo dò giá không (5.1)
      if (
        targetStatus === 'lost' &&
        statusReason.trim().toLowerCase().includes('đối thủ khảo giá')
      ) {
        setCompetitorPromptLead(selectedLead);
      }
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
      setCompetitorPromptLead(null);
      setFeedbackMsg(`Đã đăng cảnh báo nghi đối thủ dò giá cho ${selectedLead.leadCode} và thông báo tới Sales/Marketing/Ads.`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đăng cảnh báo dò giá.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDismissPriceAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !dismissingAlert || !dismissAlertReason.trim()) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest('/api/v1/leads/price-check-alerts', {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          alertId: dismissingAlert.id,
          dismissReason: dismissAlertReason.trim(),
        },
      });
      setFeedbackMsg(
        `Đã gỡ cảnh báo dò giá cho ${dismissingAlert.companyName || dismissingAlert.phone} và tự động bỏ cờ "Nghi dò giá" trên các Lead liên quan (UC01 5.3).`,
      );
      setDismissingAlert(null);
      setDismissAlertReason('');
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể gỡ cảnh báo dò giá.');
    } finally {
      setSubmitting(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = typeof reader.result === 'string' ? reader.result : '';
        resolve(res);
      };
      reader.onerror = () => reject(new Error(`Không thể đọc tệp "${file.name}".`));
      reader.readAsDataURL(file);
    });

  const handleUploadAttachment = async (e: React.FormEvent) => {
    e.preventDefault();
    const filesToUpload =
      attachmentFiles.length > 0 ? attachmentFiles : attachmentFile ? [attachmentFile] : [];
    if (!user || !selectedLead || filesToUpload.length === 0) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const encodedFiles = await Promise.all(
        filesToUpload.map(async (f) => ({
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream',
          base64Data: await fileToBase64(f),
        })),
      );

      await apiRequest(`/api/v1/leads/${selectedLead.id}/attachments`, {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          attachmentType,
          folderPath: '/ho-so-cong-trinh',
          files: encodedFiles,
        },
      });
      setAttachmentFile(null);
      setAttachmentFiles([]);
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = '';
      }
      setFeedbackMsg(
        filesToUpload.length === 1
          ? `Đã tải lên tệp "${filesToUpload[0].name}" thành công.`
          : `Đã tải lên ${filesToUpload.length} tệp đính kèm thành công.`,
      );
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải tệp đính kèm.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEditAttachment = async (attId: number) => {
    if (!user || !selectedLead) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      let base64Data: string | undefined;
      let mimeType: string | undefined;
      let nextName = editingAttachmentName.trim();
      if (editingAttachmentReplaceFile) {
        base64Data = await fileToBase64(editingAttachmentReplaceFile);
        mimeType = editingAttachmentReplaceFile.type || 'application/octet-stream';
        if (!nextName) {
          nextName = editingAttachmentReplaceFile.name;
        }
      }
      await apiRequest(`/api/v1/leads/attachments/${attId}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          fileName: nextName || undefined,
          attachmentType: editingAttachmentType,
          base64Data,
          mimeType,
        },
      });
      setEditingAttachmentId(null);
      setEditingAttachmentReplaceFile(null);
      setFeedbackMsg('Đã cập nhật tệp đính kèm thành công.');
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi cập nhật tệp đính kèm.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAttachment = async (attId: number, fileName: string) => {
    if (!user || !selectedLead) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/attachments/${attId}`, {
        method: 'DELETE',
        csrfToken: user.csrfToken,
      });
      if (editingAttachmentId === attId) {
        setEditingAttachmentId(null);
      }
      setFeedbackMsg(`Đã xóa tệp "${fileName}" khỏi hồ sơ.`);
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi xóa tệp đính kèm.');
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

  const handleSendReminderNudge = async (
    lead: LeadItemDto,
    reminderLabel: string,
    customMessage?: string,
  ) => {
    if (!user) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'send_reminder_nudge',
          reminderLabel,
          message: customMessage || '',
        },
      });
      setFeedbackMsg(
        `🔔 Đã gửi thông báo nhắc việc "${reminderLabel}" tới chuông thông báo của ${lead.assignedSalesName || 'NVKD phụ trách'} (${lead.leadCode}).`,
      );
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể gửi thông báo nhắc việc.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchNudgeSales = async (targetSalesId: number | 'all', salesName: string) => {
    if (!user) return;
    const targets = timeFilteredLeads.filter((l) => {
      const r = classifyReminderCategories(l);
      if (!r.hasAnyReminder) return false;
      if (targetSalesId === 'all') return true;
      return (l.assignedSalesId || 0) === targetSalesId;
    });
    if (targets.length === 0) {
      setFeedbackMsg('Không có hồ sơ nào cần gửi thông báo nhắc việc.');
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const batch = targets.slice(0, 8);
      await Promise.all(
        batch.map((l) => {
          const r = classifyReminderCategories(l);
          return apiRequest(`/api/v1/leads/${l.id}`, {
            method: 'PATCH',
            csrfToken: user.csrfToken,
            body: {
              action: 'send_reminder_nudge',
              reminderLabel: r.primaryBadgeText || 'Nhắc việc tự động',
              message: r.primaryActionHint,
            },
          });
        }),
      );
      setFeedbackMsg(
        `🔔 Đã bắn ${batch.length} thông báo nhắc việc tự động tới ${targetSalesId === 'all' ? 'toàn bộ đội ngũ Sales' : salesName}!`,
      );
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi gửi thông báo nhắc việc hàng loạt.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickAckReminder = async (
    lead: LeadItemDto,
    ackType: 'quote_responded' | 'followed_up',
    noteContent: string,
  ) => {
    if (!user) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'quick_ack_reminder',
          ackType,
          noteContent,
        },
      });
      setQuickReminderNotes((prev) => ({ ...prev, [lead.id]: '' }));
      setFeedbackMsg(
        ackType === 'quote_responded'
          ? `✓ Đã xác nhận khách phản hồi báo giá cho hồ sơ ${lead.leadCode} và hoàn tất nhắc việc.`
          : `✓ Đã ghi nhận kết quả chăm sóc nhắc việc cho hồ sơ ${lead.leadCode}.`,
      );
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể ghi nhận xử lý nhắc việc.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickTransitionLead = async (
    lead: LeadItemDto,
    toStatus: PipelineStatus,
    noteText: string,
  ) => {
    if (!user) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/leads/${lead.id}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'transition_pipeline',
          expectedVersion: lead.version,
          toStatus,
          reason: null,
          noteContent: noteText,
          markQuoteResponded: toStatus === 'won',
          bypassPriceCheckConfirmed: true,
        },
      });
      setFeedbackMsg(
        `✓ Đã chuyển nhanh ${lead.leadCode} sang "${PIPELINE_STATUS_LABELS[toStatus]}".`,
      );
      await fetchLeads();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể chuyển nhanh tiến độ.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3.5">
      {/* Control Bar — Căn giữa toàn bộ công cụ trên 1 hàng: Mốc thời gian + Chế độ xem + Nhắc việc tự động + Xuất/Nhập Excel + Tạo Lead mới */}
      <div className="rounded-2xl bg-white text-slate-900 px-4 py-2.5 shadow-2xs border border-slate-200/90 flex flex-wrap items-center justify-center gap-2.5">
        {/* Standard Date Range Dropdown */}
        <StandardDateRangeDropdown
          preset={dateRangePreset as StandardDatePreset}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onChangePreset={(p) => {
            setDateRangePreset(p as any);
            setCustomStartDate('');
            setCustomEndDate('');
            setCurrentPage(1);
          }}
          onChangeCustomRange={(start, end) => {
            setCustomStartDate(start);
            setCustomEndDate(end);
            setDateRangePreset('CUSTOM');
            setCurrentPage(1);
          }}
          include90Days={false}
          size="sm"
        />

          {searchQuery.trim() && (
            <div className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-blue-50 border border-blue-200 text-xs font-semibold text-[#1E3A8A]">
              <Search className="w-3.5 h-3.5" />
              <span>&ldquo;{searchQuery}&rdquo;</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tt-lead-search', { detail: '' }));
                  }
                }}
                className="ml-1 text-slate-400 hover:text-rose-600 font-bold"
                title="Xóa từ khóa tìm kiếm"
              >
                ×
              </button>
            </div>
          )}

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

          {/* Chuyển đổi Bảng / Kanban / Nhắc việc tự động */}
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                setReminderFilter('none');
              }}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                viewMode === 'table' && reminderFilter === 'none'
                  ? 'bg-white text-[#1E3A8A] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Danh sách</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('kanban');
                setReminderFilter('none');
              }}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                viewMode === 'kanban'
                  ? 'bg-white text-[#1E3A8A] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                setSpecialAlertFilter('none');
                setStatusFilter('all');
                setReminderFilter((prev) => (prev === 'none' ? 'all_reminders' : 'none'));
                setCurrentPage(1);
              }}
              className={`h-8 px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                reminderFilter !== 'none'
                  ? 'bg-white text-rose-700 shadow-2xs ring-1 ring-rose-300'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Các Lead cần xử lý theo quy tắc nhắc việc tự động"
            >
              <Bell className="w-3.5 h-3.5 text-rose-600" />
              <span>Nhắc việc tự động</span>
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                {reminderStats.totalLeadsWithReminder}
              </span>
            </button>
          </div>

          {/* Realtime Live Motion Indicator with dynamic countdown & auto-refresh */}
          <RealtimeLiveMotionIndicator
            isPolling={isLeadsPolling}
            lastUpdated={lastLeadsPolledAt}
            intervalSec={15}
            onRefresh={() => void fetchLeads(true)}
            label="Realtime Live"
            subLabel="Tự động cập nhật 15s"
            size="sm"
          />

          {/* Xuất Excel */}
          {user && hasBaPermission(user.roleCode, 'EXPORT_DATA') && (
            <a
              href={exportHref}
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors"
              title="Xuất danh sách Lead hiện tại ra file Excel (.xlsx)"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Xuất Excel ({displayedLeads.length})</span>
            </a>
          )}

          {/* Nhập Excel */}
          {canCreate && (
            <button
              type="button"
              onClick={() => {
                setImportPreviewRows([]);
                setImportFileName(null);
                setImportPastedText('');
                setShowImportModal(true);
              }}
              className="h-9 px-3 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 text-emerald-800 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors"
              title="Nhập danh sách Lead từ file Excel (.xlsx, .csv) kèm kiểm tra trùng lặp tự động"
            >
              <FolderUp className="w-4 h-4 text-emerald-700" />
              <span>Nhập Excel</span>
            </button>
          )}

          {/* Đồng bộ Gmail */}
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowGmailSyncModal(true)}
              className="h-9 px-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100/80 text-rose-800 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 shadow-2xs transition-colors"
              title="Quét hộp thư Gmail và tự động tạo Lead khách hàng hỏi báo giá"
            >
              <Mail className="w-4 h-4 text-rose-600" />
              <span>Đồng bộ Gmail</span>
            </button>
          )}

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

      {/* Unified 7-Card Interactive Status Strip (Includes dedicated Duplicate / Returning / Spam Box) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (viewMode === 'reminders') setViewMode('table');
            setStatusFilter('all');
            setSpecialAlertFilter('none');
            setReminderFilter('none');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            viewMode !== 'reminders' &&
            statusFilter === 'all' &&
            specialAlertFilter === 'none' &&
            reminderFilter === 'none' &&
            b2bHorizonFilter === 'all' &&
            !overdueOnly &&
            !unreceivedOnly
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
              Tất cả
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (viewMode === 'reminders') setViewMode('table');
            setStatusFilter('new_lead');
            setSpecialAlertFilter('none');
            setReminderFilter('none');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            viewMode !== 'reminders' &&
            statusFilter === 'new_lead' &&
            specialAlertFilter === 'none' &&
            reminderFilter === 'none'
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
            if (viewMode === 'reminders') setViewMode('table');
            setStatusFilter('quoting');
            setSpecialAlertFilter('none');
            setReminderFilter('none');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            viewMode !== 'reminders' &&
            statusFilter === 'quoting' &&
            specialAlertFilter === 'none' &&
            reminderFilter === 'none'
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
            if (viewMode === 'reminders') setViewMode('table');
            setStatusFilter('quote_sent');
            setSpecialAlertFilter('none');
            setReminderFilter('none');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            viewMode !== 'reminders' &&
            statusFilter === 'quote_sent' &&
            specialAlertFilter === 'none' &&
            reminderFilter === 'none'
              ? 'bg-amber-50/50 border-amber-300 ring-1 ring-amber-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            3. Đã Gửi Báo Giá
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.quoteSentCount}
            </span>
            <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
              Đang tư vấn
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (viewMode === 'reminders') setViewMode('table');
            setStatusFilter('won');
            setSpecialAlertFilter('none');
            setReminderFilter('none');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            viewMode !== 'reminders' &&
            statusFilter === 'won' &&
            specialAlertFilter === 'none' &&
            reminderFilter === 'none'
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

        <button
          type="button"
          onClick={() => {
            if (viewMode === 'reminders') setViewMode('table');
            setStatusFilter('lost');
            setSpecialAlertFilter('none');
            setReminderFilter('none');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            viewMode !== 'reminders' &&
            statusFilter === 'lost' &&
            specialAlertFilter === 'none' &&
            reminderFilter === 'none'
              ? 'bg-rose-50/60 border-rose-300 ring-1 ring-rose-500/20'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
            5. Thất Bại
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="font-display text-2xl font-bold text-slate-900">
              {b2bSummaryCounts.lostCount}
            </span>
            <span className="text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200/70 px-1.5 py-0.5 rounded">
              Đã đóng
            </span>
          </div>
        </button>

        {/* Ô số 6: Xem Trùng / Quay lại / Spam / Nghi dò giá */}
        <button
          type="button"
          onClick={() => {
            if (viewMode === 'reminders') setViewMode('table');
            setStatusFilter('all');
            setReminderFilter('none');
            setSpecialAlertFilter(specialAlertFilter === 'none' ? 'all_alerts' : 'none');
            setB2bHorizonFilter('all');
            setOverdueOnly(false);
            setUnreceivedOnly(false);
            setCurrentPage(1);
          }}
          className={`text-left rounded-xl p-3 border transition shadow-2xs ${
            viewMode !== 'reminders' && specialAlertFilter !== 'none'
              ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-500/25'
              : 'bg-white border-amber-200/90 hover:border-amber-300'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>6. Lưu ý</span>
          </span>
          <div className="flex items-baseline justify-between gap-1 mt-1">
            <span className="font-display text-2xl font-bold text-amber-900">
              {b2bSummaryCounts.alertAllCount}
            </span>
            <span className="text-[10px] font-semibold text-amber-800 bg-amber-100/80 border border-amber-300/80 px-1.5 py-0.5 rounded whitespace-nowrap">
              {b2bSummaryCounts.activeDupCount} trùng · {b2bSummaryCounts.returningTotalCount} quay lại · {b2bSummaryCounts.spamProbeCount} spam
            </span>
          </div>
        </button>
      </div>

      {/* Khối Nhắc Việc Tự Động (4 quy tắc tự động như Ảnh 1: Chưa tiếp nhận, Lead đứng yên > 3 ngày, Báo giá chưa phản hồi 1d/1w/>1m, Đến lịch hẹn) */}
      {reminderFilter !== 'none' && (
        <div className="rounded-2xl bg-white border border-rose-200 p-4 space-y-3 shadow-xs animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 grid place-items-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-slate-900 text-sm">
                    Nhắc việc tự động
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-bold">
                    {reminderStats.totalLeadsWithReminder}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Các hồ sơ Lead cần xử lý theo quy tắc tự động (bấm từng thẻ để lọc danh sách bên dưới)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setReminderFilter('all_reminders');
                  setCurrentPage(1);
                }}
                className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${
                  reminderFilter === 'all_reminders'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Tất cả nhắc việc ({reminderStats.totalLeadsWithReminder})
              </button>
              <button
                type="button"
                onClick={() => setReminderFilter('none')}
                className="h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Đóng ×
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Chưa tiếp nhận */}
            <button
              type="button"
              onClick={() => {
                setReminderFilter(reminderFilter === 'unreceived' ? 'all_reminders' : 'unreceived');
                setCurrentPage(1);
              }}
              className={`text-left p-3.5 rounded-xl border transition flex items-start justify-between gap-2 ${
                reminderFilter === 'unreceived'
                  ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-500/20'
                  : 'bg-rose-50/40 border-rose-200/80 hover:border-rose-300'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 grid place-items-center shrink-0 mt-0.5">
                  <UserCheck className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                    Chưa tiếp nhận
                  </span>
                  <span className="text-[11px] text-slate-600 block mt-0.5">
                    Lead mới quá 2 giờ chưa xác nhận tiếp nhận
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold shrink-0">
                {reminderStats.unreceived}
              </span>
            </button>

            {/* 2. Lead đứng yên */}
            <button
              type="button"
              onClick={() => {
                setReminderFilter(
                  reminderFilter === 'stagnant_3d' ? 'all_reminders' : 'stagnant_3d',
                );
                setCurrentPage(1);
              }}
              className={`text-left p-3.5 rounded-xl border transition flex items-start justify-between gap-2 ${
                reminderFilter === 'stagnant_3d'
                  ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20'
                  : 'bg-amber-50/40 border-amber-200/80 hover:border-amber-300'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 grid place-items-center shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                    Lead đứng yên
                  </span>
                  <span className="text-[11px] text-slate-600 block mt-0.5">
                    Không có tiến triển &gt; 3 ngày
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold shrink-0">
                {reminderStats.stagnant3d}
              </span>
            </button>

            {/* 3. Báo giá chưa phản hồi */}
            <button
              type="button"
              onClick={() => {
                setReminderFilter(
                  reminderFilter === 'quote_unresponded' ? 'all_reminders' : 'quote_unresponded',
                );
                setCurrentPage(1);
              }}
              className={`text-left p-3.5 rounded-xl border transition flex items-start justify-between gap-2 ${
                reminderFilter === 'quote_unresponded'
                  ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-500/20'
                  : 'bg-blue-50/40 border-blue-200/80 hover:border-blue-300'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-blue-100 text-[#1E3A8A] grid place-items-center shrink-0 mt-0.5">
                  <Send className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                    Báo giá chưa phản hồi
                  </span>
                  <span className="text-[11px] text-slate-600 block mt-0.5">
                    Đã gửi báo giá: 1 ngày ({reminderStats.quote1d}) · 1 tuần ({reminderStats.quote7d}) · &gt; 1 tháng ({reminderStats.quote30d})
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">
                {reminderStats.quoteUnresponded}
              </span>
            </button>

            {/* 4. Đến lịch hẹn */}
            <button
              type="button"
              onClick={() => {
                setReminderFilter(
                  reminderFilter === 'scheduled_due' ? 'all_reminders' : 'scheduled_due',
                );
                setCurrentPage(1);
              }}
              className={`text-left p-3.5 rounded-xl border transition flex items-start justify-between gap-2 ${
                reminderFilter === 'scheduled_due'
                  ? 'bg-violet-50 border-violet-400 ring-2 ring-violet-500/20'
                  : 'bg-violet-50/40 border-violet-200/80 hover:border-violet-300'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-violet-100 text-violet-700 grid place-items-center shrink-0 mt-0.5">
                  <Calendar className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm block">
                    Đến lịch hẹn
                  </span>
                  <span className="text-[11px] text-slate-600 block mt-0.5">
                    Có lịch chăm sóc &amp; theo dõi dự án B2B
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-xs font-bold shrink-0">
                {reminderStats.scheduledDue}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Sub-Filter Bar khi chọn ô Trùng / Spam / Quay lại */}
      {specialAlertFilter !== 'none' && (
        <div className="rounded-xl bg-amber-50/70 border border-amber-200/90 p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-2xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-amber-900 mr-1 inline-flex items-center gap-1">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              Bộ lọc Trùng &amp; Cảnh báo:
            </span>
            <button
              type="button"
              onClick={() => {
                setSpecialAlertFilter('all_alerts');
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                specialAlertFilter === 'all_alerts'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Tất cả ({b2bSummaryCounts.alertAllCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSpecialAlertFilter('active_dup');
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                specialAlertFilter === 'active_dup'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-50'
              }`}
            >
              <span>⚠️ Cảnh báo trùng Lead ({b2bSummaryCounts.activeDupCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSpecialAlertFilter('won_returning');
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                specialAlertFilter === 'won_returning'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-50'
              }`}
            >
              <span>💎 Khách cũ quay lại · Đã mua ({b2bSummaryCounts.wonReturningCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSpecialAlertFilter('lost_returning');
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                specialAlertFilter === 'lost_returning'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'bg-white border border-sky-300 text-sky-800 hover:bg-sky-50'
              }`}
            >
              <span>🔄 Khách quay lại hỏi mua · Chưa chốt ({b2bSummaryCounts.lostReturningCount})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSpecialAlertFilter('spam_probe');
                setCurrentPage(1);
              }}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                specialAlertFilter === 'spam_probe'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-white border border-rose-300 text-rose-800 hover:bg-rose-50'
              }`}
            >
              <span>🚫 Spam / Số ảo / Nghi dò giá ({b2bSummaryCounts.spamProbeCount})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPriceAlertDirectory(true)}
              className="h-8 px-3 rounded-lg bg-white hover:bg-orange-50 border border-orange-300 text-orange-800 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
              <span>
                Sổ đen Nghi dò giá ({priceCheckAlerts.filter((a) => a.status === 'ACTIVE').length})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSpecialAlertFilter('none')}
              className="h-8 px-2.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Đóng lọc ×
            </button>
          </div>
        </div>
      )}

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

                  {/* Separated Warning Badges */}
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

          {/* UI-01, UI-02, UI-03: Simplified 7-Column Default Desktop Table — Fits 100% Width with Zero Horizontal Scroll */}
          <div className="hidden md:block bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-2xs">
            <div className={showOptionalColumns ? 'overflow-x-auto' : 'overflow-x-hidden'}>
              <table
                className={`w-full text-left border-collapse text-[13px] ${
                  showOptionalColumns ? 'min-w-[1220px]' : 'table-fixed'
                }`}
              >
                <thead className="bg-slate-50/90 text-slate-600 border-b border-slate-200/80 text-[11px] font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3 w-[19%]">Khách hàng / Dự án</th>
                    <th className="py-2.5 px-2.5 w-[16%]">Liên hệ &amp; Nguồn / Kênh</th>
                    <th className="py-2.5 px-2.5 w-[13%]">Sản phẩm LED</th>
                    <th className="py-2.5 px-2.5 w-[16%]">Trạng thái &amp; Lịch theo dõi</th>
                    <th className="py-2.5 px-2.5 w-[14%]">Sales phụ trách</th>
                    <th className="py-2.5 px-2 w-[9%]">Ngày nhận</th>
                    {showOptionalColumns && (
                      <>
                        <th className="py-2.5 px-2.5 w-[135px]">Khu vực / Địa chỉ</th>
                        <th className="py-2.5 px-2.5 w-[115px]">Chi tiết UTM</th>
                        <th className="py-2.5 px-2.5 w-[150px]">Ghi chú</th>
                      </>
                    )}
                    <th className="py-2.5 px-3 text-right w-[13%]">Thao tác</th>
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
                      const reminderInfo = classifyReminderCategories(lead);
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
                        fraud.duplicateScenario !== 'NONE' ||
                        lead.isDuplicateAlert ||
                        fraud.hasDuplicatePhone ||
                        Boolean(fraud.duplicateProjectName);

                      // UC01 1.5 Kịch bản 1: Tô đỏ dòng khi trùng khách đang mở VÀ Lead hiện tại vẫn đang ở "Vừa nhận thông tin" (khi đổi trạng thái thì hết tô đỏ)
                      const isActiveRedDuplicateRow =
                        fraud.duplicateScenario === 'SCENARIO_1_ACTIVE_DUP' &&
                        lead.pipelineStatus === 'new_lead';

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
                              : isActiveRedDuplicateRow
                                ? 'bg-rose-50/75 hover:bg-rose-100/60 border-l-4 border-l-rose-500'
                                : fraud.isCustomerWonVIP
                                  ? 'bg-amber-50/45 hover:bg-amber-100/40 border-l-4 border-l-amber-500'
                                  : `${STATUS_ROW_ACCENTS[lead.pipelineStatus]} hover:bg-blue-50/35`
                          }`}
                        >
                          {/* Col 1: Customer / Project */}
                          <td className="py-2 px-3 align-middle overflow-hidden">
                            <div className="flex items-center gap-1.5 truncate">
                              <span
                                className="font-bold text-slate-900 text-[13px] truncate"
                                title={primaryName}
                              >
                                {primaryName}
                              </span>
                              {fraud.isCustomerWonVIP && (
                                <span
                                  className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-extrabold text-[10px] inline-flex items-center gap-0.5 shrink-0 shadow-2xs"
                                  title="Khách hàng thân thiết đã từng mua thành công hợp đồng (VIP)"
                                >
                                  <Crown className="w-2.5 h-2.5 fill-slate-950 text-slate-950" />
                                  <span>VIP</span>
                                </span>
                              )}
                            </div>
                            <div
                              className="text-xs text-slate-600 truncate mt-0.5"
                              title={secondaryProject}
                            >
                              {secondaryProject}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 font-mono truncate">
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

                          {/* Col 2: Contact (Readable Name, Phone, Channel — Bounded without forcing horizontal scroll) */}
                          <td className="py-2 px-2.5 align-middle overflow-hidden">
                            <div className="font-bold font-mono text-slate-900 text-[13px] flex items-center gap-1 truncate">
                              <Phone className="w-3.5 h-3.5 text-[#1E3A8A] shrink-0" />
                              <span className="truncate">{lead.phone}</span>
                            </div>
                            <div className="text-xs text-slate-600 truncate mt-0.5">
                              {lead.contactName || 'Khách liên hệ'}
                            </div>
                            <div className="mt-1 flex items-center gap-1 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200/70 text-[11px] font-semibold truncate max-w-full">
                                {(() => {
                                  const rawSrc =
                                    lead.selfReportedSource ||
                                    lead.tracking?.marketingSource ||
                                    '';
                                  if (
                                    rawSrc &&
                                    rawSrc !== 'Nhập tay' &&
                                    rawSrc !== 'Chưa xác định'
                                  ) {
                                    return rawSrc;
                                  }
                                  if (lead.contactChannel === 'zalo') return 'Zalo';
                                  if (lead.contactChannel === 'form_web') return 'Website Toàn Trung';
                                  if (lead.contactChannel === 'google_lead_form') return 'Google Ads';
                                  if (lead.contactChannel === 'fanpage') return 'Fanpage Facebook';
                                  if (lead.contactChannel === 'email') return 'Email Dự án';
                                  return 'SĐT / Hotline';
                                })()}
                              </span>
                              {!lead.isPhoneNormalized && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-medium truncate">
                                  SĐT cần chuẩn hóa
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Col 3: Products */}
                          <td className="py-2 px-2.5 align-middle overflow-hidden">
                            {primaryProduct ? (
                              <div className="flex items-center gap-1 flex-wrap">
                                <span
                                  className="px-2 py-0.5 rounded-lg bg-blue-50 text-[#1E3A8A] border border-blue-200 text-[11px] font-semibold truncate max-w-full"
                                  title={primaryProduct.productName}
                                >
                                  {primaryProduct.productName}
                                </span>
                                {extraProducts.length > 0 && (
                                  <span
                                    className="px-1.5 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold shrink-0"
                                    title={`Sản phẩm kèm theo: ${extraProducts
                                      .map((p) => p.productName)
                                      .join(', ')}`}
                                  >
                                    +{extraProducts.length}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Chưa chọn SP</span>
                            )}
                          </td>

                          {/* Col 4: Pipeline Status & Warnings */}
                          <td className="py-2 px-2.5 align-middle overflow-hidden">
                            <div className="flex flex-col items-start gap-1 max-w-full">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] truncate max-w-full ${
                                  STATUS_BADGE_STYLES[lead.pipelineStatus]
                                }`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-85 shrink-0" />
                                <span className="truncate">{PIPELINE_STATUS_LABELS[lead.pipelineStatus]}</span>
                              </span>

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

                                  {fraud.duplicateScenario === 'SCENARIO_1_ACTIVE_DUP' && (
                                    <div className="flex flex-col items-start gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => setInvestigativeLead(lead)}
                                        className={`px-2 py-0.5 rounded-md border text-[11px] font-bold transition ${
                                          lead.pipelineStatus === 'new_lead'
                                            ? 'bg-rose-600 hover:bg-rose-700 border-rose-600 text-white'
                                            : 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900'
                                        }`}
                                        title="Kịch bản 1 (UC01 1.5): Khách gửi thông tin nhiều kênh khi Lead đang mở"
                                      >
                                        CẢNH BÁO TRÙNG LEAD
                                      </button>
                                      {fraud.matchedCustomerLead ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedLeadId(fraud.matchedCustomerLead!.id);
                                            setLeadDetailTab('info');
                                          }}
                                          className="text-[11px] font-semibold text-rose-700 hover:underline text-left truncate max-w-[180px]"
                                          title={`Mở ngay hồ sơ gốc đang mở: ${fraud.matchedCustomerLead.leadCode}`}
                                        >
                                          🔗 Trùng: {fraud.matchedCustomerLead.leadCode} →
                                        </button>
                                      ) : (
                                        <span className="text-[11px] font-medium text-rose-700 truncate max-w-[195px]">
                                          ⚠️ Liên hệ lại · Đã gộp 1 SĐT
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {fraud.duplicateScenario === 'SCENARIO_2_WON_RETURNING' && (
                                    <div className="flex flex-col items-start gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => setInvestigativeLead(lead)}
                                        className="px-2 py-0.5 rounded-md bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 text-[11px] font-extrabold inline-flex items-center gap-1 shadow-2xs transition"
                                        title="Khách hàng từng chốt thành công hợp đồng trước đây nay quay lại mua dự án mới (VIP)"
                                      >
                                        <Crown className="w-3 h-3 fill-slate-950 text-slate-950" />
                                        <span>👑 KHÁCH CŨ ĐÃ MUA (VIP)</span>
                                      </button>
                                      {fraud.matchedCustomerLead ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedLeadId(fraud.matchedCustomerLead!.id);
                                            setLeadDetailTab('info');
                                          }}
                                          className="text-[11px] font-semibold text-emerald-800 hover:underline text-left truncate max-w-[180px]"
                                          title={`Mở ngay hồ sơ đã chốt thành công trước đây: ${fraud.matchedCustomerLead.leadCode}`}
                                        >
                                          🔗 Đã mua: {fraud.matchedCustomerLead.leadCode} →
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedLeadId(lead.id);
                                            setLeadDetailTab('info');
                                          }}
                                          className="text-[11px] font-bold text-emerald-800 hover:underline text-left truncate max-w-[180px]"
                                          title="Xem chi tiết hồ sơ đã từng chốt HĐ"
                                        >
                                          💎 Đã từng chốt HĐ · Xem hồ sơ →
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {fraud.duplicateScenario === 'SCENARIO_2_LOST_RETURNING' && (
                                    <div className="flex flex-col items-start gap-0.5">
                                      <button
                                        type="button"
                                        onClick={() => setInvestigativeLead(lead)}
                                        className="px-2 py-0.5 rounded-md bg-blue-100 hover:bg-blue-200 border border-blue-300 text-[#1E3A8A] text-[11px] font-bold transition"
                                        title="Khách từng hỏi báo giá trước đây nhưng chưa chốt, nay quay lại tiếp tục muốn mua"
                                      >
                                        KHÁCH QUAY LẠI HỎI MUA
                                      </button>
                                      {fraud.matchedCustomerLead ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedLeadId(fraud.matchedCustomerLead!.id);
                                            setLeadDetailTab('info');
                                          }}
                                          className="text-[11px] font-semibold text-[#1E3A8A] hover:underline text-left truncate max-w-[195px]"
                                          title={`Mở xem ngay hồ sơ khách từng hỏi trước đây: ${fraud.matchedCustomerLead.leadCode}${fraud.matchedCustomerLead.lostReason ? ` (${fraud.matchedCustomerLead.lostReason})` : ''}`}
                                        >
                                          🔗 Hồ sơ trước: {fraud.matchedCustomerLead.leadCode} →
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedLeadId(lead.id);
                                            setLeadDetailTab('info');
                                          }}
                                          className="text-[11px] font-medium text-[#1E3A8A] hover:underline text-left truncate max-w-[195px]"
                                          title={`Lần trước chưa chốt: ${lead.reopenReason || lead.lostReason || 'Hỏi lại dự án'}`}
                                        >
                                          🔄 Trước: {lead.reopenReason || lead.lostReason || 'Từng hỏi chưa chốt'} →
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {fraud.duplicateScenario === 'SCENARIO_3_MULTI_CONTRACTOR' && (
                                    <button
                                      type="button"
                                      onClick={() => setInvestigativeLead(lead)}
                                      className="px-2 py-0.5 rounded-md bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-900 text-[11px] font-bold transition"
                                      title="Kịch bản 3 (UC01 1.5): Nhiều nhà thầu cùng hỏi giá 1 dự án / công trình"
                                    >
                                      DỰ ÁN NHIỀU BÊN HỎI GIÁ ({fraud.projectContractors.length + 1} thầu)
                                    </button>
                                  )}

                                  {fraud.duplicateScenario === 'NONE' &&
                                    (lead.isDuplicateAlert ||
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

                          {/* Col 5: Assigned Sales (Clean Bounded Width, No Overflow into Col 6) */}
                          <td className="py-2 px-2.5 align-middle min-w-0 max-w-0 overflow-hidden">
                            <div className="flex flex-col min-w-0 max-w-full">
                              <div
                                className="font-semibold text-slate-900 text-[13px] truncate"
                                title={lead.assignedSalesName || 'Chưa phân bổ'}
                              >
                                {lead.assignedSalesName || 'Chưa phân bổ'}
                              </div>
                              {fraud.transferredFromSalesName && (
                                <div className="mt-0.5 min-w-0 max-w-full">
                                  <span
                                    className="inline-flex items-center gap-1 max-w-full min-w-0 px-1.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-[10px] font-semibold text-indigo-800"
                                    title={`Chuyển từ ${fraud.transferredFromSalesName}${fraud.transferCount > 1 ? ` (${fraud.transferCount} lần)` : ''}`}
                                  >
                                    <span className="truncate min-w-0">
                                      Chuyển từ {fraud.transferredFromSalesName}
                                    </span>
                                    {fraud.transferCount > 1 && (
                                      <span className="shrink-0 text-[10px] font-bold text-indigo-600">
                                        ({fraud.transferCount})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              )}
                              <div className="mt-0.5 min-w-0 truncate">
                                {lead.receivedConfirmedAt ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold truncate">
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span className="truncate">Đã tiếp nhận</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-semibold truncate">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span className="truncate">Chờ xác nhận</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Col 6: Received Date */}
                          <td className="py-2 px-2 align-middle overflow-hidden min-w-0">
                            <div className="text-[13px] font-semibold text-slate-800 truncate">
                              {new Date(lead.contactedAt).toLocaleDateString('vi-VN')}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {new Date(lead.contactedAt).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </td>

                          {/* Optional Columns when toggled on */}
                          {showOptionalColumns && (
                            <>
                              <td className="py-2 px-2.5 align-middle max-w-[180px]">
                                <div className="text-xs text-slate-800 truncate">
                                  {lead.areaType === 'hcm'
                                    ? `TP.HCM · ${lead.hcmDistrict || ''}`
                                    : lead.province || '—'}
                                </div>
                                {lead.installationAddress && (
                                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {lead.installationAddress}
                                  </div>
                                )}
                              </td>
                              <td className="py-2 px-2.5 align-middle whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                                  {lead.tracking?.marketingSource ||
                                    lead.selfReportedSource ||
                                    CONTACT_CHANNEL_LABELS[lead.contactChannel]}
                                </span>
                              </td>
                              <td className="py-2 px-2.5 align-middle max-w-[200px]">
                                <p className="text-xs text-slate-600 truncate" title={noteSummary}>
                                  {noteSummary}
                                </p>
                              </td>
                            </>
                          )}

                          {/* Col 7: Consolidated Row Actions with Direct Edit — Compact Fit */}
                          <td
                            className="py-2 px-2.5 align-middle text-right overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1 flex-wrap">
                              {!lead.isAnonymized && cleanDigits.length >= 9 && (
                                <>
                                  <a
                                    href={`tel:${cleanDigits}`}
                                    className="h-7 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-0.5 transition shrink-0"
                                    title={`Gọi ${lead.phone}`}
                                  >
                                    <Phone className="w-3 h-3" />
                                    <span>Gọi</span>
                                  </a>
                                  <a
                                    href={`https://zalo.me/${cleanDigits}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-7 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E3A8A] border border-blue-200 text-[11px] font-bold inline-flex items-center transition shrink-0"
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
                                className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-[#1E3A8A] text-[11px] font-semibold inline-flex items-center shadow-2xs transition shrink-0"
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

                            {/* Card Region 3: Product + Warnings */}
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {fraud.isCustomerWonVIP && (
                                <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-extrabold inline-flex items-center gap-1 shadow-2xs">
                                  <Crown className="w-3 h-3 fill-slate-950 text-slate-950" />
                                  <span>VIP ĐÃ MUA</span>
                                </span>
                              )}
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
        existingLeads={leads}
        onOpenExistingLead={(leadId) => {
          setShowCreateModal(false);
          setSelectedLeadId(leadId);
          setLeadDetailTab('info');
        }}
        onCreatedSuccess={async (leadCode, assignedMsg) => {
          setFeedbackMsg(`Đã tạo thành công hồ sơ ${leadCode}. ${assignedMsg}`);
          await fetchLeads();
        }}
      />

      {/* Modal Tạo Lead Tự Động Từ Gmail */}
      <GmailSyncModal
        open={showGmailSyncModal}
        onClose={() => setShowGmailSyncModal(false)}
        csrfToken={user?.csrfToken}
        onSynced={() => {
          void fetchLeads();
        }}
      />

      {/* Modal Nhập Danh Sách Lead Từ Excel (.xlsx / .csv) kèm Kiểm Tra Trùng Lặp Tức Thì */}
      {showImportModal && (() => {
        const seenPhonesInBatch = new Set<string>();
        const evaluatedRows = importPreviewRows.map((row) => {
          const rawDigits = (row.phone || '').replace(/\D/g, '');
          const normPhone =
            rawDigits.startsWith('84') && rawDigits.length >= 10
              ? `0${rawDigits.slice(2)}`
              : rawDigits.length === 9 && !rawDigits.startsWith('0')
                ? `0${rawDigits}`
                : rawDigits;
          const normComp = (row.companyName || '').trim().toLowerCase();

          const isDupInBatch = normPhone.length >= 8 && seenPhonesInBatch.has(normPhone);
          if (normPhone.length >= 8) {
            seenPhonesInBatch.add(normPhone);
          }

          const matchedLeads = leads.filter((l) => {
            if (l.spamStatus !== 'NONE') return false;
            const lPhone = (l.phone || '').replace(/\D/g, '');
            const phoneHit = normPhone.length >= 8 && !lPhone.includes('*') && lPhone === normPhone;
            const compHit =
              normComp.length >= 5 && (l.companyName || '').trim().toLowerCase() === normComp;
            return phoneHit || compHit;
          });

          const openMatch = matchedLeads.find(
            (l) =>
              l.pipelineStatus === 'new_lead' ||
              l.pipelineStatus === 'quoting' ||
              l.pipelineStatus === 'quote_sent',
          );
          const wonMatch = matchedLeads.find((l) => l.pipelineStatus === 'won');
          const lostMatch = matchedLeads.find((l) => l.pipelineStatus === 'lost');

          let rowStatus: 'OPEN_DUP' | 'IN_FILE_DUP' | 'WON_RETURNING' | 'LOST_RETURNING' | 'NEW_VALID' =
            'NEW_VALID';
          let matchedLead: LeadItemDto | null = null;

          if (openMatch) {
            rowStatus = 'OPEN_DUP';
            matchedLead = openMatch;
          } else if (isDupInBatch) {
            rowStatus = 'IN_FILE_DUP';
          } else if (wonMatch) {
            rowStatus = 'WON_RETURNING';
            matchedLead = wonMatch;
          } else if (lostMatch) {
            rowStatus = 'LOST_RETURNING';
            matchedLead = lostMatch;
          }

          return {
            ...row,
            rowStatus,
            matchedLead,
          };
        });

        const openDupCount = evaluatedRows.filter(
          (r) => r.rowStatus === 'OPEN_DUP' || r.rowStatus === 'IN_FILE_DUP',
        ).length;
        const wonReturningCount = evaluatedRows.filter((r) => r.rowStatus === 'WON_RETURNING').length;
        const lostReturningCount = evaluatedRows.filter((r) => r.rowStatus === 'LOST_RETURNING').length;
        const newValidCount = evaluatedRows.filter((r) => r.rowStatus === 'NEW_VALID').length;

        const rowsToCommit = importSkipOpenDup
          ? evaluatedRows.filter(
              (r) => r.rowStatus !== 'OPEN_DUP' && r.rowStatus !== 'IN_FILE_DUP',
            )
          : evaluatedRows;

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
                    <FolderUp className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-slate-900 text-lg">
                      Nhập danh sách Lead từ Excel (.xlsx / .csv)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Tự động chuẩn hóa SĐT và phát cảnh báo trùng lặp / khách cũ quay lại trên từng dòng trước khi lưu
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setImportFileName('5_Truong_Hop_Test_Mau.xlsx');
                      setImportPreviewRows([
                        {
                          rowNumber: 6,
                          phone: '0908100201',
                          contactName: 'Anh Minh Hoàng (TH1: Khách cũ đã mua)',
                          companyName: 'Công ty CP Trung tâm Hội nghị Ánh Dương',
                          projectName: 'Màn hình LED Hội trường Tầng 6',
                          email: 'minh.hoang@anhduong.vn',
                          source: 'Website Toàn Trung',
                          region: 'TP.HCM - TP. Thủ Đức',
                          address: 'Khu Công Nghệ Cao, TP. Thủ Đức',
                          productsText: 'Màn hình LED Indoor',
                          note: 'Trùng với TT-20261101-0001 đã Chốt thành công',
                        },
                        {
                          rowNumber: 7,
                          phone: '0364759204',
                          contactName: 'Anh Long (TH2: Khách thất bại quay lại)',
                          companyName: 'Công ty TNHH Xây dựng Long Phát',
                          projectName: 'Màn hình LED Phòng họp Tầng 2',
                          email: 'long@longphat.vn',
                          source: 'Zalo',
                          region: 'TP.HCM - TP. Thủ Đức',
                          address: 'Đường Võ Văn Ngân, TP. Thủ Đức',
                          productsText: 'Màn hình LED Indoor',
                          note: 'Trùng với TT-20261106-000720 từng Thất bại',
                        },
                        {
                          rowNumber: 8,
                          phone: '0908100204',
                          contactName: 'Bác sĩ Khanh (TH3: Trùng Lead đang mở)',
                          companyName: 'Bệnh viện Đa khoa Quốc tế Minh Tâm',
                          projectName: 'Màn hình LED Sảnh khám & Đồng hồ LED',
                          email: 'khanh@minhtamhospital.vn',
                          source: 'Google Ads',
                          region: 'TP.HCM - Quận 7',
                          address: 'Nguyễn Lương Bằng, Quận 7',
                          productsText: 'Màn hình LED Indoor',
                          note: 'Trùng với TT-20261105-0004 đang mở',
                        },
                        {
                          rowNumber: 9,
                          phone: '0918888999',
                          contactName: 'Chị Lan (TH4: Khách mới hợp lệ)',
                          companyName: 'Nhà máy Sản xuất Hòa Bình',
                          projectName: 'Bảng điện tử Năng suất & An toàn',
                          email: 'lan.bql@hoabinhfactory.vn',
                          source: 'Zalo',
                          region: 'Bình Dương',
                          address: 'KCN VSIP 1, Thuận An, Bình Dương',
                          productsText: 'Bảng Năng suất',
                          note: 'Khách hàng mới hoàn toàn',
                        },
                        {
                          rowNumber: 10,
                          phone: '0918888999',
                          contactName: 'Chị Lan (TH5: Lặp SĐT trong cùng file Excel)',
                          companyName: 'Nhà máy Sản xuất Hòa Bình',
                          projectName: 'Bảng điện tử Năng suất (Dòng lặp)',
                          email: 'lan.bql@hoabinhfactory.vn',
                          source: 'Website Toàn Trung',
                          region: 'Bình Dương',
                          address: 'KCN VSIP 1, Thuận An, Bình Dương',
                          productsText: 'Bảng Năng suất',
                          note: 'Trùng SĐT với dòng #9 ngay trong file Excel',
                        },
                      ]);
                    }}
                    className="h-9 px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    <span>⚡ Nạp 5 trường hợp mẫu để test ngay</span>
                  </button>
                  <a
                    href="/api/v1/leads/export?template=1"
                    className="h-9 px-3 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-[#1E3A8A] text-xs font-bold inline-flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải file Excel mẫu (.xlsx)</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-4 flex-1">
                {/* Upload File or Paste */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div
                    onClick={() => importFileInputRef.current?.click()}
                    className="cursor-pointer rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50/80 p-4 flex flex-col items-center justify-center text-center transition"
                  >
                    <input
                      ref={importFileInputRef}
                      type="file"
                      accept=".xlsx,.csv,.tsv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file || !user) return;
                        setImportFileName(file.name);
                        setImportParsing(true);
                        setErrorMsg(null);
                        void (async () => {
                          try {
                            const fd = new FormData();
                            fd.append('file', file);
                            const res = await apiRequest<{
                              rows: typeof importPreviewRows;
                            }>('/api/v1/leads/export', {
                              method: 'POST',
                              csrfToken: user.csrfToken,
                              isFormData: true,
                              body: fd,
                            });
                            setImportPreviewRows(res.rows || []);
                          } catch (err) {
                            setErrorMsg(
                              err instanceof Error ? err.message : 'Không thể đọc file Excel.',
                            );
                          } finally {
                            setImportParsing(false);
                            if (importFileInputRef.current) {
                              importFileInputRef.current.value = '';
                            }
                          }
                        })();
                      }}
                    />
                    <FolderUp className="w-7 h-7 text-emerald-700 mb-1.5" />
                    <p className="text-sm font-bold text-slate-800">
                      {importFileName
                        ? `Đã chọn: ${importFileName}`
                        : 'Bấm để chọn file Excel (.xlsx, .csv)'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Hỗ trợ cả file Mẫu Nhập Lead và file Xuất Excel từ hệ thống Toàn Trung
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        Hoặc dán trực tiếp các dòng copy từ bảng Excel:
                      </span>
                      <button
                        type="button"
                        disabled={!importPastedText.trim() || importParsing}
                        onClick={() => {
                          if (!user || !importPastedText.trim()) return;
                          setImportParsing(true);
                          setErrorMsg(null);
                          void (async () => {
                            try {
                              const fd = new FormData();
                              fd.append('pastedText', importPastedText);
                              const res = await apiRequest<{
                                rows: typeof importPreviewRows;
                              }>('/api/v1/leads/export', {
                                method: 'POST',
                                csrfToken: user.csrfToken,
                                isFormData: true,
                                body: fd,
                              });
                              setImportPreviewRows(res.rows || []);
                            } catch (err) {
                              setErrorMsg(
                                err instanceof Error ? err.message : 'Không thể phân tích dữ liệu dán.',
                              );
                            } finally {
                              setImportParsing(false);
                            }
                          })();
                        }}
                        className="h-7 px-2.5 rounded-lg bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold disabled:opacity-40 transition"
                      >
                        Kiểm tra dữ liệu dán
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={importPastedText}
                      onChange={(e) => setImportPastedText(e.target.value)}
                      placeholder="Copy các dòng từ Excel (Số điện thoại | Người liên hệ | Công ty | Dự án...) và dán vào đây..."
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>
                </div>

                {/* Summary & Instant Duplicate Detection Table */}
                {importParsing ? (
                  <div className="p-8 text-center text-sm font-semibold text-slate-600 bg-slate-50 rounded-xl border border-slate-200">
                    Đang đọc file Excel và đối chiếu trùng lặp với cơ sở dữ liệu...
                  </div>
                ) : evaluatedRows.length > 0 ? (
                  <div className="space-y-3">
                    {/* KPI Strip for Import Preview */}
                    <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                        <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800">
                          Tổng cộng: {evaluatedRows.length} dòng
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                          Mới hợp lệ: {newValidCount}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300">
                          Khách cũ quay lại (Đã mua): {wonReturningCount}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-[#1E3A8A] border border-blue-300">
                          Khách quay lại (Thất bại): {lostReturningCount}
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-300">
                          Cảnh báo trùng Lead đang mở: {openDupCount}
                        </span>
                      </div>

                      <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importSkipOpenDup}
                          onChange={(e) => setImportSkipOpenDup(e.target.checked)}
                          className="rounded border-slate-300 text-[#1E3A8A]"
                        />
                        <span>Tự động bỏ qua dòng đang Trùng Lead đang mở ({openDupCount})</span>
                      </label>
                    </div>

                    {/* Preview Table */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[340px] overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3 font-bold">Dòng</th>
                            <th className="py-2.5 px-3 font-bold">Số điện thoại</th>
                            <th className="py-2.5 px-3 font-bold">Khách hàng / Công ty</th>
                            <th className="py-2.5 px-3 font-bold">Dự án &amp; Nguồn</th>
                            <th className="py-2.5 px-3 font-bold">Sản phẩm</th>
                            <th className="py-2.5 px-3 font-bold">Trạng thái Kiểm tra Trùng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {evaluatedRows.map((r, idx) => (
                            <tr
                              key={`${r.rowNumber}-${idx}`}
                              className={
                                r.rowStatus === 'OPEN_DUP' || r.rowStatus === 'IN_FILE_DUP'
                                  ? 'bg-rose-50/70'
                                  : r.rowStatus === 'WON_RETURNING'
                                    ? 'bg-emerald-50/50'
                                    : r.rowStatus === 'LOST_RETURNING'
                                      ? 'bg-blue-50/40'
                                      : 'bg-white'
                              }
                            >
                              <td className="py-2 px-3 font-mono text-slate-500">#{r.rowNumber}</td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                {r.phone}
                              </td>
                              <td className="py-2 px-3">
                                <div className="font-semibold text-slate-900">
                                  {r.companyName || r.contactName || 'Khách liên hệ'}
                                </div>
                                {r.contactName && r.companyName && (
                                  <div className="text-[11px] text-slate-500">{r.contactName}</div>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <div className="text-slate-800 truncate max-w-[180px]">
                                  {r.projectName || r.region}
                                </div>
                                <span className="text-[11px] text-slate-500">{r.source}</span>
                              </td>
                              <td className="py-2 px-3 text-slate-700 max-w-[160px] truncate">
                                {r.productsText}
                              </td>
                              <td className="py-2 px-3">
                                {r.rowStatus === 'OPEN_DUP' && r.matchedLead && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[11px]">
                                      CẢNH BÁO TRÙNG LEAD ({r.matchedLead.leadCode})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowImportModal(false);
                                        setSelectedLeadId(r.matchedLead!.id);
                                        setLeadDetailTab('info');
                                      }}
                                      className="text-[11px] font-bold text-[#1E3A8A] underline"
                                    >
                                      Xem hồ sơ →
                                    </button>
                                  </div>
                                )}
                                {r.rowStatus === 'IN_FILE_DUP' && (
                                  <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[11px]">
                                    TRÙNG SĐT TRONG FILE EXCEL
                                  </span>
                                )}
                                {r.rowStatus === 'WON_RETURNING' && r.matchedLead && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold text-[11px]">
                                      KHÁCH CŨ QUAY LẠI ({r.matchedLead.leadCode})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowImportModal(false);
                                        setSelectedLeadId(r.matchedLead!.id);
                                        setLeadDetailTab('info');
                                      }}
                                      className="text-[11px] font-bold text-emerald-800 underline"
                                    >
                                      Xem hồ sơ đã mua →
                                    </button>
                                  </div>
                                )}
                                {r.rowStatus === 'LOST_RETURNING' && r.matchedLead && (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="px-2 py-0.5 rounded bg-blue-100 border border-blue-300 text-[#1E3A8A] font-bold text-[11px]">
                                      KHÁCH QUAY LẠI ({r.matchedLead.leadCode})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setShowImportModal(false);
                                        setSelectedLeadId(r.matchedLead!.id);
                                        setLeadDetailTab('info');
                                      }}
                                      className="text-[11px] font-bold text-[#1E3A8A] underline"
                                    >
                                      Xem hồ sơ cũ →
                                    </button>
                                  </div>
                                )}
                                {r.rowStatus === 'NEW_VALID' && (
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                                    Mới hợp lệ
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    Chọn file Excel (`.xlsx`, `.csv`) hoặc dán danh sách từ Excel để xem trước kết quả kiểm tra trùng lặp.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  {evaluatedRows.length > 0
                    ? `Sẵn sàng nhập ${rowsToCommit.length} / ${evaluatedRows.length} dòng vào hệ thống`
                    : 'Chưa có dữ liệu xem trước'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="h-9 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    disabled={rowsToCommit.length === 0 || importCommitting}
                    onClick={() => {
                      if (!user || rowsToCommit.length === 0) return;
                      setImportCommitting(true);
                      setErrorMsg(null);
                      void (async () => {
                        try {
                          const res = await apiRequest<{
                            createdCount: number;
                            failedCount: number;
                          }>('/api/v1/leads/export', {
                            method: 'POST',
                            csrfToken: user.csrfToken,
                            body: { rows: rowsToCommit },
                          });
                          setShowImportModal(false);
                          setFeedbackMsg(
                            `Đã nhập thành công ${res.createdCount} hồ sơ Lead từ Excel${
                              res.failedCount > 0 ? ` (${res.failedCount} dòng lỗi bị bỏ qua)` : ''
                            }.`,
                          );
                          await fetchLeads();
                        } catch (err) {
                          setErrorMsg(
                            err instanceof Error ? err.message : 'Lỗi khi nhập danh sách Excel.',
                          );
                        } finally {
                          setImportCommitting(false);
                        }
                      })();
                    }}
                    className="h-9 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm disabled:opacity-40 transition"
                  >
                    <FolderUp className="w-4 h-4" />
                    <span>
                      {importCommitting
                        ? 'Đang nhập dữ liệu...'
                        : `Nhập ${rowsToCommit.length} hồ sơ vào hệ thống`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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
                {evalResult.duplicateScenario === 'SCENARIO_1_ACTIVE_DUP' && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2">
                    <strong className="font-bold block text-sm">
                      Kịch bản 1 (UC01 1.5): [CẢNH BÁO TRÙNG LEAD] — Trùng khách khi Lead cũ đang mở
                    </strong>
                    <p className="text-xs leading-relaxed">
                      Khách hàng gửi thông tin qua nhiều kênh cùng lúc. Hồ sơ gốc đang mở:{' '}
                      <strong className="font-mono text-[#1E3A8A]">
                        {evalResult.matchedCustomerLead?.leadCode || investigativeLead.duplicateOfLeadCode || 'Lead cũ'}
                      </strong>{' '}
                      (Phụ trách:{' '}
                      <strong>{evalResult.matchedCustomerLead?.assignedSalesName || investigativeLead.assignedSalesName || 'NVKD'}</strong>
                      , Trạng thái:{' '}
                      <strong>
                        {evalResult.matchedCustomerLead
                          ? PIPELINE_STATUS_LABELS[evalResult.matchedCustomerLead.pipelineStatus]
                          : 'Đang mở'}
                      </strong>
                      ).
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {evalResult.matchedCustomerLead && (
                        <button
                          type="button"
                          onClick={() => {
                            const targetId = evalResult.matchedCustomerLead!.id;
                            setInvestigativeLead(null);
                            setSelectedLeadId(targetId);
                            setLeadDetailTab('info');
                          }}
                          className="h-8 px-3 rounded-lg bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition"
                        >
                          <span>Mở xem hồ sơ đang mở ({evalResult.matchedCustomerLead.leadCode}) →</span>
                        </button>
                      )}
                      {canEditLead(investigativeLead) && investigativeLead.pipelineStatus !== 'lost' && (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => {
                            void (async () => {
                              if (!user) return;
                              setSubmitting(true);
                              try {
                                await apiRequest(`/api/v1/leads/${investigativeLead.id}`, {
                                  method: 'PATCH',
                                  csrfToken: user.csrfToken,
                                  body: {
                                    action: 'transition_pipeline',
                                    expectedVersion: investigativeLead.version,
                                    toStatus: 'lost',
                                    reason: 'Trùng Lead',
                                    noteContent: `Đóng nhanh theo Kịch bản 1 (UC01 1.5) do trùng với ${evalResult.matchedCustomerLead?.leadCode || investigativeLead.duplicateOfLeadCode || 'Lead đang mở'}`,
                                    markQuoteResponded: false,
                                    bypassPriceCheckConfirmed: true,
                                  },
                                });
                                setFeedbackMsg(
                                  `Đã đóng hồ sơ ${investigativeLead.leadCode} với lý do "Trùng Lead" (Kịch bản 1 UC01 1.5).`,
                                );
                                setInvestigativeLead(null);
                                await fetchLeads();
                              } catch (err) {
                                setErrorMsg(err instanceof Error ? err.message : 'Lỗi đóng Lead trùng.');
                              } finally {
                                setSubmitting(false);
                              }
                            })();
                          }}
                          className="h-8 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition"
                        >
                          <span>Đóng nhanh Lead này (Thất bại · Lý do: Trùng Lead)</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {evalResult.duplicateScenario === 'SCENARIO_2_WON_RETURNING' && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-slate-900 space-y-2">
                    <strong className="font-bold block text-sm text-emerald-900">
                      [KHÁCH CŨ QUAY LẠI] — Khách đã mua hàng thành công trước đây
                    </strong>
                    <p className="text-xs leading-relaxed text-slate-700">
                      Khách hàng đã từng chốt hợp đồng thành công và nay quay lại mua dự án mới. Hồ sơ đã mua trước đây:{' '}
                      <strong className="font-mono text-emerald-900">
                        {evalResult.matchedCustomerLead?.leadCode || investigativeLead.duplicateOfLeadCode || 'Hồ sơ cũ'}
                      </strong>{' '}
                      · NVKD từng phụ trách:{' '}
                      <strong>{evalResult.matchedCustomerLead?.assignedSalesName || 'NVKD cũ'}</strong> · Trạng thái cũ:{' '}
                      <strong className="text-emerald-700">Chốt thành công</strong>.
                    </p>
                    {evalResult.matchedCustomerLead && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetId = evalResult.matchedCustomerLead!.id;
                          setInvestigativeLead(null);
                          setSelectedLeadId(targetId);
                          setLeadDetailTab('info');
                        }}
                        className="h-8 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition"
                      >
                        <span>Mở xem hồ sơ đã mua ({evalResult.matchedCustomerLead.leadCode}) →</span>
                      </button>
                    )}
                  </div>
                )}

                {evalResult.duplicateScenario === 'SCENARIO_2_LOST_RETURNING' && (
                  <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-slate-900 space-y-2">
                    <strong className="font-bold block text-sm text-[#1E3A8A]">
                      [KHÁCH QUAY LẠI] — Khách từng hỏi trước đây nhưng chưa chốt (Thất bại)
                    </strong>
                    <p className="text-xs leading-relaxed text-slate-700">
                      Khách hàng từng liên hệ trước đây nhưng chưa chốt được hợp đồng, nay quay lại hỏi lại. Hồ sơ cũ:{' '}
                      <strong className="font-mono text-[#1E3A8A]">
                        {evalResult.matchedCustomerLead?.leadCode || investigativeLead.duplicateOfLeadCode || 'Hồ sơ cũ'}
                      </strong>{' '}
                      · NVKD từng phụ trách:{' '}
                      <strong>{evalResult.matchedCustomerLead?.assignedSalesName || 'NVKD cũ'}</strong> · Kết quả lần trước:{' '}
                      <strong className="text-rose-700">
                        {evalResult.matchedCustomerLead
                          ? `Thất bại${evalResult.matchedCustomerLead.lostReason ? ` (${evalResult.matchedCustomerLead.lostReason})` : ''}`
                          : 'Thất bại'}
                      </strong>
                      .
                    </p>
                    {evalResult.matchedCustomerLead && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetId = evalResult.matchedCustomerLead!.id;
                          setInvestigativeLead(null);
                          setSelectedLeadId(targetId);
                          setLeadDetailTab('info');
                        }}
                        className="h-8 px-3 rounded-lg bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition"
                      >
                        <span>Mở xem hồ sơ cũ ({evalResult.matchedCustomerLead.leadCode}) →</span>
                      </button>
                    )}
                  </div>
                )}

                {evalResult.duplicateScenario === 'SCENARIO_3_MULTI_CONTRACTOR' && (
                  <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 text-purple-950 space-y-2">
                    <strong className="font-bold block text-sm">
                      Kịch bản 3 (UC01 1.5): [DỰ ÁN NHIỀU BÊN HỎI GIÁ] — Cùng dự án, khác nhà thầu
                    </strong>
                    <p className="text-xs leading-relaxed">
                      Có <strong>{evalResult.projectContractors.length + 1} nhà thầu</strong> đang cùng hỏi báo giá cho dự án/địa chỉ lắp đặt này.{' '}
                      <strong>Quy tắc xử lý:</strong> Không gộp Lead, không chuyển về 1 người; giữ nguyên các NVKD độc lập và báo Quản lý để đồng bộ giá sàn.
                    </p>
                    <div className="space-y-1 pt-1">
                      {evalResult.projectContractors.map((c) => (
                        <div
                          key={c.leadId}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-purple-200 flex items-center justify-between text-xs"
                        >
                          <span className="font-semibold text-slate-800 truncate">
                            {c.leadCode} · {c.companyName}
                          </span>
                          <span className="text-purple-800 font-bold shrink-0">
                            Sales: {c.assignedSalesName} ({PIPELINE_STATUS_LABELS[c.pipelineStatus]})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

      {/* Modal / Dialog Chi tiết Lead & Chỉnh sửa Trực tiếp theo Phân quyền (Giao diện Gọn, Hiện đại) */}
      {selectedLead && (() => {
        const selectedHorizon = getB2bFollowUpHorizon(selectedLead);
        const selectedFraud = evaluateLeadFraudCriteria(selectedLead, leads, priceCheckAlerts);
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 overflow-hidden">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl border border-slate-200 flex flex-col overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-150">
              {/* Header Gọn Sạch */}
              <div className="px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-xs font-bold text-[#1E3A8A]">
                        {selectedLead.leadCode}
                      </span>
                      <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate max-w-[440px]">
                        {selectedLead.companyName || selectedLead.contactName || selectedLead.phone}
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full border text-xs shrink-0 ${
                          STATUS_BADGE_STYLES[selectedLead.pipelineStatus]
                        }`}
                      >
                        {PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}
                      </span>
                      {selectedFraud.isCustomerWonVIP && (
                        <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 shadow-2xs shrink-0">
                          <Crown className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                          <span>👑 VIP · ĐÃ TỪNG MUA THÀNH CÔNG</span>
                        </span>
                      )}
                      {selectedLead.spamStatus !== 'NONE' && (
                        <span
                          title={selectedLead.spamReason ? `Lý do: ${selectedLead.spamReason}` : undefined}
                          className="px-2 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                        >
                          <Ban className="w-3 h-3" />
                          <span>
                            {selectedLead.spamStatus === 'CONFIRMED' ? 'Đã loại trừ Spam' : 'Spam chờ duyệt'}
                            {selectedLead.spamReason ? ` (${selectedLead.spamReason})` : ''}
                          </span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {selectedLead.projectName && (
                        <span className="font-medium text-slate-700 truncate max-w-[300px]">
                          Dự án: {selectedLead.projectName}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-700">
                        <Phone className="w-3 h-3 text-slate-400" />
                        {selectedLead.phone}
                      </span>
                      <span>
                        Nguồn:{' '}
                        <strong className="text-slate-700 font-medium">
                          {selectedLead.tracking?.marketingSource ||
                            CONTACT_CHANNEL_LABELS[selectedLead.contactChannel] ||
                            selectedLead.contactChannel}
                        </strong>
                      </span>
                      <span>
                        Phụ trách:{' '}
                        <strong className="text-slate-700 font-medium">
                          {selectedLead.assignedSalesName || 'Chưa phân bổ'}
                        </strong>
                      </span>
                      {selectedFraud.transferredFromSalesName && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-800 font-semibold">
                          Chuyển từ {selectedFraud.transferredFromSalesName}
                          {selectedFraud.transferCount > 1 ? ` (${selectedFraud.transferCount} lần)` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canEditSelectedLead && !selectedLead.receivedConfirmedAt && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => void handleConfirmReceive(selectedLead)}
                        className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Xác nhận tiếp nhận</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedLeadId(null)}
                      aria-label="Đóng chi tiết Lead"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Thanh Tab gọn nhẹ */}
              <div
                role="tablist"
                aria-label="Chi tiết hồ sơ Lead"
                className="flex items-center justify-between px-5 border-b border-slate-200 bg-slate-50/60 shrink-0 gap-2 overflow-x-auto"
              >
                <div className="flex items-center gap-1">
                  {[
                    {
                      id: 'info' as const,
                      label: 'Thông tin chung',
                      icon: canEditSelectedLead ? Pencil : Info,
                      count: null,
                    },
                    ...(canEditSelectedLead ||
                    canReassign ||
                    (selectedLead.spamStatus !== 'NONE' &&
                      ['SALES_LEAD', 'MKT_LEAD', 'BOD', 'ADMIN'].includes(
                        user?.roleCode || ''
                      ))
                      ? [
                          {
                            id: 'pipeline' as const,
                            label: 'Tiến độ & Phối hợp',
                            icon: Activity,
                            count: null,
                          },
                        ]
                      : []),
                    ...(canUploadAttachment && !selectedLead.isAnonymized
                      ? [
                          {
                            id: 'attachments' as const,
                            label: 'Tệp đính kèm',
                            icon: Paperclip,
                            count: selectedLead.attachments?.length || 0,
                          },
                        ]
                      : []),
                    {
                      id: 'activity' as const,
                      label: 'Lịch sử',
                      icon: History,
                      count: selectedLead.activities?.length || 0,
                    },
                  ].map((tab) => {
                    const isActive = leadDetailTab === tab.id;
                    const TabIcon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setLeadDetailTab(tab.id)}
                        className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap transition ${
                          isActive ? 'text-[#1E3A8A]' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <TabIcon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                        {tab.count !== null && tab.count > 0 && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[11px] font-semibold ${
                              isActive ? 'bg-blue-100 text-[#1E3A8A]' : 'bg-slate-200/70 text-slate-600'
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

                <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-500">
                  {canEditSelectedLead ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Cho phép sửa trực tiếp</span>
                    </>
                  ) : (
                    <span>Chế độ chỉ xem ({user?.roleName})</span>
                  )}
                </span>
              </div>

              {/* Nội dung cuộn */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-50/40">
                {/* Hiển thị thông báo lỗi / thành công ngay trong Modal để người dùng thấy tức thì */}
                {errorMsg && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-2">
                    <span>{errorMsg}</span>
                    <button
                      type="button"
                      onClick={() => setErrorMsg(null)}
                      className="text-rose-500 hover:text-rose-800 font-bold"
                    >
                      ×
                    </button>
                  </div>
                )}
                {feedbackMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between gap-2">
                    <span>{feedbackMsg}</span>
                    <button
                      type="button"
                      onClick={() => setFeedbackMsg(null)}
                      className="text-emerald-600 hover:text-emerald-900 font-bold"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* TAB 1: THÔNG TIN CHUNG (GỌN, RÕ RÀNG, KHÔNG RỐI) */}
                {leadDetailTab === 'info' && (
                  <div className="space-y-3.5 text-sm">
                    {/* 0. Khung Lịch Sử Khách Liên Hệ Lại — Tách biệt 2 kiểu: (1) Khách đã mua quay lại mua tiếp vs (2) Khách từng thất bại / bỏ trống thời gian nay Inbox hỏi lại */}
                    {(() => {
                      const cleanSelPhone = (selectedLead.phone || '').replace(/\D/g, '');
                      const normSelEmail = (selectedLead.email || '').trim().toLowerCase();
                      const normSelComp = (selectedLead.companyName || '').trim().toLowerCase();

                      const relatedHistoryLeads = leads.filter((other) => {
                        if (other.id === selectedLead.id || other.spamStatus !== 'NONE') return false;
                        const otherPhone = (other.phone || '').replace(/\D/g, '');
                        const phoneHit =
                          cleanSelPhone.length >= 8 &&
                          !cleanSelPhone.includes('*') &&
                          otherPhone === cleanSelPhone;
                        const emailHit =
                          normSelEmail.length >= 5 &&
                          !normSelEmail.includes('*') &&
                          (other.email || '').trim().toLowerCase() === normSelEmail;
                        const compHit =
                          normSelComp.length >= 5 &&
                          (other.companyName || '').trim().toLowerCase() === normSelComp;
                        return phoneHit || emailHit || compHit;
                      });

                      const mergeOrReopenActivities = (selectedLead.activities || []).filter(
                        (a) =>
                          a.actionType === 'reopen_lead' ||
                          Boolean(
                            a.noteContent &&
                              (a.noteContent.includes('[KHÁCH CŨ QUAY LẠI]') ||
                                a.noteContent.includes('[KHÁCH QUAY LẠI HỎI MUA]') ||
                                a.noteContent.includes('[TRÙNG SĐT')),
                          ),
                      );

                      if (
                        relatedHistoryLeads.length === 0 &&
                        selectedFraud.duplicateScenario === 'NONE' &&
                        mergeOrReopenActivities.length === 0
                      ) {
                        return null;
                      }

                      const formatStatusTextVi = (raw: string | null | undefined): string => {
                        if (!raw) return '';
                        return raw
                          .replace(/\bnew_lead\b/g, 'Vừa nhận thông tin')
                          .replace(/\bquoting\b/g, 'Đang soạn báo giá')
                          .replace(/\bquote_sent\b/g, 'Đã gửi báo giá')
                          .replace(/\bwon\b/g, 'Chốt thành công')
                          .replace(/\blost\b/g, 'Thất bại');
                      };

                      const hasWonBefore =
                        selectedFraud.duplicateScenario === 'SCENARIO_2_WON_RETURNING' ||
                        relatedHistoryLeads.some((h) => h.pipelineStatus === 'won') ||
                        mergeOrReopenActivities.some(
                          (a) =>
                            a.fromStatus === 'won' ||
                            Boolean(a.noteContent && a.noteContent.includes('[KHÁCH CŨ QUAY LẠI]')),
                        );

                      // KIỂU 1: KHÁCH ĐÃ MUA (CHỐT THÀNH CÔNG) — NAY QUAY LẠI MUA TIẾP
                      if (hasWonBefore) {
                        const wonHistoryLeads = relatedHistoryLeads.filter(
                          (h) => h.pipelineStatus === 'won',
                        );
                        return (
                          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50/90 border border-emerald-300 text-emerald-950 space-y-3 shadow-2xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-extrabold tracking-wide shadow-2xs inline-flex items-center gap-1.5">
                                  <span>💎 KHÁCH ĐÃ MUA — QUAY LẠI MUA TIẾP</span>
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full bg-white/90 border border-emerald-300 text-emerald-800 text-[11px] font-bold">
                                  Khách hàng thân thiết · SĐT {selectedLead.phone}
                                </span>
                              </div>
                              <span className="text-[11px] font-semibold text-emerald-800">
                                Đã từng chốt hợp đồng thành công trước đây
                              </span>
                            </div>

                            {/* Khối so sánh: Đơn hàng đã mua trước đây -> Lần liên hệ mua tiếp hiện tại */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                              <div className="p-3 rounded-xl bg-white border border-emerald-200 space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                                    ✅ Lần trước: Đã chốt thành công
                                  </span>
                                  <span className="text-slate-500 font-medium">
                                    {wonHistoryLeads[0]
                                      ? new Date(wonHistoryLeads[0].contactedAt).toLocaleDateString('vi-VN')
                                      : 'Hồ sơ đã mua'}
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-slate-900">
                                  {wonHistoryLeads[0]
                                    ? `${wonHistoryLeads[0].leadCode} · ${wonHistoryLeads[0].projectName || wonHistoryLeads[0].companyName || selectedLead.companyName || selectedLead.phone}`
                                    : `${selectedLead.companyName || selectedLead.contactName || selectedLead.phone}`}
                                </p>
                                <p className="text-[11px] text-slate-600">
                                  Sản phẩm đã mua:{' '}
                                  <strong className="text-emerald-800">
                                    {(wonHistoryLeads[0]?.products?.length
                                      ? wonHistoryLeads[0].products
                                      : selectedLead.products
                                    )
                                      .map((p) => p.productName)
                                      .join(', ') || 'Màn hình LED / Bảng điện tử'}
                                  </strong>
                                </p>
                              </div>

                              <div className="p-3 rounded-xl bg-white border border-teal-200 space-y-1">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="px-2 py-0.5 rounded bg-teal-600 text-white font-bold">
                                    🚀 Lần này: Liên hệ mua tiếp dự án mới
                                  </span>
                                  <span className="text-slate-500 font-medium">
                                    {mergeOrReopenActivities[0]
                                      ? new Date(mergeOrReopenActivities[0].createdAt).toLocaleString('vi-VN')
                                      : new Date(selectedLead.contactedAt).toLocaleString('vi-VN')}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-slate-800">
                                  {mergeOrReopenActivities[0]?.noteContent
                                    ? formatStatusTextVi(mergeOrReopenActivities[0].noteContent)
                                    : `Khách cũ liên hệ đặt mua thêm dự án: ${selectedLead.projectName || 'Dự án mới'}`}
                                </p>
                                <p className="text-[11px] text-teal-800 font-semibold">
                                  Trạng thái hiện tại: {PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}
                                </p>
                              </div>
                            </div>

                            {relatedHistoryLeads.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {relatedHistoryLeads.map((hist) => (
                                  <div
                                    key={hist.id}
                                    className="p-2.5 rounded-xl bg-white/95 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                  >
                                    <div className="text-xs text-slate-700 min-w-0">
                                      <span className="font-mono font-bold text-emerald-800 mr-2">
                                        {hist.leadCode}
                                      </span>
                                      <strong>{hist.companyName || hist.contactName || hist.phone}</strong>
                                      {hist.projectName ? ` · Dự án cũ: ${hist.projectName}` : ''}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {canEditSelectedLead && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (hist.companyName) setEditCompanyName(hist.companyName);
                                            if (hist.contactName) setEditContactName(hist.contactName);
                                            if (hist.email) setEditEmail(hist.email);
                                            if (hist.installationAddress)
                                              setEditAddress(hist.installationAddress);
                                            setFeedbackMsg(
                                              `Đã kế thừa thông tin công ty & địa chỉ từ hồ sơ khách cũ ${hist.leadCode}.`,
                                            );
                                          }}
                                          className="h-7 px-2.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold transition"
                                        >
                                          ⚡ Kế thừa thông tin khách cũ
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedLeadId(hist.id);
                                          setLeadDetailTab('info');
                                        }}
                                        className="h-7 px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition"
                                      >
                                        Xem đơn cũ {hist.leadCode} →
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // KIỂU 2: KHÁCH TỪNG THẤT BẠI (CHƯA CHỐT) HOẶC BỎ TRỐNG THỜI GIAN — SAU ĐÓ INBOX / LIÊN HỆ HỎI LẠI
                      const latestReopenAct = mergeOrReopenActivities[0] || null;
                      const priorHistLead = relatedHistoryLeads[0] || null;
                      const priorLostReason =
                        selectedLead.lostReason ||
                        latestReopenAct?.reason ||
                        priorHistLead?.lostReason ||
                        null;

                      return (
                        <div className="p-4 rounded-2xl bg-amber-50/75 border border-amber-300 text-slate-900 space-y-3 shadow-2xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-extrabold tracking-wide shadow-2xs">
                                🔄 KHÁCH TỪNG CHƯA CHỐT / GIÁN ĐOẠN — NAY INBOX HỎI LẠI
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full bg-white border border-amber-300 text-amber-900 text-[11px] font-bold">
                                Gộp 1 SĐT duy nhất: {selectedLead.phone}
                              </span>
                            </div>
                          </div>

                          {/* Tiến trình 2 bước rõ ràng: [1. Lần trước: Thất bại / Bỏ trống thời gian] ---> [2. Sau đó: Inbox hỏi lại] */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {/* Bước 1: Trạng thái Thất bại trước đó hoặc Bỏ trống thông tin thời gian */}
                            <div className="p-3 rounded-xl bg-white border border-rose-200/90 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200 font-bold">
                                  1. Lần trước: {priorLostReason ? 'Thất bại / Chưa chốt' : 'Tạm ngưng / Bỏ trống'}
                                </span>
                                <span className="text-slate-400 italic">
                                  {priorHistLead
                                    ? `Ngày hỏi cũ: ${new Date(priorHistLead.contactedAt).toLocaleDateString('vi-VN')}`
                                    : 'Thời gian trước: Bỏ trống / Gián đoạn'}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-rose-800">
                                {priorLostReason
                                  ? `Lý do chưa chốt lần trước: ${priorLostReason}`
                                  : 'Khách từng hỏi thông tin nhưng bỏ trống một thời gian chưa chốt'}
                              </p>
                              {priorHistLead && (
                                <p className="text-[11px] text-slate-600 truncate">
                                  Hồ sơ cũ: <strong className="font-mono">{priorHistLead.leadCode}</strong>
                                  {priorHistLead.projectName ? ` · ${priorHistLead.projectName}` : ''}
                                </p>
                              )}
                            </div>

                            {/* Bước 2: Sau đó khách Inbox / Liên hệ hỏi lại */}
                            <div className="p-3 rounded-xl bg-white border border-blue-200/90 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="px-2 py-0.5 rounded bg-[#1E3A8A] text-white font-bold">
                                  2. Sau đó: Khách Inbox / Liên hệ hỏi lại
                                </span>
                                <span className="text-slate-600 font-semibold">
                                  {latestReopenAct
                                    ? new Date(latestReopenAct.createdAt).toLocaleString('vi-VN')
                                    : new Date(selectedLead.contactedAt).toLocaleString('vi-VN')}
                                </span>
                              </div>
                              <p className="text-xs font-semibold text-slate-800">
                                {latestReopenAct?.noteContent
                                  ? formatStatusTextVi(latestReopenAct.noteContent)
                                  : 'Khách hàng liên hệ lại tiếp tục hỏi mua dự án trên cùng số điện thoại.'}
                              </p>
                              <p className="text-[11px] text-[#1E3A8A] font-bold">
                                Tiến độ hiện tại: {PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}
                              </p>
                            </div>
                          </div>

                          {relatedHistoryLeads.length > 0 && (
                            <div className="space-y-1.5">
                              {relatedHistoryLeads.map((hist) => (
                                <div
                                  key={hist.id}
                                  className="p-2.5 rounded-xl bg-white border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                >
                                  <div className="text-xs text-slate-700 min-w-0">
                                    <span className="font-mono font-bold text-[#1E3A8A] mr-2">
                                      {hist.leadCode}
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded border text-[10px] font-bold mr-2 ${
                                        STATUS_BADGE_STYLES[hist.pipelineStatus]
                                      }`}
                                    >
                                      {PIPELINE_STATUS_LABELS[hist.pipelineStatus]}
                                    </span>
                                    <strong>{hist.companyName || hist.contactName || hist.phone}</strong>
                                    {hist.projectName ? ` · Dự án: ${hist.projectName}` : ''}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {canEditSelectedLead && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (hist.companyName) setEditCompanyName(hist.companyName);
                                          if (hist.contactName) setEditContactName(hist.contactName);
                                          if (hist.projectName) setEditProjectName(hist.projectName);
                                          if (hist.email) setEditEmail(hist.email);
                                          if (hist.installationAddress)
                                            setEditAddress(hist.installationAddress);
                                          if (hist.products.length > 0) {
                                            setEditProductIds(hist.products.map((p) => p.id));
                                          }
                                          setFeedbackMsg(
                                            `Đã kế thừa thông tin khách hàng từ hồ sơ cũ ${hist.leadCode}.`,
                                          );
                                        }}
                                        className="h-7 px-2.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition"
                                      >
                                        ⚡ Kế thừa thông tin cũ
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedLeadId(hist.id);
                                        setLeadDetailTab('info');
                                      }}
                                      className="h-7 px-2.5 rounded-lg bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold transition"
                                    >
                                      Xem hồ sơ {hist.leadCode} →
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {canEditSelectedLead ? (
                      <form onSubmit={(e) => void handleUpdateLeadInfo(e)} className="space-y-3.5">
                        {/* 1. Khối Thông tin Khách hàng & Công trình (Lưới 3 cột gọn gàng) */}
                        <div className="p-4 rounded-xl border border-slate-200/90 bg-white space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-900 text-sm">
                              1. Thông tin Khách hàng &amp; Địa điểm Công trình
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Phiên bản v{selectedLead.version}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Số điện thoại *
                              </label>
                              <input
                                type="text"
                                required
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 font-mono font-semibold text-[#1E3A8A] focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Người liên hệ
                              </label>
                              <input
                                type="text"
                                value={editContactName}
                                onChange={(e) => setEditContactName(e.target.value)}
                                placeholder="Họ tên khách hàng..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 font-medium text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Email
                              </label>
                              <input
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                placeholder="email@congty.vn"
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Đơn vị / Công ty
                              </label>
                              <input
                                type="text"
                                value={editCompanyName}
                                onChange={(e) => setEditCompanyName(e.target.value)}
                                placeholder="Tên doanh nghiệp / đơn vị..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 font-medium text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Tên dự án / Công trình
                              </label>
                              <input
                                type="text"
                                value={editProjectName}
                                onChange={(e) => setEditProjectName(e.target.value)}
                                placeholder="VD: Màn hình LED Hội trường..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 font-medium text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Nguồn dự án *
                              </label>
                              <select
                                value={
                                  !editSelfSource ||
                                  editSelfSource === 'Nhập tay' ||
                                  editSelfSource === 'Chưa xác định'
                                    ? selectedLead.contactChannel === 'zalo'
                                      ? 'Zalo'
                                      : selectedLead.contactChannel === 'form_web'
                                        ? 'Website Toàn Trung'
                                        : selectedLead.contactChannel === 'google_lead_form'
                                          ? 'Google Ads'
                                          : 'SĐT / Hotline'
                                    : editSelfSource
                                }
                                onChange={(e) => setEditSelfSource(e.target.value)}
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                              >
                                <option value="SĐT / Hotline">SĐT / Hotline</option>
                                <option value="Zalo">Zalo</option>
                                <option value="Website Toàn Trung">Website Toàn Trung</option>
                                <option value="Google Ads">Google Ads</option>
                                <option value="Fanpage Facebook">Fanpage Facebook</option>
                                <option value="Email Dự án">Email Dự án</option>
                                <option value="Khách cũ / Giới thiệu">Khách cũ / Giới thiệu</option>
                                <option value="Hồ sơ Đấu thầu">Hồ sơ Đấu thầu</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Khu vực công trình
                              </label>
                              <select
                                value={editAreaType}
                                onChange={(e) =>
                                  setEditAreaType(e.target.value as 'hcm' | 'other_province')
                                }
                                className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-800"
                              >
                                <option value="hcm">Nội thành TP. Hồ Chí Minh</option>
                                <option value="other_province">Tỉnh / Thành phố khác</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                {editAreaType === 'hcm' ? 'Quận / Huyện TP.HCM' : 'Tỉnh / Thành phố'}
                              </label>
                              {editAreaType === 'hcm' ? (
                                <select
                                  value={editDistrict}
                                  onChange={(e) => setEditDistrict(e.target.value)}
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
                                  value={editProvince}
                                  onChange={(e) => setEditProvince(e.target.value)}
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
                                type="text"
                                value={editAddress}
                                onChange={(e) => setEditAddress(e.target.value)}
                                placeholder="Số nhà, đường, KCN..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* 2. Khối Sản phẩm quan tâm (Bấm mục nào sổ mục đó ra bên phải theo đúng chuẩn Ảnh 5) */}
                        <div className="p-4 rounded-xl border border-slate-200/90 bg-white space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Layers className="w-4 h-4 text-[#1E3A8A]" />
                              <span className="font-bold text-slate-900 text-sm">
                                2. Sản phẩm quan tâm *
                              </span>
                            </div>
                            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-bold">
                              Đã chọn {editProductIds.length + editCustomServiceItems.length} sản phẩm
                            </span>
                          </div>

                          {/* Thanh tìm kiếm sản phẩm + Các thẻ sản phẩm đã chọn */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="relative w-full sm:w-80 shrink-0">
                              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={editProductSearch}
                                onChange={(e) => setEditProductSearch(e.target.value)}
                                placeholder="Tìm sản phẩm (ví dụ: Màn hình LED, Bảng điện tử...)"
                                className="w-full h-8 pl-8 pr-7 rounded-lg border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                              />
                              {editProductSearch && (
                                <button
                                  type="button"
                                  onClick={() => setEditProductSearch('')}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold"
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {products
                                .filter((p) => editProductIds.includes(p.id))
                                .map((sel) => (
                                  <span
                                    key={sel.id}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-semibold"
                                  >
                                    <span>
                                      {sel.productName
                                        .replace(/^Khác\s*\(([^)]+)\)$/i, '$1 khác')
                                        .replace(/\s*\([^)]*\)/g, '')
                                        .trim()}
                                    </span>
                                    {editProductIds.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditProductIds((prev) =>
                                            prev.filter((id) => id !== sel.id),
                                          )
                                        }
                                        className="hover:text-rose-600 ml-0.5 font-bold"
                                        title="Bỏ chọn sản phẩm này"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </span>
                                ))}
                              {editCustomServiceItems.map((item) => (
                                <span
                                  key={item}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold"
                                >
                                  <span>{item}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditCustomServiceItems((prev) =>
                                        prev.filter((x) => x !== item),
                                      )
                                    }
                                    className="hover:text-rose-600 ml-0.5 font-bold"
                                    title="Xóa mục này"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Bố cục 2 cột: Cột trái chọn mục -> Cột phải chỉ sổ các sản phẩm thuộc mục đó */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start pt-1">
                            <div className="sm:col-span-4 flex flex-col gap-1">
                              {(
                                [
                                  {
                                    category: 'MAN_HINH_LED' as const,
                                    title: 'Màn hình LED',
                                    count: products.filter((p) => p.category === 'MAN_HINH_LED')
                                      .length,
                                  },
                                  {
                                    category: 'BANG_DIEN_TU' as const,
                                    title: 'Bảng điện tử & Hiển thị số',
                                    count: products.filter((p) => p.category === 'BANG_DIEN_TU')
                                      .length,
                                  },
                                  {
                                    category: 'KHAC' as const,
                                    title: 'Dịch vụ / Nhu cầu khác',
                                    count: products.filter((p) => p.category === 'KHAC').length,
                                  },
                                ]
                              ).map((cat) => {
                                const isActive =
                                  !editProductSearch.trim() &&
                                  editActiveProductCategory === cat.category;
                                return (
                                  <button
                                    key={cat.category}
                                    type="button"
                                    onClick={() => {
                                      setEditProductSearch('');
                                      setEditActiveProductCategory(cat.category);
                                    }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center justify-between ${
                                      isActive
                                        ? 'bg-blue-50/90 text-[#1E3A8A] font-bold border-l-4 border-l-[#2563EB]'
                                        : 'text-slate-700 hover:bg-slate-50 font-medium'
                                    }`}
                                  >
                                    <span>{cat.title}</span>
                                    <span className="text-[11px] text-slate-400">
                                      ({cat.count})
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            <div className="sm:col-span-8 p-3 rounded-xl border border-slate-200/90 bg-slate-50/40 space-y-2.5">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {products
                                  .filter((p) => {
                                    const q = editProductSearch.trim().toLowerCase();
                                    if (q) {
                                      return p.productName.toLowerCase().includes(q);
                                    }
                                    return p.category === editActiveProductCategory;
                                  })
                                  .map((p) => {
                                    const checked = editProductIds.includes(p.id);
                                    const cleanName = p.productName
                                      .replace(/^Khác\s*\(([^)]+)\)$/i, '$1 khác')
                                      .replace(/\s*\([^)]*\)/g, '')
                                      .trim();
                                    return (
                                      <label
                                        key={p.id}
                                        onClick={() => {
                                          setEditProductIds((prev) =>
                                            prev.includes(p.id)
                                              ? prev.length > 1
                                                ? prev.filter((id) => id !== p.id)
                                                : prev
                                              : [...prev, p.id],
                                          );
                                        }}
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
                                        <span className="truncate">{cleanName}</span>
                                      </label>
                                    );
                                  })}
                              </div>

                              {(editActiveProductCategory === 'KHAC' ||
                                editProductSearch.trim() !== '') && (
                                <div className="pt-2 border-t border-slate-200/80 flex gap-1.5">
                                  <input
                                    type="text"
                                    value={editCustomServiceDraft}
                                    onChange={(e) => setEditCustomServiceDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const trimmed = editCustomServiceDraft.trim();
                                        if (!trimmed) return;
                                        setEditCustomServiceItems((prev) =>
                                          prev.includes(trimmed) ? prev : [...prev, trimmed],
                                        );
                                        const khacProd = products.find(
                                          (p) => p.category === 'KHAC',
                                        );
                                        if (khacProd) {
                                          setEditProductIds((prev) =>
                                            prev.includes(khacProd.id)
                                              ? prev
                                              : [...prev, khacProd.id],
                                          );
                                        }
                                        setEditCustomServiceDraft('');
                                      }
                                    }}
                                    placeholder="Nhập thêm dịch vụ / nhu cầu khác..."
                                    className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-amber-300 bg-white text-xs text-slate-800 focus:border-[#1E3A8A] outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const trimmed = editCustomServiceDraft.trim();
                                      if (!trimmed) return;
                                      setEditCustomServiceItems((prev) =>
                                        prev.includes(trimmed) ? prev : [...prev, trimmed],
                                      );
                                      const khacProd = products.find(
                                        (p) => p.category === 'KHAC',
                                      );
                                      if (khacProd) {
                                        setEditProductIds((prev) =>
                                          prev.includes(khacProd.id)
                                            ? prev
                                            : [...prev, khacProd.id],
                                        );
                                      }
                                      setEditCustomServiceDraft('');
                                    }}
                                    className="h-8 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 transition"
                                  >
                                    <span>+ Thêm</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Ghi chú kích thước / cấu hình kỹ thuật
                              </label>
                              <input
                                type="text"
                                value={editCustomProductNote}
                                onChange={(e) => setEditCustomProductNote(e.target.value)}
                                placeholder="VD: Kích thước 4m x 2.5m, lắp hội trường..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-slate-800 text-xs focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-600 mb-1">
                                Ghi chú tư vấn
                              </label>
                              <input
                                type="text"
                                value={editUpdateNote}
                                onChange={(e) => setEditUpdateNote(e.target.value)}
                                placeholder="VD: Đã gửi phương án sơ bộ qua Zalo..."
                                className="w-full h-9 px-3 rounded-lg border border-slate-200 text-slate-800 text-xs focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Thanh Lưu cố định gọn gàng */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedLeadId(null)}
                            className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition"
                          >
                            Đóng
                          </button>
                          <button
                            type="submit"
                            disabled={submitting}
                            className="h-9 px-5 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>
                              {submitting ? 'Đang lưu...' : 'Lưu cập nhật'}
                            </span>
                          </button>
                        </div>
                      </form>
                    ) : (
                      /* Chế độ Chỉ xem gọn gàng (UC01 3.2: Đặt nhóm Nguồn, Chiến dịch, Thời gian, Link đổ về, Thiết bị, Địa chỉ ở đầu cho Marketing & Ads) */
                      <div className="space-y-3.5">
                        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2.5">
                          <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                            <span className="font-bold text-[#1E3A8A] text-sm">
                              1. Thông tin Nguồn, Chiến dịch, Thiết bị &amp; Địa chỉ (UC01 3.2)
                            </span>
                            <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-[11px] font-semibold text-indigo-900">
                              {selectedLead.tracking?.marketingSource ||
                                CONTACT_CHANNEL_LABELS[selectedLead.contactChannel] ||
                                'Nhập tay'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-slate-700">
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                              <span className="text-slate-500 block">Nguồn &amp; Kênh tự khai:</span>
                              <strong className="text-slate-900">
                                {selectedLead.tracking?.marketingSource ||
                                  CONTACT_CHANNEL_LABELS[selectedLead.contactChannel]}
                                {selectedLead.selfReportedSource ? ` · ${selectedLead.selfReportedSource}` : ''}
                              </strong>
                            </div>
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                              <span className="text-slate-500 block">Chiến dịch quảng cáo:</span>
                              <strong className="text-[#1E3A8A]">
                                {selectedLead.tracking?.campaignName ||
                                  selectedLead.tracking?.utmCampaign ||
                                  'Không thuộc chiến dịch Ads'}
                              </strong>
                            </div>
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                              <span className="text-slate-500 block">Thời gian khách liên hệ:</span>
                              <strong className="font-mono text-slate-900">
                                {new Date(selectedLead.contactedAt).toLocaleString('vi-VN')}
                              </strong>
                            </div>
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80 sm:col-span-2">
                              <span className="text-slate-500 block">Link đổ về (Landing Page) &amp; GCLID:</span>
                              <strong className="font-mono text-slate-800 break-all">
                                {selectedLead.tracking?.landingPageUrl || 'Trực tiếp / Không qua Landing Page'}
                                {selectedLead.tracking?.gclid ? ` · GCLID: ${selectedLead.tracking.gclid}` : ''}
                              </strong>
                            </div>
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200/80">
                              <span className="text-slate-500 block">Thiết bị &amp; Khu vực địa lý:</span>
                              <strong className="text-slate-900">
                                {selectedLead.tracking?.deviceType || 'Mọi thiết bị'} ·{' '}
                                {selectedLead.areaType === 'hcm'
                                  ? `TP.HCM (${selectedLead.hcmDistrict || ''})`
                                  : selectedLead.province || 'Chưa chọn tỉnh'}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-900 text-sm">
                              Hồ sơ khách hàng
                            </span>
                            <span className="font-mono text-slate-400 text-xs">
                              {new Date(selectedLead.contactedAt).toLocaleDateString('vi-VN')}
                            </span>
                          </div>
                          <div className="space-y-1.5 text-xs text-slate-700">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500">Số điện thoại:</span>
                              <span className="font-mono font-bold text-[#1E3A8A]">
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
                              <span className="text-slate-500">Khu vực:</span>
                              <span className="font-semibold">
                                {selectedLead.areaType === 'hcm'
                                  ? `TP.HCM · ${selectedLead.hcmDistrict || ''}`
                                  : selectedLead.province || 'Chưa chọn tỉnh'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2.5">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-900 text-sm">
                              Sản phẩm &amp; Theo dõi
                            </span>
                            {selectedHorizon.key !== 'none' && (
                              <span
                                className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${selectedHorizon.badgeClass}`}
                              >
                                {selectedHorizon.shortLabel}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedLead.products.map((p) => (
                              <span
                                key={p.id}
                                className="px-2.5 py-1 rounded-md bg-blue-50 border border-blue-200/80 text-[#1E3A8A] font-medium text-xs"
                              >
                                {p.productName}
                              </span>
                            ))}
                          </div>
                          {selectedLead.customProductNote && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                              {selectedLead.customProductNote}
                            </p>
                          )}
                        </div>
                      </div>
                      </div>
                    )}
                  </div>
                )}

              {/* TAB 2: TIẾN ĐỘ PIPELINE & PHỐI HỢP (Theo đúng chuẩn Ảnh 2) */}
              {leadDetailTab === 'pipeline' && (
                <div className="space-y-4 text-xs sm:text-sm">
                  {/* Thanh thông tin tóm tắt 4 cột trên cùng */}
                  <div className="p-3.5 rounded-2xl border border-slate-200 bg-white grid grid-cols-2 lg:grid-cols-4 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 shadow-2xs">
                    <div className="flex items-center gap-2.5 pr-2">
                      <span className="w-9 h-9 rounded-full bg-blue-50 border border-blue-100 text-[#1E3A8A] grid place-items-center shrink-0">
                        <UserCheck className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-500 block">
                          Nhân viên kinh doanh phụ trách
                        </span>
                        <strong className="text-slate-900 font-bold text-xs sm:text-sm truncate block">
                          {selectedLead.assignedSalesName || 'Chưa phân công'}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 sm:pl-3 pt-2 sm:pt-0">
                      <span className="w-9 h-9 rounded-full bg-violet-50 border border-violet-100 text-violet-700 grid place-items-center shrink-0">
                        <Layers className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-500 block mb-0.5">
                          Trạng thái Lead
                        </span>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full border text-xs ${
                            STATUS_BADGE_STYLES[selectedLead.pipelineStatus]
                          }`}
                        >
                          {PIPELINE_STATUS_LABELS[selectedLead.pipelineStatus]}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 lg:pl-3 pt-2 lg:pt-0">
                      <span className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 text-slate-700 grid place-items-center shrink-0">
                        <Calendar className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-500 block">Ngày nhận</span>
                        <strong className="text-slate-900 font-bold text-xs sm:text-sm block">
                          {new Date(selectedLead.contactedAt).toLocaleDateString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}{' '}
                          {new Date(selectedLead.contactedAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 sm:pl-3 pt-2 lg:pt-0">
                      <span className="w-9 h-9 rounded-full bg-amber-50 border border-amber-200 text-amber-600 grid place-items-center shrink-0">
                        <Star className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-[11px] text-slate-500 block mb-0.5">
                          Mức độ ưu tiên
                        </span>
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            selectedLead.projectName ||
                            selectedLead.companyName ||
                            selectedFraud.duplicateScenario === 'SCENARIO_2_WON_RETURNING'
                              ? 'bg-rose-50 border border-rose-200 text-rose-700'
                              : 'bg-blue-50 border border-blue-200 text-[#1E3A8A]'
                          }`}
                        >
                          {selectedLead.projectName ||
                          selectedLead.companyName ||
                          selectedFraud.duplicateScenario === 'SCENARIO_2_WON_RETURNING'
                            ? 'Cao'
                            : 'Tiêu chuẩn'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Lưới 2x2: Tiến độ Pipeline | Chuyển giao NVKD | Kiểm soát rủi ro | Ghi chú phối hợp */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    {/* CỘT TRÁI (7/12): Tiến độ Pipeline + Kiểm soát rủi ro */}
                    <div className="lg:col-span-7 space-y-4">
                      {/* 1. Tiến độ Pipeline với thanh 5 bước trực quan (Bỏ ô lý do khi chưa chọn Thất bại) */}
                      <form
                        onSubmit={(e) => void handleTransitionPipeline(e)}
                        className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 space-y-4 shadow-2xs"
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-bold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                            <RefreshCw className="w-4 h-4 text-[#1E3A8A]" />
                            <span>Tiến độ Pipeline</span>
                          </p>
                          <span className="text-[11px] text-slate-400">
                            Phiên bản v{selectedLead.version}
                          </span>
                        </div>

                        {/* Sơ đồ 5 bước ngang có thể bấm chọn trực tiếp */}
                        <div className="relative pt-2 pb-1 px-2">
                          <div className="absolute left-8 right-8 top-6 h-0.5 bg-slate-200" />
                          <div className="relative grid grid-cols-5 gap-1">
                            {PIPELINE_STATUSES.map((st, idx) => {
                              const isSelected = targetStatus === st;
                              const isCurrent = selectedLead.pipelineStatus === st;
                              const isWon = st === 'won';
                              const isLost = st === 'lost';
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  disabled={!canEditSelectedLead || submitting}
                                  onClick={() => setTargetStatus(st)}
                                  className="group flex flex-col items-center text-center focus:outline-none disabled:cursor-not-allowed"
                                >
                                  <span
                                    className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold border-2 transition shadow-2xs ${
                                      isSelected
                                        ? isLost
                                          ? 'bg-rose-600 border-rose-600 text-white ring-4 ring-rose-100'
                                          : isWon
                                            ? 'bg-emerald-600 border-emerald-600 text-white ring-4 ring-emerald-100'
                                            : 'bg-[#2563EB] border-[#2563EB] text-white ring-4 ring-blue-100'
                                        : isCurrent
                                          ? 'bg-blue-50 border-[#2563EB] text-[#1E3A8A]'
                                          : isWon
                                            ? 'bg-white border-emerald-400 text-emerald-600 group-hover:bg-emerald-50'
                                            : isLost
                                              ? 'bg-white border-rose-400 text-rose-600 group-hover:bg-rose-50'
                                              : 'bg-white border-slate-300 text-slate-500 group-hover:border-blue-400'
                                    }`}
                                  >
                                    {isWon ? '✓' : isLost ? '✕' : isSelected ? '●' : idx + 1}
                                  </span>
                                  <span
                                    className={`mt-2 text-[11px] leading-tight px-1 ${
                                      isSelected
                                        ? 'font-bold text-[#1E3A8A]'
                                        : isCurrent
                                          ? 'font-semibold text-slate-800'
                                          : 'font-medium text-slate-500'
                                    }`}
                                  >
                                    {PIPELINE_STATUS_LABELS[st]}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {targetStatus === 'quote_sent' && canEditSelectedLead && (
                          <div className="space-y-2">
                            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={markQuoteResponded}
                                onChange={(e) => setMarkQuoteResponded(e.target.checked)}
                              />
                              <span>
                                Đánh dấu khách hàng đã phản hồi báo giá (Tắt nhắc việc quá hạn)
                              </span>
                            </label>

                            {selectedLead.isPriceCheckSuspect && (
                              <div className="p-3 rounded-xl bg-orange-50 border border-orange-300 text-orange-950 space-y-1">
                                <p className="font-bold text-xs flex items-center gap-1.5">
                                  <ShieldAlert className="w-4 h-4 text-orange-600 shrink-0" />
                                  <span>
                                    Chốt chặn Bảo mật Giá: Hồ sơ đang có cảnh báo Nghi khảo giá / dò giá
                                  </span>
                                </p>
                                <label className="inline-flex items-start gap-2 cursor-pointer text-[11px] font-semibold">
                                  <input
                                    type="checkbox"
                                    checked={bypassPriceCheckConfirmed}
                                    onChange={(e) =>
                                      setBypassPriceCheckConfirmed(e.target.checked)
                                    }
                                    className="mt-0.5"
                                  />
                                  <span>
                                    Tôi xác nhận đã thẩm tra địa chỉ công trình thực tế hoặc đã được Quản lý duyệt gửi báo giá.
                                  </span>
                                </label>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Khi chọn Thất bại (hoặc mở lại từ Thất bại): Chỉ hiện duy nhất 1 ô nhập lý do + nút Cập nhật Pipeline */}
                        {targetStatus === 'lost' || selectedLead.pipelineStatus === 'lost' ? (
                          <div className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/80 space-y-2 animate-in fade-in duration-150">
                            <label className="block text-xs font-bold text-rose-900">
                              {targetStatus === 'lost'
                                ? 'Lý do thất bại *'
                                : 'Lý do mở lại hồ sơ Lead *'}
                            </label>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                              <input
                                type="text"
                                required
                                disabled={!canEditSelectedLead}
                                value={statusReason}
                                onChange={(e) => setStatusReason(e.target.value)}
                                placeholder={
                                  targetStatus === 'lost'
                                    ? 'Nhập lý do thất bại...'
                                    : 'Nhập lý do mở lại hồ sơ Lead...'
                                }
                                className="flex-1 h-9 px-3 rounded-xl border border-rose-300 bg-white text-xs text-slate-800 focus:outline-none focus:border-rose-600"
                              />
                              {canEditSelectedLead && (
                                <button
                                  type="submit"
                                  disabled={submitting}
                                  className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 shadow-2xs transition"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Cập nhật Pipeline</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                            <div className="relative flex-1">
                              <Pencil className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                disabled={!canEditSelectedLead}
                                value={statusNote}
                                onChange={(e) => setStatusNote(e.target.value)}
                                placeholder="Ghi chú tiến độ, nội dung trao đổi..."
                                className="w-full h-9 pl-8 pr-3 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                              />
                            </div>
                            {canEditSelectedLead && (
                              <button
                                type="submit"
                                disabled={submitting}
                                className="h-9 px-4 rounded-xl bg-[#2563EB] hover:bg-[#1E3A8A] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 shadow-2xs transition"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Cập nhật Pipeline</span>
                              </button>
                            )}
                          </div>
                        )}
                      </form>

                      {/* 3. Kiểm soát rủi ro (Cảnh báo nghi dò giá + Đánh dấu Spam) */}
                      {canEditSelectedLead && (
                        <div className="p-4 sm:p-5 rounded-2xl bg-orange-50/60 border border-orange-200/90 space-y-3.5 shadow-2xs">
                          <p className="font-bold text-orange-950 flex items-center gap-2 text-sm sm:text-base">
                            <ShieldAlert className="w-4 h-4 text-orange-600" />
                            <span>Kiểm soát rủi ro</span>
                          </p>

                          {/* Cảnh báo nghi dò giá */}
                          <form
                            onSubmit={(e) => void handleCreatePriceAlert(e)}
                            className="space-y-1.5"
                          >
                            <label className="text-xs font-bold text-orange-900 flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                              <span>Cảnh báo nghi dò giá</span>
                            </label>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <input
                                type="text"
                                required
                                value={priceCheckReason}
                                onChange={(e) => setPriceCheckReason(e.target.value)}
                                placeholder="Căn cứ xác định đối thủ khảo giá..."
                                className="flex-1 h-9 px-3 rounded-xl border border-orange-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-orange-500"
                              />
                              <button
                                type="submit"
                                disabled={submitting}
                                className="h-9 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shrink-0 shadow-2xs transition"
                              >
                                Phát cảnh báo
                              </button>
                            </div>
                          </form>

                          {/* Đánh dấu Spam */}
                          <form
                            onSubmit={(e) => void handleMarkSpam(e)}
                            className="space-y-1.5 pt-2 border-t border-orange-200/60"
                          >
                            <label className="text-xs font-bold text-orange-900 flex items-center gap-1.5">
                              <Ban className="w-3.5 h-3.5 text-orange-600" />
                              <span>Đánh dấu Spam</span>
                            </label>
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <select
                                value={spamReason}
                                onChange={(e) =>
                                  setSpamReason(e.target.value as (typeof SPAM_REASONS)[number])
                                }
                                className="flex-1 h-9 px-3 rounded-xl border border-orange-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-500"
                              >
                                {SPAM_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                disabled={submitting}
                                className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shrink-0 shadow-2xs transition"
                              >
                                Gắn cờ Spam
                              </button>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              SĐT sai / Nhầm máy tự loại khỏi báo cáo Ads; Đối thủ khảo giá vào diện chờ xác nhận.
                            </p>
                          </form>

                          {/* Duyệt Spam dành cho Quản lý / Admin nếu Lead đang có cờ Spam */}
                          {selectedLead.spamStatus !== 'NONE' && canReassign && (
                            <div className="p-3 rounded-xl bg-white border border-orange-300 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-amber-950">
                                <span className="font-bold block">
                                  Đang gắn cờ Spam: {selectedLead.spamReason || 'Chưa rõ lý do'}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  Quản lý duyệt loại khỏi báo cáo Ads hoặc khôi phục Lead
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => void handleReviewSpam('confirm_spam')}
                                  className="h-8 px-3 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold"
                                >
                                  Duyệt loại khỏi Ads
                                </button>
                                <button
                                  type="button"
                                  disabled={submitting}
                                  onClick={() => void handleReviewSpam('restore_lead')}
                                  className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold"
                                >
                                  Khôi phục Lead
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* CỘT PHẢI (5/12): Chuyển giao Nhân viên kinh doanh */}
                    <div className="lg:col-span-5 space-y-4">
                      {/* 2. Chuyển giao Nhân viên kinh doanh */}
                      {canReassign && (
                        <form
                          onSubmit={(e) => void handleReassignSales(e)}
                          className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 space-y-3.5 shadow-2xs"
                        >
                          <p className="font-bold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
                            <ArrowRightLeft className="w-4 h-4 text-[#1E3A8A]" />
                            <span>Chuyển giao Nhân viên kinh doanh</span>
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                Lý do chuyển <span className="text-rose-600">*</span>
                              </label>
                              <select
                                value={reassignCategory}
                                onChange={(e) =>
                                  setReassignCategory(
                                    e.target.value as (typeof REASSIGN_REASONS)[number],
                                  )
                                }
                                className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                              >
                                {REASSIGN_REASONS.map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">
                                NVKD nhận <span className="text-rose-600">*</span>
                              </label>
                              <select
                                required
                                value={reassignTargetId}
                                onChange={(e) =>
                                  setReassignTargetId(
                                    e.target.value ? Number(e.target.value) : '',
                                  )
                                }
                                className="w-full h-9 px-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                              >
                                <option value="">-- Chọn nhân viên --</option>
                                {filteredSalesForReassign.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.fullName} ({s.activeLeadCount} Lead)
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div>
                            <textarea
                              rows={2}
                              value={reassignDetail}
                              onChange={(e) => setReassignDetail(e.target.value)}
                              placeholder="Ghi chú bàn giao..."
                              className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={submitting || !reassignTargetId}
                            className="w-full h-9 px-4 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-2xs transition"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>Chuyển giao</span>
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: TỆP ĐÍNH KÈM (Hỗ trợ đa định dạng + Sửa tên / Thay tệp + Xóa tệp) */}
              {leadDetailTab === 'attachments' && (
                <div className="space-y-4 text-xs">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 space-y-4 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Paperclip className="w-4 h-4 text-[#1E3A8A]" />
                        <div>
                          <h3 className="font-display font-bold text-slate-900 text-sm sm:text-base">
                            Tệp đính kèm hiện trạng công trình, bản vẽ &amp; hồ sơ dự án
                          </h3>
                          <p className="text-slate-500 text-[11px]">
                            Hỗ trợ đa định dạng: Ảnh/Video (PNG, JPG, WEBP, HEIC, MP4), Bản vẽ (CAD DWG/DXF, PDF, AI, CDR), Văn phòng (Word, Excel, PowerPoint, TXT) &amp; File nén (ZIP, RAR)
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] font-bold text-xs">
                        {selectedLead.attachments?.length || 0} tệp đã tải lên
                      </span>
                    </div>

                    {canUploadAttachment && !selectedLead.isAnonymized && (
                      <form
                        onSubmit={(e) => void handleUploadAttachment(e)}
                        className="p-4 rounded-2xl bg-slate-50/80 border border-dashed border-blue-300 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2.5 flex-1">
                            <select
                              value={attachmentType}
                              onChange={(e) =>
                                setAttachmentType(
                                  e.target.value as 'site_photo' | 'customer_drawing_doc' | 'other',
                                )
                              }
                              className="h-9 px-3 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 text-xs"
                            >
                              <option value="site_photo">📷 Ảnh / Video hiện trạng công trình</option>
                              <option value="customer_drawing_doc">📐 Bản vẽ kỹ thuật (CAD / PDF / 3D)</option>
                              <option value="other">📄 Hồ sơ dự án (Word / Excel / ZIP / Khác)</option>
                            </select>
                            <input
                              ref={attachmentInputRef}
                              type="file"
                              multiple
                              accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.heic,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.dwg,.dxf,.cdr,.ai,.psd,.zip,.rar,.7z,.mp4,.mov,.webm,image/*,video/*,application/pdf"
                              onChange={(e) => {
                                const list = e.target.files ? Array.from(e.target.files) : [];
                                setAttachmentFiles(list);
                                setAttachmentFile(list[0] || null);
                              }}
                              className="text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#1E3A8A] hover:file:bg-blue-100"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={submitting || (attachmentFiles.length === 0 && !attachmentFile)}
                            className="h-9 px-4 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-2xs shrink-0 transition"
                          >
                            <FolderUp className="w-3.5 h-3.5" />
                            <span>
                              {submitting
                                ? 'Đang tải lên...'
                                : attachmentFiles.length > 1
                                  ? `Tải ${attachmentFiles.length} tệp lên`
                                  : 'Tải tệp lên'}
                            </span>
                          </button>
                        </div>

                        {attachmentFiles.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[11px] font-semibold text-slate-500">
                              Đã chọn ({attachmentFiles.length}):
                            </span>
                            {attachmentFiles.map((f, idx) => (
                              <span
                                key={`${f.name}-${idx}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-blue-200 text-[11px] font-medium text-slate-700"
                              >
                                <span className="truncate max-w-[180px]">{f.name}</span>
                                <span className="text-slate-400">
                                  ({Math.max(1, Math.round(f.size / 1024))} KB)
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </form>
                    )}

                    {selectedLead.attachments && selectedLead.attachments.length > 0 ? (
                      <div className="grid grid-cols-1 gap-2.5">
                        {selectedLead.attachments.map((att) => {
                          const lower = att.fileName.toLowerCase();
                          const extBadge = lower.endsWith('.pdf')
                            ? { label: 'PDF', style: 'bg-rose-50 border-rose-200 text-rose-700' }
                            : lower.endsWith('.doc') || lower.endsWith('.docx')
                              ? { label: 'DOC', style: 'bg-blue-50 border-blue-200 text-blue-700' }
                              : lower.endsWith('.xls') || lower.endsWith('.xlsx') || lower.endsWith('.csv')
                                ? { label: 'XLS', style: 'bg-emerald-50 border-emerald-200 text-emerald-700' }
                                : lower.endsWith('.dwg') || lower.endsWith('.dxf')
                                  ? { label: 'CAD', style: 'bg-amber-50 border-amber-200 text-amber-800' }
                                  : lower.endsWith('.zip') || lower.endsWith('.rar') || lower.endsWith('.7z')
                                    ? { label: 'ZIP', style: 'bg-purple-50 border-purple-200 text-purple-700' }
                                    : lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')
                                      ? { label: 'VID', style: 'bg-indigo-50 border-indigo-200 text-indigo-700' }
                                      : { label: 'IMG', style: 'bg-sky-50 border-sky-200 text-[#1E3A8A]' };

                          const isEditingThis = editingAttachmentId === att.id;

                          return (
                            <div
                              key={att.id}
                              className="p-3.5 rounded-xl bg-white border border-slate-200/90 hover:border-blue-300 shadow-2xs transition space-y-2.5"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <span
                                    className={`w-10 h-10 rounded-xl border grid place-items-center shrink-0 font-extrabold text-xs ${extBadge.style}`}
                                  >
                                    {extBadge.label}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-slate-900 truncate text-xs sm:text-sm">
                                        {att.fileName}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                        {att.fileType === 'site_photo'
                                          ? 'Ảnh/Video hiện trạng'
                                          : att.fileType === 'cad_drawing'
                                            ? 'Bản vẽ kỹ thuật'
                                            : 'Tài liệu dự án'}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500 mt-0.5 block">
                                      Người tải: <strong className="text-slate-700">{att.uploadedByName}</strong>
                                      {att.createdAt
                                        ? ` · ${new Date(att.createdAt).toLocaleString('vi-VN')}`
                                        : ''}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                  <a
                                    href={att.downloadUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="h-8 px-2.5 rounded-lg bg-blue-50 hover:bg-[#1E3A8A] text-[#1E3A8A] hover:text-white border border-blue-200 font-bold text-xs inline-flex items-center gap-1 transition"
                                    title="Mở xem hoặc tải tệp về máy"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Xem / Tải</span>
                                  </a>

                                  {canUploadAttachment && !selectedLead.isAnonymized && (
                                    <>
                                      <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => {
                                          if (isEditingThis) {
                                            setEditingAttachmentId(null);
                                            setEditingAttachmentReplaceFile(null);
                                          } else {
                                            setEditingAttachmentId(att.id);
                                            setEditingAttachmentName(att.fileName);
                                            setEditingAttachmentType(
                                              att.fileType === 'site_photo'
                                                ? 'site_photo'
                                                : att.fileType === 'cad_drawing'
                                                  ? 'customer_drawing_doc'
                                                  : 'other',
                                            );
                                            setEditingAttachmentReplaceFile(null);
                                          }
                                        }}
                                        className={`h-8 px-2.5 rounded-lg border font-bold text-xs inline-flex items-center gap-1 transition ${
                                          isEditingThis
                                            ? 'bg-amber-600 text-white border-amber-600'
                                            : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                                        }`}
                                        title="Sửa tên tệp, đổi phân loại hoặc thay bằng tệp mới"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                        <span>Sửa</span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => void handleDeleteAttachment(att.id, att.fileName)}
                                        className="h-8 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 font-bold text-xs inline-flex items-center gap-1 transition"
                                        title="Xóa tệp đính kèm này"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Xóa</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Khung sửa trực tiếp tệp đính kèm (Đổi tên, Đổi loại, hoặc Thay tệp mới) */}
                              {isEditingThis && (
                                <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 space-y-2.5 animate-in fade-in duration-150">
                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                    <div className="sm:col-span-2">
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Tên tệp đính kèm
                                      </label>
                                      <input
                                        type="text"
                                        value={editingAttachmentName}
                                        onChange={(e) => setEditingAttachmentName(e.target.value)}
                                        className="w-full h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1E3A8A]"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                        Phân loại tệp
                                      </label>
                                      <select
                                        value={editingAttachmentType}
                                        onChange={(e) =>
                                          setEditingAttachmentType(
                                            e.target.value as 'site_photo' | 'customer_drawing_doc' | 'other',
                                          )
                                        }
                                        className="w-full h-8 px-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                                      >
                                        <option value="site_photo">📷 Ảnh / Video hiện trạng</option>
                                        <option value="customer_drawing_doc">📐 Bản vẽ kỹ thuật</option>
                                        <option value="other">📄 Hồ sơ dự án khác</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-semibold text-slate-600">
                                        Thay bằng file khác (tùy chọn):
                                      </span>
                                      <input
                                        type="file"
                                        accept=".png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.heic,.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.txt,.dwg,.dxf,.cdr,.ai,.psd,.zip,.rar,.7z,.mp4,.mov,.webm,image/*,video/*,application/pdf"
                                        onChange={(e) => {
                                          const f = e.target.files?.[0] || null;
                                          setEditingAttachmentReplaceFile(f);
                                          if (f) setEditingAttachmentName(f.name);
                                        }}
                                        className="text-[11px] text-slate-700 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-white file:text-amber-900"
                                      />
                                    </div>

                                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingAttachmentId(null);
                                          setEditingAttachmentReplaceFile(null);
                                        }}
                                        className="h-8 px-3 rounded-lg border border-slate-300 bg-white text-slate-600 font-semibold text-xs"
                                      >
                                        Hủy
                                      </button>
                                      <button
                                        type="button"
                                        disabled={submitting}
                                        onClick={() => void handleSaveEditAttachment(att.id)}
                                        className="h-8 px-3.5 rounded-lg bg-[#1E3A8A] hover:bg-blue-800 text-white font-bold text-xs transition"
                                      >
                                        Lưu thay đổi
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-10 text-center border border-dashed border-slate-200 rounded-2xl text-slate-400">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-600 text-xs sm:text-sm">
                          Chưa có tệp đính kèm nào trong hồ sơ này
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Hỗ trợ tải lên Ảnh, Video, PDF, Word, Excel, Bản vẽ AutoCAD (DWG/DXF), File nén ZIP/RAR...
                        </p>
                      </div>
                    )}
                  </div>
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

      {/* UC01 4.6f: Hộp thoại nhắc đăng Cảnh báo dò giá khi chuyển sang "Thất bại" với lý do "Đối thủ khảo giá" */}
      {competitorPromptLead && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-orange-200 overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-orange-50 border-b border-orange-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-orange-600 shrink-0" />
                <h3 className="font-display font-bold text-orange-950 text-base">
                  Đăng Cảnh báo Dò giá Nội bộ? (UC01 4.6f)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCompetitorPromptLead(null)}
                className="p-1 rounded-lg text-orange-700 hover:bg-orange-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreatePriceAlert(e)} className="p-5 space-y-3.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                Bạn vừa đóng hồ sơ <strong className="font-mono text-[#1E3A8A]">{competitorPromptLead.leadCode}</strong> ({competitorPromptLead.companyName || competitorPromptLead.phone}) với lý do <strong>&quot;Đối thủ khảo giá&quot;</strong>. Bạn có muốn đăng cảnh báo lên danh sách nội bộ để toàn công ty cảnh giác không?
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Căn cứ nghi ngờ dò giá *
                </label>
                <input
                  type="text"
                  required
                  value={priceCheckReason}
                  onChange={(e) => setPriceCheckReason(e.target.value)}
                  placeholder="VD: Hỏi giá rời nhiều kích thước P2/P3 nhưng từ chối cho địa chỉ khảo sát..."
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ảnh chụp cuộc trò chuyện (Không bắt buộc)
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setPriceCheckFile(e.target.files?.[0] || null)}
                  className="text-xs w-full"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompetitorPromptLead(null)}
                  className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold"
                >
                  Bỏ qua
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-9 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-2xs"
                >
                  {submitting ? 'Đang đăng...' : 'Đăng cảnh báo dò giá'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UC01 5.2 & 5.3: Danh sách Cảnh báo Dò giá Nội bộ (Tìm kiếm SĐT/Email/Công ty, lọc Đang hiển thị / Đã gỡ, Gỡ cảnh báo kèm lý do) */}
      {showPriceAlertDirectory && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white w-full max-w-4xl max-h-[88vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-600 text-white grid place-items-center shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-slate-900 text-base sm:text-lg">
                    Danh sách Cảnh báo Dò giá Nội bộ (UC01 5.2 &amp; 5.3)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Tra cứu SĐT, công ty nghi đối thủ khảo giá để tránh bị khai thác thông tin giá B2B Toàn Trung
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPriceAlertDirectory(false);
                  setDismissingAlert(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'ACTIVE', label: `Đang hiển thị (${priceCheckAlerts.filter((a) => a.status === 'ACTIVE').length})` },
                    { id: 'DISMISSED', label: `Đã gỡ (${priceCheckAlerts.filter((a) => a.status === 'DISMISSED').length})` },
                    { id: 'ALL', label: `Tất cả (${priceCheckAlerts.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAlertStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      alertStatusFilter === tab.id
                        ? 'bg-orange-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={alertSearchQuery}
                  onChange={(e) => setAlertSearchQuery(e.target.value)}
                  placeholder="Tìm theo SĐT, Tên công ty, Mã Lead..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-orange-600"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {priceCheckAlerts
                .filter((a) => {
                  if (alertStatusFilter !== 'ALL' && a.status !== alertStatusFilter) return false;
                  if (!alertSearchQuery.trim()) return true;
                  const q = alertSearchQuery.trim().toLowerCase();
                  return (
                    a.phone.toLowerCase().includes(q) ||
                    (a.companyName || '').toLowerCase().includes(q) ||
                    a.leadCode.toLowerCase().includes(q) ||
                    a.reasonEvidence.toLowerCase().includes(q)
                  );
                })
                .map((alert) => {
                  const canDismissThisAlert =
                    alert.status === 'ACTIVE' &&
                    user &&
                    (alert.reportedById === user.id || user.roleCode === 'ADMIN');
                  return (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-xl border bg-white shadow-2xs space-y-2.5 ${
                        alert.status === 'ACTIVE' ? 'border-orange-200' : 'border-slate-200 opacity-75'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                alert.status === 'ACTIVE'
                                  ? 'bg-orange-100 text-orange-900 border border-orange-300'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {alert.status === 'ACTIVE' ? 'Đang hiển thị' : 'Đã gỡ'}
                            </span>
                            <span className="font-mono font-bold text-[#1E3A8A] text-sm">
                              SĐT: {alert.phone}
                            </span>
                            {alert.companyName && (
                              <span className="font-bold text-slate-900 text-sm">
                                · {alert.companyName}
                              </span>
                            )}
                            <span className="text-xs font-mono text-slate-500">
                              ({alert.leadCode})
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Người đăng: <strong className="text-slate-700">{alert.reportedByName}</strong> · Thời điểm:{' '}
                            {new Date(alert.createdAt).toLocaleString('vi-VN')}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {alert.chatScreenshotDownloadUrl && (
                            <a
                              href={alert.chatScreenshotDownloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="h-8 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[#1E3A8A] text-xs font-bold inline-flex items-center gap-1"
                            >
                              <span>Xem ảnh chụp đoạn chat</span>
                            </a>
                          )}
                          {canDismissThisAlert && (
                            <button
                              type="button"
                              onClick={() => {
                                setDismissingAlert(alert);
                                setDismissAlertReason('');
                              }}
                              className="h-8 px-3 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-700 border border-slate-200 text-slate-700 text-xs font-bold transition"
                            >
                              Gỡ cảnh báo (5.3)
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-orange-50/60 border border-orange-100 text-xs text-slate-800 whitespace-pre-line">
                        <strong>Căn cứ &amp; Nhật ký cảnh báo:</strong> {alert.reasonEvidence}
                      </div>

                      {dismissingAlert?.id === alert.id && (
                        <form
                          onSubmit={(e) => void handleDismissPriceAlert(e)}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                        >
                          <input
                            type="text"
                            required
                            value={dismissAlertReason}
                            onChange={(e) => setDismissAlertReason(e.target.value)}
                            placeholder="Nhập lý do gỡ bắt buộc (VD: Nhầm khách thật, đã xác minh địa chỉ công trình)..."
                            className="flex-1 h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs"
                          />
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setDismissingAlert(null)}
                              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600"
                            >
                              Hủy
                            </button>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="h-9 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                            >
                              Xác nhận gỡ cảnh báo
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

