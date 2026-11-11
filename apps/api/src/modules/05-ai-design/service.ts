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
import {
  readPrivateBusinessFile,
  savePrivateBusinessFile,
} from '../../core/storage/private-files.service';
import { notifyLeadSalesOnDesignCompleted } from '../01-leads/service';
import {
  AiDesignProviderFactory,
  type ProviderStatusInfo,
} from './providers';
import {
  routeDesignCommand,
  validateCommandReadiness,
} from './command-router';
import {
  createInitialDesignContext,
  extractAndMergeUserChatContext,
  summarizeDesignContextForAssistant,
  type CompositingProtectionMode,
  type ProjectDesignContext,
} from './design-context';
import {
  buildVerifiedLedProductSpecDto,
  evaluateLedTechnicalConfig,
} from './led-technical.engine';
import {
  processBannerToTargetResolution,
  renderPerspectiveCompositeWithProtection,
  validateGeneratedImageBuffer,
} from './perspective-compositor';

// Default fallback image only when required by internal provider execution
const DEFAULT_SHOWROOM_PHOTO = '/brand/toantrung-led-wall.png';

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
  productId?: number;
  productCode?: string;
  productName?: string;
  categoryGroup?: string;
  widthM?: number;
  heightM?: number;
  pitch?: string;
  screenStyle?: 'flat' | 'curved' | 'corner_90';
  cabinetModelCode?: string | null;
}): LedProductSpecDto {
  return buildVerifiedLedProductSpecDto(params);
}

interface StoredMetadata {
  projectName?: string;
  contactName?: string | null;
  installationInfo?: string | null;
  productId?: number | null;
  pixelPitch?: string;
  cabinetModelCode?: string | null;
  compositingMode?: CompositingProtectionMode;
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
  designContext?: ProjectDesignContext;
  processedIdempotencyKeys?: Record<
    string,
    { versionId: number; versionNumber: number; timestamp: string }
  >;
}

function parseProjectMetadata(jsonStr: string | null): StoredMetadata {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr) as StoredMetadata;
  } catch {
    return {};
  }
}

export class ForbiddenDesignProjectAccessError extends Error {
  public readonly code = 'FORBIDDEN_PROJECT_ACCESS';
  constructor(message = 'Tài khoản của bạn không có quyền truy cập dự án thiết kế này.') {
    super(message);
    this.name = 'ForbiddenDesignProjectAccessError';
  }
}

export function canUserAccessDesignProject(
  user: SessionUserDto,
  project: {
    id: number;
    requestedBySalesId: number | null;
    assignedDesignerId: number;
    lead?: { assignedSalesId?: number | null; createdByUserId?: number | null } | null;
  }
): boolean {
  if (['ADMIN', 'CEO', 'MKT_LEAD', 'SALES_LEAD'].includes(user.roleCode)) {
    return true;
  }
  if (user.roleCode === 'DESIGNER') {
    return !project.assignedDesignerId || project.assignedDesignerId === user.id;
  }
  if (user.roleCode === 'SALES') {
    return (
      project.requestedBySalesId === user.id ||
      project.lead?.assignedSalesId === user.id ||
      project.lead?.createdByUserId === user.id
    );
  }
  return false;
}

export async function assertCanAccessDesignProject(
  user: SessionUserDto,
  requestId: number
): Promise<void> {
  const row = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: {
      lead: {
        select: { assignedSalesId: true, createdByUserId: true },
      },
    },
  });
  if (!row) {
    throw new Error('Không tìm thấy yêu cầu thiết kế.');
  }
  if (!canUserAccessDesignProject(user, row)) {
    throw new ForbiddenDesignProjectAccessError();
  }
}

export async function assertCanAccessStorageObjectKey(
  user: SessionUserDto,
  storageObjectKey: string
): Promise<void> {
  if (['ADMIN', 'CEO', 'MKT_LEAD', 'SALES_LEAD'].includes(user.roleCode)) {
    return;
  }

  const versionMatch = await prisma.designAssetVersion.findFirst({
    where: { storageObjectKey },
    include: {
      designRequest: {
        include: {
          lead: { select: { assignedSalesId: true, createdByUserId: true } },
        },
      },
    },
  });
  if (versionMatch?.designRequest) {
    if (!canUserAccessDesignProject(user, versionMatch.designRequest)) {
      throw new ForbiddenDesignProjectAccessError();
    }
    return;
  }

  const reqIdMatch = storageObjectKey.match(/req-(\d+)/i);
  if (reqIdMatch) {
    await assertCanAccessDesignProject(user, Number(reqIdMatch[1]));
    return;
  }

  const candidateRequests = await prisma.designRequest.findMany({
    where: {
      OR: [
        { sitePhotoUrl: storageObjectKey },
        { aiDraftImageUrl: storageObjectKey },
        { finalRenderUrl: storageObjectKey },
        { installPositionJson: { contains: storageObjectKey } },
      ],
    },
    include: {
      lead: { select: { assignedSalesId: true, createdByUserId: true } },
    },
    take: 5,
  });

  if (candidateRequests.length > 0) {
    const allowed = candidateRequests.some((r) => canUserAccessDesignProject(user, r));
    if (!allowed) {
      throw new ForbiddenDesignProjectAccessError();
    }
  }
}

