/**
 * AI Design Provider Factory
 * Resolves the active provider (Google Imagen 3 / OpenAI / Local Sandbox)
 */

import { GoogleImagenProvider } from './google-imagen.provider';
import { OpenAiImageProvider } from './openai-image.provider';
import { LocalSandboxAiProvider } from './local-sandbox.provider';
import { type AiDesignProvider, type ProviderStatusInfo } from './types';

export class AiDesignProviderFactory {
  private static instance: AiDesignProvider | null = null;

  static getProvider(): AiDesignProvider {
    if (this.instance) return this.instance;

    // 1. Check Google Imagen 3 (Vertex AI / Gemini API) - PRIMARY
    const googleKey = process.env.IMAGEN_API_KEY || process.env.GEMINI_API_KEY;
    if (googleKey) {
      this.instance = new GoogleImagenProvider();
      return this.instance;
    }

    // 2. Check OpenAI - FALLBACK
    const openAiKey = process.env.OPENAI_API_KEY;
    if (openAiKey) {
      this.instance = new OpenAiImageProvider();
      return this.instance;
    }

    // 3. Otherwise use Local Sandbox Provider
    this.instance = new LocalSandboxAiProvider();
    return this.instance;
  }

  static getActiveProviderInfo(): ProviderStatusInfo {
    const provider = this.getProvider();
    const info = provider.getStatusInfo();

    // Check if an external provider was requested but missing keys
    const preferred = (process.env.AI_DESIGN_PREFERRED_PROVIDER || 'google_imagen').toLowerCase();
    if (preferred === 'google_imagen' && !process.env.IMAGEN_API_KEY && !process.env.GEMINI_API_KEY) {
      return {
        ...info,
        isConfigured: false,
        statusLabel: 'Chưa kết nối AI (Cần cấu hình IMAGEN_API_KEY)',
      };
    }

    return info;
  }
}

export * from './types';
export * from './google-imagen.provider';
export * from './openai-image.provider';
export * from './local-sandbox.provider';

