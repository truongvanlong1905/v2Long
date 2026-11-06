import {
  prisma,
  ConcurrencyConflictError,
  ingestLeadWithTrackingIdempotent,
  parseBigIntString,
  transitionLeadWithVersion,
} from '@toantrung/database';
import {
  hasBaPermission,
  toMonetaryAmountDto,
  type ContactChannel,
  type CreateManualLeadDto,
  type LeadActivityDto,
  type LeadAttachmentDto,
  type LeadItemDto,
  type MarkLeadSpamDto,
  type PipelineStatus,
  type PriceCheckAlertDto,
  type ProductCatalogDto,
  type ReassignLeadDto,
  type SalesAssigneeOptionDto,
  type SessionUserDto,
  type TransitionPipelineDto,
  type UpdateLeadDetailsDto,
} from '@toantrung/contracts';
import { savePrivateBusinessFile } from '../../core/storage/private-files.service';

export function normalizeVietnamPhone(raw: string): {
  normalizedPhone: string;
  isUnstandardized: boolean;
} {
  const cleaned = (raw || '')
    .trim()
    .replace(/[\s.\-()]/g, '')
    .replace(/^\+84/, '0')
    .replace(/^84(?=\d{9,10}$)/, '0');
  const isValid = /^0[235789]\d{8,9}$/.test(cleaned);
  return {
    normalizedPhone: isValid ? cleaned : raw.trim(),
    isUnstandardized: !isValid,
  };
}

export function normalizeLookupText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\b(cong ty|cty|tnhh|co phan|cp|tap doan|doanh nghiep|chi nhanh)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildNormalizedLookupKey(
  companyName?: string | null,
  projectName?: string | null,
): string | null {
  const c = normalizeLookupText(companyName);
  const p = normalizeLookupText(projectName);
  if (!c && !p) return null;
  return `${c}|${p}`;
}

export function shouldAnonymizeLeadForRole(roleCode: SessionUserDto['roleCode']): boolean {
  return roleCode === 'MKT_STAFF' || roleCode === 'MKT_LEAD' || roleCode === 'ADS';
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return '***';
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function mapProductCategory(group: string): ProductCatalogDto['category'] {
  if (group === 'led_screen') return 'MAN_HINH_LED';
  if (group === 'electronic_board') return 'BANG_DIEN_TU';
  return 'KHAC';
}

export async function generateNextLeadCode(): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const count = await prisma.lead.count();
  const seq = String(count + 1).padStart(4, '0');
  const rand = String(Math.floor(10 + Math.random() * 89));
  return `TT-${y}${m}${d}-${seq}${rand}`;
}

export async function inspectDuplicateAndPriceCheck(params: {
  phone: string;
  email?: string | null;
  companyName?: string | null;
  projectName?: string | null;
  excludeLeadId?: number;
}) {
  const { normalizedPhone } = normalizeVietnamPhone(params.phone);
  const lookupKey = buildNormalizedLookupKey(params.companyName, params.projectName);
  const companyNorm = normalizeLookupText(params.companyName);

  const orConditions: Array<Record<string, unknown>> = [{ phone: normalizedPhone }];
  if (params.email && params.email.trim()) {
    orConditions.push({ email: params.email.trim().toLowerCase() });
  }
  if (lookupKey) {
    orConditions.push({ normalizedLookupKey: lookupKey });
  }

  const candidateLeads = await prisma.lead.findMany({
    where: {
      ...(params.excludeLeadId ? { id: { not: params.excludeLeadId } } : {}),
      OR: orConditions,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  let isDuplicateAlert = false;
  let duplicateStatus = 'none';
  let matchedOldLead: (typeof candidateLeads)[number] | null = null;

  if (candidateLeads.length > 0) {
    // Ưu tiên Lead cũ đang ở 'new_lead' để tô đỏ cảnh báo theo UC01 4.3
    const activeNewLead = candidateLeads.find((l) => l.pipelineStatus === 'new_lead' && !l.isSpam);
    matchedOldLead = activeNewLead || candidateLeads[0];
    isDuplicateAlert = true;
    duplicateStatus = activeNewLead ? 'duplicate_red' : 'has_old_lead';
  }

  const priceAlerts = await prisma.priceCheckAlert.findMany({
    where: {
      status: 'active',
      OR: [
        { phone: normalizedPhone },
        ...(companyNorm ? [{ normalizedLookupKey: { contains: companyNorm } }] : []),
      ],
    },
    take: 1,
  });

  return {
    normalizedPhone,
    lookupKey,
    isDuplicateAlert,
    duplicateStatus,
    matchedOldLead,
    isSuspectedPriceCheck: priceAlerts.length > 0,
  };
}

export async function selectAutoAssignedSales(preferredOldSalesId?: number | null): Promise<{
  assignedSalesId: number | null;
  needsManagerAttention: boolean;
}> {
  if (preferredOldSalesId) {
    const existingSales = await prisma.user.findFirst({
      where: { id: preferredOldSalesId, isActive: true, deletedAt: null },
    });
    if (existingSales) {
      return { assignedSalesId: existingSales.id, needsManagerAttention: false };
    }
  }

  const onlineSales = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      isOnline: true,
      isReceivingLeads: true,
      role: { roleCode: { in: ['SALES', 'SALES_LEAD'] } },
    },
    include: {
      assignedLeads: {
        where: {
          isSpam: false,
          pipelineStatus: { in: ['new_lead', 'quoting', 'quote_sent'] },
        },
        select: { id: true },
      },
    },
  });

  if (onlineSales.length === 0) {
    return { assignedSalesId: null, needsManagerAttention: true };
  }

  onlineSales.sort((a, b) => a.assignedLeads.length - b.assignedLeads.length || a.id - b.id);
  return {
    assignedSalesId: onlineSales[0].id,
    needsManagerAttention: false,
  };
}