export async function getDesignProjectForUser(
  user: SessionUserDto,
  requestId: number
): Promise<{
  project: DesignRequestItemDto;
  designContext: ProjectDesignContext;
}> {
  await assertCanAccessDesignProject(user, requestId);
  const { requests } = await listDesignRequestsForUser(user);
  const project = requests.find((r) => r.id === requestId);
  if (!project) {
    throw new ForbiddenDesignProjectAccessError();
  }
  const rawRow = await prisma.designRequest.findUnique({ where: { id: requestId } });
  const meta = parseProjectMetadata(rawRow?.installPositionJson ?? null);
  const designContext =
    meta.designContext ||
    createInitialDesignContext({
      projectId: project.id,
      leadId: project.leadId,
      widthMm: Math.round((project.screenWidthM ?? 4.8) * 1000),
      heightMm: Math.round((project.screenHeightM ?? 2.7) * 1000),
      pixelPitch: project.productSpec?.pixelPitch || 'P2.5',
      placementQuad: project.placementQuad || null,
      selectedPhotoId: project.photos.find((p) => p.selected)?.id || null,
      activeVersionId: project.assetVersions[project.assetVersions.length - 1]?.id || null,
      screenStyle: project.productSpec?.screenStyle || 'flat',
      compositingMode: meta.compositingMode || 'STRICT',
    });
  return { project, designContext };
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

    // Photos list: respect meta.photos (including empty array [] when user deleted all photos or created a fresh project)
    const photos: ProjectPhotoItemDto[] = Array.isArray(meta.photos)
      ? meta.photos
      : r.sitePhotoUrl
        ? [
            {
              id: `photo-site-${r.id}`,
              name: 'Ảnh hiện trạng công trình',
              url:
                r.sitePhotoUrl.startsWith('/') || r.sitePhotoUrl.startsWith('http')
                  ? r.sitePhotoUrl
                  : `/api/v1/design/asset-file?key=${encodeURIComponent(r.sitePhotoUrl)}`,
              storageObjectKey: r.sitePhotoUrl,
              selected: true,
              uploadedAt: r.createdAt.toISOString(),
            },
          ]
        : [];

    // Initial chat messages: filter out legacy rigid template messages and keep natural conversation
    const cleanedStoredChat = (meta.chatMessages || []).filter(
      (m) =>
        !m.text?.includes('Phân tích Kỹ thuật Chuyên sâu (Chuẩn thi công LED Toàn Trung') &&
        !m.text?.includes('Mình đã nhận được chia sẻ của bạn:')
    );
    const chatMessages: DesignChatMessageDto[] =
      cleanedStoredChat.length > 0
        ? cleanedStoredChat
        : [
            {
              id: `msg-ai-welcome-${r.id}`,
              role: 'assistant',
              text: `Chào bạn! 👋 Mình là Google Gemini (kết nối trực tiếp từ API Key Gmail của bạn). Bạn có thể trò chuyện, hỏi đáp với mình giống hệt như trên Gemini web nhé!`,
              timestamp: r.createdAt.toISOString(),
              chatMode: 'consultant_free',
              modelUsed: 'Google gemini-3.5-flash-lite (Gmail Free)',
              cost: '$0.00',
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
      sitePhotoDownloadUrl: selectedPhoto?.url || null,
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

  // Clean project initialization (when user clicks "+ Tạo dự án" in Studio without calling @TaoAnh yet)
  if (input.aiPrompt.startsWith('[INIT_PROJECT]')) {
    const cleanNote = input.aiPrompt.replace(/^\[INIT_PROJECT\]\s*/i, '').trim();
    const productSpec = computeLedProductSpec({
      productName: ledCategory,
      widthM: dimensionsData.widthM,
      heightM: dimensionsData.heightM,
      pitch: 'P2.5',
    });

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
              selected: leadPhotos.length === 0,
              uploadedAt: att.uploadedAt.toISOString(),
              sourceLeadAttachmentId: att.id,
            });
          }
        }
      }
    }

    const initialMetadata: StoredMetadata = {
      projectName:
        input.projectName ||
        (input.designType === 'banner' ? 'Banner Quảng cáo LED' : 'Dự án Phối cảnh LED'),
      contactName: input.contactName || leadContactFallback,
      installationInfo: input.installationInfo || 'Vị trí lắp đặt thực tế tại công trình',
      productId: input.productId ?? 1,
      pixelPitch: 'P2.5',
      screenStyle: 'flat',
      screenWidthM: dimensionsData.widthM,
      screenHeightM: dimensionsData.heightM,
      bannerWidthPx:
        input.designType === 'banner' ? input.bannerWidthPx : productSpec.resolutionWidthPx,
      bannerHeightPx:
        input.designType === 'banner' ? input.bannerHeightPx : productSpec.resolutionHeightPx,
      aspectLocked: true,
      isArchived: false,
      photos: leadPhotos,
      placementQuad: input.placementQuad || DEFAULT_PLACEMENT_QUAD,
      chatMessages: [
        {
          id: `msg-ai-welcome-${Date.now()}`,
          role: 'assistant',
          text: [
            `👋 **AI Tư vấn Kỹ thuật LED Toàn Trung (Miễn phí $0):**`,
            `• Đã khởi tạo dự án **${input.projectName || 'Dự án mới'}** (${Math.round(dimensionsData.widthM * 1000)}×${Math.round(dimensionsData.heightM * 1000)}mm).`,
            leadPhotos.length > 0
              ? `• Đã tự động đồng bộ **${leadPhotos.length} ảnh khảo sát** từ hồ sơ Lead liên kết.`
              : `• Bước 1: Hãy bấm **+ Thêm ảnh** ở cột trái để tải ảnh công trình của dự án này lên.`,
            `• Bước 2: Bấm **🎯 Chấm điểm trên ảnh** để chọn vị trí lắp đặt, sau đó bấm **🔍 Phân tích ($0)** hoặc gọi **@TaoAnh** / **@TaoAnhPoster** để AI kết xuất ảnh.`,
          ].join('\n'),
          timestamp: new Date().toISOString(),
          chatMode: 'consultant_free',
          suggestedTaoAnhPrompt:
            input.designType === 'banner'
              ? `@TaoAnhPoster: Thiết kế Poster quảng cáo LED cho dự án ${input.projectName || 'Toàn Trung'} (${input.bannerWidthPx || 1920}×${input.bannerHeightPx || 1080}px)`
              : `@TaoAnh: Ghép màn hình LED P2.5 kích thước ${Math.round(dimensionsData.widthM * 1000)}×${Math.round(dimensionsData.heightM * 1000)}mm vào các điểm chạm đã chấm trên ảnh hiện trạng, kèm đường gióng kích thước kỹ thuật (mm)`,
          modelUsed: 'AI Tư vấn Toàn Trung (Gemini Flash Free)',
          cost: '$0.00',
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
        sitePhotoUrl: leadPhotos[0]?.storageObjectKey || null,
        prompt: cleanNote || 'Khởi tạo dự án thiết kế mới',
        designStatus: 'pending',
        notes: input.notes || cleanNote || 'Dự án mới khởi tạo — sẵn sàng tải ảnh khảo sát & chạy AI.',
      },
    });

    return {
      id: createdRequest.id,
      status: 'pending',
      versionId: null,
    };
  }

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

const DAO_TAO_ANH_POSTER_REGEX =
  /^\s*@(?:taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner)\s*:?\s*/i;
