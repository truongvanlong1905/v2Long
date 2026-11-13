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
    let ep = (opts.apiEndpoint || 'https://api.openai.com/v1/images/generations').trim();
    ep = ep.replace(/\.+$/, '').replace(/\/$/, '');
    if (!ep.endsWith('/images/generations')) {
      if (ep.endsWith('/v1')) {
        ep = `${ep}/images/generations`;
      }
    }
    this.apiEndpoint = ep;
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
    simulateTimeout?: boolean,
    referenceImageBuffer?: Buffer,
    referenceImageMimeType?: string,
    productReferenceBuffers?: Array<{ buffer: Buffer; mimeType: string; name: string }>
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
      // When using DiDi / CCPro / Codex proxy, map image models to the verified operational model `gpt-image-2`
      const isDiDiGateway =
        this.apiEndpoint.includes('ccpro.cn') ||
        Boolean(this.apiKey?.startsWith('sk-jy-') || this.apiKey?.startsWith('sk-cx-'));

      const effectiveModel = isDiDiGateway ? 'gpt-image-2' : modelId;
      const hasSitePhoto = Boolean(referenceImageBuffer && referenceImageBuffer.length > 0);
      const hasProductPhotos = Boolean(productReferenceBuffers && productReferenceBuffers.length > 0);

      let response: Response;
      if (hasSitePhoto || hasProductPhotos) {
        // Use /v1/images/edits multipart FormData so the AI strictly bases the result on the provided image(s)!
        const editsEndpoint = this.apiEndpoint.replace(/\/images\/generations\/?$/i, '/images/edits');
        const form = new FormData();
        form.append('model', effectiveModel);
        const editInstruction = hasSitePhoto
          ? `STRICTLY preserve the exact original provided photo background, structure, objects, lighting, and camera angle. Do NOT over-transform or invent a new scene. Only apply the user's exact requested edit cleanly onto the provided image: ${prompt}`
          : `Use the provided product reference image(s) faithfully without altering their shape, logo, or details: ${prompt}`;
        form.append('prompt', editInstruction);
        form.append('size', isDiDiGateway ? '1024x1024' : widthPx >= heightPx ? '1536x1024' : '1024x1536');

        if (hasSitePhoto && referenceImageBuffer) {
          const blob = new Blob([new Uint8Array(referenceImageBuffer)], {
            type: referenceImageMimeType || 'image/png',
          });
          form.append('image', blob, 'site-photo.png');
        }
        if (hasProductPhotos && productReferenceBuffers) {
          productReferenceBuffers.forEach((prod, idx) => {
            const blob = new Blob([new Uint8Array(prod.buffer)], {
              type: prod.mimeType || 'image/png',
            });
            form.append(hasSitePhoto ? 'image[]' : idx === 0 ? 'image' : 'image[]', blob, prod.name || `product-${idx + 1}.png`);
          });
        }

        response = await fetch(editsEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: form,
          signal: AbortSignal.timeout(75000),
        });
      } else {
        const payloadBody: Record<string, unknown> = {
          model: effectiveModel,
          prompt,
          n: 1,
          size: isDiDiGateway ? '1024x1024' : widthPx >= heightPx ? '1792x1024' : '1024x1792',
        };
        if (!isDiDiGateway) {
          payloadBody.response_format = 'b64_json';
        }

        response = await fetch(this.apiEndpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payloadBody),
          signal: AbortSignal.timeout(75000),
        });
      }

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

      let imageBuffer: Buffer | null = null;
      if (b64) {
        imageBuffer = Buffer.from(b64, 'base64');
      } else if (json.data?.[0]?.url) {
        try {
          const imgFetch = await fetch(json.data[0].url);
          if (imgFetch.ok) {
            const arr = await imgFetch.arrayBuffer();
            imageBuffer = Buffer.from(arr);
          }
        } catch {
          // ignore fetch error
        }
      }

      if (!imageBuffer || imageBuffer.length === 0) {
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
          errorMessage: `${this.providerName} không trả về dữ liệu ảnh base64 hoặc URL hợp lệ.`,
        };
      }

      const costMicros = BigInt(Math.round(this.costPerImageUsd * 1_000_000));
      return {
        imageBuffer,
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
    return this.invokeEndpoint(
      input.prompt,
      modelId,
      1792,
      1024,
      input.simulateTimeout,
      input.referenceImageBuffer,
      input.referenceImageMimeType,
      input.productReferenceBuffers
    );
  }

  async generateBannerDraft(input: BannerGenerationInput): Promise<ProviderGenerationResult> {
    const modelId = input.modelId || this.activeModel;
    return this.invokeEndpoint(
      input.prompt,
      modelId,
      input.dimensions.widthPx,
      input.dimensions.heightPx,
      input.simulateTimeout,
      undefined,
      undefined,
      input.productReferenceBuffers
    );
  }
}