export async function listProductsAndSalesOptions(currentUser: SessionUserDto) {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });

  const salesUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { roleCode: { in: ['SALES', 'SALES_LEAD'] } },
    },
    include: {
      assignedLeads: {
        where: {
          isSpam: false,
          pipelineStatus: { in: ['new_lead', 'quoting', 'quote_sent'] },
        },
        select: { id: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  const senderEntry = salesUsers.find((u) => u.id === currentUser.id);
  const senderActiveCount = senderEntry ? senderEntry.assignedLeads.length : 999;

  const salesOptions: SalesAssigneeOptionDto[] = salesUsers.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    isOnline: u.isOnline,
    isReceivingLeads: u.isReceivingLeads,
    activeLeadCount: u.assignedLeads.length,
    // UC02 5.2: Khi lý do chuyển là "Bận", người nhận phải online, đang nhận lead và có số Lead đang xử lý ít hơn người chuyển
    eligibleForBusyTransfer:
      u.id !== currentUser.id &&
      u.isOnline &&
      u.isReceivingLeads &&
      u.assignedLeads.length < senderActiveCount,
  }));

  const productDtos: ProductCatalogDto[] = products.map((p) => ({
    id: p.id,
    productCode: p.productCode,
    productName: p.productName,
    category: mapProductCategory(p.categoryGroup),
    isActive: p.isActive,
  }));

  return { products: productDtos, salesOptions };
}

