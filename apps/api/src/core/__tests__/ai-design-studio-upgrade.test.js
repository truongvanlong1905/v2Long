'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const V2_ROOT_CANDIDATE = path.resolve(__dirname, '../../../..');
const REPO_ROOT = fs.existsSync(path.join(V2_ROOT_CANDIDATE, 'packages/database/prisma/independent_v2.db'))
  ? V2_ROOT_CANDIDATE
  : path.resolve(__dirname, '../../../../..');
const INDEP_DB_PATH = path.join(REPO_ROOT, 'packages/database/prisma/independent_v2.db');
const INDEP_DB_NORM = INDEP_DB_PATH.replace(/\\/g, '/');
const INDEP_DB_URL = INDEP_DB_NORM.startsWith('/') ? `file://${INDEP_DB_NORM}` : `file:${INDEP_DB_NORM}`;

// Helper: PII checker implementation identical to contract
function containsCustomerPiiInPrompt(text) {
  if (!text) return { hasPii: false };
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  if (emailRegex.test(text)) {
    return {
      hasPii: true,
      reason: 'Prompt chứa địa chỉ email. Theo quy định bảo mật BA (UC06), tuyệt đối không gửi email/SĐT khách hàng sang AI bên thứ ba.',
    };
  }
  const vnPhoneRegex = /(?:\+84|0)(?:3|5|7|8|9)(?:[\s.-]*\d){8}\b/;
  if (vnPhoneRegex.test(text)) {
    return {
      hasPii: true,
      reason: 'Prompt chứa số điện thoại. Theo quy định bảo mật BA (UC06), tuyệt đối không gửi SĐT/thông tin liên hệ khách hàng sang AI bên thứ ba.',
    };
  }
  return { hasPii: false };
}

// Helper: Engineering spec calculator identical to service
function computeLedProductSpec(params) {
  const w = params.widthM && params.widthM > 0 ? params.widthM : 4.8;
  const h = params.heightM && params.heightM > 0 ? params.heightM : 2.7;
  const areaM2 = Number((w * h).toFixed(2));
  const pitch = params.pitch || 'P2.5';
  const pitchMm = Number(pitch.replace(/[^0-9.]/g, '')) || 2.5;

  const resW = Math.round((w * 1000) / pitchMm);
  const resH = Math.round((h * 1000) / pitchMm);

  const cabinetCols = Math.max(1, Math.round((w * 1000) / 640));
  const cabinetRows = Math.max(1, Math.round((h * 1000) / 480));
  const cabinetCount = cabinetCols * cabinetRows;
  const moduleCount = cabinetCount * 6;

  return {
    productCode: params.productCode || 'LED_INDOOR',
    productName: params.productName || 'Màn hình LED Indoor',
    screenStyle: params.screenStyle || 'flat',
    pixelPitch: pitch,
    physicalWidthM: w,
    physicalHeightM: h,
    areaM2,
    resolutionWidthPx: resW,
    resolutionHeightPx: resH,
    moduleDimensionsMm: '320 x 160 mm',
    cabinetDimensionsMm: '640 x 480 mm',
    cabinetCount,
    moduleCount,
    controller: 'Novastar TB60 / VX600',
    receivingCard: 'Novastar MRV328',
    powerSupply: 'Meanwell / G-Energy 5V-40A',
    avgPowerWatts: Math.round(areaM2 * 250),
    maxPowerWatts: Math.round(areaM2 * 600),
  };
}

test('M05-01: PII Protection in AI Prompts strictly blocks email and phone numbers', () => {
  // Safe prompt
  assert.equal(
    containsCustomerPiiInPrompt('Dựng phối cảnh màn hình LED P2.5 trên tường phòng họp sang trọng').hasPii,
    false
  );

  // Email leak
  const emailCheck = containsCustomerPiiInPrompt('Gửi demo về client.director@company.vn');
  assert.equal(emailCheck.hasPii, true);
  assert.match(emailCheck.reason, /email/i);

  // Phone leak
  const phoneCheck = containsCustomerPiiInPrompt('Liên hệ anh Tuấn 0903888999 để gắn màn hình');
  assert.equal(phoneCheck.hasPii, true);
  assert.match(phoneCheck.reason, /số điện thoại/i);
});

test('M05-02: Engineering Calculation of LED Dimensions, Pitch & Resolution', () => {
  const spec = computeLedProductSpec({
    productCode: 'LED_INDOOR',
    productName: 'Màn hình LED Indoor',
    widthM: 4.8,
    heightM: 2.7,
    pitch: 'P2.5',
    screenStyle: 'flat',
  });

  assert.equal(spec.physicalWidthM, 4.8);
  assert.equal(spec.physicalHeightM, 2.7);
  assert.equal(spec.areaM2, 12.96);
  assert.equal(spec.resolutionWidthPx, 1920);
  assert.equal(spec.resolutionHeightPx, 1080);
  assert.equal(spec.cabinetCount, 48); // 8 cols x 6 rows
  assert.equal(spec.moduleCount, 288);
  assert.equal(spec.avgPowerWatts, 3240);
  assert.equal(spec.maxPowerWatts, 7776);
});

