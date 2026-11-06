/**
 * AI Design Provider Types & Contracts
 * Module 05: Hỗ trợ Thiết kế & Phối cảnh AI (UC06)
 */

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
  placementQuad?: QuadCoordinates;
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
  idempotencyKey: string;
  simulateTimeout?: boolean;
}

export interface BannerGenerationInput {
  workflow: 'banner';
  prompt: string;
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
  idempotencyKey: string;
  simulateTimeout?: boolean;
}

export type DesignGenerationInput = PerspectiveGenerationInput | BannerGenerationInput;

export interface ProviderGenerationResult {
  imageBuffer: Buffer;
  mimeType: string;
  durationMs: number;
  modelUsed: string;
  provider: 'google_imagen' | 'openai_dalle' | 'local_sandbox';
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: bigint; // 1 USD = 1,000,000 micros
  costCurrency: 'USD' | 'VND';
  status: 'success' | 'failed' | 'timeout';
  errorMessage?: string;
}

export interface ProviderStatusInfo {
  provider: 'google_imagen' | 'openai_dalle' | 'local_sandbox';
  providerName: string;
  isConfigured: boolean;
  statusLabel: string;
  activeModel: string;
  costPerImageUsd: number;
  supportsInpainting: boolean;
  notes: string;
}

export interface AiDesignProvider {
  readonly providerId: 'google_imagen' | 'openai_dalle' | 'local_sandbox';
  getStatusInfo(): ProviderStatusInfo;
  generatePerspectiveDraft(input: PerspectiveGenerationInput): Promise<ProviderGenerationResult>;
  generateBannerDraft(input: BannerGenerationInput): Promise<ProviderGenerationResult>;
}

