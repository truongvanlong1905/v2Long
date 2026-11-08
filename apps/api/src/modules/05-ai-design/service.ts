/**
 * Module 05: Hỗ trợ Thiết kế & Phối cảnh AI (UC06) Service
 * Owner: Nhóm 5 (05-ai-design)
 */

import {
  prisma,
  ConcurrencyConflictError,
  recordAiUsageAttempt,
} from '@toantrung/database';
import {
  containsCustomerPiiInPrompt,
  toMonetaryAmountDto,
  type AddProjectPhotoDto,
  type ApproveDesignVersionDto,
  type ChatDesignRequestDto,
  type ConfigureAiProvidersDto,
  type CreateDesignRequestDto,
  type DesignAssetVersionItemDto,
  type DesignChatMessageDto,
  type DesignRequestItemDto,
  type DesignStatus,
  type DesignType,
  type LedProductSpecDto,
  type ProjectPhotoItemDto,
  type QuadCoordinatesDto,
  type RegenerateDesignDraftDto,
  type SessionUserDto,
  type UpdateDesignProjectDto,
} from '@toantrung/contracts';
import { savePrivateBusinessFile } from '../../core/storage/private-files.service';
import { notifyLeadSalesOnDesignCompleted } from '../01-leads/service';
import {
  AiDesignProviderFactory,
  type ProviderStatusInfo,
} from './providers';

// Default showroom photo for demo & reference alignment
const DEFAULT_SHOWROOM_PHOTO = '/brand/showroom-toan-trung.webp';

// Default 4-corner placement quadrilateral matching reference screenshot (right wall of showroom)
const DEFAULT_PLACEMENT_QUAD: QuadCoordinatesDto = {
  topLeft: { x: 64.2, y: 44.5 },
  topRight: { x: 93.8, y: 45.2 },
  bottomRight: { x: 94.5, y: 72.8 },
  bottomLeft: { x: 64.5, y: 70.1 },
};

function mapDbRequestTypeToDto(dbType: string): DesignType {
  return dbType === 'banner' ? 'banner' : 'perspective_3d';
}

function mapDbStatusToDto(dbStatus: string): DesignStatus {
  if (dbStatus === 'completed') return 'completed';
  if (dbStatus === 'in_review') return 'in_review';
  if (dbStatus === 'ai_drafting' || dbStatus === 'ai_drafted') return 'ai_drafted';
  return 'pending';
}

function parseDimensions(dimStr: string | null): {
  screenWidthM: number | null;
  screenHeightM: number | null;
  bannerWidthPx: number | null;
  bannerHeightPx: number | null;
} {
  if (!dimStr) {
    return {
      screenWidthM: null,
      screenHeightM: null,
      bannerWidthPx: null,
      bannerHeightPx: null,
    };
  }
  const pxMatch = dimStr.match(/(\d+)\s*x\s*(\d+)\s*px/i);
  if (pxMatch) {
    return {
      screenWidthM: null,
      screenHeightM: null,
      bannerWidthPx: Number(pxMatch[1]),
      bannerHeightPx: Number(pxMatch[2]),
    };
  }
  const mMatch = dimStr.match(/([\d.,]+)\s*m?\s*x\s*(?:Cao\s*)?([\d.,]+)\s*m/i);
  if (mMatch) {
    return {
      screenWidthM: Number(mMatch[1].replace(',', '.')),
      screenHeightM: Number(mMatch[2].replace(',', '.')),
      bannerWidthPx: null,
      bannerHeightPx: null,
    };
  }
  return {
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    bannerWidthPx: 1920,
    bannerHeightPx: 1080,
  };
}

export function computeLedProductSpec(params: {
  productCode?: string;
  productName?: string;
  categoryGroup?: string;
  widthM?: number;
  heightM?: number;
  pitch?: string;
  screenStyle?: 'flat' | 'curved' | 'corner_90';
}): LedProductSpecDto {
  const w = params.widthM && params.widthM > 0 ? params.widthM : 4.8;
  const h = params.heightM && params.heightM > 0 ? params.heightM : 2.7;
  const areaM2 = Number((w * h).toFixed(2));
  const pitch = params.pitch || 'P2.5';
  const pitchMm = Number(pitch.replace(/[^0-9.]/g, '')) || 2.5;

  const resW = Math.round((w * 1000) / pitchMm);
  const resH = Math.round((h * 1000) / pitchMm);

  // Module standard: 320 x 160 mm
  // Cabinet standard: 640 x 480 mm
  const cabinetCols = Math.max(1, Math.round((w * 1000) / 640));
  const cabinetRows = Math.max(1, Math.round((h * 1000) / 480));
  const cabinetCount = cabinetCols * cabinetRows;
  const moduleCount = cabinetCount * 6; // 6 modules per 640x480 cabinet

  return {
    productId: 1,
    productCode: params.productCode || 'LED_INDOOR',
    productName: params.productName || 'Màn hình LED Indoor',
    categoryGroup: params.categoryGroup || 'led_screen',
    screenStyle: params.screenStyle || 'flat',
    pixelPitch: pitch,
    physicalWidthM: w,
    physicalHeightM: h,
    areaM2,
    resolutionWidthPx: resW,
    resolutionHeightPx: resH,
    moduleDimensionsMm: '320 x 160 mm',
    cabinetDimensionsMm: '640 x 480 mm (Nhôm đúc định hình)',
    cabinetCount,
    moduleCount,
    controller: 'Novastar TB60 / VX600 chuyên dụng',
    receivingCard: 'Novastar MRV328',
    powerSupply: 'Meanwell / G-Energy 5V-40A công nghiệp',
    avgPowerWatts: Math.round(areaM2 * 250),
    maxPowerWatts: Math.round(areaM2 * 600),
    technicalNotes:
      'Lắp âm vách tường showroom, khung xương sắt hộp mạ kẽm 40x40cm, viền nhôm anot đen chống lóa, tiếp địa an toàn < 4Ω.',
  };
}

interface StoredMetadata {
  projectName?: string;
  contactName?: string | null;
  installationInfo?: string | null;
  productId?: number | null;
  pixelPitch?: string;
  screenStyle?: 'flat' | 'curved' | 'corner_90';
  screenWidthM?: number;
  screenHeightM?: number;
  bannerWidthPx?: number;
  bannerHeightPx?: number;
  aspectLocked?: boolean;
  isArchived?: boolean;
  photos?: ProjectPhotoItemDto[];
  placementQuad?: QuadCoordinatesDto;
  chatMessages?: DesignChatMessageDto[];
  productSpec?: LedProductSpecDto;
}

function parseProjectMetadata(jsonStr: string | null): StoredMetadata {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr) as StoredMetadata;
  } catch {
    return {};
  }
}

export async function getAiDesignStatus(): Promise<ProviderStatusInfo> {
  return AiDesignProviderFactory.getActiveProviderInfo();
}

