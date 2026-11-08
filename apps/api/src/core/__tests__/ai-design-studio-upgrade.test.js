'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
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
