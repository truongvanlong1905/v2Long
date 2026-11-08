import { z } from 'zod';
import type { MonetaryAmountDto } from '../common';

export const DESIGN_TYPES = [
  'perspective_3d',
  'banner',
] as const;

export type DesignType = (typeof DESIGN_TYPES)[number];

export const DESIGN_TYPE_LABELS: Record<DesignType, string> = {
  perspective_3d: 'Dựng nháp phối cảnh 3D màn hình LED',
  banner: 'Tạo hình ảnh & Banner theo tỷ lệ khung LED',
};

export const DESIGN_STATUSES = [
  'pending',
  'ai_drafted',
  'in_review',
  'completed',
] as const;

export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  pending: 'Chờ xử lý AI',
  ai_drafted: 'Đã có bản nháp AI',
  in_review: 'Designer đang hoàn thiện',
  completed: 'Đã phê duyệt & bàn giao',
};

export const AI_PROVIDER_IDS = [
  'google_imagen',
  'openai_dalle',
  'flux_bfl',
  'stability_ai',
  'custom_endpoint',
  'local_sandbox',
] as const;

export type AiProviderId = (typeof AI_PROVIDER_IDS)[number];

export interface AiModelOptionDto {
  id: string;
  name: string;
  badge: string;
  costPerImageUsd: number;
  supportsInpainting: boolean;
  description: string;
}

export interface AiProviderCatalogItemDto {
  providerId: AiProviderId;
  providerName: string;
  shortName: string;
  isConfigured: boolean;
  isDefault: boolean;
  activeModel: string;
  apiEndpoint?: string;
  hasApiKey: boolean;
  maskedApiKey?: string | null;
  statusLabel: string;
  notes: string;
  models: AiModelOptionDto[];
}

