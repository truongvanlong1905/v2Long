import { z } from 'zod';
import type { MonetaryAmountDto } from '../common';

const BigIntStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+$/, 'Giá trị số nguyên lớn (BigInt) phải là chuỗi chữ số hợp lệ.');

export const MARKETING_PLATFORMS = [
  'GOOGLE_ADS',
  'GA4',
  'SEARCH_CONSOLE',
  'FANPAGE',
  'GOOGLE_TRENDS',
  'EXTERNAL',
] as const;

export type MarketingPlatform = (typeof MARKETING_PLATFORMS)[number];

export const MARKETING_SOURCES = [
  'GOOGLE_ADS',
  'ORGANIC_SEARCH',
  'SOCIAL',
  'REFERRAL',
  'DIRECT',
  'OTHER',
  'UNKNOWN',
  'MANUAL',
] as const;

export type MarketingSource = (typeof MARKETING_SOURCES)[number];

export const MARKETING_SOURCE_LABELS: Record<MarketingSource, string> = {
  GOOGLE_ADS: 'Google Ads',
  ORGANIC_SEARCH: 'Tìm kiếm tự nhiên',
  SOCIAL: 'Mạng xã hội',
  REFERRAL: 'Website giới thiệu',
  DIRECT: 'Truy cập trực tiếp',
  OTHER: 'Khác',
  UNKNOWN: 'Chưa xác định',
  MANUAL: 'Nhập tay',
};

export interface CampaignItemDto {
  id: number;
  platform: MarketingPlatform;
  accountExternalId: string;
  campaignCode: string;
  campaignName: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  dailyBudget: MonetaryAmountDto | null;
  isAutoSynced: boolean;
  startDate: string | null;
  endDate: string | null;
  leadsCountL1: number;
  leadsCountL2: number;
  leadsCountL3: number;
  repeatLeadsCount: number;
  quoteSentCount: number;
  wonCount: number;
  totalSpend: MonetaryAmountDto | null;
  cplEffective: MonetaryAmountDto | null;
  costPerQuote: MonetaryAmountDto | null;
  costPerWon: MonetaryAmountDto | null;
}

export interface AttributionSummaryRowDto {
  dimensionType: 'CHANNEL' | 'SOURCE' | 'CAMPAIGN' | 'LANDING_PAGE' | 'DEVICE';
  dimensionKey: string;
  dimensionLabel: string;
  rawLeadsL1: number;
  validLeadsL2: number;
  effectiveLeadsL3: number;
  repeatLeads: number;
  quoteSentCount: number;
  wonCount: number;
  quoteRateText: string;
  winRateText: string;
}

