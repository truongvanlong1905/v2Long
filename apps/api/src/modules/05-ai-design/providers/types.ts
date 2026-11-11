/**
 * AI Design Provider Types & Contracts
 * Module 05: Hỗ trợ Thiết kế & Phối cảnh AI (UC06)
 */

import type { AiProviderCatalogItemDto, AiProviderId } from '@toantrung/contracts';

export interface QuadCoordinates {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

export interface PerspectiveGenerationInput {
  workflow: 'perspective_3d';
  prompt: string;
  referenceImageUrl: string;
  referenceImageBuffer?: Buffer;
  referenceImageMimeType?: string;
  sourcePhotoId?: string | null;
  sourceVersionId?: number | null;
  placementQuad?: QuadCoordinates;
  compositingMode?: 'STRICT' | 'REALISTIC';
  dimensions: {
    widthM: number;
    heightM: number;
    aspectRatio?: string;
  };
  productSpec?: {
    productCode: string;
    productName: string;
    pitch?: string;
    screenStyle?: string;
  };
  quality: 'draft' | 'high_quality';
  modelId?: string;
  idempotencyKey: string;
  simulateTimeout?: boolean;
  disableLocalFallback?: boolean;
}

export interface BannerGenerationInput {
  workflow: 'banner';
  prompt: string;
  sourceVersionId?: number | null;
  dimensions: {
    widthPx: number;
    heightPx: number;
    aspectRatio: string;
  };
  productSpec?: {
    productCode?: string;
    productName?: string;
  };
  quality: 'draft' | 'high_quality';
  modelId?: string;
  idempotencyKey: string;
  simulateTimeout?: boolean;
  disableLocalFallback?: boolean;
}

export type DesignGenerationInput = PerspectiveGenerationInput | BannerGenerationInput;

export interface ProviderGenerationResult {
  imageBuffer: Buffer;
  mimeType: string;
  durationMs: number;
  modelUsed: string;
  provider: AiProviderId;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: bigint; // 1 USD = 1,000,000 micros
  costCurrency: 'USD' | 'VND';
  isCostEstimated?: boolean;
  status: 'success' | 'failed' | 'timeout';
  errorCode?: string;
  errorMessage?: string;
  fallbackNotice?: string;
}

export interface ProviderStatusInfo {
  provider: AiProviderId;
  providerName: string;
  isConfigured: boolean;
  statusLabel: string;
  activeModel: string;
  costPerImageUsd: number;
  supportsInpainting: boolean;
  notes: string;
  defaultProviderId?: AiProviderId;
  defaultModelId?: string;
  autoFallbackToLocal?: boolean;
  availableProviders?: AiProviderCatalogItemDto[];
}

export interface AiDesignProvider {
  readonly providerId: AiProviderId;
  getStatusInfo(): ProviderStatusInfo;
  generatePerspectiveDraft(input: PerspectiveGenerationInput): Promise<ProviderGenerationResult>;
  generateBannerDraft(input: BannerGenerationInput): Promise<ProviderGenerationResult>;
}