export async function listLeadsForUser(
  user: SessionUserDto,
  filters?: {
    status?: string;
    search?: string;
    includeSpam?: boolean;
    limit?: number;
    cursorId?: number;
  },
): Promise<{
  leads: LeadItemDto[];
  products: ProductCatalogDto[];
  salesOptions: SalesAssigneeOptionDto[];
  priceCheckAlerts: PriceCheckAlertDto[];
}> {
  const canViewAll = hasBaPermission(user.roleCode, 'LEAD_VIEW_ALL');
  const isAnonymized = shouldAnonymizeLeadForRole(user.roleCode);

  const whereClause: Record<string, unknown> = {};
  if (!canViewAll) {
    if (user.roleCode === 'DESIGNER') {
      // Designer chỉ xem Lead có yêu cầu phối cảnh 3D/2D hoặc dòng màn hình LED (PERMISSIONS.md)
      whereClause.OR = [
        { designRequests: { some: {} } },
        { leadProducts: { some: { product: { categoryGroup: 'led_screen' } } } },
      ];
    } else {
      whereClause.OR = [{ assignedSalesId: user.id }, { createdByUserId: user.id }];
    }
  }

  if (filters?.status && filters.status !== 'all') {
    whereClause.pipelineStatus = filters.status;
  }
  if (!filters?.includeSpam) {
    whereClause.isSpam = false;
  }
  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim();
    whereClause.AND = [
      {
        OR: [
          { leadCode: { contains: q } },
          { companyName: { contains: q } },
          { projectName: { contains: q } },
          ...(isAnonymized ? [] : [{ phone: { contains: q } }, { contactName: { contains: q } }]),
        ],
      },
    ];
  }

  const takeLimit = Math.min(Math.max(filters?.limit ?? 200, 1), 500);

  const [rows, { products, salesOptions }, alertRows] = await Promise.all([
    prisma.lead.findMany({
      where: whereClause,
      ...(filters?.cursorId ? { cursor: { id: filters.cursorId }, skip: 1 } : {}),
      take: takeLimit,
      include: {
        assignedSales: { select: { id: true, fullName: true } },
        createdBy: { select: { id: true, fullName: true } },
        receivedBy: { select: { id: true, fullName: true } },
        matchedOldLead: { select: { id: true, leadCode: true, pipelineStatus: true } },
        leadProducts: { include: { product: true } },
        tracking: { include: { campaign: { select: { id: true, campaignCode: true, campaignName: true } } } },
        attachments: {
          include: { uploadedBy: { select: { id: true, fullName: true } } },
          orderBy: { uploadedAt: 'desc' },
          take: 15,
        },
        activities: {
          include: {
            actionBy: { select: { fullName: true } },
            fromSales: { select: { fullName: true } },
            toSales: { select: { fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 15,
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    listProductsAndSalesOptions(user),
    prisma.priceCheckAlert.findMany({
      where: { status: 'active' },
      include: {
        lead: { select: { leadCode: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);

  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  const leads: LeadItemDto[] = rows.map((r) => {
    const isOverdue7Days =
      r.pipelineStatus === 'quote_sent' &&
      !r.quoteRespondedAt &&
      r.firstQuoteSentAt !== null &&
      nowMs - r.firstQuoteSentAt.getTime() >= sevenDaysMs;

    const customNotes = r.leadProducts
      .map((lp) => lp.customProductName || lp.requestedDimension)
      .filter(Boolean)
      .join('; ');

    const spamStatus: LeadItemDto['spamStatus'] = !r.isSpam
      ? 'NONE'
      : r.spamAdsExclusionStatus === 'pending_confirm'
        ? 'PENDING_REVIEW'
        : 'CONFIRMED';

    const duplicateType: LeadItemDto['duplicateType'] = !r.isDuplicateAlert
      ? 'NONE'
      : r.duplicateStatus === 'duplicate_red'
        ? 'ACTIVE_RED'
        : 'PRIOR_LEAD';

    const slaStatus: LeadItemDto['slaStatus'] = r.needsManagerAttention
      ? 'ESCALATED'
      : !r.receivedAt && r.pipelineStatus === 'new_lead'
        ? 'WARN_UNRECEIVED'
        : isOverdue7Days
          ? 'WARN_STALE'
          : 'NORMAL';

    const attachments: LeadAttachmentDto[] = isAnonymized
      ? []
      : r.attachments.map((att) => ({
          id: att.id,
          leadId: att.leadId,
          fileName: att.fileName,
          fileType: att.attachmentType === 'site_photo' ? 'site_photo' : 'cad_drawing',
          downloadUrl: `/api/v1/leads/attachments/${att.id}`,
          uploadedById: att.uploadedById,
          uploadedByName: att.uploadedBy.fullName,
          createdAt: att.uploadedAt.toISOString(),
        }));

    const activities: LeadActivityDto[] = r.activities.map((act) => ({
      id: act.id,
      leadId: act.leadId,
      actionType: act.actionType,
      actorType: (act.actorType.toUpperCase() as 'USER' | 'WEBHOOK' | 'SYSTEM') || 'USER',
      actorName: act.actionBy?.fullName || act.actorRef || 'Hệ thống tự động',
      fromStatus: act.oldStatus,
      toStatus: act.newStatus,
      fromSalesName: act.fromSales?.fullName || null,
      toSalesName: act.toSales?.fullName || null,
      reason: act.transferReason,
      noteContent: isAnonymized ? '[Nội dung chi tiết ẩn danh theo UC01]' : act.note,
      createdAt: act.createdAt.toISOString(),
    }));

    return {
      id: r.id,
      leadCode: r.leadCode,
      version: r.version,
      contactName: isAnonymized ? 'Khách hàng ẩn danh (UC01)' : r.contactName,
      companyName: r.companyName,
      projectName: r.projectName,
      phone: isAnonymized ? maskPhone(r.phone) : r.phone,
      email: isAnonymized ? maskEmail(r.email) : r.email,
      isPhoneNormalized: !r.isPhoneUnstandardized,
      contactChannel: (r.contactChannel as ContactChannel) || 'hotline',
      selfReportedSource: r.selfReportedSource,
      areaType: r.areaType === 'tphcm' ? 'hcm' : r.areaType === 'other_province' ? 'other_province' : null,
      hcmDistrict: r.district,
      province: r.province,
      installationAddress: isAnonymized ? 'Ẩn địa chỉ chi tiết (UC01)' : r.installationAddress,
      customProductNote: customNotes || null,
      assignedSalesId: r.assignedSalesId,
      assignedSalesName: r.assignedSales?.fullName || null,
      receivedConfirmedAt: r.receivedAt ? r.receivedAt.toISOString() : null,
      receivedConfirmedByName: r.receivedBy?.fullName || null,
      pipelineStatus: (r.pipelineStatus as PipelineStatus) || 'new_lead',
      lostReason: r.lostReason,
      reopenReason: null,
      quoteSentAt: r.firstQuoteSentAt ? r.firstQuoteSentAt.toISOString() : null,
      quoteRespondedAt: r.quoteRespondedAt ? r.quoteRespondedAt.toISOString() : null,
      isQuoteOverdue7Days: isOverdue7Days,
      quoteValue: isAnonymized ? null : toMonetaryAmountDto(r.quoteValueVnd, 'VND', 'unit'),
      dealValue: isAnonymized ? null : toMonetaryAmountDto(r.dealValueVnd, 'VND', 'unit'),
      isDuplicateAlert: r.isDuplicateAlert,
      duplicateType,
      duplicateOfLeadId: r.matchedOldLeadId,
      duplicateOfLeadCode: r.matchedOldLead?.leadCode || null,
      duplicateOfLeadStatus: r.matchedOldLead?.pipelineStatus || null,
      isRepeatLead: r.tracking?.isRepeatLead ?? false,
      isPriceCheckSuspect: r.isSuspectedPriceCheck,
      spamStatus,
      spamReason: r.spamReason,
      slaStatus,
      initialNote: isAnonymized ? null : r.activities[r.activities.length - 1]?.note || null,
      createdByActorType:
        (r.createdByActorType.toUpperCase() as 'USER' | 'WEBHOOK' | 'SYSTEM') || 'USER',
      createdByName: r.createdBy?.fullName || r.createdByActorRef || 'Hệ thống Webhook',
      contactedAt: r.contactedAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      isAnonymized,
      products: r.leadProducts.map((lp) => ({
        id: lp.product.id,
        productCode: lp.product.productCode,
        productName: lp.product.productName,
        category: mapProductCategory(lp.product.categoryGroup),
        isActive: lp.product.isActive,
      })),
      tracking: r.tracking
        ? {
            marketingSource: r.tracking.marketingSource,
            attributionMethod: r.tracking.sourceResolutionMethod,
            utmSource: r.tracking.utmSource,
            utmMedium: r.tracking.utmMedium,
            utmCampaign: r.tracking.utmCampaign,
            campaignCode: r.tracking.campaign?.campaignCode || null,
            campaignName: r.tracking.campaignName || r.tracking.campaign?.campaignName || null,
            gclid: r.tracking.gclid,
            landingPageUrl: r.tracking.landingPageUrl,
            deviceType: r.tracking.deviceType,
            isUnmatchedUtm: r.tracking.isUnmatchedUtm,
            isUnknownSource: r.tracking.isUnknownSource,
            isUnknownCampaign: r.tracking.isUnknownCampaign,
            utmGclidMismatch: r.tracking.isUtmGclidMismatch,
          }
        : null,
      attachmentsCount: r.attachments.length,
      attachments,
      activities,
    };
  });

  const priceCheckAlerts: PriceCheckAlertDto[] = alertRows.map((a) => ({
    id: a.id,
    leadId: a.leadId,
    leadCode: a.lead.leadCode,
    phone: isAnonymized ? maskPhone(a.phone) : a.phone,
    companyName: a.companyName,
    reasonEvidence: a.reason,
    chatScreenshotDownloadUrl:
      a.chatScreenshotUrl && !isAnonymized
        ? `/api/v1/leads/price-check-alerts?downloadAlertId=${a.id}`
        : null,
    status: a.status === 'active' ? 'ACTIVE' : 'DISMISSED',
    reportedById: a.createdByUserId,
    reportedByName: a.createdBy.fullName,
    createdAt: a.createdAt.toISOString(),
  }));

  return { leads, products, salesOptions, priceCheckAlerts };
}

export async function createManualLead(actor: SessionUserDto, input: CreateManualLeadDto) {
  const { normalizedPhone, isUnstandardized } = normalizeVietnamPhone(input.phone);
  const dupCheck = await inspectDuplicateAndPriceCheck({
    phone: normalizedPhone,
    email: input.email,
    companyName: input.companyName,
    projectName: input.projectName,
  });

  const leadCode = await generateNextLeadCode();
  const targetSalesId = input.reassignToSalesId || actor.id;

  if (input.reassignToSalesId && input.reassignToSalesId !== actor.id && !input.reassignReason) {
    throw new Error('Khi tick chọn "Chuyển kinh doanh khác", bắt buộc chọn Lý do chuyển (UC02 5.2).');
  }

  const ingested = await ingestLeadWithTrackingIdempotent(prisma, {
    intakeSourceProvider: 'manual',
    intakeSourceAccountKey: 'internal',
    externalSubmissionId: null,
    leadCode,
    contactChannel: input.contactChannel,
    phone: normalizedPhone,
    email: input.email || null,
    contactName: input.contactName || null,
    companyName: input.companyName || null,
    projectName: input.projectName || null,
    areaType: input.areaType === 'hcm' ? 'tphcm' : input.areaType === 'other_province' ? 'other_province' : null,
    province: input.areaType === 'hcm' ? 'TP. Hồ Chí Minh' : input.province || null,
    district: input.hcmDistrict || null,
    installationAddress: input.installationAddress || null,
    selfReportedSource: input.selfReportedSource || null,
    createdByUserId: actor.id,
    assignedSalesId: targetSalesId,
    marketingSource: 'Nhập tay',
    sourceResolutionMethod: 'manual',
  });

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: ingested.lead.id },
      data: {
        isPhoneUnstandardized: isUnstandardized,
        normalizedLookupKey: dupCheck.lookupKey,
        isDuplicateAlert: dupCheck.isDuplicateAlert,
        duplicateStatus: dupCheck.duplicateStatus,
        matchedOldLeadId: dupCheck.matchedOldLead?.id ?? null,
        isSuspectedPriceCheck: dupCheck.isSuspectedPriceCheck,
        contactedAt: input.contactedAt ? new Date(input.contactedAt) : new Date(),
      },
    });

    if (dupCheck.matchedOldLead) {
      await tx.marketingTracking.update({
        where: { leadId: ingested.lead.id },
        data: { isRepeatLead: true },
      });
    }

    if (input.productIds && input.productIds.length > 0) {
      for (const productId of input.productIds) {
        await tx.leadProduct.create({
          data: {
            leadId: ingested.lead.id,
            productId,
            customProductName: input.customProductNote || null,
            requestedDimension: input.customProductNote || null,
          },
        });
      }
    }

    if (input.initialNote && input.initialNote.trim()) {
      await tx.leadActivity.create({
        data: {
          leadId: ingested.lead.id,
          actionType: 'add_note',
          actionById: actor.id,
          actorType: 'user',
          note: input.initialNote.trim(),
        },
      });
    }

    if (input.reassignToSalesId && input.reassignToSalesId !== actor.id) {
      await tx.leadActivity.create({
        data: {
          leadId: ingested.lead.id,
          actionType: 'reassign_sales',
          fromSalesId: actor.id,
          toSalesId: input.reassignToSalesId,
          transferReason: input.reassignReason || 'Chuyển ngay khi tạo mới',
          actionById: actor.id,
          actorType: 'user',
          note: `Chuyển kinh doanh khi tạo Lead: ${input.reassignReason}`,
        },
      });
    }
  });

  return ingested.lead;
}

export function assertLeadMutationScope(
  actor: SessionUserDto,
  existing: { assignedSalesId: number | null; createdByUserId: number | null },
) {
  if (
    existing.assignedSalesId !== actor.id &&
    existing.createdByUserId !== actor.id &&
    !hasBaPermission(actor.roleCode, 'LEAD_VIEW_ALL')
  ) {
    throw new Error('Bạn chỉ được phép thao tác trên hồ sơ Lead do chính mình phụ trách.');
  }
}

export async function confirmReceiveLead(
  actor: SessionUserDto,
  leadId: number,
  expectedVersion: number,
) {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error('Không tìm thấy hồ sơ Lead.');
  assertLeadMutationScope(actor, existing);

  return transitionLeadWithVersion(prisma, {
    leadId,
    expectedVersion,
    patch: {
      receivedByUserId: actor.id,
      receivedAt: new Date(),
    },
    activity: {
      actionType: 'confirm_receive',
      actionById: actor.id,
      actorType: 'user',
      note: `${actor.fullName} đã xác nhận tiếp nhận hồ sơ Lead (UC01 4.4).`,
    },
  });
}

export async function updateLeadInformation(
  actor: SessionUserDto,
  leadId: number,
  input: UpdateLeadDetailsDto,
) {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error('Không tìm thấy hồ sơ Lead.');
  assertLeadMutationScope(actor, existing);

  const phoneToUse = input.phone ? input.phone : existing.phone;
  const { normalizedPhone, isUnstandardized } = normalizeVietnamPhone(phoneToUse);
  const companyToUse = input.companyName !== undefined ? input.companyName : existing.companyName;
  const projectToUse = input.projectName !== undefined ? input.projectName : existing.projectName;
  const emailToUse = input.email !== undefined ? input.email : existing.email;

  const dupCheck = await inspectDuplicateAndPriceCheck({
    phone: normalizedPhone,
    email: emailToUse,
    companyName: companyToUse,
    projectName: projectToUse,
    excludeLeadId: leadId,
  });

  return prisma.$transaction(async (tx) => {
    const updated = await tx.lead.updateMany({
      where: { id: leadId, version: input.expectedVersion },
      data: {
        phone: normalizedPhone,
        isPhoneUnstandardized: isUnstandardized,
        contactName: input.contactName !== undefined ? input.contactName : existing.contactName,
        companyName: companyToUse,
        projectName: projectToUse,
        normalizedLookupKey: dupCheck.lookupKey,
        email: emailToUse || null,
        selfReportedSource:
          input.selfReportedSource !== undefined
            ? input.selfReportedSource
            : existing.selfReportedSource,
        areaType:
          input.areaType === 'hcm'
            ? 'tphcm'
            : input.areaType === 'other_province'
              ? 'other_province'
              : existing.areaType,
        province:
          input.areaType === 'hcm'
            ? 'TP. Hồ Chí Minh'
            : input.province !== undefined
              ? input.province
              : existing.province,
        district: input.hcmDistrict !== undefined ? input.hcmDistrict : existing.district,
        installationAddress:
          input.installationAddress !== undefined
            ? input.installationAddress
            : existing.installationAddress,
        isDuplicateAlert: dupCheck.isDuplicateAlert,
        duplicateStatus: dupCheck.duplicateStatus,
        matchedOldLeadId: dupCheck.matchedOldLead?.id ?? null,
        isSuspectedPriceCheck: dupCheck.isSuspectedPriceCheck,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new ConcurrencyConflictError('Lead', leadId, input.expectedVersion);
    }

    if (input.productIds) {
      await tx.leadProduct.deleteMany({ where: { leadId } });
      for (const productId of input.productIds) {
        await tx.leadProduct.create({
          data: {
            leadId,
            productId,
            customProductName: input.customProductNote || null,
            requestedDimension: input.customProductNote || null,
          },
        });
      }
    }

    await tx.leadActivity.create({
      data: {
        leadId,
        actionType: 'update_info',
        actionById: actor.id,
        actorType: 'user',
        oldValueJson: JSON.stringify({
          companyName: existing.companyName,
          projectName: existing.projectName,
          phone: existing.phone,
        }),
        newValueJson: JSON.stringify({
          companyName: companyToUse,
          projectName: projectToUse,
          phone: normalizedPhone,
        }),
        note: input.note || 'Cập nhật thông tin hồ sơ Lead & kiểm tra trùng lại.',
      },
    });
  });
}

export async function transitionLeadPipeline(
  actor: SessionUserDto,
  leadId: number,
  input: TransitionPipelineDto,
) {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error('Không tìm thấy hồ sơ Lead.');
  assertLeadMutationScope(actor, existing);

  if (input.toStatus === 'lost' && (!input.reason || !input.reason.trim())) {
    throw new Error('Bắt buộc chọn hoặc nhập lý do khi chuyển trạng thái sang "Thất bại" (UC02 5.1).');
  }

  const isClosed = existing.pipelineStatus === 'won' || existing.pipelineStatus === 'lost';
  const isReopening = isClosed && input.toStatus !== existing.pipelineStatus;
  if (isReopening) {
    if (!input.reason || !input.reason.trim()) {
      throw new Error('Bắt buộc nhập lý do khi mở lại Lead đã đóng (UC02 2a).');
    }
    if (existing.reopenCount >= 1 && actor.roleCode !== 'ADMIN' && actor.roleCode !== 'SALES_LEAD') {
      throw new Error('Hồ sơ này đã từng được mở lại 1 lần; vui lòng tạo Lead mới hoặc liên hệ Quản lý.');
    }
  }

  const now = new Date();
  const quoteValueVnd =
    input.quoteValueVndString !== undefined
      ? parseBigIntString(input.quoteValueVndString)
      : existing.quoteValueVnd;
  const dealValueVnd =
    input.dealValueVndString !== undefined
      ? parseBigIntString(input.dealValueVndString)
      : existing.dealValueVnd;

  return transitionLeadWithVersion(prisma, {
    leadId,
    expectedVersion: input.expectedVersion,
    patch: {
      pipelineStatus: input.toStatus,
      lostReason: input.toStatus === 'lost' ? input.reason?.trim() || null : existing.lostReason,
      quoteValueVnd,
      dealValueVnd,
      firstQuoteSentAt:
        input.toStatus === 'quote_sent' && !existing.firstQuoteSentAt
          ? now
          : existing.firstQuoteSentAt,
      quoteRespondedAt: input.markQuoteResponded ? now : existing.quoteRespondedAt,
      reopenCount: isReopening ? existing.reopenCount + 1 : existing.reopenCount,
      closedAt: input.toStatus === 'won' || input.toStatus === 'lost' ? now : null,
    },
    activity: {
      actionType: isReopening ? 'reopen_lead' : 'status_change',
      oldStatus: existing.pipelineStatus,
      newStatus: input.toStatus,
      transferReason: input.reason || null,
      actionById: actor.id,
      actorType: 'user',
      note:
        input.noteContent ||
        (input.reason
          ? `Chuyển trạng thái sang ${input.toStatus} · Lý do: ${input.reason}`
          : `Chuyển trạng thái Pipeline từ ${existing.pipelineStatus} sang ${input.toStatus}`),
    },
  });
}

export async function reassignLeadSales(
  actor: SessionUserDto,
  leadId: number,
  input: ReassignLeadDto,
) {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error('Không tìm thấy hồ sơ Lead.');
  assertLeadMutationScope(actor, existing);

  const targetSales = await prisma.user.findFirst({
    where: {
      id: input.toSalesId,
      isActive: true,
      deletedAt: null,
      role: { roleCode: { in: ['SALES', 'SALES_LEAD'] } },
    },
    include: {
      assignedLeads: {
        where: {
          isSpam: false,
          pipelineStatus: { in: ['new_lead', 'quoting', 'quote_sent'] },
        },
        select: { id: true },
      },
    },
  });

  if (!targetSales) {
    throw new Error('Nhân viên kinh doanh nhận bàn giao không tồn tại hoặc đã khóa.');
  }

  // UC02 5.2: Khi lý do là "Bận", kiểm tra lại điều kiện trực tuyến và tải việc ngay lúc xác nhận
  if (input.reasonCategory === 'Bận') {
    if (!targetSales.isOnline || !targetSales.isReceivingLeads) {
      throw new Error(
        'Khi lý do chuyển là "Bận", người nhận bắt buộc phải đang trực tuyến và bật công tắc Đang nhận Lead (UC02 5.2).',
      );
    }
    const senderActiveCount = await prisma.lead.count({
      where: {
        assignedSalesId: existing.assignedSalesId ?? actor.id,
        isSpam: false,
        pipelineStatus: { in: ['new_lead', 'quoting', 'quote_sent'] },
      },
    });
    if (targetSales.assignedLeads.length >= senderActiveCount) {
      throw new Error(
        `Người nhận hiện đang xử lý ${targetSales.assignedLeads.length} Lead (không ít hơn người chuyển: ${senderActiveCount} Lead). Không thỏa điều kiện chuyển do "Bận" (UC02 5.2).`,
      );
    }
  }

  const fullReason = input.reasonDetail
    ? `${input.reasonCategory}: ${input.reasonDetail}`
    : input.reasonCategory;

  const result = await transitionLeadWithVersion(prisma, {
    leadId,
    expectedVersion: input.expectedVersion,
    patch: {
      assignedSalesId: targetSales.id,
    },
    activity: {
      actionType: 'reassign_sales',
      fromSalesId: existing.assignedSalesId,
      toSalesId: targetSales.id,
      transferReason: fullReason,
      oldStatus: existing.pipelineStatus,
      newStatus: existing.pipelineStatus,
      actionById: actor.id,
      actorType: 'user',
      note: `Chuyển giao Lead cho ${targetSales.fullName} · Lý do: ${fullReason}`,
    },
  });

  await prisma.notification.create({
    data: {
      userId: targetSales.id,
      title: `Nhận bàn giao Lead ${existing.leadCode}`,
      summary: `${actor.fullName} vừa chuyển giao Lead ${existing.companyName || existing.phone} cho bạn (${fullReason}).`,
      category: 'Lead',
      actionLabel: 'Mở Quản lý Lead',
      actionUrl: '/leads',
      requiredPermission: 'LEAD_VIEW_OWN',
    },
  });

  return result;
}

export async function markLeadSpam(
  actor: SessionUserDto,
  leadId: number,
  input: MarkLeadSpamDto,
) {
  const existing = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!existing) throw new Error('Không tìm thấy hồ sơ Lead.');
  assertLeadMutationScope(actor, existing);

  const isAutoExcludedReason =
    input.spamReason === 'SĐT không tồn tại' ||
    input.spamReason === 'Nhầm máy' ||
    input.spamReason === 'Sai số';

  return transitionLeadWithVersion(prisma, {
    leadId,
    expectedVersion: input.expectedVersion,
    patch: {
      isSpam: true,
      spamReason: input.spamReason,
      spamAdsExclusionStatus: isAutoExcludedReason ? 'auto_excluded' : 'pending_confirm',
    },
    activity: {
      actionType: 'mark_spam',
      oldStatus: existing.pipelineStatus,
      newStatus: existing.pipelineStatus,
      transferReason: input.spamReason,
      actionById: actor.id,
      actorType: 'user',
      note: `Đánh dấu Spam (${input.spamReason}) · Trạng thái loại trừ Ads: ${
        isAutoExcludedReason ? 'Tự động loại khỏi L2 & L3' : 'Chờ xác nhận (loại khỏi L2, giữ ở L3)'
      }${input.noteContent ? ` · ${input.noteContent}` : ''}`,
    },
  });
}

export async function uploadLeadAttachment(params: {
  actor: SessionUserDto;
  leadId: number;
  attachmentType: 'site_photo' | 'customer_drawing_doc';
  folderPath?: string | null;
  fileName: string;
  fileBuffer: Buffer;
  declaredMimeType: string;
}) {
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) throw new Error('Không tìm thấy hồ sơ Lead.');
  assertLeadMutationScope(params.actor, lead);

  const saved = savePrivateBusinessFile({
    bucket: 'leads',
    prefix: `lead-${params.leadId}-${params.attachmentType}`,
    fileBuffer: params.fileBuffer,
    declaredMimeType: params.declaredMimeType,
    originalFileName: params.fileName,
    allowPdfOrDoc: params.attachmentType === 'customer_drawing_doc',
  });

  const attachment = await prisma.leadAttachment.create({
    data: {
      leadId: params.leadId,
      attachmentType: params.attachmentType,
      folderPath: params.folderPath || '/ho-so-cong-trinh',
      fileName: params.fileName,
      fileUrl: saved.storageObjectKey,
      fileSizeKb: Math.max(1, Math.round(saved.fileSizeBytes / 1024)),
      uploadedById: params.actor.id,
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId: params.leadId,
      actionType: 'upload_attachment',
      actionById: params.actor.id,
      actorType: 'user',
      note: `Tải lên tệp đính kèm "${params.fileName}" (${params.attachmentType})`,
    },
  });

  return attachment;
}

export async function createCompetitorPriceCheckAlert(params: {
  actor: SessionUserDto;
  leadId: number;
  reasonEvidence: string;
  screenshotBuffer?: Buffer | null;
  screenshotMimeType?: string | null;
}) {
  const lead = await prisma.lead.findUnique({ where: { id: params.leadId } });
  if (!lead) throw new Error('Không tìm thấy hồ sơ Lead.');
  assertLeadMutationScope(params.actor, lead);

  let chatScreenshotUrl: string | null = null;
  if (params.screenshotBuffer && params.screenshotBuffer.length > 0) {
    const saved = savePrivateBusinessFile({
      bucket: 'leads',
      prefix: `pricecheck-${params.leadId}`,
      fileBuffer: params.screenshotBuffer,
      declaredMimeType: params.screenshotMimeType || 'image/png',
    });
    chatScreenshotUrl = saved.storageObjectKey;
  }

  const companyNorm = normalizeLookupText(lead.companyName);

  const alert = await prisma.$transaction(async (tx) => {
    const created = await tx.priceCheckAlert.create({
      data: {
        leadId: lead.id,
        phone: lead.phone,
        companyName: lead.companyName,
        normalizedLookupKey: companyNorm || null,
        reason: params.reasonEvidence,
        chatScreenshotUrl,
        status: 'active',
        createdByUserId: params.actor.id,
      },
    });

    await tx.lead.updateMany({
      where: {
        OR: [
          { phone: lead.phone },
          ...(companyNorm ? [{ normalizedLookupKey: { contains: companyNorm } }] : []),
        ],
      },
      data: {
        isSuspectedPriceCheck: true,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        actionType: 'price_check_alert',
        actionById: params.actor.id,
        actorType: 'user',
        note: `Đăng cảnh báo nghi đối thủ dò giá: ${params.reasonEvidence}`,
      },
    });

    return created;
  });

  // Gửi thông báo cho toàn bộ NVKD, Marketing và Ads theo UC01 4.5
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      role: { roleCode: { in: ['SALES', 'SALES_LEAD', 'MKT_STAFF', 'MKT_LEAD', 'ADS'] } },
    },
    select: { id: true },
  });

  if (recipients.length > 0) {
    await prisma.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        title: `Cảnh báo nghi dò giá: ${lead.companyName || lead.leadCode}`,
        summary: `${params.actor.fullName} vừa đăng cảnh báo dò giá cho SĐT ${maskPhone(lead.phone)}: ${params.reasonEvidence}`,
        category: 'Cảnh báo dò giá',
        actionLabel: 'Xem danh sách Lead',
        actionUrl: '/leads',
        requiredPermission: 'LEAD_VIEW_OWN',
      })),
    });
  }

  return alert;
}

