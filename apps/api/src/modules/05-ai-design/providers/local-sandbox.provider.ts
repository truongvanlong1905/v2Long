/**
 * Local Sandbox Provider
 * Built-in local fallback adapter providing synthetic rendering for local development,
 * CI/CD verification, and sandbox evaluation without billable external API calls.
 */

import {
  type AiDesignProvider,
  type BannerGenerationInput,
  type PerspectiveGenerationInput,
  type ProviderGenerationResult,
  type ProviderStatusInfo,
} from './types';

// Valid 1x1 base transparent PNG header + IEND
const SYNTHETIC_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEgQH532y8kAAAAABJRU5ErkJggg==',
  'base64'
);

export class LocalSandboxAiProvider implements AiDesignProvider {
  readonly providerId = 'local_sandbox' as const;

  getStatusInfo(): ProviderStatusInfo {
    return {
      provider: 'local_sandbox',
      providerName: 'Toàn Trung Local Sandbox AI Engine',
      isConfigured: true,
      statusLabel: 'Chế độ mô phỏng Sandbox (Chưa kết nối AI trả phí)',
      activeModel: 'toantrung-synthetic-v2',
      costPerImageUsd: 0.0,
      supportsInpainting: true,
      notes:
        'Chế độ cục bộ an toàn: sinh bản nháp phối cảnh và banner tổng hợp mà không phát sinh chi phí bên thứ ba.',
    };
  }

  async generatePerspectiveDraft(
    input: PerspectiveGenerationInput
  ): Promise<ProviderGenerationResult> {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 85));
    const durationMs = Date.now() - started;

    if (input.simulateTimeout) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs,
        modelUsed: 'imagen-3.0-generate-002',
        provider: 'local_sandbox',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'timeout',
        errorMessage: 'Hệ thống AI dựng ảnh quá thời gian phản hồi 60s (Simulated UC06 E1).',
      };
    }

    const promptTokens = Math.max(120, Math.round(input.prompt.length * 1.8));
    const completionTokens = 2100;
    const totalTokens = promptTokens + completionTokens;
    const costMicros = input.quality === 'high_quality' ? 40_000n : 30_000n;

    return {
      imageBuffer: SYNTHETIC_PNG_BUFFER,
      mimeType: 'image/png',
      durationMs,
      modelUsed: 'imagen-3.0-generate-002',
      provider: 'local_sandbox',
      promptTokens,
      completionTokens,
      totalTokens,
      costMicros,
      costCurrency: 'USD',
      status: 'success',
    };
  }

  async generateBannerDraft(input: BannerGenerationInput): Promise<ProviderGenerationResult> {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 75));
    const durationMs = Date.now() - started;

    if (input.simulateTimeout) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs,
        modelUsed: 'imagen-3.0-generate-002',
        provider: 'local_sandbox',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'timeout',
        errorMessage: 'Hệ thống AI tạo Banner quá thời gian phản hồi (Simulated UC06 E1).',
      };
    }

    const promptTokens = Math.max(100, Math.round(input.prompt.length * 1.6));
    const completionTokens = 1600;
    const totalTokens = promptTokens + completionTokens;
    const costMicros = 24_000n;

    return {
      imageBuffer: SYNTHETIC_PNG_BUFFER,
      mimeType: 'image/png',
      durationMs,
      modelUsed: 'imagen-3.0-generate-002',
      provider: 'local_sandbox',
      promptTokens,
      completionTokens,
      totalTokens,
      costMicros,
      costCurrency: 'USD',
      status: 'success',
    };
  }
}