export async function configureAiProviders(
  actor: SessionUserDto,
  input: ConfigureAiProvidersDto
): Promise<ProviderStatusInfo> {
  const updatedStatus = AiDesignProviderFactory.updateConfiguration(input);
  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: 'AI_DESIGN_PROVIDER_CONFIGURED',
      targetType: 'SystemSetting',
      targetId: input.defaultProviderId,
      detailsJson: JSON.stringify({
        defaultProviderId: input.defaultProviderId,
        defaultModelId: input.defaultModelId,
        autoFallbackToLocal: input.autoFallbackToLocal,
        configuredProvider: input.providerConfig?.providerId,
      }),
    },
  });
  return updatedStatus;
}

export async function listDesignRequestsForUser(user: SessionUserDto): Promise<{
  requests: DesignRequestItemDto[];
  leadOptions: Array<{ id: number; leadCode: string; label: string }>;
  productOptions: Array<{ id: number; code: string; name: string; categoryGroup: string }>;
  providerStatus: ProviderStatusInfo;
}> {
  const isAnonymizedLead = ['MKT_STAFF', 'MKT_LEAD', 'ADS'].includes(user.roleCode);
  const requestScopeWhere =
    user.roleCode === 'SALES'
      ? {
          OR: [
            { requestedBySalesId: user.id },
            { lead: { assignedSalesId: user.id } },
          ],
        }
      : user.roleCode === 'DESIGNER'
        ? { assignedDesignerId: user.id }
        : undefined;

  const [rows, leads, products] = await Promise.all([
    prisma.designRequest.findMany({
      where: requestScopeWhere,
      take: 100,
      include: {
        lead: true,
        requestedBySales: true,
        assignedDesigner: true,
        assetVersions: {
          include: {
            uploadedBy: true,
            aiUsageLog: true,
          },
          orderBy: { versionNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lead.findMany({
      where: {
        isSpam: false,
        ...(user.roleCode === 'SALES'
          ? { OR: [{ assignedSalesId: user.id }, { createdByUserId: user.id }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  const providerStatus = AiDesignProviderFactory.getActiveProviderInfo();

  const requests: DesignRequestItemDto[] = rows.map((r) => {
    const dims = parseDimensions(r.screenDimensions);
    const meta = parseProjectMetadata(r.installPositionJson);

    const assetVersions: DesignAssetVersionItemDto[] = r.assetVersions.map((v) => {
      let parsedVerParams: { providerId?: string; modelUsed?: string } = {};
      if (v.parametersJson) {
        try {
          parsedVerParams = JSON.parse(v.parametersJson);
        } catch {
          parsedVerParams = {};
        }
      }
      return {
        id: v.id,
        designRequestId: v.designRequestId,
        versionNumber: v.versionNumber,
        sourceType: v.versionType === 'final_render' ? 'DESIGNER_FINAL_UPLOAD' : 'AI_DRAFT',
        providerId: parsedVerParams.providerId ?? null,
        modelUsed: parsedVerParams.modelUsed ?? v.aiUsageLog?.modelName ?? null,
        storageObjectKey: v.storageObjectKey,
        downloadUrl: `/api/v1/design/asset/${v.id}`,
        mimeType: v.mimeType,
        fileSizeBytes: v.fileSizeBytes,
        widthPx: dims.bannerWidthPx ?? 1920,
        heightPx: dims.bannerHeightPx ?? 1080,
        aspectRatio: r.aspectRatio,
        promptUsed: v.promptUsed,
        processingDurationMs: v.aiUsageLog?.durationMs ?? r.processingTimeMs,
        tokenUsed: v.aiUsageLog?.totalTokens ?? r.tokenCost,
        cost:
          v.aiUsageLog?.costMicros != null
            ? toMonetaryAmountDto(v.aiUsageLog.costMicros, 'USD', 'micros')
            : null,
        isApprovedFinal: v.isApprovedFinal,
        uploadedByName: v.uploadedBy?.fullName || r.assignedDesigner?.fullName || 'Hệ thống AI',
        createdAt: v.createdAt.toISOString(),
      };
    });

    const latestAiDraft = [...assetVersions].reverse().find((v) => v.sourceType === 'AI_DRAFT');
    const latestFinal = [...assetVersions]
      .reverse()
      .find((v) => v.sourceType === 'DESIGNER_FINAL_UPLOAD' || v.isApprovedFinal);

    const currency: 'VND' | 'USD' = r.costCurrency === 'VND' ? 'VND' : 'USD';

    // Photos list: fallback to showroom default
    const photos: ProjectPhotoItemDto[] = meta.photos && meta.photos.length > 0
      ? meta.photos
      : [
          {
            id: 'photo-default-1',
            name: 'Ảnh chính diện showroom',
            url: DEFAULT_SHOWROOM_PHOTO,
            selected: true,
            uploadedAt: r.createdAt.toISOString(),
          },
          {
            id: 'photo-default-2',
            name: 'Vách tủ module LED',
            url: DEFAULT_SHOWROOM_PHOTO,
            selected: false,
            uploadedAt: r.createdAt.toISOString(),
          },
        ];

    // Initial chat messages: align with reference UI
    const chatMessages: DesignChatMessageDto[] = meta.chatMessages && meta.chatMessages.length > 0
      ? meta.chatMessages
      : [
          {
            id: `msg-user-init-${r.id}`,
            role: 'user',
            text: r.prompt || 'Đặt màn hình ở tường bên phải, hiển thị sóng biển xanh và giữ nguyên nội thất.',
            timestamp: r.createdAt.toISOString(),
          },
          {
            id: `msg-ai-init-${r.id}`,
            role: 'assistant',
            text: 'Bản nháp mới đã được thêm vào thư viện.',
            timestamp: r.createdAt.toISOString(),
            versionNumber: 1,
            status: 'success',
          },
        ];

    const effectiveWidthM = meta.screenWidthM ?? dims.screenWidthM ?? 4.8;
    const effectiveHeightM = meta.screenHeightM ?? dims.screenHeightM ?? 2.7;
    const effectiveBannerW = meta.bannerWidthPx ?? dims.bannerWidthPx ?? 1920;
    const effectiveBannerH = meta.bannerHeightPx ?? dims.bannerHeightPx ?? 1080;
    const effectivePitch = meta.pixelPitch || meta.productSpec?.pixelPitch || 'P2.5';
    const effectiveStyle = meta.screenStyle || meta.productSpec?.screenStyle || 'flat';

    const productSpec = computeLedProductSpec({
      productCode: meta.productSpec?.productCode,
      productName: r.ledCategory || 'Màn hình LED Indoor',
      categoryGroup: meta.productSpec?.categoryGroup,
      widthM: effectiveWidthM,
      heightM: effectiveHeightM,
      pitch: effectivePitch,
      screenStyle: effectiveStyle,
    });
    if (meta.productId) {
      productSpec.productId = meta.productId;
    }

    const projectName = meta.projectName || (r.lead ? r.lead.projectName || r.lead.companyName || 'Dự án LED' : (r.requestType === 'banner' ? 'Banner Quảng cáo LED' : 'Showroom LED'));
    const selectedPhoto = photos.find((p) => p.selected) || photos[0];

    return {
      id: r.id,
      version: r.version,
      projectName,
      contactName: isAnonymizedLead
        ? 'Khách hàng ẩn danh (UC01)'
        : meta.contactName ?? (r.lead?.contactName || 'Chưa cập nhật'),
      installationInfo: meta.installationInfo || 'Tường bên phải showroom, cách sàn 1.2m',
      notes: r.notes,
      leadId: r.leadId,
      leadCode: r.lead?.leadCode ?? null,
      leadProjectLabel: r.lead
        ? `${r.lead.leadCode} — ${
            isAnonymizedLead
              ? r.lead.projectName || 'Dự án LED (Ẩn danh)'
              : r.lead.companyName || r.lead.contactName || 'Dự án LED'
          }`
        : null,
      productId: meta.productId ?? 1,
      productName: r.ledCategory,
      requestedBySalesId: r.requestedBySalesId,
      requestedBySalesName: r.requestedBySales?.fullName ?? null,
      assignedDesignerId: r.assignedDesignerId ?? user.id,
      assignedDesignerName: r.assignedDesigner?.fullName ?? 'Designer Toàn Trung',
      designType: mapDbRequestTypeToDto(r.requestType),
      ledModuleSpec: r.ledCategory,
      screenWidthM: effectiveWidthM,
      screenHeightM: effectiveHeightM,
      installZoneBboxJson: r.installPositionJson,
      placementQuad: meta.placementQuad || DEFAULT_PLACEMENT_QUAD,
      bannerWidthPx: effectiveBannerW,
      bannerHeightPx: effectiveBannerH,
      aspectRatio: r.aspectRatio || '16:9',
      aspectLocked: meta.aspectLocked ?? true,
      isArchived: meta.isArchived ?? false,
      sitePhotoDownloadUrl: selectedPhoto?.url || r.sitePhotoUrl || DEFAULT_SHOWROOM_PHOTO,
      photos,
      chatMessages,
      productSpec,
      aiPrompt: r.prompt ?? '',
      aiDraftDownloadUrl: latestAiDraft?.downloadUrl ?? null,
      finalRenderDownloadUrl: latestFinal?.downloadUrl ?? null,
      approvedVersionId: r.approvedVersionId,
      processingDurationSec:
        r.processingTimeMs != null ? Number((r.processingTimeMs / 1000).toFixed(2)) : null,
      tokenCost: r.tokenCost,
      totalCost:
        r.totalCostMicros != null
          ? toMonetaryAmountDto(r.totalCostMicros, currency, 'micros')
          : null,
      status: mapDbStatusToDto(r.designStatus),
      createdAt: r.createdAt.toISOString(),
      updatedAt: (r.completedAt ?? r.createdAt).toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
      assetVersions,
    };
  });

  return {
    requests,
    leadOptions: leads.map((l) => ({
      id: l.id,
      leadCode: l.leadCode,
      label: isAnonymizedLead
        ? `${l.leadCode} · Khách hàng ẩn danh (${l.projectName || 'Dự án LED'})`
        : `${l.leadCode} · ${l.companyName || l.contactName || 'Khách hàng'} (${l.projectName || 'Dự án LED'})`,
    })),
    productOptions: products.map((p) => ({
      id: p.id,
      code: p.productCode,
      name: p.productName,
      categoryGroup: p.categoryGroup,
    })),
    providerStatus,
  };
}

export async function createDesignRequestWithAiDraft(
  actor: SessionUserDto,
  input: CreateDesignRequestDto
) {
  const piiCheck = containsCustomerPiiInPrompt(input.aiPrompt);
  if (piiCheck.hasPii) {
    throw new Error(piiCheck.reason);
  }

  const designerUser = await prisma.user.findFirst({
    where: {
      isActive: true,
      role: { roleCode: 'DESIGNER' },
    },
    orderBy: { id: 'asc' },
  });
  const assignedDesignerId = designerUser?.id ?? actor.id;

  let ledCategory = 'Banner Truyền thông LED';
  let screenDimensions = '1920x1080px';
  let aspectRatio = '16:9';
  let sitePhotoUrl: string | null = null;
  let dimensionsData: { widthM: number; heightM: number } = { widthM: 4.8, heightM: 2.7 };

  if (input.designType === 'perspective_3d') {
    const product = await prisma.product.findUnique({ where: { id: input.productId } });
    ledCategory = product ? `${product.productName} (${input.ledModuleSpec})` : input.ledModuleSpec;
    screenDimensions = `${input.screenWidthM.toFixed(2).replace('.', ',')} x ${input.screenHeightM.toFixed(2).replace('.', ',')} m`;
    aspectRatio = `${input.screenWidthM}:${input.screenHeightM}`;
    sitePhotoUrl = input.sitePhotoObjectKey || DEFAULT_SHOWROOM_PHOTO;
    dimensionsData = { widthM: input.screenWidthM, heightM: input.screenHeightM };
  } else {
    if (input.productId) {
      const product = await prisma.product.findUnique({ where: { id: input.productId } });
      if (product) {
        ledCategory = `Banner ${product.productName}`;
      }
    }
    screenDimensions = `${input.bannerWidthPx}x${input.bannerHeightPx}px`;
    aspectRatio = input.aspectRatio;
  }

  const dbRequestType: 'banner' | '3d_perspective' =
    input.designType === 'banner' ? 'banner' : '3d_perspective';

  // Call provider adapter with Multi-AI selection & auto-fallback
  const providerResult =
    input.designType === 'perspective_3d'
      ? await AiDesignProviderFactory.executePerspectiveWithFallback(
          {
            workflow: 'perspective_3d',
            prompt: input.aiPrompt,
            referenceImageUrl: sitePhotoUrl || DEFAULT_SHOWROOM_PHOTO,
            placementQuad: input.placementQuad || DEFAULT_PLACEMENT_QUAD,
            dimensions: {
              widthM: input.screenWidthM,
              heightM: input.screenHeightM,
              aspectRatio,
            },
            quality: input.quality || 'draft',
            modelId: input.modelId,
            idempotencyKey: `design-create-${Date.now()}`,
            simulateTimeout: input.simulateAiTimeout,
          },
          input.providerId
        )
      : await AiDesignProviderFactory.executeBannerWithFallback(
          {
            workflow: 'banner',
            prompt: input.aiPrompt,
            dimensions: {
              widthPx: input.bannerWidthPx,
              heightPx: input.bannerHeightPx,
              aspectRatio,
            },
            quality: input.quality || 'draft',
            modelId: input.modelId,
            idempotencyKey: `design-create-banner-${Date.now()}`,
            simulateTimeout: input.simulateAiTimeout,
          },
          input.providerId
        );

  if (providerResult.status === 'timeout' || input.simulateAiTimeout) {
    const pendingReq = await prisma.designRequest.create({
      data: {
        leadId: input.leadId ?? null,
        requestedBySalesId:
          actor.roleCode === 'SALES' || actor.roleCode === 'SALES_LEAD' ? actor.id : null,
        assignedDesignerId,
        requestType: dbRequestType,
        ledCategory,
        screenDimensions,
        aspectRatio,
        installPositionJson: JSON.stringify({
          projectName: input.projectName || 'Dự án LED',
          contactName: input.contactName || null,
          installationInfo: input.installationInfo || null,
          placementQuad: input.placementQuad || DEFAULT_PLACEMENT_QUAD,
          chatMessages: [
            {
              id: `msg-user-${Date.now()}`,
              role: 'user',
              text: input.aiPrompt,
              timestamp: new Date().toISOString(),
            },
            {
              id: `msg-ai-${Date.now()}`,
              role: 'assistant',
              text: 'Hệ thống AI quá thời gian phản hồi (UC06 E1). Yêu cầu đã được lưu lại để Designer thử lại.',
              timestamp: new Date().toISOString(),
              status: 'timeout',
            },
          ],
        }),
        sitePhotoUrl,
        prompt: input.aiPrompt,
        designStatus: 'pending',
        notes:
          'AI quá thời gian phản hồi (UC06 E1). Đã lưu thông số để Designer thử lại hoặc tải file thủ công.',
      },
    });

    await recordAiUsageAttempt(prisma, {
      idempotencyKey: `design-ai-timeout-${pendingReq.id}-${Date.now()}`,
      attemptNumber: 1,
      moduleCode: '05-ai-design',
      taskType: dbRequestType,
      userId: actor.id,
      designRequestId: pendingReq.id,
      modelName: providerResult.modelUsed || 'imagen-3.0-generate-002',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costMicros: null,
      durationMs: providerResult.durationMs,
      status: 'timeout',
      errorMessage: 'Hệ thống AI dựng ảnh quá thời gian phản hồi 60s (Simulated UC06 E1).',
    });

    return {
      id: pendingReq.id,
      status: 'pending',
      warning:
        'Kết nối AI quá thời gian phản hồi (UC06 E1). Hệ thống đã bảo toàn thông số yêu cầu để bạn thử lại.',
    };
  }

  // Save generated asset to private storage
  const savedFile = savePrivateBusinessFile({
    bucket: 'design',
    prefix: `ai-draft-${dbRequestType}-v1`,
    fileBuffer: providerResult.imageBuffer,
    declaredMimeType: providerResult.mimeType || 'image/png',
  });

  const productSpec = computeLedProductSpec({
    productName: ledCategory,
    widthM: dimensionsData.widthM,
    heightM: dimensionsData.heightM,
    pitch: 'P2.5',
  });

  // Gather any permitted site_photo attachments from the linked Lead
  const rawPhotoKey = 'sitePhotoObjectKey' in input ? input.sitePhotoObjectKey : undefined;
  const leadPhotos: ProjectPhotoItemDto[] = [];
  let leadContactFallback: string | null = null;
  if (input.leadId) {
    const linkedLead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      include: {
        attachments: {
          where: { attachmentType: { not: 'quote_doc' } },
          orderBy: { uploadedAt: 'desc' },
          take: 10,
        },
      },
    });
    if (linkedLead) {
      leadContactFallback = linkedLead.contactName || linkedLead.companyName || null;
      for (const att of linkedLead.attachments) {
        const isImg =
          att.attachmentType === 'site_photo' ||
          /\.(png|jpe?g|webp)$/i.test(att.fileName || '') ||
          /\.(png|jpe?g|webp)$/i.test(att.fileUrl || '');
        if (isImg) {
          leadPhotos.push({
            id: `lead-att-${att.id}`,
            name: att.fileName || `Ảnh khảo sát Lead #${att.id}`,
            url: `/api/v1/leads/attachments/${att.id}`,
            storageObjectKey: att.fileUrl,
            selected: leadPhotos.length === 0 && !rawPhotoKey,
            uploadedAt: att.uploadedAt.toISOString(),
            sourceLeadAttachmentId: att.id,
          });
        }
      }
    }
  }

  const defaultPhotos: ProjectPhotoItemDto[] = [
    ...(rawPhotoKey
      ? [
          {
            id: `photo-input-${Date.now()}`,
            name: 'Ảnh hiện trạng tải lên',
            url: rawPhotoKey.startsWith('/') || rawPhotoKey.startsWith('http')
              ? rawPhotoKey
              : `/api/v1/design/asset-file?key=${encodeURIComponent(rawPhotoKey)}`,
            storageObjectKey: rawPhotoKey,
            selected: true,
            uploadedAt: new Date().toISOString(),
          },
        ]
      : []),
    ...leadPhotos,
    {
      id: `photo-1-${Date.now()}`,
      name: 'Ảnh chính diện showroom',
      url: DEFAULT_SHOWROOM_PHOTO,
      selected: !rawPhotoKey && leadPhotos.length === 0,
      uploadedAt: new Date().toISOString(),
    },
    {
      id: `photo-2-${Date.now()}`,
      name: 'Vách tủ module LED',
      url: DEFAULT_SHOWROOM_PHOTO,
      selected: false,
      uploadedAt: new Date().toISOString(),
    },
  ];

  const initialMetadata: StoredMetadata = {
    projectName: input.projectName || (input.designType === 'banner' ? 'Banner Quảng cáo LED' : 'Showroom LED'),
    contactName: input.contactName || leadContactFallback,
    installationInfo: input.installationInfo || 'Tường bên phải showroom, cách sàn 1.2m',
    productId: input.productId ?? 1,
    pixelPitch: 'P2.5',
    screenStyle: 'flat',
    screenWidthM: dimensionsData.widthM,
    screenHeightM: dimensionsData.heightM,
    bannerWidthPx: input.designType === 'banner' ? input.bannerWidthPx : productSpec.resolutionWidthPx,
    bannerHeightPx: input.designType === 'banner' ? input.bannerHeightPx : productSpec.resolutionHeightPx,
    aspectLocked: true,
    isArchived: false,
    photos: defaultPhotos,
    placementQuad: input.placementQuad || DEFAULT_PLACEMENT_QUAD,
    chatMessages: [
      {
        id: `msg-user-1-${Date.now()}`,
        role: 'user',
        text: input.aiPrompt,
        timestamp: new Date().toISOString(),
      },
      {
        id: `msg-ai-1-${Date.now()}`,
        role: 'assistant',
        text: `Bản nháp mới (v1 · ${providerResult.modelUsed}) đã được thêm vào thư viện.`,
        timestamp: new Date().toISOString(),
        versionNumber: 1,
        providerId: providerResult.provider,
        modelUsed: providerResult.modelUsed,
        durationSec: Number((providerResult.durationMs / 1000).toFixed(2)),
        tokenUsed: providerResult.totalTokens,
        cost: `$${(Number(providerResult.costMicros) / 1_000_000).toFixed(3)}`,
        status: 'success',
      },
    ],
    productSpec,
  };

  const createdRequest = await prisma.designRequest.create({
    data: {
      leadId: input.leadId ?? null,
      requestedBySalesId:
        actor.roleCode === 'SALES' || actor.roleCode === 'SALES_LEAD' ? actor.id : null,
      assignedDesignerId,
      requestType: dbRequestType,
      ledCategory,
      screenDimensions,
      aspectRatio,
      installPositionJson: JSON.stringify(initialMetadata),
      sitePhotoUrl,
      prompt: input.aiPrompt,
      designStatus: 'ai_drafting',
      aiDraftImageUrl: savedFile.storageObjectKey,
      processingTimeMs: providerResult.durationMs,
      tokenCost: providerResult.totalTokens,
      totalCostMicros: providerResult.costMicros,
      costCurrency: providerResult.costCurrency,
      notes:
        input.leadId == null
          ? 'Ấn phẩm tạo độc lập không gắn Lead (UC06 Luồng phụ 2a).'
          : 'Đã khởi tạo bản nháp AI v1.',
    },
  });

  const aiLog = await recordAiUsageAttempt(prisma, {
    idempotencyKey: `design-ai-create-${createdRequest.id}-v1-${Date.now()}`,
    attemptNumber: 1,
    providerRequestId: `${providerResult.provider}-${createdRequest.id}-v1`,
    moduleCode: '05-ai-design',
    taskType: dbRequestType,
    userId: actor.id,
    designRequestId: createdRequest.id,
    modelName: providerResult.modelUsed,
    promptTokens: providerResult.promptTokens,
    completionTokens: providerResult.completionTokens,
    totalTokens: providerResult.totalTokens,
    costMicros: providerResult.costMicros,
    costCurrency: providerResult.costCurrency,
    durationMs: providerResult.durationMs,
    status: providerResult.status,
  });

  const v1 = await prisma.designAssetVersion.create({
    data: {
      designRequestId: createdRequest.id,
      versionNumber: 1,
      versionType: 'ai_draft',
      storageObjectKey: savedFile.storageObjectKey,
      mimeType: savedFile.mimeType,
      fileSizeBytes: savedFile.fileSizeBytes,
      promptUsed: input.aiPrompt,
      parametersJson: JSON.stringify({
        designType: input.designType,
        screenDimensions,
        aspectRatio,
        quality: input.quality || 'draft',
        providerId: providerResult.provider,
        modelUsed: providerResult.modelUsed,
      }),
      aiUsageLogId: aiLog.log.id,
      uploadedByUserId: actor.id,
      isApprovedFinal: false,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: 'DESIGN_REQUEST_CREATED',
      targetType: 'DesignRequest',
      targetId: String(createdRequest.id),
      detailsJson: JSON.stringify({
        requestType: dbRequestType,
        leadId: createdRequest.leadId,
        versionId: v1.id,
        durationMs: providerResult.durationMs,
      }),
    },
  });

  return {
    id: createdRequest.id,
    status: 'ai_drafted',
    versionId: v1.id,
  };
}

export async function processChatDesignRequest(
  actor: SessionUserDto,
  requestId: number,
  input: ChatDesignRequestDto
) {
  const piiCheck = containsCustomerPiiInPrompt(input.prompt);
  if (piiCheck.hasPii) {
    throw new Error(piiCheck.reason);
  }

  const existing = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: {
      assetVersions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (!existing) {
    throw new Error('Không tìm thấy yêu cầu thiết kế.');
  }

  if (existing.version !== input.expectedVersion) {
    throw new ConcurrencyConflictError('DesignRequest', requestId, input.expectedVersion);
  }

  const nextVersionNumber = (existing.assetVersions[0]?.versionNumber ?? 0) + 1;
  const currentMeta = parseProjectMetadata(existing.installPositionJson);

  const dbType: 'banner' | '3d_perspective' =
    existing.requestType === 'banner' ? 'banner' : '3d_perspective';

  const providerResult =
    dbType === '3d_perspective'
      ? await AiDesignProviderFactory.executePerspectiveWithFallback(
          {
            workflow: 'perspective_3d',
            prompt: input.prompt,
            referenceImageUrl: input.selectedPhotoUrl || existing.sitePhotoUrl || DEFAULT_SHOWROOM_PHOTO,
            placementQuad: input.placementQuad || currentMeta.placementQuad || DEFAULT_PLACEMENT_QUAD,
            dimensions: {
              widthM: input.screenWidthM || 4.8,
              heightM: input.screenHeightM || 2.7,
              aspectRatio: input.aspectRatio || existing.aspectRatio || '16:9',
            },
            quality: input.quality || 'draft',
            modelId: input.modelId,
            idempotencyKey: input.idempotencyKey || `chat-design-${requestId}-v${nextVersionNumber}-${Date.now()}`,
            simulateTimeout: input.simulateAiTimeout,
          },
          input.providerId
        )
      : await AiDesignProviderFactory.executeBannerWithFallback(
          {
            workflow: 'banner',
            prompt: input.prompt,
            dimensions: {
              widthPx: input.bannerWidthPx || 1920,
              heightPx: input.bannerHeightPx || 1080,
              aspectRatio: input.aspectRatio || existing.aspectRatio || '16:9',
            },
            quality: input.quality || 'draft',
            modelId: input.modelId,
            idempotencyKey: input.idempotencyKey || `chat-banner-${requestId}-v${nextVersionNumber}-${Date.now()}`,
            simulateTimeout: input.simulateAiTimeout,
          },
          input.providerId
        );

  if (providerResult.status === 'timeout' || input.simulateAiTimeout) {
    await recordAiUsageAttempt(prisma, {
      idempotencyKey: `chat-design-timeout-${requestId}-v${nextVersionNumber}-${Date.now()}`,
      attemptNumber: nextVersionNumber,
      moduleCode: '05-ai-design',
      taskType: dbType,
      userId: actor.id,
      designRequestId: requestId,
      modelName: providerResult.modelUsed || 'imagen-3.0-generate-002',
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costMicros: null,
      durationMs: providerResult.durationMs,
      status: 'timeout',
      errorMessage: 'Hệ thống AI dựng ảnh quá thời gian phản hồi (UC06 E1).',
    });
    throw new Error('Kết nối hệ thống AI quá thời gian phản hồi (UC06 E1). Phiên bản hiện tại vẫn được bảo toàn an toàn.');
  }

  const savedFile = savePrivateBusinessFile({
    bucket: 'design',
    prefix: `ai-draft-req-${requestId}-v${nextVersionNumber}`,
    fileBuffer: providerResult.imageBuffer,
    declaredMimeType: providerResult.mimeType || 'image/png',
  });

  const aiLog = await recordAiUsageAttempt(prisma, {
    idempotencyKey: `chat-design-run-${requestId}-v${nextVersionNumber}-${Date.now()}`,
    attemptNumber: nextVersionNumber,
    providerRequestId: `${providerResult.provider}-${requestId}-v${nextVersionNumber}`,
    moduleCode: '05-ai-design',
    taskType: dbType,
    userId: actor.id,
    designRequestId: requestId,
    modelName: providerResult.modelUsed,
    promptTokens: providerResult.promptTokens,
    completionTokens: providerResult.completionTokens,
    totalTokens: providerResult.totalTokens,
    costMicros: providerResult.costMicros,
    costCurrency: providerResult.costCurrency,
    durationMs: providerResult.durationMs,
    status: 'success',
  });

  const createdVersion = await prisma.designAssetVersion.create({
    data: {
      designRequestId: requestId,
      versionNumber: nextVersionNumber,
      versionType: 'ai_draft',
      storageObjectKey: savedFile.storageObjectKey,
      mimeType: savedFile.mimeType,
      fileSizeBytes: savedFile.fileSizeBytes,
      promptUsed: input.prompt,
      parametersJson: JSON.stringify({
        regeneratedFromVersion: existing.version,
        placementQuad: input.placementQuad || currentMeta.placementQuad,
        quality: input.quality,
        providerId: providerResult.provider,
        modelUsed: providerResult.modelUsed,
      }),
      aiUsageLogId: aiLog.log.id,
      uploadedByUserId: actor.id,
      isApprovedFinal: false,
    },
  });

  // Append to chat messages
  const existingChat = currentMeta.chatMessages || [];
  const updatedChat: DesignChatMessageDto[] = [
    ...existingChat,
    {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      text: input.prompt,
      timestamp: new Date().toISOString(),
    },
    {
      id: `msg-ai-${Date.now()}`,
      role: 'assistant',
      text: `Bản nháp mới (v${nextVersionNumber} · ${providerResult.modelUsed}) đã được thêm vào thư viện.`,
      timestamp: new Date().toISOString(),
      versionNumber: nextVersionNumber,
      versionId: createdVersion.id,
      providerId: providerResult.provider,
      modelUsed: providerResult.modelUsed,
      durationSec: Number((providerResult.durationMs / 1000).toFixed(2)),
      tokenUsed: providerResult.totalTokens,
      cost: `$${(Number(providerResult.costMicros) / 1_000_000).toFixed(3)}`,
      status: 'success',
    },
  ];

  const updatedMetadata: StoredMetadata = {
    ...currentMeta,
    placementQuad: input.placementQuad || currentMeta.placementQuad,
    chatMessages: updatedChat,
  };

  const newTotalTokens = (existing.tokenCost ?? 0) + providerResult.totalTokens;
  const newTotalCostMicros = (existing.totalCostMicros ?? 0n) + providerResult.costMicros;

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      prompt: input.prompt,
      aiDraftImageUrl: savedFile.storageObjectKey,
      installPositionJson: JSON.stringify(updatedMetadata),
      designStatus: 'ai_drafting',
      processingTimeMs: (existing.processingTimeMs ?? 0) + providerResult.durationMs,
      tokenCost: newTotalTokens,
      totalCostMicros: newTotalCostMicros,
      version: { increment: 1 },
    },
  });

  return {
    requestId,
    versionNumber: createdVersion.versionNumber,
    versionId: createdVersion.id,
    downloadUrl: `/api/v1/design/asset/${createdVersion.id}`,
    chatMessages: updatedChat,
  };
}

export async function updateDesignProject(
  actor: SessionUserDto,
  requestId: number,
  input: UpdateDesignProjectDto
) {
  const existing = await prisma.designRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new Error('Không tìm thấy dự án thiết kế.');
  if (input.expectedVersion !== undefined && existing.version !== input.expectedVersion) {
    throw new ConcurrencyConflictError('DesignRequest', requestId, input.expectedVersion);
  }

  const dims = parseDimensions(existing.screenDimensions);
  const meta = parseProjectMetadata(existing.installPositionJson);

  if (input.projectName) meta.projectName = input.projectName;
  if (input.contactName !== undefined) meta.contactName = input.contactName;
  if (input.installationInfo !== undefined) meta.installationInfo = input.installationInfo;
  if (input.productId !== undefined) meta.productId = input.productId;
  if (input.pixelPitch !== undefined && input.pixelPitch !== null) meta.pixelPitch = input.pixelPitch;
  if (input.screenStyle !== undefined) meta.screenStyle = input.screenStyle;
  if (input.screenWidthM !== undefined && input.screenWidthM !== null) meta.screenWidthM = input.screenWidthM;
  if (input.screenHeightM !== undefined && input.screenHeightM !== null) meta.screenHeightM = input.screenHeightM;
  if (input.bannerWidthPx !== undefined && input.bannerWidthPx !== null) meta.bannerWidthPx = input.bannerWidthPx;
  if (input.bannerHeightPx !== undefined && input.bannerHeightPx !== null) meta.bannerHeightPx = input.bannerHeightPx;
  if (input.aspectLocked !== undefined) meta.aspectLocked = input.aspectLocked;
  if (input.isArchived !== undefined) meta.isArchived = input.isArchived;
  if (input.placementQuad) meta.placementQuad = input.placementQuad;

  let nextSitePhotoUrl = existing.sitePhotoUrl;
  const photos = meta.photos && meta.photos.length > 0 ? [...meta.photos] : [];

  if (input.selectedPhotoId && photos.length > 0) {
    for (const p of photos) {
      p.selected = p.id === input.selectedPhotoId;
      if (p.selected) {
        nextSitePhotoUrl = p.url;
      }
    }
    meta.photos = photos;
  }

  if (input.renamePhotoId && input.renamePhotoName && photos.length > 0) {
    for (const p of photos) {
      if (p.id === input.renamePhotoId) {
        p.name = input.renamePhotoName;
      }
    }
    meta.photos = photos;
  }

  // Import Lead attachments into Ảnh kỹ thuật when requested
  const targetLeadId = input.leadId !== undefined ? input.leadId : existing.leadId;
  if (input.importLeadAttachments && targetLeadId) {
    const linkedLead = await prisma.lead.findUnique({
      where: { id: targetLeadId },
      include: {
        attachments: {
          where: { attachmentType: { not: 'quote_doc' } },
          orderBy: { uploadedAt: 'desc' },
          take: 15,
        },
      },
    });
    if (linkedLead) {
      for (const att of linkedLead.attachments) {
        const alreadyExists = photos.some((p) => p.sourceLeadAttachmentId === att.id || p.id === `lead-att-${att.id}`);
        if (!alreadyExists) {
          photos.push({
            id: `lead-att-${att.id}`,
            name: att.fileName || `Ảnh khảo sát Lead #${att.id}`,
            url: `/api/v1/leads/attachments/${att.id}`,
            storageObjectKey: att.fileUrl,
            selected: photos.length === 0,
            uploadedAt: att.uploadedAt.toISOString(),
            sourceLeadAttachmentId: att.id,
          });
        }
      }
      meta.photos = photos;
    }
  }

  if (input.renameVersionId && input.renameVersionLabel) {
    await prisma.designAssetVersion.updateMany({
      where: { id: input.renameVersionId, designRequestId: requestId },
      data: { promptUsed: input.renameVersionLabel },
    });
  }

  let nextLedCategory = input.ledModuleSpec || existing.ledCategory;
  let productObj: { id: number; productCode: string; productName: string; categoryGroup: string } | null = null;
  if (meta.productId) {
    productObj = await prisma.product.findUnique({ where: { id: meta.productId } });
    if (productObj && !input.ledModuleSpec) {
      const pitchTag = meta.pixelPitch || meta.productSpec?.pixelPitch || 'P2.5';
      nextLedCategory = `${productObj.productName} (${pitchTag})`;
    }
  }

  const nextDesignType = input.designType
    ? input.designType === 'banner'
      ? 'banner'
      : '3d_perspective'
    : existing.requestType;

  const wM = meta.screenWidthM ?? dims.screenWidthM ?? 4.8;
  const hM = meta.screenHeightM ?? dims.screenHeightM ?? 2.7;
  const bW = meta.bannerWidthPx ?? dims.bannerWidthPx ?? 1920;
  const bH = meta.bannerHeightPx ?? dims.bannerHeightPx ?? 1080;

  meta.productSpec = computeLedProductSpec({
    productCode: productObj?.productCode || meta.productSpec?.productCode,
    productName: productObj?.productName || nextLedCategory || 'Màn hình LED Indoor',
    categoryGroup: productObj?.categoryGroup || meta.productSpec?.categoryGroup,
    widthM: wM,
    heightM: hM,
    pitch: meta.pixelPitch || meta.productSpec?.pixelPitch || 'P2.5',
    screenStyle: meta.screenStyle || meta.productSpec?.screenStyle || 'flat',
  });
  if (meta.productId) {
    meta.productSpec.productId = meta.productId;
  }

  const nextScreenDimensions =
    nextDesignType === 'banner'
      ? `${bW}x${bH}px`
      : `${wM.toFixed(2).replace('.', ',')} x ${hM.toFixed(2).replace('.', ',')} m`;

  const nextAspectRatio = input.aspectRatio || existing.aspectRatio || '16:9';

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      requestType: nextDesignType,
      ledCategory: nextLedCategory,
      screenDimensions: nextScreenDimensions,
      aspectRatio: nextAspectRatio,
      sitePhotoUrl: nextSitePhotoUrl,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      leadId: targetLeadId,
      installPositionJson: JSON.stringify(meta),
      version: { increment: 1 },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.id,
      action: 'DESIGN_PROJECT_PARAMETERS_UPDATED',
      targetType: 'DesignRequest',
      targetId: String(requestId),
      detailsJson: JSON.stringify({
        projectName: meta.projectName,
        designType: nextDesignType,
        screenDimensions: nextScreenDimensions,
        aspectRatio: nextAspectRatio,
        leadId: targetLeadId,
      }),
    },
  });

  return { id: requestId, ok: true };
}

export async function addProjectPhoto(
  actor: SessionUserDto,
  requestId: number,
  input: AddProjectPhotoDto
) {
  const existing = await prisma.designRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new Error('Không tìm thấy dự án thiết kế.');

  const buffer = Buffer.from(input.base64Data, 'base64');
  const saved = savePrivateBusinessFile({
    bucket: 'design',
    prefix: `site-photo-req-${requestId}`,
    fileBuffer: buffer,
    declaredMimeType: input.mimeType || 'image/jpeg',
    originalFileName: input.fileName,
  });

  const meta = parseProjectMetadata(existing.installPositionJson);
  const photos = meta.photos || [];

  const newPhoto: ProjectPhotoItemDto = {
    id: `photo-${Date.now()}-${photos.length + 1}`,
    name: input.photoName || input.fileName,
    url: `/api/v1/design/asset-file?key=${encodeURIComponent(saved.storageObjectKey)}`,
    storageObjectKey: saved.storageObjectKey,
    selected: true,
    uploadedAt: new Date().toISOString(),
  };

  // Set this newly added photo as selected, deselecting others
  photos.forEach((p) => {
    p.selected = false;
  });
  photos.push(newPhoto);
  meta.photos = photos;

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      sitePhotoUrl: saved.storageObjectKey,
      installPositionJson: JSON.stringify(meta),
      version: { increment: 1 },
    },
  });

  return newPhoto;
}

export async function deleteProjectPhoto(
  actor: SessionUserDto,
  requestId: number,
  photoId: string
) {
  const existing = await prisma.designRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new Error('Không tìm thấy dự án thiết kế.');

  const meta = parseProjectMetadata(existing.installPositionJson);
  const photos = meta.photos || [];

  const target = photos.find((p) => p.id === photoId);
  if (!target) throw new Error('Không tìm thấy ảnh cần xóa.');

  // Check if this photo's storage key is referenced by an approved final version
  if (target.storageObjectKey && existing.finalRenderUrl === target.storageObjectKey) {
    throw new Error('Không thể xóa ảnh đang được phiên bản hoàn thiện chính thức tham chiếu.');
  }

  const updatedPhotos = photos.filter((p) => p.id !== photoId);
  if (updatedPhotos.length > 0 && target.selected) {
    updatedPhotos[0].selected = true;
  }
  meta.photos = updatedPhotos;

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      installPositionJson: JSON.stringify(meta),
      version: { increment: 1 },
    },
  });

  return { ok: true, remainingCount: updatedPhotos.length };
}

