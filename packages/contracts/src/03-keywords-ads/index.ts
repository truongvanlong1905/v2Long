import { z } from 'zod';

export const TARGET_WEBSITES = [
  'toantrung.com.vn',
  'bangled.vn',
] as const;

export type TargetWebsite = (typeof TARGET_WEBSITES)[number];

export interface TargetWebsiteConfigDto {
  domain: TargetWebsite;
  connectionStatus: 'SIMULATED' | 'CONNECTED';
  label: string;
}

export const DEFAULT_TARGET_WEBSITE_CONFIGS: readonly TargetWebsiteConfigDto[] = [
  {
    domain: 'toantrung.com.vn',
    connectionStatus: 'SIMULATED',
    label: 'toantrung.com.vn (Chế độ giả lập - Chưa kết nối thật)',
  },
  {
    domain: 'bangled.vn',
    connectionStatus: 'SIMULATED',
    label: 'bangled.vn (Chế độ giả lập - Chưa kết nối thật)',
  },
] as const;

export const SEO_ARTICLE_STATUSES = [
  'DRAFT',
  'APPROVED_SCHEDULED',
  'PUBLISHED',
  'PUBLISH_FAILED',
] as const;

export type SeoArticleStatus = (typeof SEO_ARTICLE_STATUSES)[number];

export const SEO_ARTICLE_STATUS_LABELS: Record<SeoArticleStatus, string> = {
  DRAFT: 'Nháp',
  APPROVED_SCHEDULED: 'Đã duyệt - chờ đăng',
  PUBLISHED: 'Đã đăng',
  PUBLISH_FAILED: 'Lỗi đẩy bài (chờ đăng lại)',
};

export interface SeoKeywordItemDto {
  id: number;
  keywordText: string;
  topicCluster: string | null;
  searchIntent: string | null;
  targetWebsite: string | null;
  cachedSearchVolume: number;
  cachedAdsClicks: number;
  cachedOrganicClicks: number;
  cachedAvgPosition: number | null;
  trendScore: number | null;
  trendDirection: 'UP' | 'STABLE' | 'DOWN' | null;
  cacheSourceAccountKey: string | null;
  cacheWindowStartDate: string | null;
  cacheWindowEndDate: string | null;
  cacheRefreshedAt: string | null;
  suggestedPublishSlot: string;
  articlesCount: number;
}

export interface SeoArticleRevisionItemDto {
  id: number;
  articleId: number;
  revisionNumber: number;
  title: string;
  metaDescription: string | null;
  headingStructureJson: string | null;
  contentHtml: string;
  editorNote: string | null;
  isAiGenerated: boolean;
  editedByName: string;
  createdAt: string;
}

export interface SeoArticleItemDto {
  id: number;
  version: number;
  keywordId: number;
  keywordText: string;
  targetWebsite: string;
  title: string;
  slug: string;
  metaDescription: string | null;
  headingStructureJson: string | null;
  contentHtml: string;
  featuredImageUrl: string | null;
  keywordDensityPct: number | null;
  status: SeoArticleStatus;
  currentRevisionId: number | null;
  approvedRevisionId: number | null;
  scheduledPublishAt: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
  publishErrorMessage: string | null;
  publishAttemptCount: number;
  organicClicks30d: number;
  avgPosition30d: number | null;
  avgReadTimeSec: number | null;
  needsOptimization: boolean;
  createdByName: string;
  approvedByName: string | null;
  createdAt: string;
  updatedAt: string;
  revisions?: SeoArticleRevisionItemDto[];
}

export interface AdsCampaignItemDto {
  id: number;
  platform: string;
  campaignCode: string;
  campaignName: string;
  isActive: boolean;
  dailyBudgetVndText: string;
  impressions: number;
  clicks: number;
  ctrPct: string;
  spendVndText: string;
  conversions: number;
  cplText: string;
}

export interface AdsPerformancePointDto {
  label: string;
  clicks: number;
  conversions: number;
}

export interface KeywordDemandBarDto {
  id: number;
  keywordText: string;
  searchVolume: number;
  percentage: number;
  trendDirection: 'UP' | 'STABLE' | 'DOWN';
}

export interface AdsWorkspacePayloadDto {
  isAdsReadOnly: boolean;
  kpis: {
    totalImpressions: number;
    totalClicks: number;
    totalSpendVndText: string;
    avgCtrPct: string;
    totalConversions: number;
    cplVndText: string;
  };
  campaigns: AdsCampaignItemDto[];
  performanceChart: AdsPerformancePointDto[];
  demandBars: KeywordDemandBarDto[];
  keywords: SeoKeywordItemDto[];
  articles: SeoArticleItemDto[];
}

export const CreateSeoKeywordSchema = z.object({
  keywordText: z.string().trim().min(2, 'Từ khóa tối thiểu 2 ký tự.').max(150),
  topicCluster: z.string().trim().max(120).optional().nullable(),
  searchIntent: z.enum(['COMMERCIAL', 'INFORMATIONAL', 'TRANSACTIONAL']).default('COMMERCIAL'),
  targetWebsite: z.enum(TARGET_WEBSITES).default('toantrung.com.vn'),
});

export type CreateSeoKeywordDto = z.infer<typeof CreateSeoKeywordSchema>;

export const GenerateSeoDraftByAiSchema = z.object({
  keywordId: z.number().int().positive(),
  targetWebsite: z.enum(TARGET_WEBSITES),
  topicFocus: z.string().trim().min(5, 'Vui lòng nhập chủ đề trọng tâm bài viết.').max(300),
  customPromptInstruction: z.string().trim().max(1000).optional().nullable(),
  simulateAiFailure: z.boolean().optional(),
});

export type GenerateSeoDraftByAiDto = z.infer<typeof GenerateSeoDraftByAiSchema>;

export const UpdateSeoArticleDraftSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().trim().min(10, 'Tiêu đề chuẩn SEO tối thiểu 10 ký tự.').max(200),
  metaDescription: z.string().trim().max(320).optional().nullable(),
  contentHtml: z.string().trim().min(30, 'Nội dung bài viết tối thiểu 30 ký tự.'),
  featuredImageUrl: z.string().trim().max(300).optional().nullable(),
  targetWebsite: z.enum(TARGET_WEBSITES).optional(),
  editorNote: z.string().trim().max(300).optional().nullable(),
});

export type UpdateSeoArticleDraftDto = z.infer<typeof UpdateSeoArticleDraftSchema>;

export const ApproveAndScheduleSeoArticleSchema = z.object({
  expectedVersion: z.number().int().positive(),
  revisionId: z.number().int().positive().optional(),
  targetWebsite: z.enum(TARGET_WEBSITES),
  scheduledPublishAt: z.string().datetime('Lịch hẹn đăng phải là thời gian ISO hợp lệ.'),
});

export type ApproveAndScheduleSeoArticleDto = z.infer<typeof ApproveAndScheduleSeoArticleSchema>;

export const WithdrawSeoApprovalSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().max(300).optional().nullable(),
});

export type WithdrawSeoApprovalDto = z.infer<typeof WithdrawSeoApprovalSchema>;

export const PublishSeoArticleNowSchema = z.object({
  expectedVersion: z.number().int().positive(),
  simulateWebhookFailure: z.boolean().optional(),
});

export type PublishSeoArticleNowDto = z.infer<typeof PublishSeoArticleNowSchema>;

