/**
 * Module 05 — Deterministic Command Router (P1)
 * Separates user intent into:
 * - CHAT: Natural multi-turn LED consultation & parameter extraction (calls Chat Model only, never triggers Image Job)
 * - GENERATE_SCENE: @taoanh (and legacy aliases @TaoAnh) -> Perspective LED Scene Compositing & Inpainting
 * - GENERATE_BANNER: @taobanner (and legacy aliases @TaoAnhPoster / @taoposter) -> LED Banner / Content Design
 */

import type { QuadCoordinatesDto } from '@toantrung/contracts';

export type DesignCommandAction = 'CHAT' | 'GENERATE_SCENE' | 'GENERATE_BANNER';

export type CommandTriggerSource =
  | 'user_input'
  | 'user_button'
  | 'ai_generated_text'
  | 'uploaded_file_content';

export interface RouteCommandInput {
  rawMessage: string;
  source?: CommandTriggerSource;
  explicitButtonAction?: 'GENERATE_SCENE' | 'GENERATE_BANNER' | null;
}

export interface RoutedCommandResult {
  action: DesignCommandAction;
  commandToken: string | null;
  cleanInstruction: string;
  isMetaQuestionAboutCommand: boolean;
  blockedNonUserTrigger: boolean;
  reason: string;
}

export interface CommandReadinessInput {
  routed: RoutedCommandResult;
  hasSurveyPhoto: boolean;
  hasPlacementQuad: boolean;
  placementQuad?: QuadCoordinatesDto | null;
  widthMm?: number | null;
  heightMm?: number | null;
  pixelPitch?: string | null;
  bannerWidthPx?: number | null;
  bannerHeightPx?: number | null;
  bannerBriefFromContext?: string | null;
}

export interface CommandReadinessResult {
  canExecuteImmediately: boolean;
  effectiveAction: DesignCommandAction;
  missingFields: Array<'survey_photo' | 'placement_position' | 'led_dimensions' | 'banner_brief'>;
  clarificationReply: string | null;
}

// Prefix regexes for @taobanner (checked first so @taoanhposter / @taobanner doesn't match @taoanh prefix)
const BANNER_COMMAND_PREFIX_REGEX =
  /^\s*(@(?:taobanner|tao_banner|tao-banner|taoanhbanner|taoanhposter|taoposter|tao_anh_poster))\b\s*[:\-–—]?\s*/i;

// Prefix regexes for @taoanh
const SCENE_COMMAND_PREFIX_REGEX =
  /^\s*(@(?:taoanh|tạoảnh|tao_anh|tao-anh|taojanh))\b\s*[:\-–—]?\s*/i;

// Any mention of @taoanh or @taobanner inside a sentence
const ANY_COMMAND_MENTION_REGEX =
  /@(?:taobanner|tao_banner|tao-banner|taoanhbanner|taoanhposter|taoposter|tao_anh_poster|taoanh|tạoảnh|tao_anh|tao-anh|taojanh)\b/i;

// Detects when the user is asking ABOUT the command rather than executing it
const META_COMMAND_QUESTION_PATTERNS: RegExp[] = [
  /\blệnh\s+@\S+\s+(?:dùng\s+để\s+làm\s+gì|là\s+gì|như\s+thế\s+nào|hoạt\s+động\s+sao|có\s+tác\s+dụng\s+gì)/i,
  /\b(?:cách\s+dùng|hướng\s+dẫn\s+dùng|giải\s+thích|cho\s+hỏi|hỏi\s+về)\s+(?:lệnh\s+)?@\S+/i,
  /^@\S+\s+(?:dùng\s+để\s+làm\s+gì|là\s+gì|như\s+thế\s+nào|có\s+tác\s+dụng\s+gì|nghĩa\s+là\s+gì)\s*\??$/i,
  /\bkhi\s+nào\s+(?:thì\s+)?(?:dùng|gọi|sử\s+dụng)\s+(?:lệnh\s+)?@\S+/i,
  /\bkhác\s+nhau\s+giữa\s+@\S+\s+và\s+@\S+/i,
];