/**
 * M05 -> M01 Service Boundary (UC06 bước 7):
 * Ghi lịch sử hoạt động Lead và gửi thông báo cho NVKD khi bản phối cảnh 3D hoàn thiện.
 */
export async function notifyLeadSalesOnDesignCompleted(params: {
  leadId: number;
  designRequestId: number;
  versionNumber: number;
  actor: SessionUserDto;
  note?: string;
}) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    select: {
      id: true,
      leadCode: true,
      companyName: true,
      contactName: true,
      assignedSalesId: true,
      createdByUserId: true,
    },
  });
  if (!lead) return;

  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      actionType: 'design_completed',
      actionById: params.actor.id,
      actorType: 'user',
      note:
        params.note ||
        `Designer ${params.actor.fullName} đã hoàn thiện và phê duyệt bản phối cảnh 3D v${params.versionNumber} (Yêu cầu #${params.designRequestId}).`,
    },
  });

  const targetUserIds = Array.from(
    new Set([lead.assignedSalesId, lead.createdByUserId].filter((id): id is number => Boolean(id))),
  );

  if (targetUserIds.length > 0) {
    await prisma.notification.createMany({
      data: targetUserIds.map((uid) => ({
        userId: uid,
        title: `Hoàn thiện phối cảnh 3D: ${lead.leadCode}`,
        summary: `${params.actor.fullName} đã hoàn tất bản phối cảnh v${params.versionNumber} cho ${lead.companyName || lead.contactName || lead.leadCode}.`,
        category: 'Thiết kế 3D',
        actionLabel: 'Xem bản phối cảnh',
        actionUrl: `/design?leadId=${lead.id}`,
        requiredPermission: 'LEAD_VIEW_OWN',
      })),
    });
  }
}

