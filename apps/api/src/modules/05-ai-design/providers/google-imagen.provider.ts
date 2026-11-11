/**
 * Google Imagen 3 Provider Adapter
 * Primary Provider for Reference-Conditioned LED Perspective Inpainting & Banner Generation
 *
 * Official Pricing (November 2026 Google Cloud Vertex AI / Gemini API):
 * - Model: imagen-3.0-generate-002 / imagen-3.0-capability-001 (Inpainting/Editing)
 * - Billing unit: Per generated image (NOT solely by text token)
 * - Standard Quality: $0.030 USD / image (= 30,000 micros)
 * - High Quality / Fast Editing: $0.040 USD / image (= 40,000 micros)
 */

import {
  type AiDesignProvider,
  type BannerGenerationInput,
  type PerspectiveGenerationInput,
  type ProviderGenerationResult,
  type ProviderStatusInfo,
} from './types';

export interface GoogleImagenProviderOptions {
  apiKey?: string | null;
  projectId?: string | null;
  apiEndpoint?: string | null;
  activeModel?: string | null;
}

export class GoogleImagenProvider implements AiDesignProvider {
  readonly providerId = 'google_imagen' as const;
  private readonly apiKey: string | null;
  private readonly projectId: string | null;
  private readonly apiEndpoint: string;
  private readonly activeModel: string;

  constructor(opts?: GoogleImagenProviderOptions) {
    this.apiKey = opts?.apiKey || process.env.IMAGEN_API_KEY || process.env.GEMINI_API_KEY || null;
    this.projectId = opts?.projectId || process.env.GOOGLE_CLOUD_PROJECT || null;
    this.activeModel = opts?.activeModel || 'imagen-3.0-generate-002';
    this.apiEndpoint =
      opts?.apiEndpoint ||
      process.env.VERTEX_AI_ENDPOINT ||
      `https://generativelanguage.googleapis.com/v1beta/models/${this.activeModel}:predict`;
  }

  getStatusInfo(): ProviderStatusInfo {
    const isConfigured = Boolean(this.apiKey || this.projectId);
    return {
      provider: 'google_imagen',
      providerName: 'Google Imagen 3 & Gemini Image',
      isConfigured,
      statusLabel: isConfigured ? 'Đã kết nối API Key' : 'Chưa cấu hình API Key (IMAGEN_API_KEY)',
      activeModel: this.activeModel,
      costPerImageUsd: this.activeModel.includes('fast') ? 0.02 : 0.03,
      supportsInpainting: true,
      notes:
        'Hỗ trợ Inpainting bảo tồn bối cảnh phòng & kiến trúc showroom, kết xuất ánh sáng LED chân thực theo chuẩn Google Cloud.',
    };
  }