export interface QuadCoordinatesDto {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface ProjectPhotoItemDto {
  id: string;
  name: string;
  url: string;
  storageObjectKey?: string;
  selected: boolean;
  uploadedAt: string;
  sourceLeadAttachmentId?: number;
}

export interface DesignChatMessageDto {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  versionId?: number;
  versionNumber?: number;
  providerId?: string;
  modelUsed?: string;
  durationSec?: number;
  tokenUsed?: number;
  cost?: string;
  status?: 'success' | 'failed' | 'timeout' | 'pending';
}

export interface LedProductSpecDto {
  productId: number;
  productCode: string;
  productName: string;
  categoryGroup: string;
  screenStyle: 'flat' | 'curved' | 'corner_90';
  pixelPitch: string; // e.g. "P2.5", "P2.0", "P3", "P4"
  physicalWidthM: number;
  physicalHeightM: number;
  areaM2: number;
  resolutionWidthPx: number;
  resolutionHeightPx: number;
  moduleDimensionsMm: string; // e.g. "320 x 160 mm"
  cabinetDimensionsMm: string; // e.g. "640 x 480 mm"
  cabinetCount: number;
  moduleCount: number;
  controller: string; // e.g. "Novastar TB60 / VX600"
  receivingCard: string; // e.g. "Novastar MRV328"
  powerSupply: string; // e.g. "Meanwell / G-Energy 5V-40A"
  avgPowerWatts: number;
  maxPowerWatts: number;
  technicalNotes: string;
}

export interface DesignAssetVersionItemDto {
  id: number;
  designRequestId: number;
  versionNumber: number;
  sourceType: 'AI_DRAFT' | 'DESIGNER_FINAL_UPLOAD';
  providerId?: string | null;
  modelUsed?: string | null;
  storageObjectKey: string;
  downloadUrl: string;
  mimeType: string;
  fileSizeBytes: number | null;
  widthPx: number | null;
  heightPx: number | null;
  aspectRatio: string | null;
  promptUsed: string | null;
  processingDurationMs: number | null;
  tokenUsed: number | null;
  cost: MonetaryAmountDto | null;
  isApprovedFinal: boolean;
  uploadedByName: string;
  createdAt: string;
}

export interface DesignRequestItemDto {
  id: number;
  version: number;
  projectName: string;
  contactName: string | null;
  installationInfo: string | null;
  notes: string | null;
  leadId: number | null;
  leadCode: string | null;
  leadProjectLabel: string | null;
  productId: number | null;
  productName: string | null;
  requestedBySalesId: number | null;
  requestedBySalesName: string | null;
  assignedDesignerId: number;
  assignedDesignerName: string;
  designType: DesignType;
  ledModuleSpec: string | null;
  screenWidthM: number | null;
  screenHeightM: number | null;
  installZoneBboxJson: string | null;
  placementQuad: QuadCoordinatesDto | null;
  bannerWidthPx: number | null;
  bannerHeightPx: number | null;
  aspectRatio: string | null;
  aspectLocked?: boolean;
  isArchived?: boolean;
  sitePhotoDownloadUrl: string | null;
  photos: ProjectPhotoItemDto[];
  chatMessages: DesignChatMessageDto[];
  productSpec: LedProductSpecDto | null;
  aiPrompt: string;
  aiDraftDownloadUrl: string | null;
  finalRenderDownloadUrl: string | null;
  approvedVersionId: number | null;
  processingDurationSec: number | null;
  tokenCost: number | null;
  totalCost: MonetaryAmountDto | null;
  status: DesignStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  assetVersions: DesignAssetVersionItemDto[];
}

/**
 * Kiểm tra không cho phép gửi SĐT hoặc Email khách hàng vào Prompt AI (AGENTS.md & UC06 mục 4)
 */
export function containsCustomerPiiInPrompt(text: string): { hasPii: boolean; reason?: string } {
  if (!text) return { hasPii: false };
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (emailRegex.test(text)) {
    return {
      hasPii: true,
      reason: 'Prompt chứa địa chỉ email. Theo quy định bảo mật BA (UC06), tuyệt đối không gửi email/SĐT khách hàng sang AI bên thứ ba.',
    };
  }
  const vnPhoneRegex = /(?:\+84|0)(?:3|5|7|8|9)(?:[\s.-]*\d){8}\b/;
  if (vnPhoneRegex.test(text)) {
    return {
      hasPii: true,
      reason: 'Prompt chứa số điện thoại. Theo quy định bảo mật BA (UC06), tuyệt đối không gửi SĐT/thông tin liên hệ khách hàng sang AI bên thứ ba.',
    };
  }
  return { hasPii: false };
}

export const QuadCoordinatesSchema = z.object({
  topLeft: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  topRight: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  bottomRight: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  bottomLeft: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
});

export const CreatePerspective3dRequestSchema = z.object({
  designType: z.literal('perspective_3d'),
  projectName: z.string().trim().min(2, 'Tên dự án tối thiểu 2 ký tự.').max(150).default('Showroom LED'),
  contactName: z.string().trim().max(120).optional().nullable(),
  installationInfo: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  leadId: z.number().int().positive().optional().nullable(),
  productId: z.number().int().positive().default(1),
  ledModuleSpec: z.string().trim().min(2, 'Vui lòng chọn cấu hình module LED (P2, P2.5, P3, P4...).').max(120).default('P2.5 Indoor'),
  screenWidthM: z.number().positive('Chiều ngang màn hình (m) phải lớn hơn 0.').max(200).default(4.8),
  screenHeightM: z.number().positive('Chiều cao màn hình (m) phải lớn hơn 0.').max(100).default(2.7),
  installZoneBboxJson: z.string().trim().min(2).max(500).optional().nullable(),
  placementQuad: QuadCoordinatesSchema.optional().nullable(),
  sitePhotoObjectKey: z.string().trim().max(260).optional().nullable(),
  aiPrompt: z
    .string()
    .trim()
    .min(5, 'Prompt mô tả phối cảnh cần tối thiểu 5 ký tự.')
    .max(1500),
  quality: z.enum(['draft', 'high_quality']).default('draft'),
  providerId: z.enum(AI_PROVIDER_IDS).optional(),
  modelId: z.string().trim().max(120).optional(),
  simulateAiTimeout: z.boolean().optional(),
});

export const CreateBannerRequestSchema = z.object({
  designType: z.literal('banner'),
  projectName: z.string().trim().min(2).max(150).default('Banner LED'),
  contactName: z.string().trim().max(120).optional().nullable(),
  installationInfo: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  /** Banner có thể tạo độc lập không cần gắn Lead theo UC06 Luồng phụ 2a */
  leadId: z.number().int().positive().optional().nullable(),
  productId: z.number().int().positive().optional().nullable(),
  bannerWidthPx: z.number().int().min(128, 'Chiều rộng pixel tối thiểu 128px.').max(15360).default(1920),
  bannerHeightPx: z.number().int().min(64, 'Chiều cao pixel tối thiểu 64px.').max(8640).default(1080),
  aspectRatio: z.string().trim().min(2).max(30).default('16:9'),
  placementQuad: QuadCoordinatesSchema.optional().nullable(),
  aiPrompt: z
    .string()
    .trim()
    .min(5, 'Prompt mô tả nội dung Banner cần tối thiểu 5 ký tự.')
    .max(1500),
  quality: z.enum(['draft', 'high_quality']).default('draft'),
  providerId: z.enum(AI_PROVIDER_IDS).optional(),
  modelId: z.string().trim().max(120).optional(),
  simulateAiTimeout: z.boolean().optional(),
});

export const CreateDesignRequestSchema = z.discriminatedUnion('designType', [
  CreatePerspective3dRequestSchema,
  CreateBannerRequestSchema,
]);

export type CreateDesignRequestDto = z.infer<typeof CreateDesignRequestSchema>;

export const UpdateDesignProjectSchema = z.object({
  projectName: z.string().trim().min(2).max(150).optional(),
  designType: z.enum(DESIGN_TYPES).optional(),
  contactName: z.string().trim().max(120).optional().nullable(),
  installationInfo: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  leadId: z.number().int().positive().optional().nullable(),
  productId: z.number().int().positive().optional().nullable(),
  ledModuleSpec: z.string().trim().max(120).optional().nullable(),
  pixelPitch: z.string().trim().max(30).optional().nullable(),
  screenStyle: z.enum(['flat', 'curved', 'corner_90']).optional(),
  screenWidthM: z.number().positive().max(200).optional().nullable(),
  screenHeightM: z.number().positive().max(100).optional().nullable(),
  bannerWidthPx: z.number().int().min(128).max(15360).optional().nullable(),
  bannerHeightPx: z.number().int().min(64).max(8640).optional().nullable(),
  aspectRatio: z.string().trim().max(30).optional().nullable(),
  aspectLocked: z.boolean().optional(),
  placementQuad: QuadCoordinatesSchema.optional().nullable(),
  selectedPhotoId: z.string().trim().optional(),
  renamePhotoId: z.string().trim().optional(),
  renamePhotoName: z.string().trim().min(1).max(120).optional(),
  renameVersionId: z.number().int().positive().optional(),
  renameVersionLabel: z.string().trim().min(1).max(200).optional(),
  isArchived: z.boolean().optional(),
  importLeadAttachments: z.boolean().optional(),
  expectedVersion: z.number().int().positive().optional(),
});

export type UpdateDesignProjectDto = z.infer<typeof UpdateDesignProjectSchema>;

export const ChatDesignRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  prompt: z.string().trim().min(5, 'Yêu cầu chỉnh sửa cần tối thiểu 5 ký tự.').max(1500),
  quality: z.enum(['draft', 'high_quality']).default('draft'),
  providerId: z.enum(AI_PROVIDER_IDS).optional(),
  modelId: z.string().trim().max(120).optional(),
  placementQuad: QuadCoordinatesSchema.optional().nullable(),
  selectedPhotoUrl: z.string().trim().optional().nullable(),
  productId: z.number().int().positive().optional().nullable(),
  screenWidthM: z.number().positive().max(200).optional().nullable(),
  screenHeightM: z.number().positive().max(100).optional().nullable(),
  bannerWidthPx: z.number().int().min(128).max(15360).optional().nullable(),
  bannerHeightPx: z.number().int().min(64).max(8640).optional().nullable(),
  aspectRatio: z.string().trim().max(30).optional().nullable(),
  simulateAiTimeout: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export type ChatDesignRequestDto = z.infer<typeof ChatDesignRequestSchema>;

export const RegenerateDesignDraftSchema = z.object({
  expectedVersion: z.number().int().positive(),
  aiPrompt: z.string().trim().min(5).max(1500),
  providerId: z.enum(AI_PROVIDER_IDS).optional(),
  modelId: z.string().trim().max(120).optional(),
  ledModuleSpec: z.string().trim().max(120).optional().nullable(),
  screenWidthM: z.number().positive().max(200).optional().nullable(),
  screenHeightM: z.number().positive().max(100).optional().nullable(),
  bannerWidthPx: z.number().int().min(128).max(15360).optional().nullable(),
  bannerHeightPx: z.number().int().min(64).max(8640).optional().nullable(),
  aspectRatio: z.string().trim().max(30).optional().nullable(),
  quality: z.enum(['draft', 'high_quality']).optional(),
  simulateAiTimeout: z.boolean().optional(),
});

export type RegenerateDesignDraftDto = z.infer<typeof RegenerateDesignDraftSchema>;

export const ConfigureAiProvidersSchema = z.object({
  defaultProviderId: z.enum(AI_PROVIDER_IDS),
  defaultModelId: z.string().trim().min(1).max(120).optional(),
  autoFallbackToLocal: z.boolean().default(true),
  providerConfig: z
    .object({
      providerId: z.enum(AI_PROVIDER_IDS),
      apiKey: z.string().trim().max(300).optional().nullable(),
      apiEndpoint: z.string().trim().max(400).optional().nullable(),
      activeModel: z.string().trim().max(120).optional().nullable(),
    })
    .optional(),
});

export type ConfigureAiProvidersDto = z.infer<typeof ConfigureAiProvidersSchema>;

export const ApproveDesignVersionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  versionId: z.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

export type ApproveDesignVersionDto = z.infer<typeof ApproveDesignVersionSchema>;

export const AddProjectPhotoSchema = z.object({
  photoName: z.string().trim().min(1).max(120).default('Ảnh hiện trạng'),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().default('image/jpeg'),
  base64Data: z.string().min(1),
});

export type AddProjectPhotoDto = z.infer<typeof AddProjectPhotoSchema>;
