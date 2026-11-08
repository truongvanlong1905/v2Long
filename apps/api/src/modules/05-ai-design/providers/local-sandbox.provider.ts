/**
 * Local Sandbox Provider
 * Built-in local fallback adapter providing synthetic rendering for local development,
 * CI/CD verification, and sandbox evaluation without billable external API calls.
 */

import zlib from 'node:zlib';
import {
  type AiDesignProvider,
  type BannerGenerationInput,
  type PerspectiveGenerationInput,
  type ProviderGenerationResult,
  type ProviderStatusInfo,
} from './types';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generates a genuine 640x360 RGB PNG buffer representing either a 3D LED perspective render
 * in a showroom interior or a full-frame LED banner graphic, visually distinct per prompt/version.
 */
export function renderSyntheticLedPngBuffer(opts: {
  mode: 'perspective_3d' | 'banner';
  prompt: string;
  seedKey?: string;
  quad?: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
}): Buffer {
  const width = 640;
  const height = 360;
  const seed = hashSeed(`${opts.mode}:${opts.prompt}:${opts.seedKey || ''}`);
  const hueShift = (seed % 3) as 0 | 1 | 2; // 0: ocean cyan-blue, 1: emerald-teal, 2: royal-indigo-gold

  // Row size: 1 filter byte + width * 3 (RGB)
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height);

  const q = opts.quad || {
    topLeft: { x: 58, y: 26 },
    topRight: { x: 93, y: 29 },
    bottomRight: { x: 94, y: 74 },
    bottomLeft: { x: 58, y: 70 },
  };

  const minX = Math.max(0.08, Math.min(q.topLeft.x, q.bottomLeft.x) / 100);
  const maxX = Math.min(0.95, Math.max(q.topRight.x, q.bottomRight.x) / 100);
  const minY = Math.max(0.12, Math.min(q.topLeft.y, q.topRight.y) / 100);
  const maxY = Math.min(0.86, Math.max(q.bottomLeft.y, q.bottomRight.y) / 100);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0; // Filter type 0 (None)
    const ny = y / height;

    for (let x = 0; x < width; x++) {
      const nx = x / width;
      let r = 20;
      let g = 28;
      let b = 44;

      if (opts.mode === 'banner') {
        // Widescreen LED Banner graphic
        const wave = Math.sin(nx * 10 + ny * 5 + (seed % 7)) * 0.5 + 0.5;
        if (hueShift === 0) {
          r = Math.round(14 + wave * 38 + (1 - ny) * 20);
          g = Math.round(68 + wave * 115 + nx * 35);
          b = Math.round(148 + wave * 95);
        } else if (hueShift === 1) {
          r = Math.round(12 + wave * 30);
          g = Math.round(92 + wave * 110 + (1 - ny) * 25);
          b = Math.round(125 + wave * 90 + nx * 30);
        } else {
          r = Math.round(28 + wave * 95 + nx * 40);
          g = Math.round(48 + wave * 75);
          b = Math.round(138 + wave * 95);
        }
        // Subtle LED cabinet grid every 64px
        if (x % 64 === 0 || y % 64 === 0) {
          r = Math.max(0, r - 14);
          g = Math.max(0, g - 14);
          b = Math.max(0, b - 14);
        }
        // Border frame
        if (x < 6 || x >= width - 6 || y < 6 || y >= height - 6) {
          r = 220;
          g = 235;
          b = 255;
        }
      } else {
        // Showroom interior architectural background + perspective LED wall
        if (ny < 0.18) {
          // Ceiling with recessed linear lights
          const isLightBar = Math.abs(((nx * 6) % 1) - 0.5) < 0.08 && ny > 0.05 && ny < 0.14;
          r = isLightBar ? 235 : Math.round(38 + ny * 90);
          g = isLightBar ? 242 : Math.round(44 + ny * 95);
          b = isLightBar ? 255 : Math.round(58 + ny * 105);
        } else if (ny > 0.78) {
          // Polished showroom floor with reflection
          const floorFactor = (ny - 0.78) / 0.22;
          const underScreen = nx >= minX && nx <= maxX;
          r = Math.round(34 - floorFactor * 10 + (underScreen ? 18 : 0));
          g = Math.round(42 - floorFactor * 10 + (underScreen ? 52 : 0));
          b = Math.round(56 - floorFactor * 8 + (underScreen ? 88 : 0));
          if (x % 48 === 0) {
            r += 8;
            g += 10;
            b += 14;
          }
        } else {
          // Showroom acoustic slatted wall & left display area
          const slat = x % 16 < 3 ? -8 : 0;
          r = Math.round(54 + nx * 18 + slat);
          g = Math.round(60 + nx * 18 + slat);
          b = Math.round(74 + nx * 22 + slat);
        }

        // Perspective interpolation for top/bottom edges of the LED screen
        const u = (nx - minX) / Math.max(0.05, maxX - minX);
        const topEdge = minY + u * 0.025;
        const botEdge = maxY - u * 0.02;

        if (nx >= minX && nx <= maxX && ny >= topEdge && ny <= botEdge) {
          const v = (ny - topEdge) / Math.max(0.05, botEdge - topEdge);
          const isBezel = u < 0.022 || u > 0.978 || v < 0.03 || v > 0.97;
          if (isBezel) {
            // Anodized aluminum LED frame + white glow inner rim
            const isInnerRim = u > 0.014 && u < 0.986 && v > 0.018 && v < 0.982;
            r = isInnerRim ? 120 : 18;
            g = isInnerRim ? 210 : 22;
            b = isInnerRim ? 255 : 30;
          } else {
            // Active LED screen displaying high-contrast dynamic waves
            const wave1 = Math.sin(u * 9 + v * 4 + (seed % 5)) * 0.5 + 0.5;
            const wave2 = Math.cos(u * 5 - v * 7 + ((seed >> 3) % 5)) * 0.5 + 0.5;
            if (hueShift === 0) {
              r = Math.round(10 + wave1 * 45 + wave2 * 25);
              g = Math.round(105 + wave1 * 115 + (1 - v) * 30);
              b = Math.round(185 + wave2 * 68);
            } else if (hueShift === 1) {
              r = Math.round(14 + wave2 * 35);
              g = Math.round(135 + wave1 * 105);
              b = Math.round(150 + wave2 * 95);
            } else {
              r = Math.round(45 + wave1 * 120);
              g = Math.round(75 + wave2 * 95);
              b = Math.round(175 + wave1 * 75);
            }
            // Cabinet seam lines
            if (Math.abs((u * 6) % 1) < 0.018 || Math.abs((v * 4) % 1) < 0.022) {
              r = Math.max(0, r - 18);
              g = Math.max(0, g - 18);
              b = Math.max(0, b - 18);
            }
          }
        }
      }

      const pxOffset = rowOffset + 1 + x * 3;
      raw[pxOffset] = Math.min(255, Math.max(0, r));
      raw[pxOffset + 1] = Math.min(255, Math.max(0, g));
      raw[pxOffset + 2] = Math.min(255, Math.max(0, b));
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 2; // Color type 2 (Truecolor RGB)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export class LocalSandboxAiProvider implements AiDesignProvider {
  readonly providerId = 'local_sandbox' as const;
  private readonly activeModel: string;

  constructor(activeModel?: string | null) {
    this.activeModel = activeModel || 'toantrung-studio-v3';
  }

  getStatusInfo(): ProviderStatusInfo {
    return {
      provider: 'local_sandbox',
      providerName: 'Toàn Trung Studio Engine v3 (Sẵn sàng ngay)',
      isConfigured: true,
      statusLabel: 'Đang hoạt động · Không cần API Key bên ngoài',
      activeModel: this.activeModel,
      costPerImageUsd: 0.0,
      supportsInpainting: true,
      notes:
        'Engine kết xuất phối cảnh 3D & Banner LED nội bộ Toàn Trung: hoạt động tức thì, bảo mật 100% và không phát sinh chi phí bên thứ ba.',
    };
  }

  async generatePerspectiveDraft(
    input: PerspectiveGenerationInput
  ): Promise<ProviderGenerationResult> {
    const started = Date.now();
    await new Promise((r) => setTimeout(r, 85));
    const durationMs = Date.now() - started;
    const modelUsed = input.modelId || this.activeModel;

    if (input.simulateTimeout) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs,
        modelUsed,
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

    const imageBuffer = renderSyntheticLedPngBuffer({
      mode: 'perspective_3d',
      prompt: input.prompt,
      seedKey: `${modelUsed}:${input.idempotencyKey}`,
      quad: input.placementQuad,
    });

    return {
      imageBuffer,
      mimeType: 'image/png',
      durationMs,
      modelUsed,
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
    const modelUsed = input.modelId || this.activeModel;

    if (input.simulateTimeout) {
      return {
        imageBuffer: Buffer.alloc(0),
        mimeType: 'image/png',
        durationMs,
        modelUsed,
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

    const imageBuffer = renderSyntheticLedPngBuffer({
      mode: 'banner',
      prompt: input.prompt,
      seedKey: `${modelUsed}:${input.idempotencyKey}`,
    });

    return {
      imageBuffer,
      mimeType: 'image/png',
      durationMs,
      modelUsed,
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

