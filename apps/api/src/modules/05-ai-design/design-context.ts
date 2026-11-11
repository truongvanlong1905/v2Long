/**
 * Module 05 — Design Context & Multi-turn Natural Language State Manager (P1 & P4)
 * Manages per-project DesignContext with strict parameter provenance:
 * - 'user_confirmed': Explicitly stated or saved by the user (NEVER overwritten by AI suggestions)
 * - 'ai_suggested': Recommended by AI assistant (pending user confirmation)
 * - 'undetermined': Not yet specified
 */

import type { QuadCoordinatesDto } from '@toantrung/contracts';

export type ParameterProvenance = 'user_confirmed' | 'ai_suggested' | 'undetermined';

export type CompositingProtectionMode = 'STRICT' | 'REALISTIC';

export interface DesignContextFields {
  projectId: number;
  leadId: number | null;
  selectedPhotoId: string | null;
  activeVersionId: number | null;
  ledType: string | null;
  environment: 'indoor' | 'outdoor' | null;
  widthMm: number | null;
  heightMm: number | null;
  pixelPitch: string | null;
  cabinetModel: string | null;
  installPosition: string | null;
  placementQuad: QuadCoordinatesDto | null;
  screenStyle: 'flat' | 'curved' | 'corner_90';
  compositingMode: CompositingProtectionMode;
  designStyle: string | null;
  bannerContent: string | null;
  targetResolution: {
    widthPx: number;
    heightPx: number;
    aspectRatio: string;
  } | null;
}

export type DesignContextProvenanceMap = {
  [K in keyof Omit<
    DesignContextFields,
    'projectId' | 'leadId' | 'selectedPhotoId' | 'activeVersionId' | 'compositingMode'
  >]: ParameterProvenance;
};

export interface ProjectDesignContext {
  fields: DesignContextFields;
  provenance: DesignContextProvenanceMap;
  updatedAt: string;
}

