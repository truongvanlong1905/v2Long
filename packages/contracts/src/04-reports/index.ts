import { z } from 'zod';
import type { MonetaryAmountDto } from '../common';

export const REPORT_PRESETS = ['7d', '30d', 'all', 'custom'] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

export interface SalesPerformanceRowDto {
  salesUserId: number;
  salesFullName: string;
  isOnline: boolean;
  isReceivingLeads: boolean;
  totalLeads: number;
  newLeads: number;
  quotingLeads: number;
  quoteSentLeads: number;
  wonLeads: number;
  lostLeads: number;
  unansweredOverdue7d: number;
  winRateText: string;
}

export interface ProductInsightRowDto {
  productId: number;
  productCode: string;
  productName: string;
  category: 'MAN_HINH_LED' | 'BANG_DIEN_TU' | 'KHAC';
  inquiryCount: number;
  wonCount: number;
}

export interface UnansweredQuoteItemDto {
  leadId: number;
  leadCode: string;
  companyOrContact: string;
  phone: string;
  assignedSalesName: string;
  quoteSentAt: string;
  daysWaiting: number;
  isOverdue7Days: boolean;
  productSummary: string;
}

export interface DetailedReportLeadRowDto {
  stt: number;
  leadCode: string;
  receivedAt: string;
  assignedSalesName: string;
  companyOrCustomer: string;
  phone: string;
  contactChannel: string;
  marketingSource: string;
  productsText: string;
  pipelineStatusLabel: string;
  noteOrReason: string;
  isAnonymized: boolean;
}

export interface ReportsDashboardDto {
  scopeRole: string;
  scopeDescription: string;
  preset: ReportPreset;
  fromDate: string;
  toDate: string;
  isSmallSample: boolean;
  smallSampleNotice: string | null;
  todayPreliminaryNotice: string;
  lastSyncedAt: string | null;
  overview: {
    totalLeadsL1: number;
    validLeadsL2: number;
    effectiveLeadsL3: number;
    newLeadCount: number;
    quotingCount: number;
    quoteSentCount: number;
    wonCount: number;
    lostCount: number;
    unansweredQuoteCount: number;
    overdue7DaysQuoteCount: number;
    winRateText: string;
  };
  byChannel: Array<{
    channel: string;
    label: string;
    count: number;
  }>;
  salesPerformance: SalesPerformanceRowDto[];
  productInsights: ProductInsightRowDto[];
  unansweredQuotes: UnansweredQuoteItemDto[];
  marketingSummary: {
    totalAdsSpend: MonetaryAmountDto | null;
    effectiveLeadsFromAds: number;
    cplEffective: MonetaryAmountDto | null;
    publishedSeoArticles: number;
    optimizationNeededArticles: number;
  };
  designSummary: {
    totalRequests: number;
    completed3dCount: number;
    completedBannerCount: number;
    avgProcessingSecText: string;
    totalAiTokens: number;
    totalAiCost: MonetaryAmountDto | null;
  };
  detailedLeads: DetailedReportLeadRowDto[];
}

export const ReportQuerySchema = z.object({
  preset: z.enum(REPORT_PRESETS).default('30d'),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