test('M05-03: Shared Database Integration & Project Model Lifecycle (Create -> Chat Version -> Save Finished)', async (t) => {
  assert.ok(fs.existsSync(INDEP_DB_PATH), 'independent_v2.db must exist');
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  // 1. Verify shared products exist in database
  const products = await prisma.product.findMany({ where: { isActive: true } });
  assert.ok(products.length >= 20, 'Catalog must contain BA approved products');
  const ledIndoor = products.find((p) => p.productCode === 'LED_INDOOR');
  assert.ok(ledIndoor, 'LED_INDOOR product must exist in shared catalog');

  // 2. Create a new DesignRequest (3D perspective)
  const placementQuad = {
    topLeft: { x: 64.2, y: 44.5 },
    topRight: { x: 93.8, y: 45.2 },
    bottomRight: { x: 94.5, y: 72.8 },
    bottomLeft: { x: 64.5, y: 70.1 },
  };

  const initialMetadata = {
    projectName: 'Showroom LED Test Lifecycle',
    contactName: 'Anh Tuấn',
    installationInfo: 'Vách thạch cao bên phải',
    photos: [
      {
        id: 'p1',
        name: 'Ảnh chính diện showroom',
        url: '/brand/showroom-toan-trung.webp',
        selected: true,
      },
    ],
    placementQuad,
    chatMessages: [
      {
        id: 'msg-1',
        role: 'user',
        text: 'Đặt màn hình ở tường bên phải, hiển thị sóng biển xanh và giữ nguyên nội thất.',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        text: 'Bản nháp mới đã được thêm vào thư viện.',
        timestamp: new Date().toISOString(),
        versionNumber: 1,
        status: 'success',
      },
    ],
  };

  const created = await prisma.designRequest.create({
    data: {
      leadId: 1,
      assignedDesignerId: 5,
      requestType: '3d_perspective',
      ledCategory: 'Màn hình LED Indoor (P2.5)',
      screenDimensions: '4,80 x 2,70 m',
      aspectRatio: '16:9',
      installPositionJson: JSON.stringify(initialMetadata),
      sitePhotoUrl: 'leads/site-photo-lead-1.png',
      prompt: 'Đặt màn hình ở tường bên phải, hiển thị sóng biển xanh và giữ nguyên nội thất.',
      designStatus: 'ai_drafting',
      aiDraftImageUrl: 'design/design-3d-v1-draft.png',
      processingTimeMs: 4200,
      tokenCost: 2450,
      totalCostMicros: 30000n,
      costCurrency: 'USD',
      notes: 'Bản nháp ban đầu do AI dựng.',
    },
  });

  assert.ok(created.id > 0);

  // 3. Create Asset Version v1
  const v1 = await prisma.designAssetVersion.create({
    data: {
      designRequestId: created.id,
      versionNumber: 1,
      versionType: 'ai_draft',
      storageObjectKey: 'design/design-3d-v1-draft.png',
      mimeType: 'image/png',
      fileSizeBytes: 1024,
      promptUsed: created.prompt,
      parametersJson: JSON.stringify({ quad: placementQuad }),
      uploadedByUserId: 5,
      isApprovedFinal: false,
    },
  });

  assert.equal(v1.versionNumber, 1);

  // 4. Simulate Conversational Editing (Chat turn creates version v2)
  const updatedMetadata = {
    ...initialMetadata,
    chatMessages: [
      ...initialMetadata.chatMessages,
      {
        id: 'msg-3',
        role: 'user',
        text: 'Chuyển màu LED sang tông vàng ấm và giảm độ bóng sàn',
        timestamp: new Date().toISOString(),
      },
      {
        id: 'msg-4',
        role: 'assistant',
        text: 'Bản nháp mới (v2) đã được thêm vào thư viện.',
        timestamp: new Date().toISOString(),
        versionNumber: 2,
        status: 'success',
      },
    ],
  };

  const v2 = await prisma.designAssetVersion.create({
    data: {
      designRequestId: created.id,
      versionNumber: 2,
      versionType: 'ai_draft',
      storageObjectKey: 'design/design-3d-v2-final.png',
      mimeType: 'image/png',
      fileSizeBytes: 2048,
      promptUsed: 'Chuyển màu LED sang tông vàng ấm và giảm độ bóng sàn',
      parametersJson: JSON.stringify({ quad: placementQuad, regenerated: true }),
      uploadedByUserId: 5,
      isApprovedFinal: false,
    },
  });

  assert.equal(v2.versionNumber, 2);

  await prisma.designRequest.update({
    where: { id: created.id },
    data: {
      installPositionJson: JSON.stringify(updatedMetadata),
      version: { increment: 1 },
      processingTimeMs: { increment: 3800 },
      tokenCost: { increment: 2100 },
      totalCostMicros: { increment: 30000n },
    },
  });

  // Verify both versions exist
  const versions = await prisma.designAssetVersion.findMany({
    where: { designRequestId: created.id },
    orderBy: { versionNumber: 'asc' },
  });
  assert.equal(versions.length, 2, 'Must retain both v1 and v2 in history');

  // 5. Save Finished Version (Mark v2 as approved final)
  await prisma.$transaction([
    prisma.designAssetVersion.updateMany({
      where: { designRequestId: created.id },
      data: { isApprovedFinal: false },
    }),
    prisma.designAssetVersion.update({
      where: { id: v2.id },
      data: { isApprovedFinal: true },
    }),
    prisma.designRequest.update({
      where: { id: created.id },
      data: {
        approvedVersionId: v2.id,
        finalRenderUrl: v2.storageObjectKey,
        designStatus: 'completed',
        completedAt: new Date(),
        version: { increment: 1 },
      },
    }),
  ]);

  const finished = await prisma.designRequest.findUnique({
    where: { id: created.id },
    include: { approvedVersion: true },
  });

  assert.equal(finished.designStatus, 'completed');
  assert.equal(finished.approvedVersionId, v2.id);
  assert.equal(finished.approvedVersion?.isApprovedFinal, true);

  // Clean up test rows so live studio database stays clean
  await prisma.designRequest.update({
    where: { id: created.id },
    data: { approvedVersionId: null },
  });
  await prisma.designAssetVersion.deleteMany({ where: { designRequestId: created.id } });
  await prisma.designRequest.delete({ where: { id: created.id } });
});

