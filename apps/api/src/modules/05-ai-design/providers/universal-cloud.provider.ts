/**
 * Universal Cloud & Custom AI Image Provider Adapter
 * Supports:
 * - Black Forest Labs FLUX.1 (`flux_bfl`)
 * - Stability AI SD 3.5 / SDXL (`stability_ai`)
 * - Any OpenAI-Compatible / OpenRouter / Self-Hosted ComfyUI / Custom Gateway (`custom_endpoint`)
 */

import type { AiProviderId } from '@toantrung/contracts';
import {
  type AiDesignProvider,
  type BannerGenerationInput,
  type PerspectiveGenerationInput,
  type ProviderGenerationResult,
  type ProviderStatusInfo,
} from './types';

export interface UniversalCloudProviderOptions {
  providerId: AiProviderId;
  providerName: string;
  apiKey?: string | null;
  apiEndpoint?: string | null;
  activeModel: string;
  costPerImageUsd: number;
  notes: string;
}

export class UniversalCloudAiProvider implements AiDesignProvider {
  readonly providerId: AiProviderId;
  private readonly providerName: string;
  private readonly apiKey: string | null;
  private readonly apiEndpoint: string;
  private readonly activeModel: string;
  private readonly costPerImageUsd: number;
  private readonly notes: string;

  constructor(opts: UniversalCloudProviderOptions) {
    this.providerId = opts.providerId;
    this.providerName = opts.providerName;
    this.apiKey = opts.apiKey || null;
    this.apiEndpoint = opts.apiEndpoint || 'https://api.openai.com/v1/images/generations';
    this.activeModel = opts.activeModel;
    this.costPerImageUsd = opts.costPerImageUsd;
    this.notes = opts.notes;
  }

  getStatusInfo(): ProviderStatusInfo {
    const isConfigured = Boolean(this.apiKey);
    return {
      provider: this.providerId,
      providerName: this.providerName,
      isConfigured,
      statusLabel: isConfigured
        ? `Đã kết nối (${this.activeModel})`
        : 'Chưa cấu hình API Key · Sẵn sàng tự động dùng Engine Studio',
      activeModel: this.activeModel,
      costPerImageUsd: this.costPerImageUsd,
      supportsInpainting: true,
      notes: this.notes,
    };
  }

  private async invokeEndpoint(
    prompt: string,
    modelId: string,
    widthPx: number,
    heightPx: number,
    simulateTimeout?: boolean
  ): Promise<ProviderGenerationResult> {
    const started = Date.now();
    if (simulateTimeout) {
      await new Promise((r) => setTimeout(r, 120));
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: modelId,
        provider: this.providerId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'timeout',
        errorMessage: `${this.providerName} quá thời gian phản hồi 60s (Simulated UC06 E1).`,
      };
    }

    if (!this.apiKey) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: modelId,
        provider: this.providerId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: `Chưa cấu hình API Key cho ${this.providerName}.`,
      };
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          prompt,
          n: 1,
          size: widthPx >= heightPx ? '1792x1024' : '1024x1792',
          response_format: 'b64_json',
        }),
      });

      const durationMs = Date.now() - started;
      if (!response.ok) {
        const text = await response.text();
        return {
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/png',
          durationMs,
          modelUsed: modelId,
          provider: this.providerId,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0n,
          costCurrency: 'USD',
          status: 'failed',
          errorMessage: `${this.providerName} Error [${response.status}]: ${text}`,
        };
      }

      const json = await response.json();
      const b64 =
        json.data?.[0]?.b64_json ||
        json.predictions?.[0]?.bytesBase64Encoded ||
        json.images?.[0] ||
        json.image_base64;

      if (!b64) {
        return {
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/png',
          durationMs,
          modelUsed: modelId,
          provider: this.providerId,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0n,
          costCurrency: 'USD',
          status: 'failed',
          errorMessage: `${this.providerName} không trả về dữ liệu ảnh base64 hợp lệ.`,
        };
      }

      const costMicros = BigInt(Math.round(this.costPerImageUsd * 1_000_000));
      return {
        imageBuffer: Buffer.from(b64, 'base64'),
        mimeType: 'image/png',
        durationMs,
        modelUsed: modelId,
        provider: this.providerId,
        promptTokens: Math.round(prompt.length * 1.5),
        completionTokens: 1536,
        totalTokens: Math.round(prompt.length * 1.5) + 1536,
        costMicros,
        costCurrency: 'USD',
        status: 'success',
      };
    } catch (err) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: modelId,
        provider: this.providerId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : `Lỗi kết nối ${this.providerName}.`,
      };
    }
  }

  async generatePerspectiveDraft(
    input: PerspectiveGenerationInput
  ): Promise<ProviderGenerationResult> {
    const modelId = input.modelId || this.activeModel;
    return this.invokeEndpoint(input.prompt, modelId, 1792, 1024, input.simulateTimeout);
  }

  async generateBannerDraft(input: BannerGenerationInput): Promise<ProviderGenerationResult> {
    const modelId = input.modelId || this.activeModel;
    return this.invokeEndpoint(
      input.prompt,
      modelId,
      input.dimensions.widthPx,
      input.dimensions.heightPx,
      input.simulateTimeout
    );
  }
}

