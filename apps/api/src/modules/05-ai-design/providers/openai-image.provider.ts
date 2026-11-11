/**
 * OpenAI Image Edit Provider Adapter
 * Fallback Provider using OpenAI Images API (/v1/images/edits and /v1/images/generations)
 *
 * Official Pricing (November 2026 OpenAI):
 * - Model: dall-e-2 edits / dall-e-3 generation
 * - Billing unit: Per image
 * - DALL-E 2 edits (1024x1024): $0.020 USD (= 20,000 micros)
 * - DALL-E 3 Standard (1024x1024 / 1024x1792): $0.040 USD (= 40,000 micros)
 * - DALL-E 3 HD: $0.080 USD (= 80,000 micros)
 */

import {
  type AiDesignProvider,
  type BannerGenerationInput,
  type PerspectiveGenerationInput,
  type ProviderGenerationResult,
  type ProviderStatusInfo,
} from './types';

export interface OpenAiImageProviderOptions {
  apiKey?: string | null;
  apiEndpoint?: string | null;
  activeModel?: string | null;
}

export class OpenAiImageProvider implements AiDesignProvider {
  readonly providerId = 'openai_dalle' as const;
  private readonly apiKey: string | null;
  private readonly apiEndpoint: string;
  private readonly activeModel: string;

  constructor(opts?: OpenAiImageProviderOptions) {
    this.apiKey = opts?.apiKey || process.env.OPENAI_API_KEY || null;
    this.apiEndpoint = opts?.apiEndpoint || 'https://api.openai.com/v1/images/generations';
    this.activeModel = opts?.activeModel || 'gpt-image-1';
  }

  getStatusInfo(): ProviderStatusInfo {
    const isConfigured = Boolean(this.apiKey);
    return {
      provider: 'openai_dalle',
      providerName: 'OpenAI GPT 2.5 Image / GPT-Image-1 & DALL-E 3',
      isConfigured,
      statusLabel: isConfigured ? 'Đã kết nối API Key' : 'Chưa cấu hình API Key (OPENAI_API_KEY)',
      activeModel: this.activeModel,
      costPerImageUsd: 0.04,
      supportsInpainting: true,
      notes:
        'Hỗ trợ ghép ảnh sản phẩm vào ảnh hiện trường (Multi-Image Edit), hiển thị chữ sắc nét trên Banner và dựng phối cảnh 3D.',
    };
  }

  async generatePerspectiveDraft(
    input: PerspectiveGenerationInput
  ): Promise<ProviderGenerationResult> {
    const started = Date.now();
    const requestedModel = (input.modelId || this.activeModel || 'gpt-image-1').trim();
    const apiModel = requestedModel === 'gpt-2.5-image' ? 'gpt-image-1' : requestedModel;
    const isGptImageModel = apiModel.startsWith('gpt-image');

    if (input.simulateTimeout) {
      await new Promise((r) => setTimeout(r, 120));
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: requestedModel,
        provider: 'openai_dalle',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'timeout',
        errorMessage: 'OpenAI API quá thời gian phản hồi (Simulated UC06 E1).',
      };
    }