test('M05-04: Standalone Banner creation without Lead requirement (UC06 Luồng phụ 2a)', async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  const bannerReq = await prisma.designRequest.create({
    data: {
      leadId: null, // Optional for independent Banner
      assignedDesignerId: 5,
      requestType: 'banner',
      ledCategory: 'Banner Truyền thông Màn hình LED Khuyến mãi',
      screenDimensions: '1920x1080px',
      aspectRatio: '16:9',
      prompt: 'Banner phong cách công nghệ màu xanh dương và trắng',
      designStatus: 'ai_drafting',
      notes: 'Tạo độc lập không gắn Lead theo UC06 Luồng phụ 2a',
    },
  });

  assert.ok(bannerReq.id > 0);
  assert.equal(bannerReq.leadId, null, 'Lead ID must be null for independent banner');
  assert.equal(bannerReq.requestType, 'banner');

  await prisma.designRequest.delete({ where: { id: bannerReq.id } });
});

test('M05-05: AI Usage Log records timing, tokens, and micro-costs per attempt', async (t) => {
  const prisma = new PrismaClient({ datasources: { db: { url: INDEP_DB_URL } } });
  t.after(() => prisma.$disconnect());

  const idempotencyKey = `test-usage-log-${Date.now()}`;
  const log = await prisma.aiUsageLog.create({
    data: {
      idempotencyKey,
      attemptNumber: 1,
      providerRequestId: 'imagen-test-req-001',
      moduleCode: '05-ai-design',
      taskType: '3d_perspective',
      userId: 5,
      modelName: 'imagen-3.0-generate-002',
      promptTokens: 180,
      completionTokens: 2048,
      totalTokens: 2228,
      costMicros: 30000n, // $0.030 USD
      costCurrency: 'USD',
      durationMs: 4150,
      status: 'success',
    },
  });

  assert.ok(log.id > 0);
  assert.equal(log.costMicros, 30000n);
  assert.equal(log.status, 'success');
  assert.equal(log.moduleCode, '05-ai-design');

  await prisma.aiUsageLog.delete({ where: { id: log.id } });
});

// ============================================================================
// BỘ 14 KỊCH BẢN KIỂM THỬ TỰ ĐỘNG BẮT BUỘC — NÂNG CẤP CHUYÊN SÂU MODULE 05 (MỤC IX)
// ============================================================================

const ts = require('typescript');
const Module = require('node:module');

// Register on-the-fly TypeScript compiler hook for importing M05 TypeScript modules in node:test
if (!require.extensions['.ts']) {
  require.extensions['.ts'] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };
}

const V2_ROOT = path.resolve(__dirname, '../../../../..');
const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAliases(request, parent, isMain, options) {
  if (request === '@toantrung/contracts') {
    return path.join(V2_ROOT, 'packages/contracts/src/common/index.ts');
  }
  if (request === '@toantrung/database') {
    return path.join(V2_ROOT, 'packages/database/src/index.ts');
  }
  try {
    return origResolveFilename.call(this, request, parent, isMain, options);
  } catch (err) {
    if (request.startsWith('.') && parent && parent.filename) {
      const candidateTs = path.resolve(path.dirname(parent.filename), `${request}.ts`);
      if (fs.existsSync(candidateTs)) {
        return candidateTs;
      }
      const candidateIndexTs = path.resolve(path.dirname(parent.filename), request, 'index.ts');
      if (fs.existsSync(candidateIndexTs)) {
        return candidateIndexTs;
      }
    }
    throw err;
  }
};