export function createInitialDesignContext(params: {
  projectId: number;
  leadId?: number | null;
  selectedPhotoId?: string | null;
  activeVersionId?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  pixelPitch?: string | null;
  environment?: 'indoor' | 'outdoor' | null;
  cabinetModel?: string | null;
  installPosition?: string | null;
  placementQuad?: QuadCoordinatesDto | null;
  screenStyle?: 'flat' | 'curved' | 'corner_90';
  compositingMode?: CompositingProtectionMode;
  designStyle?: string | null;
  bannerContent?: string | null;
  targetResolution?: { widthPx: number; heightPx: number; aspectRatio: string } | null;
  isUserConfirmedInit?: boolean;
}): ProjectDesignContext {
  const confirmedProv: ParameterProvenance = params.isUserConfirmedInit
    ? 'user_confirmed'
    : 'ai_suggested';

  return {
    fields: {
      projectId: params.projectId,
      leadId: params.leadId ?? null,
      selectedPhotoId: params.selectedPhotoId ?? null,
      activeVersionId: params.activeVersionId ?? null,
      ledType:
        params.environment === 'outdoor'
          ? 'Màn hình LED Outdoor'
          : params.environment === 'indoor'
            ? 'Màn hình LED Indoor'
            : null,
      environment: params.environment ?? null,
      widthMm: params.widthMm ?? null,
      heightMm: params.heightMm ?? null,
      pixelPitch: params.pixelPitch ?? null,
      cabinetModel: params.cabinetModel ?? 'CAB_640_480',
      installPosition: params.installPosition ?? null,
      placementQuad: params.placementQuad ?? null,
      screenStyle: params.screenStyle ?? 'flat',
      compositingMode: params.compositingMode ?? 'STRICT',
      designStyle: params.designStyle ?? null,
      bannerContent: params.bannerContent ?? null,
      targetResolution: params.targetResolution ?? null,
    },
    provenance: {
      ledType: params.environment ? confirmedProv : 'undetermined',
      environment: params.environment ? confirmedProv : 'undetermined',
      widthMm: params.widthMm ? confirmedProv : 'undetermined',
      heightMm: params.heightMm ? confirmedProv : 'undetermined',
      pixelPitch: params.pixelPitch ? confirmedProv : 'undetermined',
      cabinetModel: params.cabinetModel ? confirmedProv : 'ai_suggested',
      installPosition: params.installPosition ? confirmedProv : 'undetermined',
      placementQuad: params.placementQuad ? confirmedProv : 'ai_suggested',
      screenStyle: params.screenStyle ? confirmedProv : 'ai_suggested',
      designStyle: params.designStyle ? confirmedProv : 'undetermined',
      bannerContent: params.bannerContent ? confirmedProv : 'undetermined',
      targetResolution: params.targetResolution ? confirmedProv : 'ai_suggested',
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Helper to parse Vietnamese dimension expressions such as:
 * - "4m8" -> 4800 mm
 * - "2m7" -> 2700 mm
 * - "4.8m" / "4,8m" -> 4800 mm
 * - "4800mm" / "4800 mm" -> 4800 mm
 * - "480cm" -> 4800 mm
 */
export function parseVietnameseLengthToMm(rawToken: string, unitHint?: string): number | null {
  const clean = rawToken.trim().toLowerCase();
  // Format "4m8", "2m75"
  const compactM = clean.match(/^(\d+)\s*m\s*(\d{1,3})$/i);
  if (compactM) {
    const meters = Number(compactM[1]);
    const fracStr = compactM[2];
    const fracMeters = Number(fracStr) / Math.pow(10, fracStr.length);
    return Math.round((meters + fracMeters) * 1000);
  }

  const numUnit = clean.match(/^(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?$/i);
  if (!numUnit) return null;
  const val = Number(numUnit[1].replace(',', '.'));
  if (!Number.isFinite(val) || val <= 0) return null;
  const unit = (numUnit[2] || unitHint || '').toLowerCase();

  if (unit === 'mm') return Math.round(val);
  if (unit === 'cm') return Math.round(val * 10);
  if (unit === 'm') return Math.round(val * 1000);

  // Heuristic if unit omitted: >= 400 is mm, <= 50 is meters
  if (val >= 400) return Math.round(val);
  if (val <= 50) return Math.round(val * 1000);
  return Math.round(val * 10);
}

export interface ExtractedChatUpdates {
  updatedContext: ProjectDesignContext;
  newlyConfirmedLabels: string[];
}

/**
 * Extracts user-confirmed design specifications from a natural language Vietnamese message
 * and merges them into the project's DesignContext without losing prior confirmed fields.
 * Also ensures AI suggestions never overwrite user_confirmed fields.
 */
export function extractAndMergeUserChatContext(
  current: ProjectDesignContext,
  userMessage: string
): ExtractedChatUpdates {
  const next: ProjectDesignContext = {
    fields: { ...current.fields },
    provenance: { ...current.provenance },
    updatedAt: new Date().toISOString(),
  };
  const newlyConfirmedLabels: string[] = [];
  const text = userMessage.trim();
  const lower = text.toLowerCase();

  // 1. Environment & Location extraction ("trong showroom", "phòng họp", "hội trường", "ngoài trời", "mặt tiền")
  if (/\b(ngoài\s*trời|outdoor|mặt\s*tiền|mặt\s*dựng|cổng\s*chào|sân\s*vận\s*động)\b/i.test(text)) {
    next.fields.environment = 'outdoor';
    next.provenance.environment = 'user_confirmed';
    next.fields.ledType = 'Màn hình LED Outdoor (IP65)';
    next.provenance.ledType = 'user_confirmed';
    newlyConfirmedLabels.push('Môi trường: Outdoor (Ngoài trời)');
  } else if (
    /\b(trong\s*nhà|indoor|showroom|phòng\s*họp|hội\s*trường|sảnh\s*tiệc|sân\s*khấu\s*trong\s*nhà|văn\s*phòng)\b/i.test(
      text
    )
  ) {
    next.fields.environment = 'indoor';
    next.provenance.environment = 'user_confirmed';
    next.fields.ledType = 'Màn hình LED Indoor';
    next.provenance.ledType = 'user_confirmed';
    newlyConfirmedLabels.push('Môi trường: Indoor (Trong nhà)');
  }

  // 2. Installation position extraction ("lắp trên vách tường", "lắp trong showroom", "âm tường", "treo trần", "trên sân khấu")
  const posPatterns: Array<{ regex: RegExp; label: (m: RegExpExecArray) => string }> = [
    {
      regex: /(?:muốn\s*)?(?:lắp|đặt|gắn|treo)\s+(?:ở\s+|tại\s+|trên\s+|trong\s+)?(vách\s*tường[^.,;\n]*|tường\s*chính[^.,;\n]*|showroom[^.,;\n]*|phòng\s*họp[^.,;\n]*|hội\s*trường[^.,;\n]*|mặt\s*tiền[^.,;\n]*|sảnh[^.,;\n]*|sân\s*khấu[^.,;\n]*)/i,
      label: (m) => m[1].trim(),
    },
    {
      regex: /\b(trên\s*vách\s*tường|âm\s*vách\s*tường|vách\s*tường\s*chính|giữa\s*sân\s*khấu)\b/i,
      label: (m) => m[1].trim(),
    },
  ];
  for (const pat of posPatterns) {
    const m = pat.regex.exec(text);
    if (m) {
      const posVal = pat.label(m);
      if (posVal) {
        next.fields.installPosition = posVal;
        next.provenance.installPosition = 'user_confirmed';
        newlyConfirmedLabels.push(`Vị trí lắp: ${posVal}`);
        break;
      }
    }
  }

  // 3. Physical Width & Height extraction
  // Case A: Explicit width and height in words ("Chiều rộng khoảng 4m8, cao 2m7" / "ngang 4.8m, cao 2.7m" / "rộng 4800mm cao 2700mm")
  const widthWordMatch = text.match(
    /(?:chiều\s*)?(?:rộng|ngang|dài)\s*(?:khoảng|tầm|là|:)?\s*(\d+\s*m\s*\d+|\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?)/i
  );
  const heightWordMatch = text.match(
    /(?:chiều\s*)?(?:cao|đứng)\s*(?:khoảng|tầm|là|:)?\s*(\d+\s*m\s*\d+|\d+(?:[.,]\d+)?\s*(?:mm|cm|m)?)/i
  );

  if (widthWordMatch) {
    const parsedW = parseVietnameseLengthToMm(widthWordMatch[1], 'm');
    if (parsedW && parsedW >= 320 && parsedW <= 200_000) {
      next.fields.widthMm = parsedW;
      next.provenance.widthMm = 'user_confirmed';
      newlyConfirmedLabels.push(`Chiều rộng: ${parsedW} mm (${(parsedW / 1000).toFixed(2)}m)`);
    }
  }
  if (heightWordMatch) {
    const parsedH = parseVietnameseLengthToMm(heightWordMatch[1], 'm');
    if (parsedH && parsedH >= 160 && parsedH <= 100_000) {
      next.fields.heightMm = parsedH;
      next.provenance.heightMm = 'user_confirmed';
      newlyConfirmedLabels.push(`Chiều cao: ${parsedH} mm (${(parsedH / 1000).toFixed(2)}m)`);
    }
  }

  // Case B: "4800x2700mm" or "4.8m x 2.7m" or "4m8 x 2m7" (and NOT pixel resolution like 1920x1080)
  if (!widthWordMatch && !heightWordMatch) {
    const pairDimMatch = text.match(
      /\b(\d+\s*m\s*\d+|\d+(?:[.,]\d+)?\s*(?:mm|cm|m))\s*[x×*]\s*(\d+\s*m\s*\d+|\d+(?:[.,]\d+)?\s*(?:mm|cm|m))\b/i
    );
    if (pairDimMatch) {
      const wMm = parseVietnameseLengthToMm(pairDimMatch[1]);
      const hMm = parseVietnameseLengthToMm(pairDimMatch[2]);
      if (wMm && hMm && wMm >= 320 && hMm >= 160) {
        next.fields.widthMm = wMm;
        next.fields.heightMm = hMm;
        next.provenance.widthMm = 'user_confirmed';
        next.provenance.heightMm = 'user_confirmed';
        newlyConfirmedLabels.push(`Kích thước: ${wMm} × ${hMm} mm`);
      }
    }
  }

  // 4. Pixel Pitch extraction ("Chọn P2.5", "P1.53", "P1.86", "P2", "P2.0", "P3", "P3.076", "P4", "P5", "P8", "P10")
  const pitchMatch = text.match(/\bP\s*(1\.25|1\.53|1\.5|1\.86|1\.875|2\.0|2\.5|2\.6|2\.97|2|3\.076|3\.91|3|4|5|6|8|10)\b/i);
  if (pitchMatch) {
    const normPitch = `P${pitchMatch[1]}`;
    next.fields.pixelPitch = normPitch;
    next.provenance.pixelPitch = 'user_confirmed';
    newlyConfirmedLabels.push(`Pixel Pitch: ${normPitch}`);
  }

  // 5. Cabinet model extraction ("cabinet 640x480", "cabinet 600x337.5", "cabinet 960x960", "cabinet 500x500", "ghép module 320x160")
  if (/600\s*[x×]\s*337/i.test(text)) {
    next.fields.cabinetModel = 'CAB_600_3375';
    next.provenance.cabinetModel = 'user_confirmed';
    newlyConfirmedLabels.push('Model Cabinet: 600×337.5mm (Chuẩn 16:9)');
  } else if (/960\s*[x×]\s*960/i.test(text)) {
    next.fields.cabinetModel = 'CAB_960_960';
    next.provenance.cabinetModel = 'user_confirmed';
    newlyConfirmedLabels.push('Model Cabinet: 960×960mm (Outdoor)');
  } else if (/500\s*[x×]\s*500/i.test(text)) {
    next.fields.cabinetModel = 'CAB_500_500';
    next.provenance.cabinetModel = 'user_confirmed';
    newlyConfirmedLabels.push('Model Cabinet: 500×500mm');
  } else if (/640\s*[x×]\s*480/i.test(text)) {
    next.fields.cabinetModel = 'CAB_640_480';
    next.provenance.cabinetModel = 'user_confirmed';
    newlyConfirmedLabels.push('Model Cabinet: 640×480mm');
  } else if (/ghép\s*module\s*trực\s*tiếp|không\s*dùng\s*cabin/i.test(text)) {
    next.fields.cabinetModel = 'MODULE_320_160_FRAME';
    next.provenance.cabinetModel = 'user_confirmed';
    newlyConfirmedLabels.push('Kiểu ghép: Module 320×160mm trên khung sắt');
  }

  // 6. Screen curvature / style extraction ("màn hình cong", "bo cong", "vuông góc 90", "màn phẳng")
  if (/\b(màn\s*(?:hình\s*)?cong|bo\s*cong|vách\s*cong|curved)\b/i.test(text)) {
    next.fields.screenStyle = 'curved';
    next.provenance.screenStyle = 'user_confirmed';
    newlyConfirmedLabels.push('Kiểu màn hình: Màn hình cong (Cần xử lý biến dạng riêng)');
  } else if (/\b(vuông\s*góc\s*90|góc\s*90\s*độ|chữ\s*l)\b/i.test(text)) {
    next.fields.screenStyle = 'corner_90';
    next.provenance.screenStyle = 'user_confirmed';
    newlyConfirmedLabels.push('Kiểu màn hình: Vuông góc 90°');
  } else if (/\b(màn\s*(?:hình\s*)?phẳng|phẳng\s*tiêu\s*chuẩn)\b/i.test(text)) {
    next.fields.screenStyle = 'flat';
    next.provenance.screenStyle = 'user_confirmed';
    newlyConfirmedLabels.push('Kiểu màn hình: Phẳng');
  }

  // 7. Compositing protection mode ("STRICT" vs "REALISTIC")
  if (/\b(chế\s*độ\s*realistic|bật\s*realistic|phản\s*chiếu\s*ánh\s*sáng\s*môi\s*trường|hắt\s*sáng\s*xung\s*quanh)\b/i.test(text)) {
    next.fields.compositingMode = 'REALISTIC';
    newlyConfirmedLabels.push('Chế độ bảo vệ ảnh: REALISTIC (Hắt sáng vùng lân cận)');
  } else if (/\b(chế\s*độ\s*strict|bảo\s*toàn\s*tuyệt\s*đối|chỉ\s*sửa\s*vùng\s*led)\b/i.test(text)) {
    next.fields.compositingMode = 'STRICT';
    newlyConfirmedLabels.push('Chế độ bảo vệ ảnh: STRICT (Bảo toàn 100% ngoài vùng LED)');
  }

  // 8. Design style / Color palette extraction ("Tông đỏ, hiện đại", "màu đỏ trắng, hiện đại", "tông xanh dương sang trọng")
  const styleMatch = text.match(
    /\b((?:tông|màu|phong\s*cách|style)\s+[^.!\n]{3,80})/i
  );
  if (styleMatch) {
    const cleanStyle = styleMatch[1].trim();
    next.fields.designStyle = cleanStyle;
    next.provenance.designStyle = 'user_confirmed';
    newlyConfirmedLabels.push(`Phong cách/Màu sắc: ${cleanStyle}`);
  } else if (
    /\b(hiện\s*đại|sang\s*trọng|tối\s*giản|công\s*nghệ|rực\s*rỡ|chuyên\s*nghiệp)\b/i.test(lower) &&
    text.length <= 60
  ) {
    next.fields.designStyle = text;
    next.provenance.designStyle = 'user_confirmed';
    newlyConfirmedLabels.push(`Phong cách: ${text}`);
  }

  // 9. Target pixel resolution extraction ("1920x1080", "3840x2160", "1280x720")
  const pxMatch = text.match(/\b(\d{3,5})\s*[x×*]\s*(\d{3,5})\s*(?:px|pixel)?\b/i);
  if (pxMatch && !/\b(mm|cm|m)\b/i.test(pxMatch[0])) {
    const wPx = Number(pxMatch[1]);
    const hPx = Number(pxMatch[2]);
    // Only treat as pixel resolution if it doesn't collide with explicit mm dimensions or if explicitly labeled px / standard video res
    const isStandardRes =
      (wPx === 1920 && hPx === 1080) ||
      (wPx === 3840 && hPx === 2160) ||
      (wPx === 1280 && hPx === 720) ||
      (wPx === 2560 && hPx === 1440) ||
      /px|pixel|độ\s*phân\s*giải|kích\s*thước\s*\d+\s*[x×]\s*\d+/i.test(text);
    if (isStandardRes && wPx >= 128 && hPx >= 64) {
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const g = gcd(wPx, hPx);
      const ratio = `${Math.round(wPx / g)}:${Math.round(hPx / g)}`;
      next.fields.targetResolution = { widthPx: wPx, heightPx: hPx, aspectRatio: ratio };
      next.provenance.targetResolution = 'user_confirmed';
      newlyConfirmedLabels.push(`Độ phân giải mục tiêu: ${wPx}×${hPx} px (${ratio})`);
    }
  }

  // 10. Banner brief / content extraction ("banner khai trương showroom...", "nội dung banner...")
  const bannerBriefMatch = text.match(
    /(?:thiết\s*kế\s*banner|nội\s*dung\s*banner|banner\s*hiển\s*thị|chủ\s*đề\s*banner)\s*[:\-]?\s*([^\n]+)/i
  );
  if (bannerBriefMatch) {
    const cleanBrief = bannerBriefMatch[1].trim();
    next.fields.bannerContent = cleanBrief;
    next.provenance.bannerContent = 'user_confirmed';
    newlyConfirmedLabels.push(`Nội dung Banner: ${cleanBrief}`);
  }

  // Auto-derive theoretical resolution as 'ai_suggested' ONLY if targetResolution is NOT yet 'user_confirmed'
  if (
    next.provenance.targetResolution !== 'user_confirmed' &&
    next.fields.widthMm &&
    next.fields.heightMm &&
    next.fields.pixelPitch
  ) {
    const pitchNum = Number(next.fields.pixelPitch.replace(/[^0-9.]/g, '')) || 2.5;
    const resW = Math.round(next.fields.widthMm / pitchNum);
    const resH = Math.round(next.fields.heightMm / pitchNum);
    next.fields.targetResolution = {
      widthPx: resW,
      heightPx: resH,
      aspectRatio: '16:9',
    };
    next.provenance.targetResolution = 'ai_suggested';
  }

  return {
    updatedContext: next,
    newlyConfirmedLabels,
  };
}

/**
 * Safely applies AI-suggested defaults without ever overwriting fields where provenance === 'user_confirmed'.
 */
export function applyAiSuggestionsSafely(
  current: ProjectDesignContext,
  suggestions: Partial<DesignContextFields>
): ProjectDesignContext {
  const next: ProjectDesignContext = {
    fields: { ...current.fields },
    provenance: { ...current.provenance },
    updatedAt: new Date().toISOString(),
  };

  const keys = Object.keys(suggestions) as Array<keyof DesignContextFields>;
  for (const key of keys) {
    if (
      key === 'projectId' ||
      key === 'leadId' ||
      key === 'selectedPhotoId' ||
      key === 'activeVersionId' ||
      key === 'compositingMode'
    ) {
      continue;
    }
    const provKey = key as keyof DesignContextProvenanceMap;
    if (next.provenance[provKey] === 'user_confirmed') {
      // NEVER overwrite user-confirmed specification!
      continue;
    }
    const val = suggestions[key];
    if (val !== undefined && val !== null) {
      (next.fields as unknown as Record<string, unknown>)[key] = val;
      next.provenance[provKey] = 'ai_suggested';
    }
  }

  return next;
}

/**
 * Formats a concise human-readable summary of the current DesignContext
 * distinguishing between 'Đã xác nhận' (user_confirmed), 'AI đề xuất' (ai_suggested), and 'Chưa xác định' (undetermined).
 */
export function summarizeDesignContextForAssistant(ctx: ProjectDesignContext): string {
  const { fields, provenance } = ctx;
  const tag = (p: ParameterProvenance) =>
    p === 'user_confirmed' ? '✅ Đã xác nhận' : p === 'ai_suggested' ? '💡 AI đề xuất' : '⏳ Chưa xác định';

  const lines: string[] = [];
  lines.push(
    `• **Loại màn & Môi trường**: ${fields.ledType || 'Chưa xác định'} (${tag(provenance.environment)})`
  );
  lines.push(
    `• **Kích thước vật lý**: ${fields.widthMm && fields.heightMm
      ? `${fields.widthMm} × ${fields.heightMm} mm (${(fields.widthMm / 1000).toFixed(2)}m × ${(fields.heightMm / 1000).toFixed(2)}m)`
      : 'Chưa xác định'
    } (${tag(provenance.widthMm)})`
  );
  lines.push(
    `• **Pixel Pitch**: ${fields.pixelPitch || 'Chưa xác định'} (${tag(provenance.pixelPitch)})`
  );
  lines.push(
    `• **Vị trí lắp đặt**: ${fields.installPosition || 'Chưa xác định'} (${tag(provenance.installPosition)})`
  );
  lines.push(
    `• **Phong cách / Tông màu**: ${fields.designStyle || 'Chưa xác định'} (${tag(provenance.designStyle)})`
  );
  if (fields.targetResolution) {
    lines.push(
      `• **Độ phân giải mục tiêu**: ${fields.targetResolution.widthPx} × ${fields.targetResolution.heightPx} px (${tag(provenance.targetResolution)})`
    );
  }
  return lines.join('\n');
}