/**
 * Deterministic Command Router
 * Rules:
 * 1. Rejects execution if source is AI-generated text or uploaded file content.
 * 2. Detects meta-questions about `@taoanh` / `@taobanner` and routes them to `CHAT`.
 * 3. Only routes to `GENERATE_SCENE` or `GENERATE_BANNER` when user explicitly starts the command
 *    with `@taoanh` / `@taobanner` (or legacy aliases `@TaoAnh`, `@TaoAnhPoster`) or clicks the dedicated execution button.
 * 4. Normal conversational messages (even "tôi muốn hình ảnh đẹp hơn") ALWAYS route to `CHAT`.
 */
export function routeDesignCommand(input: RouteCommandInput): RoutedCommandResult {
  const raw = (input.rawMessage || '').trim();
  const source: CommandTriggerSource = input.source || 'user_input';

  // Rule 1: Never allow AI-generated output or uploaded file content to self-trigger image generation commands
  if (source === 'ai_generated_text' || source === 'uploaded_file_content') {
    return {
      action: 'CHAT',
      commandToken: null,
      cleanInstruction: raw,
      isMetaQuestionAboutCommand: false,
      blockedNonUserTrigger: true,
      reason: 'Blocked command trigger from non-user source (AI text or uploaded file content).',
    };
  }

  // Rule 2: Check if user is asking a meta-question about what @taoanh or @taobanner does
  if (ANY_COMMAND_MENTION_REGEX.test(raw)) {
    const isMetaQuestion = META_COMMAND_QUESTION_PATTERNS.some((pat) => pat.test(raw));
    if (isMetaQuestion) {
      return {
        action: 'CHAT',
        commandToken: null,
        cleanInstruction: raw,
        isMetaQuestionAboutCommand: true,
        blockedNonUserTrigger: false,
        reason: 'User is asking about the command usage rather// than invoking image generation.',
      };
    }
  }

  // Rule 3: Check explicit `@taobanner` (and aliases `@TaoAnhPoster`, `@taoposter`) at the start of user message
  const bannerMatch = raw.match(BANNER_COMMAND_PREFIX_REGEX);
  if (bannerMatch) {
    const cleanInstruction = raw.slice(bannerMatch[0].length).trim();
    return {
      action: 'GENERATE_BANNER',
      commandToken: bannerMatch[1].toLowerCase(),
      cleanInstruction,
      isMetaQuestionAboutCommand: false,
      blockedNonUserTrigger: false,
      reason: 'Matched explicit @taobanner command prefix from user.',
    };
  }

  // Rule 4: Check explicit `@taoanh` (and aliases `@TaoAnh`, `@tạoảnh`) at the start of user message
  const sceneMatch = raw.match(SCENE_COMMAND_PREFIX_REGEX);
  if (sceneMatch) {
    const cleanInstruction = raw.slice(sceneMatch[0].length).trim();
    return {
      action: 'GENERATE_SCENE',
      commandToken: sceneMatch[1].toLowerCase(),
      cleanInstruction,
      isMetaQuestionAboutCommand: false,
      blockedNonUserTrigger: false,
      reason: 'Matched explicit @taoanh command prefix from user.',
    };
  }

  // Rule 5: Check if user clicked an explicit execution button in UI
  if (source === 'user_button' && input.explicitButtonAction) {
    return {
      action: input.explicitButtonAction,
      commandToken: input.explicitButtonAction === 'GENERATE_BANNER' ? '@taobanner' : '@taoanh',
      cleanInstruction: raw,
      isMetaQuestionAboutCommand: false,
      blockedNonUserTrigger: false,
      reason: `Triggered via explicit user button (${input.explicitButtonAction}).`,
    };
  }

  // Rule 6: Default to CHAT — never auto-trigger image jobs from normal conversation
  return {
    action: 'CHAT',
    commandToken: null,
    cleanInstruction: raw,
    isMetaQuestionAboutCommand: false,
    blockedNonUserTrigger: false,
    reason: 'Standard conversational message routed to CHAT model.',
  };
}