process.env.DATABASE_URL = INDEP_DB_URL;

const {
  routeDesignCommand,
  validateCommandReadiness,
} = require('../../modules/05-ai-design/command-router.ts');
const {
  createInitialDesignContext,
  extractAndMergeUserChatContext,
  applyAiSuggestionsSafely,
} = require('../../modules/05-ai-design/design-context.ts');
const {
  evaluateLedTechnicalConfig,
} = require('../../modules/05-ai-design/led-technical.engine.ts');
const {
  validateGeneratedImageBuffer,
  decodePngToRgb,
  encodeRgbToPng,
  renderPerspectiveCompositeWithProtection,
  processBannerToTargetResolution,
} = require('../../modules/05-ai-design/perspective-compositor.ts');
const {
  canUserAccessDesignProject,
  ForbiddenDesignProjectAccessError,
  createDesignRequestWithAiDraft,
  addProjectPhoto,
  processChatDesignRequest,
  getDesignProjectForUser,
  deleteDesignProject,
} = require('../../modules/05-ai-design/service.ts');

const DESIGNER_ACTOR = {
  id: 5,
  username: 'designer01',
  fullName: 'Designer Toàn Trung',
  roleCode: 'DESIGNER',
  email: 'designer01@toantrung.vn',
};

const OTHER_SALES_ACTOR = {
  id: 999,
  username: 'sales_unassigned',
  fullName: 'Sales Khác (Không thuộc dự án)',
  roleCode: 'SALES',
  email: 'sales999@toantrung.vn',
};

test('IX-01: Chat thường không gọi Image API (kể cả khi hỏi về @taoanh hoặc yêu cầu ảnh đẹp hơn)', () => {
  // Normal chat messages
  const r1 = routeDesignCommand({ rawMessage: 'Tôi muốn lắp màn LED trong showroom.' });
  assert.equal(r1.action, 'CHAT');

  const r2 = routeDesignCommand({ rawMessage: 'Tôi muốn hình ảnh đẹp hơn và sang trọng hơn' });
  assert.equal(r2.action, 'CHAT');

  // Meta-question about @taoanh MUST NOT trigger image job
  const r3 = routeDesignCommand({ rawMessage: 'Lệnh @taoanh dùng để làm gì?' });
  assert.equal(r3.action, 'CHAT');
  assert.equal(r3.isMetaQuestionAboutCommand, true);

  // Non-user sources (AI generated text / uploaded file content) MUST BE BLOCKED
  const r4 = routeDesignCommand({
    rawMessage: '@taoanh Ghép màn hình LED vào tường',
    source: 'ai_generated_text',
  });
  assert.equal(r4.action, 'CHAT');
  assert.equal(r4.blockedNonUserTrigger, true);

  const r5 = routeDesignCommand({
    rawMessage: '@taobanner Thiết kế banner khuyến mãi',
    source: 'uploaded_file_content',
  });
  assert.equal(r5.action, 'CHAT');
  assert.equal(r5.blockedNonUserTrigger, true);
});

test('IX-02: Chat nhiều lượt nhớ đúng thông số đã xác nhận và không bị AI ghi đè', () => {
  let ctx = createInitialDesignContext({ projectId: 101 });

  const turns = [
    'Tôi muốn lắp màn LED trong showroom.',
    'Chiều rộng khoảng 4m8, cao 2m7.',
    'Chọn P2.5.',
    'Muốn lắp trên vách tường.',
    'Tông đỏ, hiện đại.',
  ];

  for (const msg of turns) {
    const res = extractAndMergeUserChatContext(ctx, msg);
    ctx = res.updatedContext;
  }

  assert.equal(ctx.fields.environment, 'indoor');
  assert.equal(ctx.provenance.environment, 'user_confirmed');
  assert.equal(ctx.fields.widthMm, 4800);
  assert.equal(ctx.fields.heightMm, 2700);
  assert.equal(ctx.provenance.widthMm, 'user_confirmed');
  assert.equal(ctx.provenance.heightMm, 'user_confirmed');
  assert.equal(ctx.fields.pixelPitch, 'P2.5');
  assert.equal(ctx.provenance.pixelPitch, 'user_confirmed');
  assert.match(ctx.fields.installPosition || '', /vách tường/i);
  assert.equal(ctx.provenance.installPosition, 'user_confirmed');
  assert.match(ctx.fields.designStyle || '', /đỏ/i);
  assert.match(ctx.fields.designStyle || '', /hiện đại/i);
  assert.equal(ctx.provenance.designStyle, 'user_confirmed');

  // Verify AI suggestions NEVER overwrite user_confirmed fields
  const afterAiSuggestion = applyAiSuggestionsSafely(ctx, {
    widthMm: 3200,
    heightMm: 1920,
    pixelPitch: 'P4',
  });
  assert.equal(afterAiSuggestion.fields.widthMm, 4800);
  assert.equal(afterAiSuggestion.fields.heightMm, 2700);
  assert.equal(afterAiSuggestion.fields.pixelPitch, 'P2.5');
});