const DAO_TAO_ANH_REGEX =
  /^\s*@(?:taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner|taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\s*:?\s*/i;

function buildConsultantReplyAndSuggestedPrompt(params: {
  userText: string;
  designType: 'banner' | '3d_perspective';
  widthM: number;
  heightM: number;
  bannerWidthPx: number;
  bannerHeightPx: number;
  aspectRatio: string;
  pitch: string;
  screenStyle: 'flat' | 'curved' | 'corner_90';
  placementQuad?: QuadCoordinatesDto;
  history?: DesignChatMessageDto[];
}): { replyText: string; suggestedTaoAnhPrompt?: string } {
  const {
    userText,
    designType,
    widthM,
    heightM,
    bannerWidthPx,
    bannerHeightPx,
    aspectRatio,
    pitch,
    screenStyle,
    placementQuad,
  } = params;
  const cleanUser = userText.trim();
  const lower = cleanUser.toLowerCase();

  const rawWmm = Math.round(widthM * 1000);
  const rawHmm = Math.round(heightM * 1000);
  const modCols = Math.max(2, Math.round(rawWmm / 320));
  const modRows = Math.max(2, Math.round(rawHmm / 160));
  const snappedWmm = modCols * 320;
  const snappedHmm = modRows * 160;
  const areaM2 = Number(((snappedWmm / 1000) * (snappedHmm / 1000)).toFixed(2));
  const cabCols = Math.max(1, Math.round(snappedWmm / 640));
  const cabRows = Math.max(1, Math.round(snappedHmm / 480));
  const totalCabinets = cabCols * cabRows;
  const totalModules = modCols * modRows;
  const pitchNum = Number(pitch.replace(/[^0-9.]/g, '')) || 2.5;
  const isOutdoor = pitchNum >= 3.0 || /outdoor|ngoài trời|mặt dựng|sảnh/i.test(cleanUser);
  const minViewM = Number((pitchNum * 1.1).toFixed(1));
  const maxViewM = Math.round(pitchNum * 12);
  const avgKw = Number((areaM2 * (isOutdoor ? 0.32 : 0.22)).toFixed(1));
  const maxKw = Number((areaM2 * (isOutdoor ? 0.85 : 0.58)).toFixed(1));

  // 1. Check if user is explicitly asking to analyze the photo or generate an image/poster
  const isExplicitPhotoAnalysis =
    /phân tích\s*(?:ảnh|hình|công trình|điểm chạm)|xem\s*(?:ảnh|hình)|đánh giá\s*(?:ảnh|công trình)|tạo\s*sẵn\s*lệnh|ghép\s*màn\s*hình|dựng\s*phối\s*cảnh/i.test(
      cleanUser
    );
  const isExplicitPosterRequest =
    /\b(thiết kế\s*poster|tạo\s*poster|làm\s*banner|thiết kế\s*banner|tạo\s*banner)\b/i.test(
      cleanUser
    );

  // 2. Greetings & casual conversation (act like a normal friendly AI!)
  if (
    /^(xin\s*chào|chào|hi|hello|hey|alo|ê|ơi|bạn\s*ơi|chào\s*bạn|chào\s*em|good\s*morning|có\s*ai\s*không|test|ok|oke|ừ|dạ|vâng|cảm\s*ơn|thank)/i.test(
      lower
    ) &&
    cleanUser.length < 45
  ) {
    if (/cảm\s*ơn|thank/i.test(lower)) {
      return {
        replyText:
          'Không có gì ạ! 😊 Bạn cần mình giải đáp thêm câu hỏi nào, viết nội dung hay hỗ trợ thiết kế gì cứ nhắn tự nhiên nhé!',
      };
    }
    return {
      replyText:
        'Chào bạn! 👋 Mình là trợ lý AI Gemini. Bạn có thể trò chuyện bình thường với mình về bất kỳ chủ đề nào (hỏi đáp, lên ý tưởng, viết nội dung, tính toán, hoặc tư vấn màn hình LED). Bạn đang cần mình hỗ trợ gì hôm nay?',
    };
  }

  // 3. Questions about who the AI is / capabilities / how are you
  if (
    /bạn\s*là\s*ai|tên\s*(?:là\s*)?gì|con\s*ai\s*nào|khỏe\s*không|ăn\s*cơm\s*chưa|làm\s*được\s*gì|giúp\s*được\s*gì|nói\s*chuyện\s*bình\s*thường/i.test(
      lower
    )
  ) {
    return {
      replyText:
        'Mình là trợ lý AI (Google Gemini Flash) hoạt động như một AI trò chuyện bình thường! 😊\n• Bạn có thể hỏi đáp mọi kiến thức, nhờ viết bài quảng cáo, dịch thuật, tính toán hoặc tâm sự thoải mái.\n• Ngoài ra, vì đang tích hợp trong Studio Toàn Trung nên khi nào bạn cần phân tích ảnh công trình hoặc ghép phối cảnh 3D màn hình LED (`@TaoAnh`), mình cũng có thể làm ngay cho bạn!',
    };
  }

  // 4. Simple math / calculation expressions
  const mathMatch = cleanUser.match(/^(\d+(?:[.,]\d+)?)\s*([+\-*/x×:])\s*(\d+(?:[.,]\d+)?)\s*[=?]?$/i);
  if (mathMatch) {
    const a = Number(mathMatch[1].replace(',', '.'));
    const op = mathMatch[2];
    const b = Number(mathMatch[3].replace(',', '.'));
    let res = 0;
    if (op === '+') res = a + b;
    else if (op === '-') res = a - b;
    else if (op === '*' || op.toLowerCase() === 'x' || op === '×') res = a * b;
    else if ((op === '/' || op === ':') && b !== 0) res = Number((a / b).toFixed(4));
    return {
      replyText: `Kết quả của **${a} ${op} ${b}** là **${res}** nhé bạn!`,
    };
  }

  // 5. Copywriting / Content / Marketing / Slogan requests
  if (/\b(viết|soạn|lên\s*ý\s*tưởng|content|bài\s*đăng|quảng\s*cáo|slogan|kịch\s*bản|email|thư\s*ngỏ|báo\s*giá)\b/i.test(lower) && !isExplicitPosterRequest) {
    return {
      replyText: [
        `Dưới đây là gợi ý nội dung theo yêu cầu **"${cleanUser}"** của bạn:`,
        `---`,
        `✨ **Tiêu đề gợi ý:** Giải Pháp Trình Chiếu Màn Hình LED Chuyên Nghiệp — Nâng Tầm Không Gian Của Bạn`,
        `• **Điểm nhấn 1:** Hình ảnh sắc nét chuẩn 4K, góc nhìn siêu rộng, hoạt động bền bỉ 24/7.`,
        `• **Điểm nhấn 2:** Thiết kế liền mạch theo đúng kích thước thực tế, thẩm mỹ sang trọng.`,
        `• **Kêu gọi hành động (CTA):** Liên hệ ngay để được khảo sát miễn phí và dựng phối cảnh 3D trực tiếp trên không gian của bạn!`,
        `---`,
        `Bạn muốn mình chỉnh lại giọng văn (ngắn gọn hơn, sang trọng hơn hay hài hước hơn) cứ nhắn mình nhé!`,
      ].join('\n'),
    };
  }

  // 6. Specific LED comparison or technical Q&A (without dumping the rigid 3-bullet photo template)
  if (/\b(khác\s*gì|so\s*sánh|nên\s*chọn|nên\s*dùng|là\s*gì|p1\.|p2\.|p3|p4|p5|indoor|outdoor|nits|cabinet|module|công\s*suất|điện)\b/i.test(lower) && !isExplicitPhotoAnalysis) {
    return {
      replyText: [
        `Về câu hỏi **"${cleanUser}"** của bạn, mình giải thích ngắn gọn và dễ hiểu như sau nhé:`,
        `• **Về khoảng cách nhìn (Bước điểm ảnh P):** Số P càng nhỏ (như P1.53, P2.0, P2.5) thì điểm ảnh càng dày, nhìn gần từ **2m – 5m** cực kỳ mịn (phù hợp phòng họp, hội trường, showroom). Số P lớn hơn (P3, P4, P5) phù hợp sảnh lớn hoặc ngoài trời nhìn xa từ **4m – 30m+**.`,
        `• **Về môi trường lắp đặt:** Dòng **Indoor** có độ sáng vừa phải (~600–800 nits) để nhìn lâu không chói mắt; dòng **Outdoor** có chuẩn chống nước **IP65** và độ sáng rất cao (**4.500 – 6.000 nits**) để rõ nét dưới nắng gắt.`,
        `• Với dự án đang mở hiện tại (${widthM}m × ${heightM}m · ${areaM2}m²), nếu cần mình tính chi tiết số tấm Module hay xuất ảnh phối cảnh thì bạn cứ bảo mình nhé!`,
      ].join('\n'),
    };
  }

  // 7. Explicit Poster request
  if (isExplicitPosterRequest || (designType === 'banner' && isExplicitPhotoAnalysis)) {
    const suggestedTaoAnhPrompt = `@TaoAnhPoster: Thiết kế Poster quảng cáo LED tỷ lệ ${aspectRatio} (${bannerWidthPx}×${bannerHeightPx}px) theo nội dung: "${cleanUser}", nổi bật sản phẩm & thông điệp chính`;
    const replyText = [
      `Mình đã lên bố cục thiết kế Poster/Banner LED (${bannerWidthPx}×${bannerHeightPx}px · tỷ lệ ${aspectRatio}) theo yêu cầu của bạn.`,
      `👉 Bạn có thể bấm nút bên dưới để AI xuất mẫu Poster ngay nhé!`,
    ].join('\n');
    return { replyText, suggestedTaoAnhPrompt };
  }

  // 8. Explicit Photo Analysis & 3D LED Composite suggestion (only when user clicked "Phân tích ảnh" or asked for photo analysis)
  if (isExplicitPhotoAnalysis) {
    const styleLabel =
      screenStyle === 'curved'
        ? 'màn hình LED bo cong'
        : screenStyle === 'corner_90'
          ? 'màn hình LED vuông góc 90°'
          : 'màn hình LED phẳng viền mỏng';
    const quadSummary = placementQuad
      ? `tọa độ điểm chạm A(${Math.round(placementQuad.topLeft.x)}%, ${Math.round(placementQuad.topLeft.y)}%) → C(${Math.round(placementQuad.bottomRight.x)}%, ${Math.round(placementQuad.bottomRight.y)}%)`
      : 'vùng trung tâm công trình';
    const suggestedTaoAnhPrompt = `@TaoAnh: Ghép phối cảnh ${styleLabel} ${pitch} kích thước ${snappedWmm} × ${snappedHmm}mm vào đúng các điểm chạm đã chấm trên ảnh khảo sát, kèm đường gióng kích thước kỹ thuật (mm)`;
    const replyText = [
      `Mình đã xem bức ảnh công trình hiện tại (${quadSummary}) và tính toán nhanh thông số cho bạn:`,
      `• **Kích thước chuẩn theo Module (320×160mm):** **${snappedWmm} × ${snappedHmm} mm** (${areaM2} m² · gồm ${totalModules} tấm Module / ${totalCabinets} Cabinet).`,
      `• **Dòng LED & Nguồn:** **${pitch} ${isOutdoor ? 'Outdoor (IP65)' : 'Indoor'}** (tầm nhìn tối ưu ${minViewM}m – ${maxViewM}m), công suất tiêu thụ khoảng **${avgKw} – ${maxKw} kW**.`,
      `👉 Mình đã soạn sẵn lệnh **@TaoAnh** bên dưới nếu bạn muốn ghép thử màn hình LED lên ảnh ngay!`,
    ].join('\n');
    return { replyText, suggestedTaoAnhPrompt };
  }

  // 9. General open-ended conversation fallback (Natural, helpful response without forcing the 3-bullet hardware template!)
  return {
    replyText: [
      `Mình đã nhận được chia sẻ của bạn: *"${cleanUser}"*.`,
      `• Nếu bạn đang muốn trao đổi thêm ý tưởng, hỏi thông tin kỹ thuật, soạn nội dung báo giá/quảng cáo hoặc cần giải đáp bất kỳ vấn đề gì, bạn cứ nhắn cụ thể hơn nhé — mình trả lời trực tiếp như một AI bình thường!`,
      `• Còn nếu bạn muốn mình nhìn ảnh công trình để tư vấn vị trí lắp LED hoặc ghép ảnh 3D, bạn chỉ cần bấm nút **🔍 Phân tích ảnh ($0)** hoặc **🏢 @TaoAnh (Ghép 3D)** ngay bên dưới nhé!`,
    ].join('\n'),
  };
}

export async function processChatDesignRequest(
  actor: SessionUserDto,
  requestId: number,
  input: ChatDesignRequestDto
) {
  await assertCanAccessDesignProject(actor, requestId);

  const piiCheck = containsCustomerPiiInPrompt(input.prompt);
  if (piiCheck.hasPii) {
    throw new Error(piiCheck.reason);
  }

  const existing = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: {
      assetVersions: {
        orderBy: { versionNumber: 'desc' },
      },
    },
  });

  if (!existing) {
    throw new Error('Không tìm thấy yêu cầu thiết kế.');
  }

  if (
    typeof input.expectedVersion === 'number' &&
    input.expectedVersion > 0 &&
    existing.version !== input.expectedVersion
  ) {
    throw new ConcurrencyConflictError('DesignRequest', requestId, input.expectedVersion);
  }

  const currentMeta = parseProjectMetadata(existing.installPositionJson);

  // 0. Idempotency check: prevent duplicate billable jobs or duplicate versions on retry
  if (input.idempotencyKey && currentMeta.processedIdempotencyKeys?.[input.idempotencyKey]) {
    const prevRecord = currentMeta.processedIdempotencyKeys[input.idempotencyKey];
    return {
      requestId,
      idempotentReplay: true,
      versionNumber: prevRecord.versionNumber,
      versionId: prevRecord.versionId,
      downloadUrl: `/api/v1/design/asset/${prevRecord.versionId}`,
      chatMessages: currentMeta.chatMessages || [],
      designContext: currentMeta.designContext,
    };
  }

  const nextVersionNumber = (existing.assetVersions[0]?.versionNumber ?? 0) + 1;

  // 1. Initialize or load per-project DesignContext
  let designContext: ProjectDesignContext =
    currentMeta.designContext ||
    createInitialDesignContext({
      projectId: requestId,
      leadId: existing.leadId,
      widthMm: Math.round((currentMeta.screenWidthM ?? 4.8) * 1000),
      heightMm: Math.round((currentMeta.screenHeightM ?? 2.7) * 1000),
      pixelPitch: currentMeta.pixelPitch || 'P2.5',
      cabinetModel: currentMeta.cabinetModelCode || 'CAB-640x480-DIE',
      placementQuad: input.placementQuad || currentMeta.placementQuad || null,
      selectedPhotoId:
        input.selectedPhotoId || (currentMeta.photos || []).find((p) => p.selected)?.id || null,
      activeVersionId: input.sourceVersionId ?? existing.assetVersions[0]?.id ?? null,
      screenStyle: currentMeta.screenStyle || 'flat',
      compositingMode: input.compositingMode || currentMeta.compositingMode || 'STRICT',
    });

  if (input.placementQuad) {
    designContext.fields.placementQuad = input.placementQuad;
    designContext.provenance.placementQuad = 'user_confirmed';
  }
  if (input.selectedPhotoId) {
    designContext.fields.selectedPhotoId = input.selectedPhotoId;
  }
  if (input.sourceVersionId !== undefined) {
    designContext.fields.activeVersionId = input.sourceVersionId;
  }
  if (input.compositingMode) {
    designContext.fields.compositingMode = input.compositingMode;
  }

  // 2. Deterministic Command Router (never relies solely on LLM prompt instructions)
  const routeDecision = routeDesignCommand({
    rawMessage: input.prompt,
    source: input.triggerSource || 'user_input',
    explicitButtonAction:
      input.chatMode === 'image_generator' &&
      !DAO_TAO_ANH_REGEX.test(input.prompt) &&
      input.triggerSource === 'user_button'
        ? existing.requestType === 'banner'
          ? 'GENERATE_BANNER'
          : 'GENERATE_SCENE'
        : null,
  });

  // Extract multi-turn user-confirmed specifications from chat text
  const extraction = extractAndMergeUserChatContext(designContext, input.prompt);
  designContext = extraction.updatedContext;

  // Sync user-confirmed DesignContext parameters into StoredMetadata without overwriting confirmed fields with defaults
  if (designContext.provenance.widthMm === 'user_confirmed' && designContext.fields.widthMm) {
    currentMeta.screenWidthM = Number((designContext.fields.widthMm / 1000).toFixed(3));
  } else if (input.screenWidthM && designContext.provenance.widthMm !== 'user_confirmed') {
    currentMeta.screenWidthM = input.screenWidthM;
  }
  if (designContext.provenance.heightMm === 'user_confirmed' && designContext.fields.heightMm) {
    currentMeta.screenHeightM = Number((designContext.fields.heightMm / 1000).toFixed(3));
  } else if (input.screenHeightM && designContext.provenance.heightMm !== 'user_confirmed') {
    currentMeta.screenHeightM = input.screenHeightM;
  }
  if (designContext.provenance.pixelPitch === 'user_confirmed' && designContext.fields.pixelPitch) {
    currentMeta.pixelPitch = designContext.fields.pixelPitch;
  }
  if (
    designContext.provenance.installPosition === 'user_confirmed' &&
    designContext.fields.installPosition
  ) {
    currentMeta.installationInfo = designContext.fields.installPosition;
  }
  if (
    designContext.provenance.screenStyle === 'user_confirmed' &&
    designContext.fields.screenStyle
  ) {
    currentMeta.screenStyle = designContext.fields.screenStyle;
  }
  if (
    designContext.provenance.targetResolution === 'user_confirmed' &&
    designContext.fields.targetResolution
  ) {
    currentMeta.bannerWidthPx = designContext.fields.targetResolution.widthPx;
    currentMeta.bannerHeightPx = designContext.fields.targetResolution.heightPx;
  }
  currentMeta.compositingMode = designContext.fields.compositingMode;

  // 3. Resolve exact source image (either a selected survey photo OR a specific source version for iterative editing)
  const photosList = currentMeta.photos || [];
  if (input.selectedPhotoId && photosList.length > 0) {
    for (const p of photosList) {
      p.selected = p.id === input.selectedPhotoId;
    }
    currentMeta.photos = photosList;
  }
  const activePhotoObj =
    (input.selectedPhotoId
      ? photosList.find((p) => p.id === input.selectedPhotoId)
      : undefined) ||
    photosList.find((p) => p.selected) ||
    photosList[0];

  const sourceVersionObj = input.sourceVersionId
    ? existing.assetVersions.find((v) => v.id === input.sourceVersionId)
    : null;

  let storageKeyToRead: string | null = null;
  let sourceImageOrigin: 'version' | 'survey_photo' | 'none' = 'none';
  if (sourceVersionObj?.storageObjectKey) {
    storageKeyToRead = sourceVersionObj.storageObjectKey;
    sourceImageOrigin = 'version';
  } else if (activePhotoObj?.storageObjectKey) {
    storageKeyToRead = activePhotoObj.storageObjectKey;
    sourceImageOrigin = 'survey_photo';
  } else if (input.selectedPhotoUrl?.includes('key=')) {
    try {
      const q = input.selectedPhotoUrl.split('?')[1] || '';
      storageKeyToRead = new URLSearchParams(q).get('key');
      if (storageKeyToRead) sourceImageOrigin = 'survey_photo';
    } catch {
      storageKeyToRead = null;
    }
  } else if (existing.sitePhotoUrl && !existing.sitePhotoUrl.startsWith('/')) {
    storageKeyToRead = existing.sitePhotoUrl;
    sourceImageOrigin = 'survey_photo';
  }

  const activePhotoFileData = storageKeyToRead ? readPrivateBusinessFile(storageKeyToRead) : null;

  const effectiveWidthM =
    (designContext.fields.widthMm ? designContext.fields.widthMm / 1000 : null) ||
    input.screenWidthM ||
    currentMeta.screenWidthM ||
    4.8;
  const effectiveHeightM =
    (designContext.fields.heightMm ? designContext.fields.heightMm / 1000 : null) ||
    input.screenHeightM ||
    currentMeta.screenHeightM ||
    2.7;
  const effectiveBannerW =
    designContext.fields.targetResolution?.widthPx ||
    input.bannerWidthPx ||
    currentMeta.bannerWidthPx ||
    1920;
  const effectiveBannerH =
    designContext.fields.targetResolution?.heightPx ||
    input.bannerHeightPx ||
    currentMeta.bannerHeightPx ||
    1080;
  const effectivePitch =
    designContext.fields.pixelPitch ||
    currentMeta.pixelPitch ||
    currentMeta.productSpec?.pixelPitch ||
    'P2.5';
  const effectiveStyle =
    designContext.fields.screenStyle ||
    currentMeta.screenStyle ||
    currentMeta.productSpec?.screenStyle ||
    'flat';

  // Recompute independent LED technical spec & BOM
  currentMeta.productSpec = computeLedProductSpec({
    productCode: currentMeta.productSpec?.productCode,
    productName: existing.ledCategory || 'Màn hình LED Indoor',
    categoryGroup: currentMeta.productSpec?.categoryGroup,
    widthM: effectiveWidthM,
    heightM: effectiveHeightM,
    pitch: effectivePitch,
    screenStyle: effectiveStyle,
    cabinetModelCode: currentMeta.cabinetModelCode,
  });

  const dbType: 'banner' | '3d_perspective' =
    routeDecision.action === 'GENERATE_BANNER'
      ? 'banner'
      : routeDecision.action === 'GENERATE_SCENE'
        ? '3d_perspective'
        : existing.requestType === 'banner'
          ? 'banner'
          : '3d_perspective';

  const isImageGenerationMode =
    routeDecision.action === 'GENERATE_SCENE' || routeDecision.action === 'GENERATE_BANNER';

  // MODE 1: CHAT MODEL ONLY ($0.00 - Never auto-creates an AI Image Job on normal chat messages)
  if (!isImageGenerationMode) {
    const wM = effectiveWidthM;
    const hM = effectiveHeightM;
    const bW = effectiveBannerW;
    const bH = effectiveBannerH;
    const ratio = input.aspectRatio || existing.aspectRatio || '16:9';
    const pitch = effectivePitch;
    const style = effectiveStyle;

    const fallbackConsult = buildConsultantReplyAndSuggestedPrompt({
      userText: input.prompt,
      designType: dbType,
      widthM: wM,
      heightM: hM,
      bannerWidthPx: bW,
      bannerHeightPx: bH,
      aspectRatio: ratio,
      pitch,
      screenStyle: style,
      placementQuad: input.placementQuad || currentMeta.placementQuad,
    });

    let replyText = fallbackConsult.replyText;
    if (routeDecision.isMetaQuestionAboutCommand) {
      replyText = [
        `Mình giải thích nhanh về 2 lệnh tạo ảnh trong Studio nhé:`,
        `• **\`@taoanh <mô tả>\`** (hoặc \`@TaoAnh\`): Dùng khi bạn muốn AI ghép phối cảnh màn hình LED vào đúng 4 góc đã chấm trên ảnh khảo sát.`,
        `• **\`@taobanner <nội dung>\`** (hoặc \`@TaoAnhPoster\`): Dùng khi bạn muốn AI thiết kế hình ảnh Banner/Poster trình chiếu trên màn hình LED.`,
        `• Còn khi bạn nhắn tin bình thường như thế này thì mình sẽ trò chuyện, giải đáp và tư vấn hoàn toàn tự nhiên như một AI thông thường (không tự động tạo ảnh hay tốn phí)! 😊`,
      ].join('\n');
    } else if (extraction.newlyConfirmedLabels.length > 0) {
      const techEval = evaluateLedTechnicalConfig({
        widthMm: Math.round(wM * 1000),
        heightMm: Math.round(hM * 1000),
        pixelPitch: pitch,
        cabinetModelCode: currentMeta.cabinetModelCode,
        screenStyle: style,
      });
      replyText = [
        `Mình đã nắm được thông tin bạn vừa chia sẻ (**${extraction.newlyConfirmedLabels.join(', ')}**) nhé! 👍`,
        `• Cấu hình hiện tại của dự án: **${Math.round(wM * 1000)} × ${Math.round(hM * 1000)} mm** (${wM}m × ${hM}m), dòng **${pitch}** (${techEval.theoreticalResolutionWidthPx} × ${techEval.theoreticalResolutionHeightPx} px).`,
        ...(techEval.warnings.length > 0 ? [`• Lưu ý kỹ thuật nhẹ: ${techEval.warnings[0]}`] : []),
        `Bạn muốn trao đổi thêm về phương án thiết kế hay cần mình hỗ trợ nội dung gì tiếp cứ nhắn tự nhiên nhé!`,
      ].join('\n');
    }

    let suggestedTaoAnhPrompt: string | undefined = fallbackConsult.suggestedTaoAnhPrompt;
    let consultModelUsed = 'Google Gemini 3 Flash (Trợ lý AI)';

    // If a real Google Gemini API Key (e.g., from user's Gmail / Google AI Studio / Vertex Express) is configured, call Gemini live for ALL chat turns!
    const { config: aiCfg } = AiDesignProviderFactory.getCatalog();
    const geminiApiKey =
      aiCfg.providers.google_imagen?.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.IMAGEN_API_KEY;
    const isOfflineUnitTest = Boolean(process.env.NODE_TEST_CONTEXT);

    if (geminiApiKey && !input.simulateAiTimeout && !isOfflineUnitTest) {
      try {
        const quadInfo = input.placementQuad || currentMeta.placementQuad || DEFAULT_PLACEMENT_QUAD;
        // Only attach the heavy survey photo when the user actually asks about the photo/room/image/wall
        const asksAboutVisualImage =
          /ảnh|hình|nhìn|xem|phân tích|trong phòng|vách|tường|vị trí|showroom|công trình|mặt tiền|ghép|sửa|thêm|xóa|bỏ/i.test(
            input.prompt
          );
        const wantsImageAttachment =
          asksAboutVisualImage &&
          Boolean(
            activePhotoFileData &&
              activePhotoFileData.buffer.length > 0 &&
              activePhotoFileData.buffer.length < 5 * 1024 * 1024
          );

        const sysInstruction = [
          'Bạn là một trợ lý AI thông minh, thân thiện và tự nhiên (giống hệt ChatGPT / Google Gemini).',
          'NGUYÊN TẮC QUAN TRỌNG NHẤT:',
          '1. Hãy trò chuyện tự nhiên, mạch lạc, gần gũi như một người bạn / trợ lý AI bình thường. Người dùng hỏi chủ đề gì (đời sống, kiến thức chung, viết content, dịch thuật, tính toán, ý tưởng, hay thiết kế LED) thì trả lời trực tiếp, thông minh và đúng trọng tâm câu hỏi đó.',
          '2. TUYỆT ĐỐI KHÔNG trả lời máy móc kiểu rập khuôn, KHÔNG tự ý liệt kê bảng thông số kỹ thuật LED hay hướng dẫn bấm nút nếu người dùng chỉ đang trò chuyện hoặc hỏi việc khác.',
          '3. Nếu người dùng đang trao đổi về dự án màn hình LED của họ, hãy phản hồi tự nhiên và khéo léo ghi nhận thông số họ vừa nói. Ngữ cảnh dự án hiện tại (chỉ tham khảo khi nói về LED): ' +
            `LED ${pitch}, kích thước ${Math.round(wM * 1000)}x${Math.round(hM * 1000)}mm (${wM}m x ${hM}m), tỷ lệ ${ratio}, vùng lắp TL(${quadInfo.topLeft.x}%,${quadInfo.topLeft.y}%) -> BR(${quadInfo.bottomRight.x}%,${quadInfo.bottomRight.y}%).`,
          '4. Nếu tin nhắn có đính kèm bức ảnh và người dùng hỏi về bức ảnh đó, hãy quan sát ảnh thật kỹ để trả lời.',
          '5. Chỉ khi người dùng chủ động yêu cầu tạo/sửa ảnh hoặc ghép màn hình LED vào ảnh thì ở dòng cuối cùng mới gợi ý câu lệnh @TaoAnh: <mô tả>. Còn lại tuyệt đối không chèn @TaoAnh.',
        ].join('\n');

        // Build multi-turn conversation history so Gemini remembers previous messages naturally
        const rawHistory = (currentMeta.chatMessages || [])
          .filter((m) => m.text && !m.id.startsWith('msg-ai-welcome-'))
          .slice(-8);

        // Normalize alternating user/model turns for Google generateContent API
        const historyTurns: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
        for (const msg of rawHistory) {
          const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
          const cleanText = msg.text.trim();
          if (!cleanText) continue;
          if (historyTurns.length === 0 && role === 'model') {
            // Google API requires the first turn in `contents` to have role 'user'
            continue;
          }
          const prev = historyTurns[historyTurns.length - 1];
          if (prev && prev.role === role) {
            prev.parts[0].text += `\n${cleanText}`;
          } else {
            historyTurns.push({ role, parts: [{ text: cleanText }] });
          }
        }
        // If last history turn was 'user', pop it so it doesn't collide with the current 'user' turn
        if (historyTurns.length > 0 && historyTurns[historyTurns.length - 1].role === 'user') {
          historyTurns.pop();
        }

        // Prioritize verified discoveredModels from the user's API key (putting full Gemini models before Gemma models)
        const discoveredIds = (aiCfg.providers.google_imagen?.discoveredModels || [])
          .map((m) => m.id.replace(/^models\//, '').trim())
          .filter(Boolean);
        const discoveredGeminiFirst = [
          ...discoveredIds.filter((id) => id.startsWith('gemini-')),
          ...discoveredIds.filter((id) => !id.startsWith('gemini-')),
        ];

        const rawRequestedModel =
          input.modelId &&
          input.modelId !== 'toantrung-rules-v3' &&
          input.modelId !== 'toantrung-studio-v3' &&
          !input.modelId.includes('image') &&
          !input.modelId.includes('imagen')
            ? input.modelId.replace(/^models\//, '').trim()
            : '';

        const candidateModels = Array.from(
          new Set(
            [
              // If user specifically chose a gemini-* model, try it first; if activeModel was gemma-*, try discovered gemini-* first for richer chat/vision
              rawRequestedModel.startsWith('gemini-') ? rawRequestedModel : '',
              ...discoveredGeminiFirst,
              rawRequestedModel,
              'gemini-3-flash-preview',
              'gemma-4-26b-a4b-it',
              'gemini-flash-lite-latest',
            ].filter(Boolean)
          )
        ).slice(0, 3);

        let rawAiText = '';
        let usedModelName = candidateModels[0] || 'gemini-3-flash-preview';

        for (const modelCandidate of candidateModels) {
          const isGemmaModel = modelCandidate.toLowerCase().startsWith('gemma-');
          const userPartsForModel: Array<
            | { text: string }
            | { inlineData: { mimeType: string; data: string } }
          > = [
            {
              text: isGemmaModel
                ? `[Hướng dẫn hệ thống: ${sysInstruction}]\n\nNgười dùng: ${input.prompt}`
                : input.prompt,
            },
          ];

          if (!isGemmaModel && wantsImageAttachment && activePhotoFileData) {
            userPartsForModel.push({
              inlineData: {
                mimeType: activePhotoFileData.mimeType.startsWith('image/')
                  ? activePhotoFileData.mimeType
                  : 'image/jpeg',
                data: activePhotoFileData.buffer.toString('base64'),
              },
            });
          }

          const payloadObj: Record<string, unknown> = {
            contents: [
              ...historyTurns,
              {
                role: 'user',
                parts: userPartsForModel,
              },
            ],
            generationConfig: {
              maxOutputTokens: 800,
              temperature: 0.7,
            },
          };

          // Gemma models reject `systemInstruction` with HTTP 400; only attach `systemInstruction` on Gemini models
          if (!isGemmaModel) {
            payloadObj.systemInstruction = {
              parts: [{ text: sysInstruction }],
            };
          }

          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            modelCandidate
          )}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
          try {
            const gemRes = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payloadObj),
              signal: AbortSignal.timeout(8000),
            });
            if (gemRes.ok) {
              const gemJson = (await gemRes.json()) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
              };
              const extracted = gemJson.candidates?.[0]?.content?.parts
                ?.map((p) => p.text || '')
                .join('')
                .trim();
              if (extracted) {
                rawAiText = extracted;
                usedModelName = modelCandidate;
                break;
              }
            } else if (gemRes.status === 429) {
              // Try next model in candidateModels (each model has its own RPM quota bucket!)
              continue;
            }
          } catch {
            // Try next candidate
          }
        }

        if (rawAiText) {
          const cmdMatch = rawAiText.match(/(@(?:TaoAnhPoster|TaoAnh|taobanner|taoanh)\s*:?[^\n]+)/i);
          if (cmdMatch) {
            suggestedTaoAnhPrompt = cmdMatch[1].trim();
            replyText = rawAiText.replace(cmdMatch[0], '').trim() || rawAiText;
          } else {
            suggestedTaoAnhPrompt = undefined;
            replyText = rawAiText;
          }
          consultModelUsed = `Google ${usedModelName} (Gmail Free)`;
        }
      } catch {
        // Fallback to natural conversational reply if network fails
      }
    }

    const existingChat = currentMeta.chatMessages || [];
    const updatedChat: DesignChatMessageDto[] = [
      ...existingChat,
      {
        id: `msg-user-${Date.now()}`,
        role: 'user',
        text: input.prompt,
        timestamp: new Date().toISOString(),
        chatMode: 'consultant_free',
      },
      {
        id: `msg-ai-consult-${Date.now() + 1}`,
        role: 'assistant',
        text: replyText,
        timestamp: new Date().toISOString(),
        chatMode: 'consultant_free',
        suggestedTaoAnhPrompt,
        modelUsed: consultModelUsed,
        durationSec: 0.3,
        cost: '$0.00',
        status: 'success',
      },
    ];

    const updatedMetadata: StoredMetadata = {
      ...currentMeta,
      placementQuad: input.placementQuad || currentMeta.placementQuad,
      chatMessages: updatedChat,
      designContext,
    };

    const nextScreenDims =
      existing.requestType === 'banner'
        ? `${effectiveBannerW}x${effectiveBannerH}px`
        : `${effectiveWidthM.toFixed(2).replace('.', ',')} x ${effectiveHeightM.toFixed(2).replace('.', ',')} m`;

    await prisma.designRequest.update({
      where: { id: requestId },
      data: {
        screenDimensions: nextScreenDims,
        installPositionJson: JSON.stringify(updatedMetadata),
        version: { increment: 1 },
      },
    });

    return {
      requestId,
      mode: 'consultant_free' as const,
      commandAction: 'CHAT' as const,
      versionNumber: existing.assetVersions[0]?.versionNumber ?? 1,
      versionId: existing.assetVersions[0]?.id,
      suggestedTaoAnhPrompt,
      chatMessages: updatedChat,
      designContext,
    };
  }

  // 4. Validate Mandatory Readiness before calling Image API
  const hasSurveyPhoto = Boolean(
    photosList.length > 0 ||
      existing.sitePhotoUrl ||
      input.selectedPhotoUrl ||
      sourceVersionObj
  );
  const effectiveQuad =
    input.placementQuad ||
    currentMeta.placementQuad ||
    designContext.fields.placementQuad ||
    DEFAULT_PLACEMENT_QUAD;
  const hasPlacementQuad = Boolean(effectiveQuad?.topLeft && effectiveQuad?.bottomRight);

  const readiness = validateCommandReadiness({
    routed: routeDecision,
    hasSurveyPhoto,
    hasPlacementQuad,
    placementQuad: effectiveQuad,
    widthMm: Math.round(effectiveWidthM * 1000),
    heightMm: Math.round(effectiveHeightM * 1000),
    pixelPitch: effectivePitch,
    bannerWidthPx: effectiveBannerW,
    bannerHeightPx: effectiveBannerH,
    bannerBriefFromContext: designContext.fields.bannerContent,
  });

  if (!readiness.canExecuteImmediately && readiness.clarificationReply) {
    const existingChat = currentMeta.chatMessages || [];
    const updatedChat: DesignChatMessageDto[] = [
      ...existingChat,
      {
        id: `msg-user-${Date.now()}`,
        role: 'user',
        text: input.prompt,
        timestamp: new Date().toISOString(),
        chatMode: 'consultant_free',
      },
      {
        id: `msg-ai-missing-${Date.now() + 1}`,
        role: 'assistant',
        text: readiness.clarificationReply,
        timestamp: new Date().toISOString(),
        chatMode: 'consultant_free',
        modelUsed: 'Command Router Validator',
        durationSec: 0.05,
        cost: '$0.00',
        status: 'success',
      },
    ];

    const updatedMetadata: StoredMetadata = {
      ...currentMeta,
      chatMessages: updatedChat,
      designContext,
    };

    await prisma.designRequest.update({
      where: { id: requestId },
      data: {
        installPositionJson: JSON.stringify(updatedMetadata),
        version: { increment: 1 },
      },
    });

    return {
      requestId,
      mode: 'consultant_free' as const,
      commandAction: routeDecision.action,
      missingFields: readiness.missingFields,
      versionNumber: existing.assetVersions[0]?.versionNumber ?? 1,
      versionId: existing.assetVersions[0]?.id,
      chatMessages: updatedChat,
      designContext,
    };
  }

  // 5. Reject text-only Chat Models when attempting Image Generation
  if (
    input.modelId &&
    /(?:chat-only|text-only|gemini-1\.5-flash-8b|gpt-4o-mini-text)/i.test(input.modelId)
  ) {
    throw new Error(
      `MODEL_NOT_IMAGE_CAPABLE: Model "${input.modelId}" chỉ hỗ trợ Chat văn bản, không hỗ trợ xuất file ảnh. Vui lòng chọn Image Provider/Model hỗ trợ tạo ảnh (như gemini-3.1-flash-image-preview, imagen-3.0, gpt-image-1 hoặc Local Sandbox).`
    );
  }

  // MODE 2: IMAGE GENERATION (@taoanh -> GENERATE_SCENE | @taobanner -> GENERATE_BANNER)
  const cleanImagePrompt =
    routeDecision.cleanInstruction ||
    input.prompt.replace(DAO_TAO_ANH_REGEX, '').trim() ||
    designContext.fields.bannerContent ||
    input.prompt;

  const normalizedProviderId = (
    input.providerId === 'flux_pro'
      ? 'flux_bfl'
      : input.providerId === 'custom_http'
        ? 'custom_endpoint'
        : input.providerId
  ) as
    | 'google_imagen'
    | 'openai_dalle'
    | 'flux_bfl'
    | 'stability_ai'
    | 'custom_endpoint'
    | 'local_sandbox'
    | undefined;

  const effectiveCompositingMode: CompositingProtectionMode =
    input.compositingMode ||
    designContext.fields.compositingMode ||
    currentMeta.compositingMode ||
    'STRICT';

  const providerResult =
    dbType === '3d_perspective'
      ? await AiDesignProviderFactory.executePerspectiveWithFallback(
          {
            workflow: 'perspective_3d',
            prompt: cleanImagePrompt,
            referenceImageUrl:
              input.selectedPhotoUrl ||
              activePhotoObj?.url ||
              existing.sitePhotoUrl ||
              DEFAULT_SHOWROOM_PHOTO,
            referenceImageBuffer: activePhotoFileData?.buffer,
            referenceImageMimeType: activePhotoFileData?.mimeType,
            placementQuad: effectiveQuad,
            compositingMode: effectiveCompositingMode,
            productSpec: {
              productCode: currentMeta.productSpec?.productCode || 'LED_INDOOR',
              productName: existing.ledCategory || 'Màn hình LED Indoor',
              pitch: effectivePitch,
              screenStyle: effectiveStyle,
            },
            dimensions: {
              widthM: effectiveWidthM,
              heightM: effectiveHeightM,
              aspectRatio: input.aspectRatio || existing.aspectRatio || '16:9',
            },
            quality: input.quality || 'draft',
            modelId: input.modelId,
            idempotencyKey:
              input.idempotencyKey ||
              `chat-design-${requestId}-v${nextVersionNumber}-${Date.now()}`,
            simulateTimeout: input.simulateAiTimeout,
          },
          normalizedProviderId
        )
      : await AiDesignProviderFactory.executeBannerWithFallback(
          {
            workflow: 'banner',
            prompt: cleanImagePrompt,
            dimensions: {
              widthPx: effectiveBannerW,
              heightPx: effectiveBannerH,
              aspectRatio: input.aspectRatio || existing.aspectRatio || '16:9',
            },
            quality: input.quality || 'draft',
            modelId: input.modelId,
            idempotencyKey:
              input.idempotencyKey ||
              `chat-banner-${requestId}-v${nextVersionNumber}-${Date.now()}`,
            simulateTimeout: input.simulateAiTimeout,
          },
          normalizedProviderId
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
    throw new Error(
      'Kết nối hệ thống AI quá thời gian phản hồi (UC06 E1). Phiên bản hiện tại vẫn được bảo toàn an toàn.'
    );
  }

  // Validate binary output strictly: NEVER mark success if provider returned text-only, empty buffer, or invalid image bytes!
  const imageValidation = validateGeneratedImageBuffer(providerResult.imageBuffer);

  if (providerResult.status === 'failed' || !imageValidation.isValid) {
    const existingChat = currentMeta.chatMessages || [];
    const explainText = providerResult.errorMessage?.startsWith('FREE_TIER_IMAGE_LIMIT_0')
      ? [
          `⚠️ **Giữ nguyên ảnh gốc của bạn (Không tự ý nhảy sang ảnh giả lập):**`,
          `• Mã **API Key Gmail Miễn phí ($0)** của Google AI Studio hiện được Google mở miễn phí cho **Chat & Nhìn ảnh (Vision)**, nhưng khóa hạn mức **\`limit: 0\`** đối với tính năng **Tạo/Sửa xuất ra file ảnh mới** (\`gemini-3.1-flash-image\` / \`imagen-3\`).`,
          `• Để AI tự động vẽ/chỉnh sửa trực tiếp ra file ảnh mới (thêm/bớt vật thể trong ảnh), bạn cần bật **Billing Tier 1** trên Google AI Studio hoặc gắn Key **OpenAI (\`gpt-image-1\`) / FLUX.1 Pro** trong mục **Setting**.`,
          `• Nếu bạn chỉ muốn **ghép khung màn hình LED 3D Toàn Trung** vào điểm chạm trên bức ảnh này, hãy gõ: \`@TaoAnh: Ghép màn hình LED vào điểm chạm\`.`,
        ].join('\n')
      : `Không thể xuất ảnh mới từ AI (${providerResult.errorMessage || imageValidation.errorMessage || 'AI chỉ trả về văn bản hoặc thiếu dữ liệu ảnh hợp lệ'}). Hệ thống không tạo phiên bản lỗi và giữ nguyên bức ảnh hiện tại của bạn trên màn hình.`;

    const updatedChat: DesignChatMessageDto[] = [
      ...existingChat,
      {
        id: `msg-user-${Date.now()}`,
        role: 'user',
        text: input.prompt,
        timestamp: new Date().toISOString(),
        chatMode: 'consultant_free',
      },
      {
        id: `msg-ai-limit-${Date.now() + 1}`,
        role: 'assistant',
        text: explainText,
        timestamp: new Date().toISOString(),
        chatMode: 'consultant_free',
        modelUsed: providerResult.modelUsed || 'Google Gemini API',
        durationSec: Number((providerResult.durationMs / 1000).toFixed(2)),
        cost: '$0.00',
        status: 'failed',
      },
    ];

    const updatedMetadata: StoredMetadata = {
      ...currentMeta,
      placementQuad: effectiveQuad,
      chatMessages: updatedChat,
      designContext,
    };

    await prisma.designRequest.update({
      where: { id: requestId },
      data: {
        installPositionJson: JSON.stringify(updatedMetadata),
        version: { increment: 1 },
      },
    });

    return {
      requestId,
      mode: 'consultant_free' as const,
      freeTierImageBlocked: true,
      errorReason: providerResult.errorMessage || imageValidation.errorMessage,
      versionNumber: existing.assetVersions[0]?.versionNumber ?? 1,
      versionId: existing.assetVersions[0]?.id,
      chatMessages: updatedChat,
      designContext,
    };
  }

  // Post-process banner resolution & typography warning when action is GENERATE_BANNER
  let finalBufferToSave = providerResult.imageBuffer;
  let bannerTypographyWarning: string | null = null;
  let bannerResizeExplanation: string | null = null;
  let curvedDistortionWarning: string | null = null;

  if (dbType === 'banner') {
    const bannerProcessed = processBannerToTargetResolution({
      sourceBuffer: providerResult.imageBuffer,
      sourceMimeType: providerResult.mimeType || 'image/png',
      targetWidthPx: effectiveBannerW,
      targetHeightPx: effectiveBannerH,
      prompt: cleanImagePrompt,
    });
    finalBufferToSave = bannerProcessed.imageBuffer;
    bannerTypographyWarning = bannerProcessed.typographyWarning;
    bannerResizeExplanation = bannerProcessed.resizeExplanation;
  } else if (effectiveStyle === 'curved') {
    curvedDistortionWarning =
      'Cấu hình màn hình LED cong (Curved): Phép biến đổi mặt phẳng 4 góc chỉ là xấp xỉ; cần kiểm tra biến dạng phi phẳng theo bán kính cong thực tế.';
  }

  const savedFile = savePrivateBusinessFile({
    bucket: 'design',
    prefix: `ai-draft-req-${requestId}-v${nextVersionNumber}`,
    fileBuffer: finalBufferToSave,
    declaredMimeType: providerResult.mimeType || 'image/png',
  });

  const aiLog = await recordAiUsageAttempt(prisma, {
    idempotencyKey:
      input.idempotencyKey || `chat-design-run-${requestId}-v${nextVersionNumber}-${Date.now()}`,
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
        sourceOrigin: sourceImageOrigin,
        sourcePhotoId: activePhotoObj?.id ?? null,
        sourceVersionId: sourceVersionObj?.id ?? null,
        compositingMode: effectiveCompositingMode,
        placementQuad: effectiveQuad,
        screenDimensionsMm: {
          widthMm: Math.round(effectiveWidthM * 1000),
          heightMm: Math.round(effectiveHeightM * 1000),
        },
        bannerResolutionPx:
          dbType === 'banner'
            ? { widthPx: effectiveBannerW, heightPx: effectiveBannerH }
            : undefined,
        curvedDistortionWarning,
        bannerResizeExplanation,
        bannerTypographyWarning,
        quality: input.quality,
        providerId: providerResult.provider,
        modelUsed: providerResult.modelUsed,
      }),
      aiUsageLogId: aiLog.log.id,
      uploadedByUserId: actor.id,
      isApprovedFinal: false,
    },
  });

  designContext.fields.activeVersionId = createdVersion.id;

  const extraNotices: string[] = [];
  if (dbType === 'banner') {
    if (bannerResizeExplanation) extraNotices.push(`• 📐 ${bannerResizeExplanation}`);
    if (bannerTypographyWarning) extraNotices.push(`• ${bannerTypographyWarning}`);
  } else {
    extraNotices.push(
      `• 🛡️ Chế độ bảo vệ nền: **${effectiveCompositingMode}** (giữ nguyên toạ độ 4 góc & kích thước ${Math.round(effectiveWidthM * 1000)}×${Math.round(effectiveHeightM * 1000)}mm).`
    );
    if (curvedDistortionWarning) extraNotices.push(`• ⚠️ ${curvedDistortionWarning}`);
  }

  // Append to chat messages
  const existingChat = currentMeta.chatMessages || [];
  const updatedChat: DesignChatMessageDto[] = [
    ...existingChat,
    {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      text: input.prompt,
      timestamp: new Date().toISOString(),
      chatMode: 'image_generator',
    },
    {
      id: `msg-ai-${Date.now() + 1}`,
      role: 'assistant',
      text: [
        `Đã kết xuất phiên bản thiết kế mới (v${nextVersionNumber} · ${providerResult.modelUsed}) và cập nhật lên màn hình chính.`,
        ...extraNotices,
      ].join('\n'),
      timestamp: new Date().toISOString(),
      chatMode: 'image_generator',
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

  const processedKeys = { ...(currentMeta.processedIdempotencyKeys || {}) };
  if (input.idempotencyKey) {
    processedKeys[input.idempotencyKey] = {
      versionId: createdVersion.id,
      versionNumber: createdVersion.versionNumber,
      timestamp: new Date().toISOString(),
    };
  }

  const updatedMetadata: StoredMetadata = {
    ...currentMeta,
    placementQuad: effectiveQuad,
    chatMessages: updatedChat,
    designContext,
    processedIdempotencyKeys: processedKeys,
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
    commandAction: routeDecision.action,
    versionNumber: createdVersion.versionNumber,
    versionId: createdVersion.id,
    downloadUrl: `/api/v1/design/asset/${createdVersion.id}`,
    compositingMode: effectiveCompositingMode,
    sourcePhotoId: activePhotoObj?.id ?? null,
    sourceVersionId: sourceVersionObj?.id ?? null,
    typographyWarning: bannerTypographyWarning,
    resizeExplanation: bannerResizeExplanation,
    curvedDistortionWarning,
    chatMessages: updatedChat,
    designContext,
  };
}

export async function updateDesignProject(
  actor: SessionUserDto,
  requestId: number,
  input: UpdateDesignProjectDto
) {
  await assertCanAccessDesignProject(actor, requestId);

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

  // Keep per-project DesignContext synchronized when user manually updates fields
  if (meta.designContext) {
    if (input.screenWidthM != null) {
      meta.designContext.fields.widthMm = Math.round(input.screenWidthM * 1000);
      meta.designContext.provenance.widthMm = 'user_confirmed';
    }
    if (input.screenHeightM != null) {
      meta.designContext.fields.heightMm = Math.round(input.screenHeightM * 1000);
      meta.designContext.provenance.heightMm = 'user_confirmed';
    }
    if (input.pixelPitch) {
      meta.designContext.fields.pixelPitch = input.pixelPitch;
      meta.designContext.provenance.pixelPitch = 'user_confirmed';
    }
    if (input.installationInfo) {
      meta.designContext.fields.installPosition = input.installationInfo;
      meta.designContext.provenance.installPosition = 'user_confirmed';
    }
    if (input.screenStyle) {
      meta.designContext.fields.screenStyle = input.screenStyle;
      meta.designContext.provenance.screenStyle = 'user_confirmed';
    }
    if (input.placementQuad) {
      meta.designContext.fields.placementQuad = input.placementQuad;
      meta.designContext.provenance.placementQuad = 'user_confirmed';
    }
    if (input.selectedPhotoId) {
      meta.designContext.fields.selectedPhotoId = input.selectedPhotoId;
    }
    meta.designContext.updatedAt = new Date().toISOString();
  }

  let nextSitePhotoUrl = existing.sitePhotoUrl;
  const photos = meta.photos && meta.photos.length > 0 ? [...meta.photos] : [];

  if (input.selectedPhotoId && photos.length > 0) {
    for (const p of photos) {
      p.selected = p.id === input.selectedPhotoId;
      if (p.selected) {
        nextSitePhotoUrl = p.storageObjectKey || p.url;
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
    cabinetModelCode: meta.cabinetModelCode,
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
  await assertCanAccessDesignProject(actor, requestId);

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
  if (meta.designContext) {
    meta.designContext.fields.selectedPhotoId = newPhoto.id;
  }

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
  await assertCanAccessDesignProject(actor, requestId);

  const existing = await prisma.designRequest.findUnique({ where: { id: requestId } });
  if (!existing) throw new Error('Không tìm thấy dự án thiết kế.');

  const meta = parseProjectMetadata(existing.installPositionJson);
  const photos = meta.photos || [];

  const target = photos.find((p) => p.id === photoId);

  // Check if this photo's storage key is referenced by an approved final version
  if (target?.storageObjectKey && existing.finalRenderUrl === target.storageObjectKey) {
    throw new Error('Không thể xóa ảnh đang được phiên bản hoàn thiện chính thức tham chiếu.');
  }

  const updatedPhotos = target ? photos.filter((p) => p.id !== photoId) : [...photos];
  if (updatedPhotos.length > 0 && !updatedPhotos.some((p) => p.selected)) {
    updatedPhotos[0].selected = true;
  }
  const activeAfterDelete = updatedPhotos.find((p) => p.selected) || updatedPhotos[0] || null;
  meta.photos = updatedPhotos;

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      sitePhotoUrl: activeAfterDelete?.storageObjectKey || activeAfterDelete?.url || null,
      installPositionJson: JSON.stringify(meta),
      version: { increment: 1 },
    },
  });

  return { ok: true, remainingCount: updatedPhotos.length };
}

export async function deleteDesignAssetVersion(
  actor: SessionUserDto,
  requestId: number,
  versionId: number
) {
  await assertCanAccessDesignProject(actor, requestId);

  const existing = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: {
      assetVersions: {
        orderBy: { versionNumber: 'asc' },
      },
    },
  });
  if (!existing) throw new Error('Không tìm thấy dự án thiết kế.');

  const targetVer = existing.assetVersions.find((v) => v.id === versionId);
  if (!targetVer) {
    throw new Error('Không tìm thấy phiên bản ảnh AI cần xóa.');
  }

  await prisma.designAssetVersion.delete({
    where: { id: versionId },
  });

  const remaining = existing.assetVersions.filter((v) => v.id !== versionId);
  const latestRemaining = remaining[remaining.length - 1] || null;
  const nextApprovedId =
    existing.approvedVersionId === versionId ? null : existing.approvedVersionId;

  await prisma.designRequest.update({
    where: { id: requestId },
    data: {
      approvedVersionId: nextApprovedId,
      finalRenderUrl: nextApprovedId ? existing.finalRenderUrl : null,
      aiDraftImageUrl: latestRemaining?.storageObjectKey || null,
      designStatus: nextApprovedId
        ? 'completed'
        : latestRemaining
          ? 'ai_drafting'
          : 'pending',
      version: { increment: 1 },
    },
  });

  return {
    ok: true,
    deletedVersionId: versionId,
    remainingCount: remaining.length,
  };
}

