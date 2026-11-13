/**
 * Multi-AI Design Provider Factory & Dynamic Model Registry
 * Supports switching between multiple AI providers & models at runtime:
 * - Google Imagen 3 & Gemini Image (`google_imagen`)
 * - OpenAI GPT-Image-1 & DALL-E 3 (`openai_dalle`)
 * - Black Forest Labs FLUX.1 Pro / Dev (`flux_bfl`)
 * - Stability AI Stable Diffusion 3.5 / SDXL (`stability_ai`)
 * - Custom AI Gateway / OpenRouter / ComfyUI (`custom_endpoint`)
 * - Toàn Trung Studio Smart Engine v3 (`local_sandbox`)
 */

import fs from 'node:fs';
import path from 'node:path';
import type {
  AiModelOptionDto,
  AiProviderCatalogItemDto,
  AiProviderId,
  ConfigureAiProvidersDto,
} from '@toantrung/contracts';
import { APP_CONFIG } from '../../../core/config';
import { GoogleImagenProvider } from './google-imagen.provider';
import { OpenAiImageProvider } from './openai-image.provider';
import { UniversalCloudAiProvider } from './universal-cloud.provider';
import { LocalSandboxAiProvider } from './local-sandbox.provider';
import {
  type AiDesignProvider,
  type BannerGenerationInput,
  type PerspectiveGenerationInput,
  type ProviderGenerationResult,
  type ProviderStatusInfo,
} from './types';
import { validateGeneratedImageBuffer } from '../perspective-compositor';

interface StoredProviderEntry {
  apiKey?: string | null;
  apiEndpoint?: string | null;
  activeModel?: string | null;
  discoveredModels?: AiModelOptionDto[];
}

function mergeProviderModels(
  discovered: AiModelOptionDto[] | undefined,
  defaults: AiModelOptionDto[]
): AiModelOptionDto[] {
  // When live-probed usable models have been discovered for this API key, return ONLY those verified working models!
  if (discovered && discovered.length > 0) {
    return discovered;
  }
  return defaults;
}

interface StoredMultiAiConfig {
  defaultProviderId: AiProviderId;
  defaultModelId?: string;
  autoFallbackToLocal: boolean;
  providers: Partial<Record<AiProviderId, StoredProviderEntry>>;
}

const DEFAULT_MULTI_AI_CONFIG: StoredMultiAiConfig = {
  defaultProviderId: 'google_imagen',
  defaultModelId: 'imagen-3.0-generate-002',
  autoFallbackToLocal: true,
  providers: {},
};

function getConfigFilePath(): string {
  const dir = path.join(APP_CONFIG.getStorageRoot(), 'config');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'multi-ai-providers.json');
}

function readStoredConfig(): StoredMultiAiConfig {
  try {
    const file = getConfigFilePath();
    if (!fs.existsSync(file)) {
      return { ...DEFAULT_MULTI_AI_CONFIG, providers: {} };
    }
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<StoredMultiAiConfig>;
    return {
      defaultProviderId: parsed.defaultProviderId || 'google_imagen',
      defaultModelId: parsed.defaultModelId || 'imagen-3.0-generate-002',
      autoFallbackToLocal: parsed.autoFallbackToLocal ?? true,
      providers: parsed.providers || {},
    };
  } catch {
    return { ...DEFAULT_MULTI_AI_CONFIG, providers: {} };
  }
}

function writeStoredConfig(config: StoredMultiAiConfig): void {
  try {
    const file = getConfigFilePath();
    fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf-8');
  } catch {
    // Ignore write failure in read-only test environments
  }
}