test('IX-03: @taoanh thiếu ảnh khảo sát phải hỏi lại người dùng và không tạo Image Job', async () => {
  const routed = routeDesignCommand({
    rawMessage: '@taoanh Ghép màn hình LED P2.5 vào vị trí đã đánh dấu',
    source: 'user_input',
  });
  assert.equal(routed.action, 'GENERATE_SCENE');

  const readiness = validateCommandReadiness({
    routed,
    hasSurveyPhoto: false,
    hasPlacementQuad: true,
    placementQuad: {
      topLeft: { x: 20, y: 20 },
      topRight: { x: 80, y: 20 },
      bottomRight: { x: 80, y: 70 },
      bottomLeft: { x: 20, y: 70 },
    },
    widthMm: 4800,
    heightMm: 2700,
    pixelPitch: 'P2.5',
  });

  assert.equal(readiness.canExecuteImmediately, false);
  assert.ok(readiness.missingFields.includes('survey_photo'));
  assert.match(readiness.clarificationReply || '', /Ảnh khảo sát hiện trạng/i);

  // Also verify via full service on an initialized project with 0 photos
  const initProj = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'perspective_3d',
    projectName: 'Test Missing Photo Project',
    productId: 1,
    ledModuleSpec: 'P2.5 Indoor',
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    aiPrompt: '[INIT_PROJECT] Dự án chưa có ảnh khảo sát',
    quality: 'draft',
  });

  try {
    const res = await processChatDesignRequest(DESIGNER_ACTOR, initProj.id, {
      prompt: '@taoanh Ghép màn hình LED P2.5 vào vách tường',
      providerId: 'local_sandbox',
    });
    assert.equal(res.mode, 'consultant_free');
    assert.ok(Array.isArray(res.missingFields) && res.missingFields.includes('survey_photo'));
    const detail = await getDesignProjectForUser(DESIGNER_ACTOR, initProj.id);
    assert.equal(detail.project.assetVersions.length, 0, 'Không được tạo version ảnh khi thiếu ảnh khảo sát');
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, initProj.id);
  }
});

test('IX-04 & IX-09: @taoanh đủ dữ liệu tạo job đúng một lần, tạo version mới cho Canvas và bảo toàn 100% pixel ngoài vùng LED (STRICT)', async () => {
  // Create a synthetic 120x80 survey photo PNG with a distinct background pattern
  const W = 120;
  const H = 80;
  const bgRgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    bgRgb[i * 3] = 42;
    bgRgb[i * 3 + 1] = 115;
    bgRgb[i * 3 + 2] = 188;
  }
  const surveyPngBuffer = encodeRgbToPng({ width: W, height: H, rgb: bgRgb });

  const quad = {
    topLeft: { x: 25, y: 25 },
    topRight: { x: 75, y: 25 },
    bottomRight: { x: 75, y: 75 },
    bottomLeft: { x: 25, y: 75 },
  };

  // Verify STRICT mode preserves 100% of pixels outside the quad
  const strictResult = renderPerspectiveCompositeWithProtection({
    referenceImageBuffer: surveyPngBuffer,
    placementQuad: quad,
    prompt: 'Showroom Toàn Trung P2.5 tông đỏ hiện đại',
    screenStyle: 'flat',
    compositingMode: 'STRICT',
  });
  assert.ok(strictResult);
  assert.equal(strictResult.preservedOutsidePixelsStrictly, true);

  const decodedStrict = decodePngToRgb(strictResult.imageBuffer);
  assert.ok(decodedStrict);
  // Check top-left corner pixel (5, 5) outside the 25%-75% quad is 100% identical to original (42, 115, 188)
  const outsideIdx = (5 * W + 5) * 3;
  assert.equal(decodedStrict.rgb[outsideIdx], 42);
  assert.equal(decodedStrict.rgb[outsideIdx + 1], 115);
  assert.equal(decodedStrict.rgb[outsideIdx + 2], 188);

  // Full end-to-end service execution with @taoanh
  const proj = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'perspective_3d',
    projectName: 'Test Full @taoanh Scene',
    productId: 1,
    ledModuleSpec: 'P2.5 Indoor',
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    placementQuad: quad,
    aiPrompt: '[INIT_PROJECT] Dự án đủ dữ liệu',
    quality: 'draft',
  });

  try {
    const addedPhoto = await addProjectPhoto(DESIGNER_ACTOR, proj.id, {
      photoName: 'Anh_khao_sat_showroom.png',
      fileName: 'survey.png',
      mimeType: 'image/png',
      base64Data: surveyPngBuffer.toString('base64'),
    });
    assert.ok(addedPhoto.id);

    const execRes = await processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
      prompt: '@taoanh Ghép màn hình LED P2.5 vào vị trí đã đánh dấu, giữ nguyên công trình và tạo phối cảnh chân thực.',
      providerId: 'local_sandbox',
      placementQuad: quad,
      compositingMode: 'STRICT',
    });

    assert.equal(execRes.commandAction, 'GENERATE_SCENE');
    assert.equal(execRes.versionNumber, 1);
    assert.ok(execRes.versionId > 0);
    assert.equal(execRes.compositingMode, 'STRICT');

    const detail = await getDesignProjectForUser(DESIGNER_ACTOR, proj.id);
    assert.equal(detail.project.assetVersions.length, 1, 'Phải tạo đúng 1 DesignAssetVersion mới cho Canvas');
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, proj.id);
  }
});