  private async tryGeminiGenerateContentImage(
    prompt: string,
    started: number,
    referenceImageBuffer?: Buffer,
    referenceImageMimeType?: string,
    productReferenceBuffers?: Array<{ buffer: Buffer; mimeType: string; name: string }>
  ): Promise<{ result: ProviderGenerationResult | null; freeTierBlocked?: boolean }> {
    if (!this.apiKey) return { result: null };
    const requestedImgModel =
      this.activeModel.includes('image') || this.activeModel.includes('banana')
        ? this.activeModel.replace(/^models\//, '')
        : '';
    const candidateModels = Array.from(
      new Set(
        [
          requestedImgModel,
          'gemini-2.5-flash-image',
          'gemini-3.1-flash-image',
          'gemini-3.1-flash-lite-image',
        ].filter(Boolean)
      )
    ).slice(0, 3);

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [{ text: prompt }];

    if (referenceImageBuffer && referenceImageBuffer.length > 0 && referenceImageBuffer.length < 5 * 1024 * 1024) {
      parts.push({
        inlineData: {
          mimeType:
            referenceImageMimeType && referenceImageMimeType.startsWith('image/')
              ? referenceImageMimeType
              : 'image/jpeg',
          data: referenceImageBuffer.toString('base64'),
        },
      });
    }

    if (productReferenceBuffers && productReferenceBuffers.length > 0) {
      for (const prod of productReferenceBuffers) {
        if (prod.buffer && prod.buffer.length > 0 && prod.buffer.length < 5 * 1024 * 1024) {
          parts.push({
            inlineData: {
              mimeType: prod.mimeType?.startsWith('image/') ? prod.mimeType : 'image/jpeg',
              data: prod.buffer.toString('base64'),
            },
          });
        }
      }
    }

    let freeTierBlocked = false;
    for (const geminiImgModel of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          geminiImgModel
        )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts,
              },
            ],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
            },
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          const errTxt = await res.text().catch(() => '');
          if (res.status === 429 && /limit:\s*0|free_tier/i.test(errTxt)) {
            freeTierBlocked = true;
            break;
          }
          continue;
        }
        const json = (await res.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                inlineData?: { mimeType?: string; data?: string };
              }>;
            };
          }>;
        };
        const resParts = json.candidates?.[0]?.content?.parts || [];
        const imgPart = resParts.find((p) => p.inlineData?.data);
        if (!imgPart?.inlineData?.data) continue;

        return {
          result: {
            imageBuffer: Buffer.from(imgPart.inlineData.data, 'base64'),
            mimeType: imgPart.inlineData.mimeType || 'image/png',
            durationMs: Date.now() - started,
            modelUsed: geminiImgModel,
            provider: 'google_imagen',
            promptTokens: Math.round(prompt.length * 1.5),
            completionTokens: 1290,
            totalTokens: Math.round(prompt.length * 1.5) + 1290,
            costMicros: 0n,
            costCurrency: 'USD',
            status: 'success',
          },
        };
      } catch {
        // try next candidate
      }
    }
    return { result: null, freeTierBlocked };
  }

  async generatePerspectiveDraft(
    input: PerspectiveGenerationInput
  ): Promise<ProviderGenerationResult> {
    const started = Date.now();

    if (input.simulateTimeout) {
      await new Promise((r) => setTimeout(r, 120));
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: 'imagen-3.0-capability-001',
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'timeout',
        errorMessage: 'Google Imagen 3 API quá thời gian phản hồi 60s (Simulated UC06 E1).',
      };
    }

    if (!this.apiKey && !this.projectId) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: this.activeModel,
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage:
          'Chưa cấu hình Google Cloud Vertex AI credentials (thiếu biến môi trường IMAGEN_API_KEY hoặc GOOGLE_CLOUD_PROJECT).',
      };
    }

    // Try multimodal Gemini Image Editing first (with referenceImageBuffer + productReferenceBuffers attached!)
    const gemAttempt = await this.tryGeminiGenerateContentImage(
      input.prompt,
      started,
      input.referenceImageBuffer,
      input.referenceImageMimeType,
      input.productReferenceBuffers
    );
    if (gemAttempt.result) return gemAttempt.result;
    if (gemAttempt.freeTierBlocked) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: this.activeModel,
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage:
          'FREE_TIER_IMAGE_LIMIT_0: Tài khoản Google AI Studio (Key Gmail Miễn phí $0) hiện bị Google giới hạn limit: 0 đối với tính năng xuất file ảnh mới (chỉ miễn phí tính năng Nhìn ảnh Vision & Chat chữ). Để AI tự động sửa/xuất file ảnh trực tiếp trên đám mây, cần bật Billing Tier 1 trên Google AI Studio hoặc gắn Key OpenAI (gpt-image-1) / FLUX.',
      };
    }

    // Call official Vertex AI / Gemini API when credentials are provided
    try {
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [
            {
              prompt: input.prompt,
              referenceImage: input.referenceImageUrl,
              aspectRatio: input.dimensions.aspectRatio || '16:9',
            },
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: input.dimensions.aspectRatio || '16:9',
            safetyFilterLevel: 'block_medium_and_above',
            personGeneration: 'dont_allow',
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      const durationMs = Date.now() - started;
      if (!response.ok) {
        const errorText = await response.text();
        return {
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/png',
          durationMs,
          modelUsed: this.activeModel,
          provider: 'google_imagen',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0n,
          costCurrency: 'USD',
          status: 'failed',
          errorMessage: `Google Imagen 3 API Error [${response.status}]: ${errorText}`,
        };
      }

      const json = await response.json();
      const b64 = json.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) {
        return {
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/png',
          durationMs,
          modelUsed: 'imagen-3.0-generate-002',
          provider: 'google_imagen',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0n,
          costCurrency: 'USD',
          status: 'failed',
          errorMessage: 'Google Imagen 3 API không trả về dữ liệu ảnh hợp lệ.',
        };
      }

      const costMicros = input.quality === 'high_quality' ? 40_000n : 30_000n;
      return {
        imageBuffer: Buffer.from(b64, 'base64'),
        mimeType: 'image/png',
        durationMs,
        modelUsed: 'imagen-3.0-generate-002',
        provider: 'google_imagen',
        promptTokens: Math.round(input.prompt.length * 1.5),
        completionTokens: 2048,
        totalTokens: Math.round(input.prompt.length * 1.5) + 2048,
        costMicros,
        costCurrency: 'USD',
        status: 'success',
      };
    } catch (err) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: 'imagen-3.0-generate-002',
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Lỗi kết nối Google Imagen 3 API.',
      };
    }
  }

  async generateBannerDraft(input: BannerGenerationInput): Promise<ProviderGenerationResult> {
    const started = Date.now();
    if (input.simulateTimeout) {
      await new Promise((r) => setTimeout(r, 120));
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: 'imagen-3.0-generate-002',
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'timeout',
        errorMessage: 'Google Imagen API quá thời gian phản hồi (Banner).',
      };
    }

    if (!this.apiKey && !this.projectId) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: this.activeModel,
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: 'Chưa cấu hình API Key Google Imagen (IMAGEN_API_KEY).',
      };
    }

    const gemAttempt = await this.tryGeminiGenerateContentImage(
      input.prompt,
      started,
      undefined,
      undefined,
      input.productReferenceBuffers
    );
    if (gemAttempt.result) return gemAttempt.result;
    if (gemAttempt.freeTierBlocked) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: this.activeModel,
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage:
          'FREE_TIER_IMAGE_LIMIT_0: Tài khoản Google AI Studio (Key Gmail Miễn phí $0) hiện bị Google giới hạn limit: 0 đối với tính năng xuất file ảnh mới (chỉ miễn phí tính năng Nhìn ảnh Vision & Chat chữ).',
      };
    }

    try {
      const response = await fetch(`${this.apiEndpoint}?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: input.prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: input.dimensions.aspectRatio || '16:9',
            safetyFilterLevel: 'block_medium_and_above',
          },
        }),
        signal: AbortSignal.timeout(8000),
      });

      const durationMs = Date.now() - started;
      if (!response.ok) {
        const errorText = await response.text();
        return {
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/png',
          durationMs,
          modelUsed: this.activeModel,
          provider: 'google_imagen',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0n,
          costCurrency: 'USD',
          status: 'failed',
          errorMessage: `Google Imagen Error [${response.status}]: ${errorText}`,
        };
      }

      const json = await response.json();
      const b64 = json.predictions?.[0]?.bytesBase64Encoded;
      return {
        imageBuffer: Buffer.from(b64, 'base64'),
        mimeType: 'image/png',
        durationMs,
        modelUsed: 'imagen-3.0-generate-002',
        provider: 'google_imagen',
        promptTokens: Math.round(input.prompt.length * 1.5),
        completionTokens: 1536,
        totalTokens: Math.round(input.prompt.length * 1.5) + 1536,
        costMicros: 30_000n,
        costCurrency: 'USD',
        status: 'success',
      };
    } catch (err) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: Date.now() - started,
        modelUsed: 'imagen-3.0-generate-002',
        provider: 'google_imagen',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Lỗi gọi API Google Imagen.',
      };
    }
  }
}