function maskKey(key: string | null | undefined): string | null {
  if (!key || key.trim().length < 4) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

export class AiDesignProviderFactory {
  static getCatalog(): {
    config: StoredMultiAiConfig;
    catalog: AiProviderCatalogItemDto[];
  } {
    const config = readStoredConfig();

    const googleKey =
      config.providers.google_imagen?.apiKey ||
      process.env.IMAGEN_API_KEY ||
      process.env.GEMINI_API_KEY ||
      null;
    const openAiKey =
      config.providers.openai_dalle?.apiKey || process.env.OPENAI_API_KEY || null;
    const fluxKey =
      config.providers.flux_bfl?.apiKey ||
      process.env.FLUX_API_KEY ||
      process.env.BFL_API_KEY ||
      null;
    const stabilityKey =
      config.providers.stability_ai?.apiKey || process.env.STABILITY_API_KEY || null;
    const customKey =
      config.providers.custom_endpoint?.apiKey || process.env.CUSTOM_AI_API_KEY || null;

    const catalog: AiProviderCatalogItemDto[] = [
      {
        providerId: 'google_imagen',
        providerName: 'Google Imagen 3 & Gemini Image',
        shortName: 'Google Imagen 3',
        isConfigured: Boolean(googleKey || process.env.GOOGLE_CLOUD_PROJECT),
        isDefault: config.defaultProviderId === 'google_imagen',
        activeModel:
          config.providers.google_imagen?.activeModel || 'imagen-3.0-generate-002',
        apiEndpoint:
          config.providers.google_imagen?.apiEndpoint ||
          process.env.VERTEX_AI_ENDPOINT ||
          'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict',
        hasApiKey: Boolean(googleKey),
        maskedApiKey: maskKey(googleKey),
        statusLabel: googleKey
          ? 'Đã kết nối API Key'
          : config.autoFallbackToLocal
            ? 'Sẵn sàng (Tự động kết xuất qua Studio Engine khi chưa nhập Key)'
            : 'Chưa cấu hình IMAGEN_API_KEY',
        notes:
          'Chuyên dụng dựng phối cảnh 3D màn hình LED giữ nguyên kiến trúc phòng họp, hội trường & mặt tiền tòa nhà.',
        models: mergeProviderModels(config.providers.google_imagen?.discoveredModels, [
          {
            id: 'gemini-2.5-flash-image',
            name: 'Gemini 2.5 Flash Image',
            badge: 'New',
            costPerImageUsd: 0.02,
            supportsInpainting: true,
            description: 'Nhận diện đồng thời ảnh công trình + ảnh sản phẩm mẫu để ghép phối cảnh và tạo Banner.',
          },
          {
            id: 'imagen-3.0-generate-002',
            name: 'Google Imagen 3',
            badge: 'Pro',
            costPerImageUsd: 0.03,
            supportsInpainting: true,
            description: 'Độ nét cao, giữ nguyên 100% nội thất phòng và ánh sáng phản chiếu sàn.',
          },
          {
            id: 'gemini-3.5-flash-lite',
            name: 'Gemini 3.5 Flash',
            badge: 'Fast',
            costPerImageUsd: 0.0,
            supportsInpainting: true,
            description: 'Tốc độ cao, phân tích ảnh công trình và trò chuyện tự nhiên ($0).',
          },
        ]),
      },
      {
        providerId: 'openai_dalle',
        providerName: 'OpenAI GPT 2.5 Image',
        shortName: 'OpenAI GPT 2.5 Image',
        isConfigured: Boolean(openAiKey),
        isDefault: config.defaultProviderId === 'openai_dalle',
        activeModel: config.providers.openai_dalle?.activeModel || 'gpt-2.5-image',
        apiEndpoint:
          config.providers.openai_dalle?.apiEndpoint ||
          'https://api.openai.com/v1/images/generations',
        hasApiKey: Boolean(openAiKey),
        maskedApiKey: maskKey(openAiKey),
        statusLabel: openAiKey
          ? 'Đã kết nối API Key'
          : config.autoFallbackToLocal
            ? 'Sẵn sàng (Tự động kết xuất qua Studio Engine khi chưa nhập Key)'
            : 'Chưa cấu hình OPENAI_API_KEY',
        notes:
          'Hỗ trợ ghép ảnh sản phẩm công ty vào ảnh hiện trường (Multi-Image Edit), thiết kế Banner có sản phẩm và hiển thị chữ sắc nét.',
        models: mergeProviderModels(config.providers.openai_dalle?.discoveredModels, [
          {
            id: 'gpt-2.5-image',
            name: 'GPT 2.5 Image',
            badge: 'New',
            costPerImageUsd: 0.04,
            supportsInpainting: true,
            description: 'Hỗ trợ nhận nhiều ảnh đầu vào (ảnh công trình + ảnh sản phẩm mẫu) để ghép phối cảnh & thiết kế Banner.',
          },
          {
            id: 'gpt-image-1',
            name: 'GPT-Image 1',
            badge: 'Standard',
            costPerImageUsd: 0.04,
            supportsInpainting: true,
            description: 'Hiển thị chữ tiếng Việt/Anh trên Banner và ghép vùng chọn chính xác.',
          },
        ]),
      },
      {
        providerId: 'flux_bfl',
        providerName: 'Black Forest Labs FLUX.1 Pro',
        shortName: 'FLUX.1 Pro',
        isConfigured: Boolean(fluxKey),
        isDefault: config.defaultProviderId === 'flux_bfl',
        activeModel: config.providers.flux_bfl?.activeModel || 'flux-1.1-pro-ultra',
        apiEndpoint:
          config.providers.flux_bfl?.apiEndpoint ||
          'https://api.bfl.ml/v1/flux-pro-1.1-ultra',
        hasApiKey: Boolean(fluxKey),
        maskedApiKey: maskKey(fluxKey),
        statusLabel: fluxKey
          ? 'Đã kết nối API Key'
          : config.autoFallbackToLocal
            ? 'Sẵn sàng (Tự động kết xuất qua Studio Engine khi chưa nhập Key)'
            : 'Chưa cấu hình FLUX_API_KEY',
        notes:
          'Chuyên gia kết xuất ánh sáng kiến trúc nội thất & mặt tiền tòa nhà siêu thực (Photorealistic 4K).',
        models: mergeProviderModels(config.providers.flux_bfl?.discoveredModels, [
          {
            id: 'flux-1.1-pro-ultra',
            name: 'FLUX 1.1 Pro Ultra 4K',
            badge: 'Siêu thực 4K',
            costPerImageUsd: 0.035,
            supportsInpainting: true,
            description: 'Chất lượng ánh sáng LED và vật liệu kiến trúc chân thực bậc nhất.',
          },
          {
            id: 'flux-1-fill-pro',
            name: 'FLUX.1 Fill Pro (Inpainting)',
            badge: 'Ghép vách tường',
            costPerImageUsd: 0.03,
            supportsInpainting: true,
            description: 'Chuyên ghép màn hình LED vào đúng khung vách tường hiện trạng.',
          },
        ]),
      },
      {
        providerId: 'stability_ai',
        providerName: 'Stability AI (SD 3.5 & SDXL)',
        shortName: 'Stability SD 3.5',
        isConfigured: Boolean(stabilityKey),
        isDefault: config.defaultProviderId === 'stability_ai',
        activeModel: config.providers.stability_ai?.activeModel || 'sd3.5-large',
        apiEndpoint:
          config.providers.stability_ai?.apiEndpoint ||
          'https://api.stability.ai/v2beta/stable-image/generate/sd3',
        hasApiKey: Boolean(stabilityKey),
        maskedApiKey: maskKey(stabilityKey),
        statusLabel: stabilityKey
          ? 'Đã kết nối API Key'
          : config.autoFallbackToLocal
            ? 'Sẵn sàng (Tự động kết xuất qua Studio Engine khi chưa nhập Key)'
            : 'Chưa cấu hình STABILITY_API_KEY',
        notes:
          'Phù hợp dựng phối cảnh công trình ngoài trời, bảng điện tử nhà máy và điều khiển ControlNet.',
        models: mergeProviderModels(config.providers.stability_ai?.discoveredModels, [
          {
            id: 'sd3.5-large',
            name: 'Stable Diffusion 3.5 Large',
            badge: 'Chuẩn kiến trúc',
            costPerImageUsd: 0.03,
            supportsInpainting: true,
            description: 'Kiểm soát tốt tỷ lệ khung hình rộng 21:9, 32:9 cho màn hình LED dài.',
          },
          {
            id: 'sdxl-inpaint-v1',
            name: 'SDXL Inpainting 1.0',
            badge: 'Nhanh & nhẹ',
            costPerImageUsd: 0.015,
            supportsInpainting: true,
            description: 'Ghép nhanh màn hình LED vào ảnh chụp khảo sát công trình.',
          },
        ]),
      },
      {
        providerId: 'custom_endpoint',
        providerName: 'Custom AI Gateway / OpenRouter / ComfyUI',
        shortName: 'Custom AI API',
        isConfigured: Boolean(customKey || config.providers.custom_endpoint?.apiEndpoint),
        isDefault: config.defaultProviderId === 'custom_endpoint',
        activeModel:
          config.providers.custom_endpoint?.activeModel || 'custom-led-diffusion-v1',
        apiEndpoint:
          config.providers.custom_endpoint?.apiEndpoint ||
          'https://openrouter.ai/api/v1/images/generations',
        hasApiKey: Boolean(customKey),
        maskedApiKey: maskKey(customKey),
        statusLabel: customKey
          ? 'Đã kết nối Custom Endpoint'
          : 'Mở rộng linh hoạt (Hỗ trợ mọi API chuẩn OpenAI / ComfyUI)',
        notes:
          'Cho phép đấu nối bất kỳ con AI mới nào trong tương lai (OpenRouter, Replicate, fal.ai, máy chủ GPU nội bộ ComfyUI) chỉ bằng URL & Key.',
        models: mergeProviderModels(config.providers.custom_endpoint?.discoveredModels, [
          {
            id: config.providers.custom_endpoint?.activeModel || 'custom-led-diffusion-v1',
            name: `Model tùy chỉnh (${config.providers.custom_endpoint?.activeModel || 'custom-led-diffusion-v1'})`,
            badge: 'Tùy biến 100%',
            costPerImageUsd: 0.02,
            supportsInpainting: true,
            description: 'Gọi trực tiếp tới Endpoint tùy chỉnh do doanh nghiệp cấu hình.',
          },
        ]),
      },
      {
        providerId: 'local_sandbox',
        providerName: 'Toàn Trung Studio Engine v3 (Nội bộ)',
        shortName: 'Toàn Trung Studio v3',
        isConfigured: true,
        isDefault: config.defaultProviderId === 'local_sandbox',
        activeModel: config.providers.local_sandbox?.activeModel || 'toantrung-studio-v3',
        hasApiKey: true,
        maskedApiKey: 'BUILT-IN-READY',
        statusLabel: 'Sẵn sàng 100% · Không cần API Key',
        notes:
          'Engine dựng phối cảnh 3D & ghép khung LED trực tiếp của Toàn Trung: hoạt động tức thì 24/7, không tốn phí API và bảo mật tuyệt đối.',
        models: [
          {
            id: 'toantrung-studio-v3',
            name: 'Toàn Trung Studio Compositor v3',
            badge: 'Miễn phí & Tức thì',
            costPerImageUsd: 0.0,
            supportsInpainting: true,
            description: 'Kết xuất ngay bản nháp phối cảnh LED & Banner chuẩn kỹ thuật Toàn Trung.',
          },
        ],
      },
    ];

    return { config, catalog };
  }

  static getProvider(
    requestedProviderId?: AiProviderId,
    requestedModelId?: string
  ): AiDesignProvider {
    const { config, catalog } = this.getCatalog();
    const targetProviderId: AiProviderId =
      requestedProviderId || config.defaultProviderId || 'google_imagen';
    const catEntry = catalog.find((c) => c.providerId === targetProviderId);
    const activeModel =
      requestedModelId ||
      catEntry?.activeModel ||
      config.defaultModelId ||
      'imagen-3.0-generate-002';

    if (targetProviderId === 'google_imagen') {
      return new GoogleImagenProvider({
        apiKey: config.providers.google_imagen?.apiKey,
        apiEndpoint: config.providers.google_imagen?.apiEndpoint,
        activeModel,
      });
    }

    if (targetProviderId === 'openai_dalle') {
      return new OpenAiImageProvider({
        apiKey: config.providers.openai_dalle?.apiKey,
        apiEndpoint: config.providers.openai_dalle?.apiEndpoint,
        activeModel,
      });
    }

    if (
      targetProviderId === 'flux_bfl' ||
      targetProviderId === 'stability_ai' ||
      targetProviderId === 'custom_endpoint'
    ) {
      const stored = config.providers[targetProviderId];
      const envKey =
        targetProviderId === 'flux_bfl'
          ? process.env.FLUX_API_KEY || process.env.BFL_API_KEY
          : targetProviderId === 'stability_ai'
            ? process.env.STABILITY_API_KEY
            : process.env.CUSTOM_AI_API_KEY;

      return new UniversalCloudAiProvider({
        providerId: targetProviderId,
        providerName: catEntry?.providerName || targetProviderId,
        apiKey: stored?.apiKey || envKey || null,
        apiEndpoint: stored?.apiEndpoint || catEntry?.apiEndpoint,
        activeModel,
        costPerImageUsd: catEntry?.models[0]?.costPerImageUsd ?? 0.03,
        notes: catEntry?.notes || '',
      });
    }

    return new LocalSandboxAiProvider(activeModel);
  }

  /**
   * Checks whether a model ID belongs to the CHAT MODEL group (text/vision consultation only)
   * rather than an IMAGE MODEL capable of binary image generation.
   */
  static isChatOnlyModel(modelId?: string | null): boolean {
    if (!modelId) return false;
    const clean = modelId.trim().toLowerCase();
    if (
      clean.includes('image') ||
      clean.includes('imagen') ||
      clean.includes('dall-e') ||
      clean.includes('flux') ||
      clean.includes('sd3') ||
      clean.includes('sdxl') ||
      clean.includes('diffusion') ||
      clean === 'toantrung-studio-v3'
    ) {
      return false;
    }
    if (
      clean === 'toantrung-rules-v3' ||
      clean.startsWith('gemini-3.5-flash-lite') ||
      clean.startsWith('gemini-3.1-flash-lite') ||
      clean === 'gemini-flash-lite-latest' ||
      clean.startsWith('gemma-') ||
      clean.startsWith('gpt-4') ||
      clean.startsWith('gpt-3.5') ||
      clean.startsWith('llama-') ||
      clean.startsWith('claude-')
    ) {
      return true;
    }
    return false;
  }

  static async executePerspectiveWithFallback(
    input: PerspectiveGenerationInput,
    requestedProviderId?: AiProviderId
  ): Promise<ProviderGenerationResult> {
    const { config } = this.getCatalog();
    const targetProviderId = requestedProviderId || config.defaultProviderId || 'google_imagen';
    const allowFallback = !input.disableLocalFallback && config.autoFallbackToLocal;

    if (this.isChatOnlyModel(input.modelId) && !allowFallback) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: 0,
        modelUsed: input.modelId || 'chat-model',
        provider: targetProviderId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorCode: 'CHAT_MODEL_NO_IMAGE_OUTPUT',
        errorMessage: `Model "${input.modelId}" thuộc nhóm CHAT MODEL (chỉ tư vấn văn bản, không hỗ trợ xuất ảnh). Vui lòng chọn IMAGE MODEL (Google Imagen 3, Gemini Flash Image, OpenAI GPT-Image-1, FLUX.1 Pro hoặc Toàn Trung Studio Compositor).`,
      };
    }

    const provider = this.getProvider(targetProviderId, input.modelId);

    if (input.simulateTimeout) {
      return provider.generatePerspectiveDraft(input);
    }

    const res = await provider.generatePerspectiveDraft(input);
    if (res.status === 'success') {
      const check = validateGeneratedImageBuffer(res.imageBuffer);
      if (check.isValid) {
        return res;
      }
      res.status = 'failed';
      res.errorCode = check.errorCode || 'INVALID_IMAGE_BINARY';
      res.errorMessage =
        check.errorMessage || 'Provider chỉ trả về văn bản hoặc thiếu dữ liệu ảnh hợp lệ.';
    }

    if (
      !res.errorMessage?.startsWith('FREE_TIER_IMAGE_LIMIT_0') &&
      allowFallback &&
      targetProviderId !== 'local_sandbox'
    ) {
      const fallback = new LocalSandboxAiProvider(input.modelId || provider.getStatusInfo().activeModel);
      const fallbackRes = await fallback.generatePerspectiveDraft(input);
      return {
        ...fallbackRes,
        provider: targetProviderId,
        modelUsed: input.modelId || provider.getStatusInfo().activeModel,
        fallbackNotice:
          'Đã tự động kết xuất qua Toàn Trung Studio Engine (do AI đám mây chưa cấu hình API Key hoặc đang bảo trì).',
      };
    }

    return res;
  }

  static async executeBannerWithFallback(
    input: BannerGenerationInput,
    requestedProviderId?: AiProviderId
  ): Promise<ProviderGenerationResult> {
    const { config } = this.getCatalog();
    const targetProviderId = requestedProviderId || config.defaultProviderId || 'google_imagen';
    const allowFallback = !input.disableLocalFallback && config.autoFallbackToLocal;

    if (this.isChatOnlyModel(input.modelId) && !allowFallback) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs: 0,
        modelUsed: input.modelId || 'chat-model',
        provider: targetProviderId,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        costMicros: 0n,
        costCurrency: 'USD',
        status: 'failed',
        errorCode: 'CHAT_MODEL_NO_IMAGE_OUTPUT',
        errorMessage: `Model "${input.modelId}" thuộc nhóm CHAT MODEL (chỉ tư vấn văn bản, không hỗ trợ xuất ảnh Banner). Vui lòng chọn IMAGE MODEL (Google Imagen 3, OpenAI GPT-Image-1, FLUX.1 Pro hoặc Toàn Trung Studio Compositor).`,
      };
    }

    const provider = this.getProvider(targetProviderId, input.modelId);

    if (input.simulateTimeout) {
      return provider.generateBannerDraft(input);
    }

    const res = await provider.generateBannerDraft(input);
    if (res.status === 'success') {
      const check = validateGeneratedImageBuffer(res.imageBuffer);
      if (check.isValid) {
        return res;
      }
      res.status = 'failed';
      res.errorCode = check.errorCode || 'INVALID_IMAGE_BINARY';
      res.errorMessage =
        check.errorMessage || 'Provider chỉ trả về văn bản hoặc thiếu dữ liệu ảnh Banner hợp lệ.';
    }

    if (
      !res.errorMessage?.startsWith('FREE_TIER_IMAGE_LIMIT_0') &&
      allowFallback &&
      targetProviderId !== 'local_sandbox'
    ) {
      const fallback = new LocalSandboxAiProvider(input.modelId || provider.getStatusInfo().activeModel);
      const fallbackRes = await fallback.generateBannerDraft(input);
      return {
        ...fallbackRes,
        provider: targetProviderId,
        modelUsed: input.modelId || provider.getStatusInfo().activeModel,
        fallbackNotice:
          'Đã tự động kết xuất qua Toàn Trung Studio Engine (do AI đám mây chưa cấu hình API Key hoặc đang bảo trì).',
      };
    }

    return res;
  }

  static getActiveProviderInfo(): ProviderStatusInfo {
    const { config, catalog } = this.getCatalog();
    const activeCat =
      catalog.find((c) => c.providerId === config.defaultProviderId) || catalog[0];
    const isReady = activeCat.isConfigured || config.autoFallbackToLocal;

    return {
      provider: activeCat.providerId,
      providerName: activeCat.providerName,
      isConfigured: isReady,
      statusLabel: activeCat.isConfigured
        ? `${activeCat.shortName} · Đã kết nối Key`
        : config.autoFallbackToLocal
          ? `${activeCat.shortName} (Chế độ Studio Sẵn sàng)`
          : activeCat.statusLabel,
      activeModel: config.defaultModelId || activeCat.activeModel,
      costPerImageUsd: activeCat.models[0]?.costPerImageUsd ?? 0.03,
      supportsInpainting: true,
      notes: activeCat.notes,
      defaultProviderId: config.defaultProviderId,
      defaultModelId: config.defaultModelId || activeCat.activeModel,
      autoFallbackToLocal: config.autoFallbackToLocal,
      availableProviders: catalog,
    };
  }

  static updateConfiguration(input: ConfigureAiProvidersDto): ProviderStatusInfo {
    const current = readStoredConfig();
    current.defaultProviderId = input.defaultProviderId;
    if (input.defaultModelId) {
      current.defaultModelId = input.defaultModelId;
    }
    current.autoFallbackToLocal = input.autoFallbackToLocal ?? true;

    if (input.providerConfig) {
      const pid = input.providerConfig.providerId;
      const existingEntry = current.providers[pid] || {};
      const nextEntry: StoredProviderEntry = { ...existingEntry };

      if (input.providerConfig.apiKey !== undefined) {
        const trimmed = input.providerConfig.apiKey?.trim() || '';
        // Only overwrite if user typed a real key (not a masked placeholder)
        if (!trimmed.includes('••••')) {
          nextEntry.apiKey = trimmed || null;
        }
      }
      if (input.providerConfig.apiEndpoint !== undefined) {
        nextEntry.apiEndpoint = input.providerConfig.apiEndpoint?.trim() || null;
      }
      if (input.providerConfig.activeModel !== undefined) {
        nextEntry.activeModel = input.providerConfig.activeModel?.trim() || null;
        if (pid === current.defaultProviderId && nextEntry.activeModel) {
          current.defaultModelId = nextEntry.activeModel;
        }
      }
      current.providers[pid] = nextEntry;
    }

    writeStoredConfig(current);
    return this.getActiveProviderInfo();
  }

  static async testProviderConnection(input: {
    providerId?: AiProviderId;
    apiKey?: string | null;
    apiEndpoint?: string | null;
    modelId?: string | null;
  }): Promise<{
    ok: boolean;
    connected: boolean;
    providerId: AiProviderId;
    modelTested: string;
    latencyMs: number;
    replyText: string;
    maskedKey: string | null;
    discoveredModels?: AiModelOptionDto[];
    providerStatus?: ProviderStatusInfo;
  }> {
    const started = Date.now();
    const { config } = this.getCatalog();
    const pid: AiProviderId = input.providerId || config.defaultProviderId || 'google_imagen';

    if (pid === 'local_sandbox') {
      const localModels: AiModelOptionDto[] = [
        {
          id: 'toantrung-studio-v3',
          name: 'Toàn Trung Studio Compositor v3 (Nội bộ $0)',
          badge: 'Miễn phí & Tức thì',
          costPerImageUsd: 0,
          supportsInpainting: true,
          description: 'Kết xuất ngay bản nháp phối cảnh LED & Banner chuẩn kỹ thuật Toàn Trung.',
        },
        {
          id: 'toantrung-rules-v3',
          name: 'Toàn Trung AI Nội bộ (Chat & Bóc tách BOM $0)',
          badge: 'Chat & Vision ($0)',
          costPerImageUsd: 0,
          supportsInpainting: true,
          description: 'Trợ lý kỹ thuật nội bộ không cần mạng hay API Key.',
        },
      ];
      return {
        ok: true,
        connected: true,
        providerId: 'local_sandbox',
        modelTested: input.modelId || 'toantrung-studio-v3',
        latencyMs: 12,
        replyText:
          'Toàn Trung Studio Engine v3 (Nội bộ) đang hoạt động 100% — sẵn sàng dựng phối cảnh 3D LED & xuất bản vẽ Cabin BOM tức thì!',
        maskedKey: 'BUILT-IN-READY',
        discoveredModels: localModels,
        providerStatus: this.getActiveProviderInfo(),
      };
    }

    const rawInputKey = input.apiKey?.trim() || '';
    // Auto-detect provider from API Key prefix when user pastes any API key into the unified input
    let detectedPid: AiProviderId = pid;
    if (rawInputKey && !rawInputKey.includes('••••')) {
      if (rawInputKey.startsWith('AIza') || rawInputKey.startsWith('AQ.')) {
        detectedPid = 'google_imagen';
      } else if (
        rawInputKey.startsWith('sk-or-') ||
        rawInputKey.startsWith('gsk_') ||
        rawInputKey.startsWith('sk-jy-') ||
        rawInputKey.startsWith('sk-cx-') ||
        Boolean(input.apiEndpoint?.trim())
      ) {
        detectedPid = 'custom_endpoint';
      } else if (rawInputKey.startsWith('sk-')) {
        detectedPid = 'openai_dalle';
      }
    }

    const storedKey = config.providers[detectedPid]?.apiKey || '';
    const effectiveKey =
      rawInputKey && !rawInputKey.includes('••••')
        ? rawInputKey
        : storedKey ||
          (detectedPid === 'google_imagen'
            ? process.env.GEMINI_API_KEY || process.env.IMAGEN_API_KEY || ''
            : detectedPid === 'openai_dalle'
              ? process.env.OPENAI_API_KEY || ''
              : '');

    if (!effectiveKey) {
      return {
        ok: false,
        connected: false,
        providerId: detectedPid,
        modelTested: input.modelId || 'gemini-3.5-flash-lite',
        latencyMs: Date.now() - started,
        replyText:
          'Chưa có API Key để tự động đọc danh sách Model. Hãy dán mã API Key vào ô bên trên rồi bấm Kết nối & Tự đọc Model.',
        maskedKey: null,
      };
    }

    // Test & Auto-Probe Usable Models from Google Gemini / Google AI Studio / Imagen Key
    if (
      detectedPid === 'google_imagen' ||
      effectiveKey.startsWith('AIza') ||
      effectiveKey.startsWith('AQ.')
    ) {
      try {
        // Step 1: Call ModelService.ListModels to read all candidate models on this API key
        const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(
          effectiveKey
        )}`;
        const listRes = await fetch(listUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(10000),
        });

        if (!listRes.ok) {
          const errTxt = await listRes.text();
          return {
            ok: false,
            connected: false,
            providerId: 'google_imagen',
            modelTested: 'gemini-flash',
            latencyMs: Date.now() - started,
            replyText: `Mã API Key Google không hợp lệ hoặc bị từ chối [HTTP ${listRes.status}]: ${errTxt.slice(0, 140)}`,
            maskedKey: maskKey(effectiveKey),
          };
        }

        const listJson = (await listRes.json()) as {
          models?: Array<{
            name?: string;
            displayName?: string;
            description?: string;
            supportedGenerationMethods?: string[];
          }>;
        };

        const rawModels = listJson.models || [];

        // Extract Image Generation / Multi-Image Editing models available on this Google API key
        const imageModelPriority = [
          'gemini-2.5-flash-image',
          'gemini-2.5-flash-image-preview',
          'gemini-2.0-flash-exp-image-generation',
          'gemini-2.0-flash-preview-image-generation',
          'imagen-3.0-generate-002',
          'imagen-3.0-generate-001',
          'imagen-3.0-fast-generate-001',
        ];

        const rawCleaned = rawModels.map((m) => ({
          raw: m,
          id: (m.name || '').replace(/^models\//, '').trim(),
        }));

        const imageModelsFromKey = rawCleaned
          .filter(({ id }) => {
            if (!id) return false;
            return (
              imageModelPriority.includes(id) ||
              /gemini-.*image|imagen-3/i.test(id)
            );
          })
          .sort((a, b) => {
            const iA = imageModelPriority.indexOf(a.id);
            const iB = imageModelPriority.indexOf(b.id);
            return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
          })
          .slice(0, 4);

        // Extract fast Chat & Vision models available on this Google API key
        const fastPriorityOrder = [
          'gemini-3.5-flash-lite',
          'gemini-flash-lite-latest',
          'gemini-2.5-flash',
          'gemini-2.0-flash',
          'gemini-3.1-flash-lite',
          'gemini-3-flash-preview',
        ];

        const candidates = rawCleaned
          .filter(({ id, raw }) => {
            if (!id) return false;
            if (
              /embedding|tts|audio|transcribe|robotics|computer-use|lyria|aqa|veo|deep-research|customtools|antigravity|image|imagen|banana|omni|argon|3\.6|3\.7|3\.8|31b/i.test(
                id
              )
            ) {
              return false;
            }
            if (id.startsWith('gemini-1.5-') || id.includes('-pro')) {
              return false;
            }
            const methods = raw.supportedGenerationMethods || [];
            return methods.length === 0 || methods.includes('generateContent');
          })
          .sort((a, b) => {
            const iA = fastPriorityOrder.indexOf(a.id);
            const iB = fastPriorityOrder.indexOf(b.id);
            return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
          })
          .slice(0, 5);

        // Step 2: Fast Parallel Probe for Chat/Vision models
        const probeResults = await Promise.all(
          candidates.map(async ({ id, raw }) => {
            const t0 = Date.now();
            try {
              const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                id
              )}:generateContent?key=${encodeURIComponent(effectiveKey)}`;
              const genRes = await fetch(genUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
                  generationConfig: { maxOutputTokens: 3 },
                }),
                signal: AbortSignal.timeout(1800),
              });
              const ms = Date.now() - t0;
              if (!genRes.ok) {
                return { id, raw, usable: false, status: genRes.status, ms };
              }
              return { id, raw, usable: true, status: 200, ms };
            } catch {
              return { id, raw, usable: false, status: 408, ms: Date.now() - t0 };
            }
          })
        );

        const verifiedWorkingChat = probeResults
          .filter((r) => r.usable)
          .sort((a, b) => a.ms - b.ms);

        const discoveredModels: AiModelOptionDto[] = [
          // 1. Image Generation & Product Compositing models discovered on this API key
          ...imageModelsFromKey.map(({ id, raw }) => ({
            id,
            name: raw.displayName ? raw.displayName.trim() : id,
            badge: '🎨 Tạo & Ghép ảnh',
            costPerImageUsd: 0.02,
            supportsInpainting: true,
            description:
              raw.description ||
              'Model tạo phối cảnh, ghép sản phẩm công ty & thiết kế Banner trực tiếp từ Google API Key.',
          })),
          // 2. Verified 200 OK Chat & Vision analysis models discovered on this API key
          ...verifiedWorkingChat.map((item) => ({
            id: item.id,
            name: item.raw.displayName ? item.raw.displayName.trim() : item.id,
            badge: `💬 Chat & Phân tích ảnh`,
            costPerImageUsd: 0.0,
            supportsInpainting: true,
            description:
              item.raw.description ||
              `Model trò chuyện & phân tích ảnh công trình (Phản hồi ${item.ms}ms).`,
          })),
        ];

        if (discoveredModels.length === 0) {
          return {
            ok: false,
            connected: false,
            providerId: 'google_imagen',
            modelTested: 'none',
            latencyMs: Date.now() - started,
            replyText: `Đã đọc ${rawModels.length} model từ Google API Key nhưng tất cả đều hết hạn mức (HTTP 429) hoặc không phản hồi. Vui lòng kiểm tra lại hạn mức Key!`,
            maskedKey: maskKey(effectiveKey),
          };
        }

        const requestedClean = input.modelId?.replace(/^models\//, '') || '';
        const chosenEntry =
          discoveredModels.find((v) => v.id === requestedClean) || discoveredModels[0];
        const chosenModel = chosenEntry.id;

        const currentCfg = readStoredConfig();
        const prevEntry = currentCfg.providers.google_imagen || {};
        currentCfg.providers.google_imagen = {
          ...prevEntry,
          apiKey: effectiveKey,
          activeModel: chosenModel,
          discoveredModels,
        };
        currentCfg.defaultProviderId = 'google_imagen';
        currentCfg.defaultModelId = chosenModel;
        writeStoredConfig(currentCfg);

        const imgCount = imageModelsFromKey.length;
        const chatCount = verifiedWorkingChat.length;
        return {
          ok: true,
          connected: true,
          providerId: 'google_imagen',
          modelTested: chosenModel,
          latencyMs: Date.now() - started,
          replyText: `Đã nhận diện Google API Key → Đọc được ${discoveredModels.length} Model (${imgCount} Model Tạo/Ghép ảnh, ${chatCount} Model Chat & Phân tích ảnh). Đã chọn: ${chosenEntry.name}!`,
          maskedKey: maskKey(effectiveKey),
          discoveredModels,
          providerStatus: this.getActiveProviderInfo(),
        };
      } catch (err) {
        return {
          ok: false,
          connected: false,
          providerId: 'google_imagen',
          modelTested: 'gemini-flash',
          latencyMs: Date.now() - started,
          replyText: `Lỗi mạng khi kết nối tới Google API: ${
            err instanceof Error ? err.message : 'Không xác định'
          }`,
          maskedKey: maskKey(effectiveKey),
        };
      }
    }

    // Auto-detect & Probe Usable Models for OpenAI, Custom Gateway (DiDi/CCPro, OpenRouter, Groq)
    const candidateBaseUrls: string[] = [];
    if (input.apiEndpoint?.trim()) {
      candidateBaseUrls.push(input.apiEndpoint.trim());
    } else if (config.providers[detectedPid]?.apiEndpoint) {
      candidateBaseUrls.push(config.providers[detectedPid]!.apiEndpoint!);
    }
    if (effectiveKey.startsWith('sk-jy-') || effectiveKey.startsWith('sk-cx-')) {
      candidateBaseUrls.unshift(
        'https://api.ccpro.cn/v1',
        'https://ccpro.cn/v1',
        'https://gateway.ccpro.cn/v1'
      );
    } else if (effectiveKey.startsWith('sk-or-')) {
      candidateBaseUrls.push('https://openrouter.ai/api/v1');
    } else if (effectiveKey.startsWith('gsk_')) {
      candidateBaseUrls.push('https://api.groq.com/openai/v1');
    } else if (detectedPid === 'openai_dalle' || effectiveKey.startsWith('sk-')) {
      candidateBaseUrls.push('https://api.openai.com/v1');
    } else {
      candidateBaseUrls.push('https://openrouter.ai/api/v1');
    }

    let discoveredOpenAiModels: AiModelOptionDto[] = [];
    let totalOtherScanned = 0;
    let successfulBaseUrl = candidateBaseUrls[0];
    let listJson: {
      data?: Array<{ id?: string; name?: string; description?: string }>;
      models?: Array<{ id?: string; name?: string; description?: string }>;
    } = {};
    let lastErrStatus = 401;
    let lastErrTxt = '';
    let probeSucceeded = false;

    for (const rawCandidate of candidateBaseUrls) {
      const baseApiUrl = (rawCandidate || '')
        .trim()
        .replace(/\.+$/, '')
        .replace(/\/images\/generations\/?$/i, '')
        .replace(/\/chat\/completions\/?$/i, '')
        .replace(/\/completions\/?$/i, '')
        .replace(/\/models\/?$/i, '')
        .replace(/\/$/, '');

      try {
        let listRes = await fetch(`${baseApiUrl}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${effectiveKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        });

        // DiDi / Codex / CCPro Gateway requires an initial chat conversation to activate the license key:
        // "密钥尚未激活，请先在客户端发起一次对话完成激活后再查询 / Key not activated - start a conversation in your client first"
        if (listRes.status === 403 || !listRes.ok) {
          const errBody = await listRes.text();
          lastErrTxt = errBody;
          lastErrStatus = listRes.status;

          if (
            errBody.includes('激活') ||
            errBody.includes('not activated') ||
            errBody.includes('客户端发起一次对话')
          ) {
            try {
              const pingRes = await fetch(`${baseApiUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${effectiveKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'gpt-4o-mini',
                  messages: [{ role: 'user', content: 'ping' }],
                  max_tokens: 5,
                }),
                signal: AbortSignal.timeout(10000),
              });

              if (pingRes.ok) {
                const retryListRes = await fetch(`${baseApiUrl}/models`, {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${effectiveKey}`,
                    Accept: 'application/json',
                  },
                  signal: AbortSignal.timeout(8000),
                });
                if (retryListRes.ok) {
                  listJson = (await retryListRes.json()) as typeof listJson;
                  successfulBaseUrl = baseApiUrl;
                  probeSucceeded = true;
                  break;
                }
              }
            } catch {
              // Ignore ping error and continue fallback
            }
          }
        } else {
          listJson = (await listRes.json()) as typeof listJson;
          successfulBaseUrl = baseApiUrl;
          probeSucceeded = true;
          break;
        }
      } catch (e) {
        lastErrTxt = e instanceof Error ? e.message : 'Lỗi kết nối';
      }
    }

    if (!probeSucceeded) {
      return {
        ok: false,
        connected: false,
        providerId: detectedPid,
        modelTested: 'gpt-image-2',
        latencyMs: Date.now() - started,
        replyText: `Mã API Key (${detectedPid === 'openai_dalle' ? 'OpenAI' : 'Custom API'}) không hợp lệ hoặc bị từ chối [HTTP ${lastErrStatus}]: ${lastErrTxt.slice(0, 140)}`,
        maskedKey: maskKey(effectiveKey),
      };
    }

    const items = listJson.data || listJson.models || [];
    totalOtherScanned = items.length;

    const normalizedItems = items
      .map((m) => ({
        id: (m.id || m.name || '').trim(),
        name: m.name || m.id || '',
        description: m.description || '',
      }))
      .filter((m) => Boolean(m.id));

    // 1. Separate Image Generation / Multi-Image Edit models on this API key
    const openAiImagePriority = [
      'gpt-image-2',
      'gpt-image-2-4k',
      'gpt-image-2.5',
      'gpt-image-2.5-flare',
      'gpt-image-2.5-sunburst',
      'gpt-image-2-4k-high',
      'gpt-image-2.6-flare-4k',
      'gpt-image-2.6-sunburst-4k',
      'gpt-2.5-image',
      'gpt-image-1',
      'dall-e-3',
      'dall-e-2',
    ];
    const imageCandidates = normalizedItems
      .filter(
        (m) =>
          openAiImagePriority.includes(m.id) ||
          /gpt-.*image|dall-e|flux|stable-diffusion|sdxl|imagen/i.test(m.id)
      )
      .sort((a, b) => {
        const iA = openAiImagePriority.indexOf(a.id);
        const iB = openAiImagePriority.indexOf(b.id);
        return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
      })
      .slice(0, 8);

    // If OpenAI key is valid and has gpt-image-1, also surface gpt-2.5-image alias if not explicitly listed yet
    if (
      detectedPid === 'openai_dalle' &&
      !imageCandidates.some((m) => m.id === 'gpt-2.5-image')
    ) {
      imageCandidates.unshift({
        id: 'gpt-2.5-image',
        name: 'GPT 2.5 Image',
        description: 'Model ghép ảnh sản phẩm công ty vào hiện trường & tạo Banner (OpenAI Image API).',
      });
    }

    // 2. Separate Vision & Chat models on this API key
    const openAiChatPriority = [
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.5',
      'gpt-5.6',
      'gpt-6',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
    ];
    const chatCandidates = normalizedItems
      .filter(
        (m) =>
          !/embedding|tts|whisper|moderation|audio|realtime|dall-e|gpt-.*image|babbage|davinci|instruct/i.test(
            m.id
          ) &&
          (openAiChatPriority.includes(m.id) ||
            /^(gpt-5|gpt-6|gpt-4o|gpt-4\.1|chatgpt-4o|claude-3|gemini-|deepseek)/i.test(m.id))
      )
      .sort((a, b) => {
        const iA = openAiChatPriority.indexOf(a.id);
        const iB = openAiChatPriority.indexOf(b.id);
        return (iA === -1 ? 99 : iA) - (iB === -1 ? 99 : iB);
      })
      .slice(0, 6);

    discoveredOpenAiModels = [
      ...imageCandidates.map((m) => ({
        id: m.id,
        name:
          m.id === 'gpt-image-2'
            ? 'GPT-Image 2 (Codex AI)'
            : m.id === 'gpt-image-2-4k'
              ? 'GPT-Image 2 4K Ultra'
              : m.id === 'gpt-image-2.5'
                ? 'GPT-Image 2.5 Pro'
                : m.id === 'gpt-2.5-image'
                  ? 'GPT 2.5 Image'
                  : m.id === 'gpt-image-1'
                    ? 'GPT-Image 1'
                    : m.name || m.id,
        badge: '🎨 Tạo & Ghép ảnh',
        costPerImageUsd: 0.04,
        supportsInpainting: true,
        description: m.description || 'Model Tạo phối cảnh, ghép sản phẩm & thiết kế Banner.',
      })),
      ...chatCandidates.map((m) => ({
        id: m.id,
        name: m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id,
        badge: '💬 Chat & Phân tích ảnh',
        costPerImageUsd: 0.0,
        supportsInpainting: true,
        description: m.description || 'Model Trò chuyện & phân tích ảnh hiện trường.',
      })),
    ];

    const chosenOtherModel =
      input.modelId?.trim() ||
      discoveredOpenAiModels[0]?.id ||
      config.providers[detectedPid]?.activeModel ||
      (detectedPid === 'openai_dalle' ? 'gpt-2.5-image' : detectedPid);

    const currentCfg = readStoredConfig();
    const prevEntry = currentCfg.providers[detectedPid] || {};
    currentCfg.providers[detectedPid] = {
      ...prevEntry,
      apiKey: effectiveKey,
      apiEndpoint: `${successfulBaseUrl}/images/generations`,
      activeModel: chosenOtherModel,
      ...(discoveredOpenAiModels.length > 0 ? { discoveredModels: discoveredOpenAiModels } : {}),
    };
    currentCfg.defaultProviderId = detectedPid;
    currentCfg.defaultModelId = chosenOtherModel;
    writeStoredConfig(currentCfg);

    const providerLabel =
      detectedPid === 'openai_dalle'
        ? 'OpenAI API'
        : effectiveKey.startsWith('sk-jy-') || effectiveKey.startsWith('sk-cx-')
          ? 'DiDi / CCPro Gateway'
          : effectiveKey.startsWith('sk-or-')
            ? 'OpenRouter API'
            : effectiveKey.startsWith('gsk_')
              ? 'Groq API'
              : 'Custom API';

    return {
      ok: true,
      connected: true,
      providerId: detectedPid,
      modelTested: chosenOtherModel,
      latencyMs: Date.now() - started,
      replyText:
        discoveredOpenAiModels.length > 0
          ? `Đã nhận diện ${providerLabel} (quét ${totalOtherScanned} model) → Phân loại được ${discoveredOpenAiModels.length} Model khả dụng. Đã chọn: ${chosenOtherModel}!`
          : `Đã kết nối khóa API (${maskKey(effectiveKey)}) cho ${providerLabel}. Đã chọn Model: ${chosenOtherModel}!`,
      maskedKey: maskKey(effectiveKey),
      discoveredModels: discoveredOpenAiModels.length > 0 ? discoveredOpenAiModels : undefined,
      providerStatus: this.getActiveProviderInfo(),
    };
  }
}

export * from './types';
export * from './google-imagen.provider';
export * from './openai-image.provider';
export * from './universal-cloud.provider';
export * from './local-sandbox.provider';