test('IX-05: @taobanner tạo job banner đúng luồng, xử lý độ phân giải mục tiêu và cảnh báo kiểm tra chữ (typographyWarning)', async () => {
  const proj = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'banner',
    projectName: 'Test @taobanner Workflow',
    bannerWidthPx: 1920,
    bannerHeightPx: 1080,
    aspectRatio: '16:9',
    aiPrompt: '[INIT_PROJECT] Khởi tạo dự án Banner',
    quality: 'draft',
  });

  try {
    const bannerRes = await processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
      prompt: '@taobanner Thiết kế banner khai trương showroom, màu đỏ trắng, hiện đại, kích thước 1920x1080.',
      providerId: 'local_sandbox',
      bannerWidthPx: 1920,
      bannerHeightPx: 1080,
    });

    assert.equal(bannerRes.commandAction, 'GENERATE_BANNER');
    assert.equal(bannerRes.versionNumber, 1);
    assert.ok(bannerRes.versionId > 0);
    assert.ok(bannerRes.typographyWarning, 'Phải đính kèm cảnh báo kiểm tra chính tả/typography trên banner');
    assert.match(bannerRes.typographyWarning, /chính tả|font/i);
    assert.ok(bannerRes.resizeExplanation, 'Phải giải thích quy tắc xử lý kích thước đầu ra');
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, proj.id);
  }
});

test('IX-06: Chọn nguồn ảnh khảo sát (selectedPhotoId) và chọn phiên bản (sourceVersionId) đều dùng đúng ảnh tương ứng', async () => {
  const W = 80;
  const H = 60;
  const photo1Buf = encodeRgbToPng({ width: W, height: H, rgb: new Uint8Array(W * H * 3).fill(60) });
  const photo2Buf = encodeRgbToPng({ width: W, height: H, rgb: new Uint8Array(W * H * 3).fill(180) });

  const proj = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'perspective_3d',
    projectName: 'Test Source Selection',
    productId: 1,
    ledModuleSpec: 'P2.5 Indoor',
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    aiPrompt: '[INIT_PROJECT] Chọn nguồn ảnh',
    quality: 'draft',
  });

  try {
    const p1 = await addProjectPhoto(DESIGNER_ACTOR, proj.id, {
      photoName: 'Góc chụp 1',
      fileName: 'p1.png',
      mimeType: 'image/png',
      base64Data: photo1Buf.toString('base64'),
    });
    const p2 = await addProjectPhoto(DESIGNER_ACTOR, proj.id, {
      photoName: 'Góc chụp 2',
      fileName: 'p2.png',
      mimeType: 'image/png',
      base64Data: photo2Buf.toString('base64'),
    });

    // Explicitly select p1 as source photo
    const v1Res = await processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
      prompt: '@taoanh Ghép màn LED trên ảnh góc chụp 1',
      providerId: 'local_sandbox',
      selectedPhotoId: p1.id,
    });
    assert.equal(v1Res.sourcePhotoId, p1.id);
    assert.equal(v1Res.versionNumber, 1);

    // Explicitly select v1 (versionId) as the source version for v2 edit
    const v2Res = await processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
      prompt: '@taoanh Điều chỉnh nội dung màn hình sang tông vàng ấm từ bản v1',
      providerId: 'local_sandbox',
      sourceVersionId: v1Res.versionId,
    });
    assert.equal(v2Res.sourceVersionId, v1Res.versionId);
    assert.equal(v2Res.versionNumber, 2);
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, proj.id);
  }
});