    if (!this.apiKey) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: requestedModel,
        provider: 'openai_dalle',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: 'Chưa cấu hình OPENAI_API_KEY.',
      };
    }

    try {
      // When using gpt-image-1 / gpt-2.5-image and we have a site photo or product reference photo(s), use /v1/images/edits for true multi-image compositing!
      const hasSitePhoto = Boolean(input.referenceImageBuffer && input.referenceImageBuffer.length > 0);
      const hasProductPhotos = Boolean(input.productReferenceBuffers && input.productReferenceBuffers.length > 0);

      let res: Response;
      if (isGptImageModel && (hasSitePhoto || hasProductPhotos)) {
        const form = new FormData();
        form.append('model', apiModel);
        form.append('prompt', input.prompt);
        form.append('size', '1536x1024');
        if (hasSitePhoto && input.referenceImageBuffer) {
          const blob = new Blob([new Uint8Array(input.referenceImageBuffer)], {
            type: input.referenceImageMimeType || 'image/png',
          });
          form.append('image[]', blob, 'site-photo.png');
        }
        if (hasProductPhotos && input.productReferenceBuffers) {
          input.productReferenceBuffers.forEach((prod, idx) => {
            const blob = new Blob([new Uint8Array(prod.buffer)], {
              type: prod.mimeType || 'image/png',
            });
            form.append('image[]', blob, prod.name || `product-${idx + 1}.png`);
          });
        }
        res = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: form,
        });
      } else {
        const bodyPayload: Record<string, unknown> = {
          model: isGptImageModel ? apiModel : 'dall-e-3',
          prompt: input.prompt,
          n: 1,
          size: isGptImageModel ? '1536x1024' : '1024x1024',
        };
        if (!isGptImageModel) {
          bodyPayload.response_format = 'b64_json';
        }
        res = await fetch(this.apiEndpoint || 'https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });
      }

      const durationMs = Date.now() - started;
      if (!res.ok) {
        const text = await res.text();
        return {
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/png',
          durationMs,
          modelUsed: requestedModel,
          provider: 'openai_dalle',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0n,
          costCurrency: 'USD',
          status: 'failed',
          errorMessage: `OpenAI API Error [${res.status}]: ${text}`,
        };
      }

      const json = await res.json();
      const b64 = json.data?.[0]?.b64_json;
      return {
        imageBuffer: Buffer.from(b64 || '', 'base64'),
        mimeType: 'image/png',
        durationMs,
        modelUsed: requestedModel,
        provider: 'openai_dalle',
        promptTokens: Math.round(input.prompt.length * 1.5),
        completionTokens: 1024,
        totalTokens: Math.round(input.prompt.length * 1.5) + 1024,
        costMicros: 40_000n,
        costCurrency: 'USD',
        status: 'success',
      };
    } catch (err) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: requestedModel,
        provider: 'openai_dalle',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Lỗi kết nối OpenAI.',
      };
    }
  }

  async generateBannerDraft(input: BannerGenerationInput): Promise<ProviderGenerationResult> {
    const started = Date.now();
    const requestedModel = (input.modelId || this.activeModel || 'gpt-image-1').trim();
    const apiModel = requestedModel === 'gpt-2.5-image' ? 'gpt-image-1' : requestedModel;
    const isGptImageModel = apiModel.startsWith('gpt-image');

    if (!this.apiKey) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: requestedModel,
        provider: 'openai_dalle',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: 'Chưa cấu hình OPENAI_API_KEY cho luồng tạo Banner.',
      };
    }

    try {
      const hasProductPhotos = Boolean(input.productReferenceBuffers && input.productReferenceBuffers.length > 0);
      let res: Response;

      if (isGptImageModel && hasProductPhotos && input.productReferenceBuffers) {
        const form = new FormData();
        form.append('model', apiModel);
        form.append('prompt', input.prompt);
        form.append(
          'size',
          input.dimensions.widthPx >= input.dimensions.heightPx ? '1536x1024' : '1024x1536'
        );
        input.productReferenceBuffers.forEach((prod, idx) => {
          const blob = new Blob([new Uint8Array(prod.buffer)], {
            type: prod.mimeType || 'image/png',
          });
          form.append('image[]', blob, prod.name || `product-${idx + 1}.png`);
        });
        res = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: form,
        });
      } else {
        const bodyPayload: Record<string, unknown> = {
          model: isGptImageModel ? apiModel : 'dall-e-3',
          prompt: input.prompt,
          n: 1,
          size: isGptImageModel
            ? input.dimensions.widthPx >= input.dimensions.heightPx
              ? '1536x1024'
              : '1024x1536'
            : input.dimensions.widthPx > input.dimensions.heightPx
              ? '1792x1024'
              : '1024x1792',
        };
        if (!isGptImageModel) {
          bodyPayload.response_format = 'b64_json';
        }
        res = await fetch(this.apiEndpoint || 'https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });
      }

      const durationMs = Date.now() - started;
      if (!res.ok) {
        const text = await res.text();
        return {
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/png',
          durationMs,
          modelUsed: requestedModel,
          provider: 'openai_dalle',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0n,
          costCurrency: 'USD',
          status: 'failed',
          errorMessage: `OpenAI API Error [${res.status}]: ${text}`,
        };
      }

      const json = await res.json();
      const b64 = json.data?.[0]?.b64_json;
      return {
        imageBuffer: Buffer.from(b64 || '', 'base64'),
        mimeType: 'image/png',
        durationMs,
        modelUsed: requestedModel,
        provider: 'openai_dalle',
        promptTokens: Math.round(input.prompt.length * 1.5),
        completionTokens: 1024,
        totalTokens: Math.round(input.prompt.length * 1.5) + 1024,
        costMicros: 40_000n,
        costCurrency: 'USD',
        status: 'success',
      };
    } catch (err) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: requestedModel,
        provider: 'openai_dalle',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Lỗi kết nối OpenAI.',
      };
    }
  }
}