export interface PlatformSyncStatusDto {
  id: number;
  platform: MarketingPlatform;
  accountPropertyId: string;
  scheduleSlot: 'FULL_0200' | 'LIGHT_1100' | 'LIGHT_1700' | 'MANUAL_RETRY';
  windowDays: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  recordsUpserted: number;
  errorMessage: string | null;
  consecutiveFailureCount: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface LeadReconciliationItemDto {
  id: number;
  reconcileDate: string;
  platform: string;
  accountPropertyId: string;
  campaignExternalId: string;
  crmLeadCount: number;
  errorIntakeCount: number;
  platformReportedCount: number;
  discrepancyCount: number;
  status: 'MATCHED' | 'ALERT_OPEN' | 'RESOLVED';
  resolutionNote: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
}

export interface WebhookIntakeErrorItemDto {
  id: number;
  intakeSourceProvider: string;
  intakeSourceAccountKey: string;
  sourceChannel: string;
  externalSubmissionId: string | null;
  errorReason: string;
  status: 'FAILED' | 'REPLAYED' | 'IGNORED';
  createdAt: string;
  replayedAt: string | null;
}

export interface TrackingDashboardDto {
  periodDays: number;
  isSmallSample: boolean;
  smallSampleNote: string | null;
  todayPreliminaryNotice: string;
  liveIntegrationMode: 'FIXTURE_SIMULATION' | 'LIVE_CONFIGURED';
  lastSyncedAt: string | null;
  totals: {
    rawLeadsL1: number;
    validLeadsL2: number;
    effectiveLeadsL3: number;
    repeatLeads: number;
    unknownSourceLeads: number;
    unknownCampaignLeads: number;
    utmGclidMismatchCount: number;
    unmatchedUtmCount: number;
    openReconciliationAlerts: number;
    consecutiveSyncFailureAlerts: number;
  };
  bySource: AttributionSummaryRowDto[];
  byChannel: AttributionSummaryRowDto[];
  campaigns: CampaignItemDto[];
  syncLogs: PlatformSyncStatusDto[];
  reconciliations: LeadReconciliationItemDto[];
  webhookErrors: WebhookIntakeErrorItemDto[];
  sourceVsSelfReported: Array<{
    leadCode: string;
    contactChannel: string;
    marketingSource: string;
    selfReportedSource: string | null;
    utmGclidMismatch: boolean;
    createdAt: string;
  }>;
}

export const WebhookLeadIntakeSchema = z.object({
  intakeSourceProvider: z.enum(['WEBSITE_FORM', 'GOOGLE_LEAD_FORM']).default('WEBSITE_FORM'),
  intakeSourceAccountKey: z.string().trim().min(2).max(120),
  externalSubmissionId: z.string().trim().min(2).max(150),
  phone: z.string().trim().min(3).max(40),
  email: z.string().trim().max(150).optional().nullable(),
  contactName: z.string().trim().max(150).optional().nullable(),
  companyName: z.string().trim().max(200).optional().nullable(),
  projectName: z.string().trim().max(200).optional().nullable(),
  areaType: z.enum(['hcm', 'other_province']).optional().nullable(),
  hcmDistrict: z.string().trim().max(100).optional().nullable(),
  province: z.string().trim().max(100).optional().nullable(),
  installationAddress: z.string().trim().max(500).optional().nullable(),
  productCodes: z.array(z.string().trim()).optional(),
  note: z.string().trim().max(2000).optional().nullable(),
  tracking: z
    .object({
      gclid: z.string().trim().max(200).optional().nullable(),
      googleCampaignCode: z.string().trim().max(120).optional().nullable(),
      utmSource: z.string().trim().max(120).optional().nullable(),
      utmMedium: z.string().trim().max(120).optional().nullable(),
      utmCampaign: z.string().trim().max(150).optional().nullable(),
      utmContent: z.string().trim().max(150).optional().nullable(),
      utmTerm: z.string().trim().max(150).optional().nullable(),
      landingPageUrl: z.string().trim().max(500).optional().nullable(),
      referrerUrl: z.string().trim().max(500).optional().nullable(),
      deviceType: z.enum(['mobile', 'desktop', 'tablet']).optional().nullable(),
    })
    .optional(),
});

export type WebhookLeadIntakeDto = z.infer<typeof WebhookLeadIntakeSchema>;

export const DeclareExternalCampaignSchema = z.object({
  platform: z.enum(MARKETING_PLATFORMS).default('EXTERNAL'),
  accountExternalId: z.string().trim().min(2).max(100).default('TOANTRUNG_MKT'),
  campaignCode: z.string().trim().min(2, 'Mã chiến dịch tối thiểu 2 ký tự.').max(100),
  campaignName: z.string().trim().min(3, 'Tên chiến dịch tối thiểu 3 ký tự.').max(200),
  dailyBudgetMicrosString: BigIntStringSchema.optional().nullable(),
});

export type DeclareExternalCampaignDto = z.infer<typeof DeclareExternalCampaignSchema>;

export const TriggerPlatformSyncSchema = z.object({
  scheduleSlot: z.enum(['FULL_0200', 'LIGHT_1100', 'LIGHT_1700', 'MANUAL_RETRY']).default('MANUAL_RETRY'),
  platforms: z.array(z.enum(MARKETING_PLATFORMS)).optional(),
  runGclidResolution: z.boolean().default(true),
  runReconciliation: z.boolean().default(true),
});

export type TriggerPlatformSyncDto = z.infer<typeof TriggerPlatformSyncSchema>;

export const ResolveReconciliationSchema = z.object({
  reconciliationId: z.number().int().positive(),
  resolutionNote: z.string().trim().min(5, 'Vui lòng nhập ghi chú xử lý đối soát (tối thiểu 5 ký tự).').max(500),
});

export type ResolveReconciliationDto = z.infer<typeof ResolveReconciliationSchema>;