test('IX-07 & IX-08: AI chỉ trả về text (không có ảnh) hoặc AI timeout/lỗi đều không tạo version giả và giữ nguyên dữ liệu', async () => {
  // 1. Validate binary validator rejects text-only or empty payload
  const textPayload = Buffer.from(JSON.stringify({ message: 'Tôi đã tạo ảnh cho bạn!' }), 'utf8');
  const valText = validateGeneratedImageBuffer(textPayload);
  assert.equal(valText.isValid, false);
  assert.ok(valText.errorCode === 'INVALID_IMAGE_FORMAT' || valText.errorCode === 'TEXT_ONLY_OR_NON_IMAGE_PAYLOAD');

  const emptyVal = validateGeneratedImageBuffer(Buffer.alloc(0));
  assert.equal(emptyVal.isValid, false);

  // 2. Reject text-only chat model when calling @taoanh
  const proj = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'perspective_3d',
    projectName: 'Test Error & Timeout Resilience',
    productId: 1,
    ledModuleSpec: 'P2.5 Indoor',
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    aiPrompt: '[INIT_PROJECT] Test Resilience',
    quality: 'draft',
  });

  try {
    const surveyBuf = encodeRgbToPng({ width: 64, height: 48, rgb: new Uint8Array(64 * 48 * 3).fill(100) });
    await addProjectPhoto(DESIGNER_ACTOR, proj.id, {
      photoName: 'Survey.png',
      fileName: 'survey.png',
      mimeType: 'image/png',
      base64Data: surveyBuf.toString('base64'),
    });

    await assert.rejects(
      () =>
        processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
          prompt: '@taoanh Ghép màn LED',
          modelId: 'gemini-2.5-flash-chat-only',
        }),
      /MODEL_NOT_IMAGE_CAPABLE/
    );

    // 3. Simulate timeout -> must throw timeout error and preserve existing versions (0 versions created)
    await assert.rejects(
      () =>
        processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
          prompt: '@taoanh Ghép màn LED khi mạng timeout',
          providerId: 'local_sandbox',
          simulateAiTimeout: true,
        }),
      /quá thời gian phản hồi/i
    );

    const afterTimeout = await getDesignProjectForUser(DESIGNER_ACTOR, proj.id);
    assert.equal(afterTimeout.project.assetVersions.length, 0, 'Timeout không được tạo version rỗng');
    assert.equal(afterTimeout.project.photos.length, 1, 'Ảnh khảo sát gốc phải được giữ nguyên sau khi lỗi/timeout');
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, proj.id);
  }
});

test('IX-10 & IX-14: Refresh trang bảo toàn lịch sử chat, ảnh, version từ DB và chuyển dự án không làm lẫn DesignContext', async () => {
  const projA = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'perspective_3d',
    projectName: 'Dự án A - Showroom Quận 1',
    productId: 1,
    ledModuleSpec: 'P2.5 Indoor',
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    aiPrompt: '[INIT_PROJECT] Dự án A',
    quality: 'draft',
  });

  const projB = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'perspective_3d',
    projectName: 'Dự án B - Mặt dựng Outdoor Quận 7',
    productId: 1,
    ledModuleSpec: 'P4 Outdoor',
    screenWidthM: 9.6,
    screenHeightM: 4.8,
    aiPrompt: '[INIT_PROJECT] Dự án B',
    quality: 'draft',
  });

  try {
    await processChatDesignRequest(DESIGNER_ACTOR, projA.id, {
      prompt: 'Tôi muốn lắp màn LED trong showroom. Chiều rộng khoảng 4m8, cao 2m7. Chọn P2.5. Tông đỏ, hiện đại.',
    });

    await processChatDesignRequest(DESIGNER_ACTOR, projB.id, {
      prompt: 'Lắp màn hình ngoài trời mặt tiền tòa nhà. Rộng 9m6, cao 4m8. Chọn P4.',
    });

    // Reload both projects fresh from DB (simulating page refresh & switching between Project A and Project B)
    const reloadA = await getDesignProjectForUser(DESIGNER_ACTOR, projA.id);
    const reloadB = await getDesignProjectForUser(DESIGNER_ACTOR, projB.id);

    assert.equal(reloadA.designContext.fields.projectId, projA.id);
    assert.equal(reloadA.designContext.fields.environment, 'indoor');
    assert.equal(reloadA.designContext.fields.widthMm, 4800);
    assert.equal(reloadA.designContext.fields.heightMm, 2700);
    assert.equal(reloadA.designContext.fields.pixelPitch, 'P2.5');
    assert.ok(reloadA.project.chatMessages.length >= 2);

    assert.equal(reloadB.designContext.fields.projectId, projB.id);
    assert.equal(reloadB.designContext.fields.environment, 'outdoor');
    assert.equal(reloadB.designContext.fields.widthMm, 9600);
    assert.equal(reloadB.designContext.fields.heightMm, 4800);
    assert.equal(reloadB.designContext.fields.pixelPitch, 'P4');
    assert.ok(reloadB.project.chatMessages.length >= 2);
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, projA.id);
    await deleteDesignProject(DESIGNER_ACTOR, projB.id);
  }
});