/**
 * UC01 4.4 & UC03 BR6: Duyệt hàng đợi Spam chờ xác nhận (pending_confirm -> confirmed_excluded hoặc khôi phục)
 */
export async function reviewPendingSpamLead(
  actor: SessionUserDto,
  leadId: number,
  decision: 'CONFIRM_SPAM' | 'RESTORE_VALID',
  note?: string,
) {
  if (!['SALES_LEAD', 'MKT_LEAD', 'BOD', 'ADMIN'].includes(actor.roleCode)) {
    throw new Error('Chỉ Trưởng nhóm Kinh doanh / Marketing, Giám đốc hoặc Admin được duyệt hàng đợi Spam chờ xác nhận.');
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new Error('Không tìm thấy hồ sơ Lead.');

  const isConfirmSpam = decision === 'CONFIRM_SPAM';
  const updated = await prisma.lead.update({
    where: { id: leadId },
    data: {
      isSpam: isConfirmSpam,
      spamAdsExclusionStatus: isConfirmSpam ? 'confirmed_excluded' : 'none',
      version: { increment: 1 },
    },
  });

  await prisma.leadActivity.create({
    data: {
      leadId,
      actionType: isConfirmSpam ? 'spam_confirmed_excluded' : 'spam_restored_valid',
      actionById: actor.id,
      actorType: 'user',
      note:
        note ||
        (isConfirmSpam
          ? 'Quản lý xác nhận Spam: Đã loại trừ khỏi mẫu số L3 / tập học Ads (UC03 BR6).'
          : 'Quản lý khôi phục Lead hợp lệ từ hàng đợi chờ duyệt Spam.'),
    },
  });

  return updated;
}

/**
 * UC01 & UC02 5.2: Công tắc Online / Đang nhận Lead cho Nhân viên Kinh doanh
 */
export async function setSalesReceivingStatus(actor: SessionUserDto, isReceivingLeads: boolean) {
  const updated = await prisma.user.update({
    where: { id: actor.id },
    data: { isReceivingLeads },
    select: { id: true, fullName: true, isReceivingLeads: true },
  });
  return updated;
}