export async function deleteDesignProject(
  actor: SessionUserDto,
  requestId: number,
) {
  const existing = await prisma.designRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new Error('Không tìm thấy dự án thiết kế cần xóa.');

  await prisma.$transaction([
    prisma.designAssetVersion.deleteMany({ where: { designRequestId: requestId } }),
    prisma.designRequest.delete({ where: { id: requestId } }),
    prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'DESIGN_PROJECT_DELETED',
        targetType: 'DesignRequest',
        targetId: String(requestId),
        detailsJson: JSON.stringify({ deletedRequestId: requestId }),
      },
    }),
  ]);

  return { ok: true, deletedId: requestId };
}


export async function approveDesignAssetVersion(
  actor: SessionUserDto,
  requestId: number,
  input: ApproveDesignVersionDto
) {
  const existing = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: { assetVersions: true },
  });

  if (!existing) throw new Error('Không tìm thấy yêu cầu thiết kế.');
  if (existing.version !== input.expectedVersion) {
    throw new ConcurrencyConflictError('DesignRequest', requestId, input.expectedVersion);
  }

  const targetVer = existing.assetVersions.find((v) => v.id === input.versionId);
  if (!targetVer) {
    throw new Error('Phiên bản thiết kế cần phê duyệt không thuộc yêu cầu này.');
  }

  await prisma.$transaction([
    prisma.designAssetVersion.updateMany({
      where: { designRequestId: requestId },
      data: { isApprovedFinal: false },
    }),
    prisma.designAssetVersion.update({
      where: { id: targetVer.id },
      data: { isApprovedFinal: true },
    }),
    prisma.designRequest.update({
      where: { id: requestId },
      data: {
        approvedVersionId: targetVer.id,
        finalRenderUrl: targetVer.storageObjectKey,
        designStatus: 'completed',
        completedAt: new Date(),
        version: { increment: 1 },
      },
    }),
    prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'DESIGN_VERSION_APPROVED',
        targetType: 'DesignRequest',
        targetId: String(requestId),
        detailsJson: JSON.stringify({
          approvedVersionId: targetVer.id,
          versionNumber: targetVer.versionNumber,
          note: input.note,
        }),
      },
    }),
  ]);

  if (existing.leadId) {
    await notifyLeadSalesOnDesignCompleted({
      leadId: existing.leadId,
      designRequestId: requestId,
      versionNumber: targetVer.versionNumber,
      actor,
      note: input.note || undefined,
      storageObjectKey: targetVer.storageObjectKey,
      fileSizeBytes: targetVer.fileSizeBytes,
    });
  }

  return {
    requestId,
    approvedVersionId: targetVer.id,
    status: 'completed',
  };
}