/**
 * Validates whether a `GENERATE_SCENE` or `GENERATE_BANNER` command has all mandatory inputs
 * before calling any external/internal Image Generation API.
 * If missing mandatory data, returns `canExecuteImmediately: false` and a helpful prompt asking the user.
 */
export function validateCommandReadiness(input: CommandReadinessInput): CommandReadinessResult {
  const { routed } = input;
  if (routed.action === 'CHAT') {
    return {
      canExecuteImmediately: true,
      effectiveAction: 'CHAT',
      missingFields: [],
      clarificationReply: null,
    };
  }

  if (routed.action === 'GENERATE_SCENE') {
    const missing: Array<'survey_photo' | 'placement_position' | 'led_dimensions'> = [];

    if (!input.hasSurveyPhoto) {
      missing.push('survey_photo');
    }

    const q = input.placementQuad;
    const validQuad =
      input.hasPlacementQuad &&
      q &&
      typeof q.topLeft?.x === 'number' &&
      typeof q.bottomRight?.x === 'number' &&
      Math.hypot(q.bottomRight.x - q.topLeft.x, q.bottomRight.y - q.topLeft.y) >= 2;

    if (!validQuad) {
      missing.push('placement_position');
    }

    const validDims =
      typeof input.widthMm === 'number' &&
      input.widthMm > 0 &&
      typeof input.heightMm === 'number' &&
      input.heightMm > 0 &&
      Boolean(input.pixelPitch && input.pixelPitch.trim().length > 0);

    if (!validDims) {
      missing.push('led_dimensions');
    }

    if (missing.length > 0) {
      const bulletPrompts: string[] = [];
      if (missing.includes('survey_photo')) {
        bulletPrompts.push(
          '• **Ảnh khảo sát hiện trạng**: Dự án hiện chưa có ảnh công trình. Vui lòng bấm **+ Thêm ảnh** ở cột bên trái để tải ảnh khảo sát lên trước khi ghép phối cảnh.'
        );
      }
      if (missing.includes('placement_position')) {
        bulletPrompts.push(
          '• **Vị trí lắp đặt trên ảnh**: Vui lòng chấm 4 góc vị trí lắp màn hình LED trên Canvas (hoặc xác nhận vùng lắp đặt).'
        );
      }
      if (missing.includes('led_dimensions')) {
        bulletPrompts.push(
          '• **Thông số màn hình LED**: Vui lòng cho biết chiều rộng × chiều cao (ví dụ `4m8 x 2m7`) và dòng Pixel Pitch (ví dụ `P2.5`).'
        );
      }

      return {
        canExecuteImmediately: false,
        effectiveAction: 'CHAT',
        missingFields: missing,
        clarificationReply: [
          'Để thực thi lệnh **`@taoanh`** dựng phối cảnh chính xác và không làm sai lệch hiện trạng, bạn vui lòng bổ sung thông tin còn thiếu sau:',
          ...bulletPrompts,
          'Sau khi bổ sung xong, bạn chỉ cần gửi lại lệnh **`@taoanh`** để hệ thống kết xuất ngay!',
        ].join('\n'),
      };
    }

    return {
      canExecuteImmediately: true,
      effectiveAction: 'GENERATE_SCENE',
      missingFields: [],
      clarificationReply: null,
    };
  }

  // GENERATE_BANNER readiness check
  const effectiveBrief = (routed.cleanInstruction || input.bannerBriefFromContext || '').trim();
  if (!effectiveBrief || effectiveBrief.length < 3) {
    return {
      canExecuteImmediately: false,
      effectiveAction: 'CHAT',
      missingFields: ['banner_brief'],
      clarificationReply: [
        'Để thực thi lệnh **`@taobanner`**, bạn vui lòng mô tả ngắn gọn nội dung hoặc chủ đề Banner cần thiết kế.',
        '• Ví dụ: `@taobanner Thiết kế banner khai trương showroom, màu đỏ trắng, hiện đại, kích thước 1920x1080.`',
      ].join('\n'),
    };
  }

  return {
    canExecuteImmediately: true,
    effectiveAction: 'GENERATE_BANNER',
    missingFields: [],
    clarificationReply: null,
  };
}