test('IX-11: Người dùng không có quyền bị chặn truy cập dự án và tài sản ảnh của dự án khác', async () => {
  const proj = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'perspective_3d',
    projectName: 'Dự án Bảo mật Nội bộ',
    productId: 1,
    ledModuleSpec: 'P2.5 Indoor',
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    aiPrompt: '[INIT_PROJECT] Bảo mật',
    quality: 'draft',
  });

  try {
    // Sales user #999 does not own this project and is not assigned to its lead
    assert.equal(
      canUserAccessDesignProject(OTHER_SALES_ACTOR, {
        id: proj.id,
        requestedBySalesId: null,
        assignedDesignerId: DESIGNER_ACTOR.id,
        lead: null,
      }),
      false
    );

    await assert.rejects(
      () => getDesignProjectForUser(OTHER_SALES_ACTOR, proj.id),
      ForbiddenDesignProjectAccessError
    );

    await assert.rejects(
      () =>
        processChatDesignRequest(OTHER_SALES_ACTOR, proj.id, {
          prompt: 'Xem trộm dự án',
        }),
      ForbiddenDesignProjectAccessError
    );
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, proj.id);
  }
});

test('IX-12: Kiểm tra kỹ thuật độc lập — 4800×2700mm P2.5 cảnh báo lẻ cabinet 640×480mm, không ép cứng 48 cabin giả và không tự sửa thông số đã xác nhận', () => {
  // 1. Check 4800 x 2700 mm with P2.5 on standard 640 x 480 mm cabinet
  const eval640 = evaluateLedTechnicalConfig({
    widthMm: 4800,
    heightMm: 2700,
    pixelPitch: 'P2.5',
    cabinetModelCode: 'CAB_640_480',
  });

  assert.equal(eval640.theoreticalResolutionWidthPx, 1920);
  assert.equal(eval640.theoreticalResolutionHeightPx, 1080);
  assert.equal(eval640.feasibilityStatus, 'dimension_mismatch_warning');
  assert.equal(eval640.isFeasibleWithoutAdjustment, false);
  // Preserves user's requested 4800 x 2700 mm without overwriting
  assert.equal(eval640.widthMm, 4800);
  assert.equal(eval640.heightMm, 2700);
  // Provides lower (7x5 = 35 cabin -> 4480x2400mm), upper (8x6 = 48 cabin -> 5120x2880mm), and exact 16:9 alternative (8x8 = 64 cabin of 600x337.5mm -> 4800x2700mm)
  assert.equal(eval640.lowerFitOption.cabinetCount, 35);
  assert.equal(eval640.upperFitOption.cabinetCount, 48);
  assert.equal(eval640.upperFitOption.actualWidthMm, 5120);
  assert.equal(eval640.upperFitOption.actualHeightMm, 2880);
  assert.equal(eval640.exact16by9CabinetOption.cabinetCount, 64);
  assert.equal(eval640.exact16by9CabinetOption.actualWidthMm, 4800);
  assert.equal(eval640.exact16by9CabinetOption.actualHeightMm, 2700);

  // 2. Check missing input/catalog -> returns "Chưa đủ dữ liệu xác nhận" without fabricating numbers
  const evalMissing = evaluateLedTechnicalConfig({
    widthMm: null,
    heightMm: null,
    pixelPitch: null,
  });
  assert.equal(evalMissing.feasibilityStatus, 'insufficient_data');
  assert.equal(evalMissing.statusLabel, 'Chưa đủ dữ liệu xác nhận');
  assert.equal(evalMissing.cabinetCount, null);
  assert.equal(evalMissing.avgPowerWatts, null);
});

test('IX-13: Gửi trùng một yêu cầu (cùng idempotencyKey) không tạo hai job tính phí hoặc hai version trùng lặp', async () => {
  const proj = await createDesignRequestWithAiDraft(DESIGNER_ACTOR, {
    designType: 'banner',
    projectName: 'Test Idempotency Deduplication',
    bannerWidthPx: 1920,
    bannerHeightPx: 1080,
    aspectRatio: '16:9',
    aiPrompt: '[INIT_PROJECT] Idempotency',
    quality: 'draft',
  });

  try {
    const sharedKey = `idem-test-${proj.id}-${Date.now()}`;
    const firstCall = await processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
      prompt: '@taobanner Thiết kế banner sự kiện ra mắt sản phẩm mới 1920x1080',
      providerId: 'local_sandbox',
      idempotencyKey: sharedKey,
    });
    assert.equal(firstCall.versionNumber, 1);

    const secondCall = await processChatDesignRequest(DESIGNER_ACTOR, proj.id, {
      prompt: '@taobanner Thiết kế banner sự kiện ra mắt sản phẩm mới 1920x1080',
      providerId: 'local_sandbox',
      idempotencyKey: sharedKey,
    });
    assert.equal(secondCall.idempotentReplay, true);
    assert.equal(secondCall.versionId, firstCall.versionId);
    assert.equal(secondCall.versionNumber, 1);

    const detail = await getDesignProjectForUser(DESIGNER_ACTOR, proj.id);
    assert.equal(detail.project.assetVersions.length, 1, 'Chỉ được tạo đúng 1 version duy nhất khi gửi trùng idempotencyKey');
  } finally {
    await deleteDesignProject(DESIGNER_ACTOR, proj.id);
  }
});