export async function regenerateDesignDraftByAi(
  actor: SessionUserDto,
  requestId: number,
  input: RegenerateDesignDraftDto
) {
  return processChatDesignRequest(actor, requestId, {
    expectedVersion: input.expectedVersion,
    prompt: input.aiPrompt,
    quality: input.quality || 'draft',
    providerId: input.providerId,
    modelId: input.modelId,
    screenWidthM: input.screenWidthM,
    screenHeightM: input.screenHeightM,
    bannerWidthPx: input.bannerWidthPx,
    bannerHeightPx: input.bannerHeightPx,
    aspectRatio: input.aspectRatio,
    simulateAiTimeout: input.simulateAiTimeout,
  });
}

export async function saveCompositedDraftVersion(
  actor: SessionUserDto,
  requestId: number,
  params: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    note?: string;
    placementQuad?: QuadCoordinatesDto;
  }
) {
  const existing = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: {
      assetVersions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (!existing) {
    throw new Error('Không tìm thấy yêu cầu thiết kế.');
  }

  const savedFile = savePrivateBusinessFile({
    bucket: 'design',
    prefix: `studio-composite-req-${requestId}`,
    fileBuffer: params.buffer,
    declaredMimeType: params.mimeType || 'image/png',
    originalFileName: params.fileName,
  });

  const nextVersionNumber = (existing.assetVersions[0]?.versionNumber ?? 0) + 1;
  const currentMeta = parseProjectMetadata(existing.installPositionJson);

  const createdVersion = await prisma.designAssetVersion.create({
    data: {
      designRequestId: requestId,
      versionNumber: nextVersionNumber,
      versionType: 'ai_draft',
      storageObjectKey: savedFile.storageObjectKey,
      mimeType: savedFile.mimeType,
      fileSizeBytes: savedFile.fileSizeBytes,
      promptUsed: params.note || `Bản ghép phối cảnh 3D trực tiếp trên ảnh hiện trạng (v${nextVersionNumber})`,
      parametersJson: JSON.stringify({
        studioComposite: true,
        providerId: 'local_sandbox',
        modelUsed: 'Toàn Trung Live 3D Compositor',
        placementQuad: params.placementQuad || currentMeta.placementQuad,
      }),
      uploadedByUserId: actor.id,
      isApprovedFinal: false,
    },
  });

  const existingChat = currentMeta.chatMessages || [];
  const updatedChat: DesignChatMessageDto[] = [
    ...existingChat,
    {
      id: `msg-composite-${Date.now()}`,
      role: 'assistant',
      text: `Đã kết xuất & lưu bản ghép phối cảnh 3D thực tế (v${nextVersionNumber} · Toàn Trung Live 3D Compositor) vào thư viện Bản thiết kế.`,
      timestamp: new Date().toISOString(),
      versionNumber: nextVersionNumber,
      versionId: createdVersion.id,
      providerId: 'local_sandbox',
      modelUsed: 'Toàn Trung Live 3D Compositor',
      durationSec: 0.4,
      cost: '$0.000',
      status: 'success',
    },
  ];

  const updatedMetadata: StoredMetadata = {
    ...currentMeta,
    placementQuad: params.placementQuad || currentMeta.placementQuad,
    chatMessages: updatedChat,
  };

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      aiDraftImageUrl: savedFile.storageObjectKey,
      installPositionJson: JSON.stringify(updatedMetadata),
      designStatus: 'ai_drafting',
      version: { increment: 1 },
    },
  });

  return {
    requestId,
    versionId: createdVersion.id,
    versionNumber: createdVersion.versionNumber,
  };
}