export async function deleteDesignProject(
  actor: SessionUserDto,
  requestId: number,
) {
  await assertCanAccessDesignProject(actor, requestId);

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
  await assertCanAccessDesignProject(actor, requestId);

  const existing = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: { assetVersions: true },
  });

  if (!existing) throw new Error('Không tìm thấy yêu cầu thiết kế.');
  if (
    typeof input.expectedVersion === 'number' &&
    input.expectedVersion > 0 &&
    existing.version !== input.expectedVersion
  ) {
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
  await assertCanAccessDesignProject(actor, requestId);

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
  const isTaoAnhCommand = params.note ? /^@/i.test(params.note.trim()) : false;
  const updatedChat: DesignChatMessageDto[] = [
    ...existingChat,
    ...(isTaoAnhCommand && params.note
      ? [
          {
            id: `msg-user-${Date.now()}`,
            role: 'user' as const,
            text: params.note,
            timestamp: new Date().toISOString(),
            chatMode: 'image_generator' as const,
          },
        ]
      : []),
    {
      id: `msg-composite-${Date.now() + 1}`,
      role: 'assistant',
      text: isTaoAnhCommand
        ? `Đã thực thi lệnh **${DAO_TAO_ANH_POSTER_REGEX.test(params.note || '') ? '@TaoAnhPoster' : '@TaoAnh'}** và xuất bản thiết kế mới **v${nextVersionNumber}** trực tiếp trên ảnh công trình.`
        : `Đã kết xuất & lưu bản ghép phối cảnh 3D thực tế (v${nextVersionNumber}) vào thư viện Phiên bản AI.`,
      timestamp: new Date().toISOString(),
      chatMode: 'image_generator',
      versionNumber: nextVersionNumber,
      versionId: createdVersion.id,
      providerId: 'local_sandbox',
      modelUsed: DAO_TAO_ANH_POSTER_REGEX.test(params.note || '')
        ? 'AI Tạo Poster LED (@TaoAnhPoster)'
        : 'AI Phối Cảnh 3D LED (@TaoAnh)',
      durationSec: 0.8,
      cost: isTaoAnhCommand ? '$0.020' : '$0.000',
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
  await assertCanAccessDesignProject(actor, requestId);

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
