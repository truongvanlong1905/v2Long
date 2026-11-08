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

interface StoredProviderEntry {
  apiKey?: string | null;
  apiEndpoint?: string | null;
  activeModel?: string | null;
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
        models: [
          {
            id: 'imagen-3.0-generate-002',
            name: 'Google Imagen 3 Pro (Chuẩn 3D)',
            badge: 'Khuyên dùng',
            costPerImageUsd: 0.03,
            supportsInpainting: true,
            description: 'Độ nét cao, giữ nguyên 100% nội thất phòng và ánh sáng phản chiếu sàn.',
          },
          {
            id: 'imagen-3.0-fast-generate-001',
            name: 'Google Imagen 3 Fast (Nháp nhanh)',
            badge: 'Tốc độ cao',
            costPerImageUsd: 0.02,
            supportsInpainting: true,
            description: 'Tạo phương án nháp nhanh trong 2–3 giây để gửi khách hàng xem trước.',
          },
          {
            id: 'gemini-2.5-flash-image',
            name: 'Gemini 2.5 Flash Multimodal',
            badge: 'Đa phương thức',
            costPerImageUsd: 0.025,
            supportsInpainting: true,
            description: 'Hiểu sâu ngữ cảnh tiếng Việt, chỉnh sửa linh hoạt theo hội thoại.',
          },
        ],
      },
      {
        providerId: 'openai_dalle',
        providerName: 'OpenAI GPT-Image-1 & DALL-E 3',
        shortName: 'OpenAI GPT-Image',
        isConfigured: Boolean(openAiKey),
        isDefault: config.defaultProviderId === 'openai_dalle',
        activeModel: config.providers.openai_dalle?.activeModel || 'gpt-image-1',
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
          'Mạnh về thiết kế Banner truyền thông LED, hiển thị chữ tiêu đề sự kiện chuẩn xác và sáng tạo bố cục.',
        models: [
          {
            id: 'gpt-image-1',
            name: 'OpenAI GPT-Image-1 (Mới nhất)',
            badge: 'Chuẩn Banner & Chữ',
            costPerImageUsd: 0.04,
            supportsInpainting: true,
            description: 'Hiển thị chữ tiếng Việt/Anh trên Banner LED và ghép vùng chọn chính xác.',
          },
          {
            id: 'dall-e-3',
            name: 'OpenAI DALL-E 3 HD',
            badge: 'Sáng tạo',
            costPerImageUsd: 0.04,
            supportsInpainting: false,
            description: 'Thiết kế hình nền sân khấu LED, đại hội cổ đông & sự kiện Gala.',
          },
          {
            id: 'dall-e-2',
            name: 'OpenAI DALL-E 2 Edit (Inpaint)',
            badge: 'Tiết kiệm',
            costPerImageUsd: 0.02,
            supportsInpainting: true,
            description: 'Chỉnh sửa vùng mask màn hình LED chi phí thấp.',
          },
        ],
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
        models: [
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
        ],
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
        models: [
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
        ],
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
        models: [
          {
            id: config.providers.custom_endpoint?.activeModel || 'custom-led-diffusion-v1',
            name: `Model tùy chỉnh (${config.providers.custom_endpoint?.activeModel || 'custom-led-diffusion-v1'})`,
            badge: 'Tùy biến 100%',
            costPerImageUsd: 0.02,
            supportsInpainting: true,
            description: 'Gọi trực tiếp tới Endpoint tùy chỉnh do doanh nghiệp cấu hình.',
          },
        ],
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

  static async executePerspectiveWithFallback(
    input: PerspectiveGenerationInput,
    requestedProviderId?: AiProviderId
  ): Promise<ProviderGenerationResult> {
    const { config } = this.getCatalog();
    const targetProviderId = requestedProviderId || config.defaultProviderId || 'google_imagen';
    const provider = this.getProvider(targetProviderId, input.modelId);

    if (input.simulateTimeout) {
      return provider.generatePerspectiveDraft(input);
    }

    const res = await provider.generatePerspectiveDraft(input);
    if (res.status === 'success') {
      return res;
    }

    if (config.autoFallbackToLocal && targetProviderId !== 'local_sandbox') {
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
    const provider = this.getProvider(targetProviderId, input.modelId);

    if (input.simulateTimeout) {
      return provider.generateBannerDraft(input);
    }

    const res = await provider.generateBannerDraft(input);
    if (res.status === 'success') {
      return res;
    }

    if (config.autoFallbackToLocal && targetProviderId !== 'local_sandbox') {
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
}

export * from './types';
export * from './google-imagen.provider';
export * from './openai-image.provider';
export * from './universal-cloud.provider';
export * from './local-sandbox.provider';