export async function uploadDesignerFinalRender(
  actor: SessionUserDto,
  requestId: number,
  params: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    note?: string;
  }
) {
  const existing = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: {
      assetVersions: {
        orderBy: { versionNumber: 'desc' },
        take: 1,
      },
    },
  });

  if (!existing) {
    throw new Error('Không tìm thấy yêu cầu thiết kế.');
  }

  const savedFile = savePrivateBusinessFile({
    bucket: 'design',
    prefix: `final-render-req-${requestId}`,
    fileBuffer: params.buffer,
    declaredMimeType: params.mimeType,
    originalFileName: params.fileName,
    allowPdfOrDoc: true,
  });

  const nextVersionNumber = (existing.assetVersions[0]?.versionNumber ?? 0) + 1;

  const finalVer = await prisma.designAssetVersion.create({
    data: {
      designRequestId: requestId,
      versionNumber: nextVersionNumber,
      versionType: 'final_render',
      storageObjectKey: savedFile.storageObjectKey,
      mimeType: savedFile.mimeType,
      fileSizeBytes: savedFile.fileSizeBytes,
      promptUsed: params.note || 'Bản thiết kế hoàn thiện tải lên bởi Designer (Photoshop/3DsMax)',
      parametersJson: JSON.stringify({ manualDesignerUpload: true }),
      uploadedByUserId: actor.id,
      isApprovedFinal: true,
    },
  });

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      finalRenderUrl: savedFile.storageObjectKey,
      approvedVersionId: finalVer.id,
      designStatus: 'completed',
      completedAt: new Date(),
      notes: params.note || existing.notes,
      version: { increment: 1 },
    },
  });

  if (existing.leadId) {
    await notifyLeadSalesOnDesignCompleted({
      leadId: existing.leadId,
      designRequestId: requestId,
      versionNumber: finalVer.versionNumber,
      actor,
      note: params.note,
      storageObjectKey: savedFile.storageObjectKey,
      fileSizeBytes: savedFile.fileSizeBytes,
    });
  }

  return {
    requestId,
    versionId: finalVer.id,
    versionNumber: finalVer.versionNumber,
  };
}
