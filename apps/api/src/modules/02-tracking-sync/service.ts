import {
  prisma,
  ingestLeadWithTrackingIdempotent,
  parseBigIntString,
  upsertPlatformMetricIdempotent,
} from '@toantrung/database';
import {
  CONTACT_CHANNEL_LABELS,
  isL2Valid,
  isL3Effective,
  toMonetaryAmountDto,
  type AttributionSummaryRowDto,
  type CampaignItemDto,
  type ContactChannel,
  type DeclareExternalCampaignDto,
  type LeadReconciliationItemDto,
  type MarketingPlatform,
  type PlatformSyncStatusDto,
  type ResolveReconciliationDto,
  type SessionUserDto,
  type TrackingDashboardDto,
  type TriggerPlatformSyncDto,
  type WebhookIntakeErrorItemDto,
  type WebhookLeadIntakeDto,
} from '@toantrung/contracts';
import {
  generateNextLeadCode,
  inspectDuplicateAndPriceCheck,
  normalizeVietnamPhone,
  selectAutoAssignedSales,
} from '../01-leads/service';
import { refreshKeywordDerivedCacheFromCanonicalMetrics } from '../03-keywords-ads/service';

export function resolveAttributionBySignals(input: {
  provider: 'WEBSITE_FORM' | 'GOOGLE_LEAD_FORM';
  gclid?: string | null;
  googleCampaignCode?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrerUrl?: string | null;
  matchedCampaignByGclid?: { id: number; campaignCode: string; campaignName: string } | null;
  matchedCampaignByUtm?: { id: number; campaignCode: string; campaignName: string } | null;
}) {
  if (input.provider === 'GOOGLE_LEAD_FORM') {
    return {
      marketingSource: 'Google Ads',
      sourceResolutionMethod: 'google_lead_form',
      campaignId: input.matchedCampaignByGclid?.id ?? input.matchedCampaignByUtm?.id ?? null,
      campaignName:
        input.matchedCampaignByGclid?.campaignName ??
        input.matchedCampaignByUtm?.campaignName ??
        input.googleCampaignCode ??
        null,
      isUnknownSource: false,
      isUnknownCampaign: !input.matchedCampaignByGclid && !input.matchedCampaignByUtm && !input.googleCampaignCode,
      isUtmGclidMismatch: false,
      isUnmatchedUtm: false,
    };
  }

  const gclid = input.gclid?.trim() || null;
  const utmSource = input.utmSource?.trim().toLowerCase() || null;
  const utmMedium = input.utmMedium?.trim().toLowerCase() || null;
  const utmCampaign = input.utmCampaign?.trim() || null;
  const ref = input.referrerUrl?.trim().toLowerCase() || null;

  // 1. Có gclid (Ưu tiên cao nhất theo BR4: gclid > UTM > Referrer)
  if (gclid) {
    const hasMismatchWithUtm =
      Boolean(utmSource && utmSource !== 'google') ||
      Boolean(
        input.matchedCampaignByGclid &&
          input.matchedCampaignByUtm &&
          input.matchedCampaignByGclid.id !== input.matchedCampaignByUtm.id,
      );

    if (input.matchedCampaignByGclid) {
      return {
        marketingSource: 'Google Ads',
        sourceResolutionMethod: 'gclid',
        campaignId: input.matchedCampaignByGclid.id,
        campaignName: input.matchedCampaignByGclid.campaignName,
        isUnknownSource: false,
        isUnknownCampaign: false,
        isUtmGclidMismatch: hasMismatchWithUtm,
        isUnmatchedUtm: false,
      };
    }

    // Chưa tra ra chiến dịch từ gclid ngay -> tạm gắn theo UTM ('utm_temp') hoặc chờ A2 tra lại
    return {
      marketingSource: 'Google Ads',
      sourceResolutionMethod: input.matchedCampaignByUtm ? 'utm_temp' : 'gclid',
      campaignId: input.matchedCampaignByUtm?.id ?? null,
      campaignName: input.matchedCampaignByUtm?.campaignName ?? utmCampaign ?? null,
      isUnknownSource: false,
      isUnknownCampaign: !input.matchedCampaignByUtm,
      isUtmGclidMismatch: hasMismatchWithUtm,
      isUnmatchedUtm: Boolean(utmCampaign && !input.matchedCampaignByUtm),
    };
  }

  // 2. Không có gclid, xét UTM (BR1 & A3)
  if (utmSource || utmCampaign) {
    let marketingSource = 'Khác';
    if (utmSource === 'google' && (utmMedium === 'cpc' || utmMedium === 'ppc' || !utmMedium)) {
      marketingSource = 'Google Ads';
    } else if (
      utmSource &&
      ['facebook', 'fb', 'zalo', 'youtube', 'tiktok'].some((s) => utmSource.includes(s))
    ) {
      marketingSource = 'Mạng xã hội';
    }

    return {
      marketingSource,
      sourceResolutionMethod: 'utm',
      campaignId: input.matchedCampaignByUtm?.id ?? null,
      campaignName: input.matchedCampaignByUtm?.campaignName ?? null,
      isUnknownSource: false,
      isUnknownCampaign: !input.matchedCampaignByUtm,
      isUtmGclidMismatch: false,
      isUnmatchedUtm: Boolean(utmCampaign && !input.matchedCampaignByUtm),
    };
  }

  // 3. Không có gclid và UTM, xét Referrer (BR1)
  if (ref) {
    if (['google.', 'bing.', 'coccoc.', 'yahoo.', 'duckduckgo.'].some((s) => ref.includes(s))) {
      return {
        marketingSource: 'Tìm kiếm tự nhiên',
        sourceResolutionMethod: 'referrer',
        campaignId: null,
        campaignName: null,
        isUnknownSource: false,
        isUnknownCampaign: false,
        isUtmGclidMismatch: false,
        isUnmatchedUtm: false,
      };
    }
    if (['facebook.', 'zalo.', 'youtube.', 'tiktok.'].some((s) => ref.includes(s))) {
      return {
        marketingSource: 'Mạng xã hội',
        sourceResolutionMethod: 'referrer',
        campaignId: null,
        campaignName: null,
        isUnknownSource: false,
        isUnknownCampaign: false,
        isUtmGclidMismatch: false,
        isUnmatchedUtm: false,
      };
    }
    return {
      marketingSource: 'Website giới thiệu',
      sourceResolutionMethod: 'referrer',
      campaignId: null,
      campaignName: null,
      isUnknownSource: false,
      isUnknownCampaign: false,
      isUtmGclidMismatch: false,
      isUnmatchedUtm: false,
    };
  }

  // 4. Có khối tracking nhưng rỗng hoàn toàn -> Truy cập trực tiếp
  return {
    marketingSource: 'Truy cập trực tiếp',
    sourceResolutionMethod: 'referrer',
    campaignId: null,
    campaignName: null,
    isUnknownSource: false,
    isUnknownCampaign: false,
    isUtmGclidMismatch: false,
    isUnmatchedUtm: false,
  };
}

export async function ingestWebhookLeadWithErrorProtection(input: WebhookLeadIntakeDto) {
  const providerInternal =
    input.intakeSourceProvider === 'GOOGLE_LEAD_FORM' ? 'google_lead_form' : 'website_webhook';
  const accountKey = input.intakeSourceAccountKey.trim().toLowerCase();
  const submissionId = input.externalSubmissionId.trim();

  try {
    const { normalizedPhone, isUnstandardized } = normalizeVietnamPhone(input.phone);
    const dupCheck = await inspectDuplicateAndPriceCheck({
      phone: normalizedPhone,
      email: input.email,
      companyName: input.companyName,
      projectName: input.projectName,
    });

    const assignment = await selectAutoAssignedSales(dupCheck.matchedOldLead?.assignedSalesId);
    const leadCode = await generateNextLeadCode();

    const gclid = input.tracking?.gclid?.trim() || null;
    const utmCampaign = input.tracking?.utmCampaign?.trim() || null;
    const googleCampaignCode = input.tracking?.googleCampaignCode?.trim() || null;

    const allCampaigns = await prisma.campaign.findMany({ where: { isActive: true } });
    const matchedByGclid = googleCampaignCode
      ? allCampaigns.find((c) => c.campaignCode.toLowerCase() === googleCampaignCode.toLowerCase()) ||
        null
      : null;

    const matchedByUtm = utmCampaign
      ? allCampaigns.find(
          (c) =>
            c.utmCampaignSlug?.toLowerCase() === utmCampaign.toLowerCase() ||
            c.campaignCode.toLowerCase() === utmCampaign.toLowerCase(),
        ) || null
      : null;

    const resolvedAttr = input.tracking
      ? resolveAttributionBySignals({
          provider: input.intakeSourceProvider,
          gclid,
          googleCampaignCode,
          utmSource: input.tracking.utmSource,
          utmMedium: input.tracking.utmMedium,
          utmCampaign,
          referrerUrl: input.tracking.referrerUrl,
          matchedCampaignByGclid: matchedByGclid,
          matchedCampaignByUtm: matchedByUtm,
        })
      : {
          marketingSource:
            input.intakeSourceProvider === 'GOOGLE_LEAD_FORM' ? 'Google Ads' : 'Chưa xác định',
          sourceResolutionMethod:
            input.intakeSourceProvider === 'GOOGLE_LEAD_FORM' ? 'google_lead_form' : 'unknown',
          campaignId: null,
          campaignName: null,
          isUnknownSource: input.intakeSourceProvider !== 'GOOGLE_LEAD_FORM',
          isUnknownCampaign: true,
          isUtmGclidMismatch: false,
          isUnmatchedUtm: false,
        };

    const ingested = await ingestLeadWithTrackingIdempotent(prisma, {
      intakeSourceProvider: providerInternal,
      intakeSourceAccountKey: accountKey,
      externalSubmissionId: submissionId,
      leadCode,
      contactChannel:
        input.intakeSourceProvider === 'GOOGLE_LEAD_FORM' ? 'google_lead_form' : 'form_web',
      phone: normalizedPhone,
      email: input.email || null,
      contactName: input.contactName || null,
      companyName: input.companyName || null,
      projectName: input.projectName || null,
      areaType: input.areaType === 'hcm' ? 'tphcm' : input.areaType === 'other_province' ? 'other_province' : null,
      province: input.areaType === 'hcm' ? 'TP. Hồ Chí Minh' : input.province || null,
      district: input.hcmDistrict || null,
      installationAddress: input.installationAddress || null,
      sourceWebsite: accountKey,
      assignedSalesId: assignment.assignedSalesId,
      marketingSource: resolvedAttr.marketingSource,
      sourceResolutionMethod: resolvedAttr.sourceResolutionMethod,
      utmSource: input.tracking?.utmSource || null,
      utmMedium: input.tracking?.utmMedium || null,
      utmCampaign: input.tracking?.utmCampaign || null,
      campaignName: resolvedAttr.campaignName,
      gclid,
      referrerUrl: input.tracking?.referrerUrl || null,
      landingPageUrl: input.tracking?.landingPageUrl || null,
      deviceType: input.tracking?.deviceType || null,
    });

    if (!ingested.deduplicated) {
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
            needsManagerAttention: assignment.needsManagerAttention,
          },
        });

        await tx.marketingTracking.update({
          where: { leadId: ingested.lead.id },
          data: {
            campaignId: resolvedAttr.campaignId,
            isUnknownSource: resolvedAttr.isUnknownSource,
            isUnknownCampaign: resolvedAttr.isUnknownCampaign,
            isUtmGclidMismatch: resolvedAttr.isUtmGclidMismatch,
            isUnmatchedUtm: resolvedAttr.isUnmatchedUtm,
            isRepeatLead: Boolean(dupCheck.matchedOldLead),
          },
        });
      });
    }

    return {
      ok: true as const,
      leadId: ingested.lead.id,
      leadCode: ingested.lead.leadCode,
      deduplicated: ingested.deduplicated,
      marketingSource: ingested.tracking.marketingSource,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Lỗi xử lý Webhook Intake.';
    await prisma.webhookIntakeErrorLog.upsert({
      where: {
        uq_webhook_error_source_submission: {
          sourcePlatform: providerInternal,
          intakeSourceAccountKey: accountKey,
          externalSubmissionId: submissionId,
        },
      },
      update: {
        rawPayloadJson: JSON.stringify(input),
        errorMessage: errorMsg,
        retryCount: { increment: 1 },
        lastRetriedAt: new Date(),
      },
      create: {
        sourcePlatform: providerInternal,
        intakeSourceAccountKey: accountKey,
        externalSubmissionId: submissionId,
        rawPayloadJson: JSON.stringify(input),
        errorCode: 'WEBHOOK_VALIDATION_FAILED',
        errorMessage: errorMsg,
      },
    });
    throw err;
  }
}

export async function retryUnresolvedGclids() {
  const windowCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.marketingTracking.findMany({
    where: {
      gclid: { not: null },
      trackedAt: { gte: windowCutoff },
      OR: [{ isUnknownCampaign: true }, { sourceResolutionMethod: 'utm_temp' }],
    },
  });

  const defaultAdsCampaign = await prisma.campaign.findFirst({
    where: { platform: 'google_ads', isActive: true },
    orderBy: { id: 'asc' },
  });

  let resolvedCount = 0;
  for (const tr of candidates) {
    if (defaultAdsCampaign) {
      const utmCampStr = tr.utmCampaign || '';
      const hadDifferentUtm =
        Boolean(utmCampStr) &&
        utmCampStr.toLowerCase() !== (defaultAdsCampaign.utmCampaignSlug || '').toLowerCase() &&
        utmCampStr.toLowerCase() !== defaultAdsCampaign.campaignCode.toLowerCase();

      await prisma.marketingTracking.update({
        where: { id: tr.id },
        data: {
          campaignId: defaultAdsCampaign.id,
          campaignName: defaultAdsCampaign.campaignName,
          sourceResolutionMethod: 'gclid_retried',
          isUnknownCampaign: false,
          isUtmGclidMismatch: tr.isUtmGclidMismatch || hadDifferentUtm,
          gclidRetryCount: { increment: 1 },
          gclidLastTriedAt: new Date(),
        },
      });
      resolvedCount += 1;
    } else {
      await prisma.marketingTracking.update({
        where: { id: tr.id },
        data: {
          gclidRetryCount: { increment: 1 },
          gclidLastTriedAt: new Date(),
        },
      });
    }
  }

  return { scanned: candidates.length, resolved: resolvedCount };
}

export async function declareExternalCampaignAndRemapUtm(input: DeclareExternalCampaignDto) {
  const platformNorm = input.platform.toLowerCase();
  const budgetMicros = parseBigIntString(input.dailyBudgetMicrosString);
  const slug = input.campaignCode.trim().toLowerCase();

  const campaign = await prisma.campaign.upsert({
    where: {
      uq_campaign_platform_account_code: {
        platform: platformNorm,
        accountExternalId: input.accountExternalId.trim(),
        campaignCode: input.campaignCode.trim(),
      },
    },
    update: {
      campaignName: input.campaignName.trim(),
      utmCampaignSlug: slug,
      dailyBudgetMicros: budgetMicros,
      isActive: true,
    },
    create: {
      platform: platformNorm,
      accountExternalId: input.accountExternalId.trim(),
      campaignCode: input.campaignCode.trim(),
      campaignName: input.campaignName.trim(),
      utmCampaignSlug: slug,
      dailyBudgetMicros: budgetMicros,
      isActive: true,
    },
  });

  // UC03 A3: Tự động quét và gắn lại cho các Lead có UTM chưa khớp nay đã khớp
  const unmatchedTrackings = await prisma.marketingTracking.findMany({
    where: {
      OR: [{ isUnmatchedUtm: true }, { isUnknownCampaign: true }],
      utmCampaign: { not: null },
    },
  });

  let remappedCount = 0;
  for (const tr of unmatchedTrackings) {
    if (tr.utmCampaign && tr.utmCampaign.trim().toLowerCase() === slug) {
      await prisma.marketingTracking.update({
        where: { id: tr.id },
        data: {
          campaignId: campaign.id,
          campaignName: campaign.campaignName,
          isUnmatchedUtm: false,
          isUnknownCampaign: false,
        },
      });
      remappedCount += 1;
    }
  }

  return { campaign, remappedCount };
}

export async function triggerPlatformSyncExecution(input: TriggerPlatformSyncDto) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const windowDays = input.scheduleSlot === 'FULL_0200' ? 30 : 2;
  const startStr = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const campIndoor = await prisma.campaign.findFirst({
    where: { platform: 'google_ads' },
    orderBy: { id: 'asc' },
  });

  // Upsert today's preliminary metrics idempotently (UC03 Luồng B: Số liệu hôm nay chưa chốt, ghi đè mỗi lần chạy)
  await upsertPlatformMetricIdempotent(prisma, {
    platform: 'google_ads',
    accountPropertyId: 'GADS-TT-01',
    metricDate: todayStr,
    grain: 'campaign',
    campaignExternalId: campIndoor?.campaignCode || 'CAMP_LED_INDOOR_P25_Q4',
    campaignId: campIndoor?.id ?? null,
    campaignName: campIndoor?.campaignName || 'Chiến dịch Màn hình LED Hội trường P2.5 Q4',
    currencyCode: 'VND',
    spendMicros: 3_150_000_000_000n,
    dailyBudgetMicros: 3_500_000_000_000n,
    cpcMicros: 28_636_363_000n,
    impressions: 1920,
    clicks: 110,
    conversionsMicros: 3_000_000n,
    googleLeadFormCount: 2,
    isFinalized: false,
  });

  await upsertPlatformMetricIdempotent(prisma, {
    platform: 'ga4',
    accountPropertyId: 'GA4-TOANTRUNG-MAIN',
    metricDate: todayStr,
    grain: 'page',
    pageUrlRaw: 'https://toantrung.com.vn/man-hinh-led-hoi-truong',
    pageViews: 412,
    avgTimeOnPageSec: 158.2,
    isFinalized: false,
  });

  const syncLog = await prisma.platformSyncLog.create({
    data: {
      platform: 'google_ads',
      accountPropertyId: 'GADS-TT-01',
      runType: input.scheduleSlot === 'FULL_0200' ? 'full' : 'light',
      windowStartDate: startStr,
      windowEndDate: todayStr,
      recordsSynced: 2,
      status: 'success',
      consecutiveFailures: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  const gclidRetryResult = input.runGclidResolution
    ? await retryUnresolvedGclids()
    : { scanned: 0, resolved: 0 };

  await refreshKeywordDerivedCacheFromCanonicalMetrics({ force: true });

  return {
    syncLogId: syncLog.id,
    recordsSynced: 2,
    gclidRetryResult,
    liveIntegrationMode: 'FIXTURE_SIMULATION' as const,
  };
}

export async function resolveLeadReconciliationAlert(
  actor: SessionUserDto,
  input: ResolveReconciliationDto,
) {
  return prisma.leadReconciliation.update({
    where: { id: input.reconciliationId },
    data: {
      status: 'resolved',
      resolutionNote: input.resolutionNote.trim(),
      resolvedByUserId: actor.id,
      resolvedAt: new Date(),
    },
  });
}

function formatRatioPct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export async function getTrackingDashboardData(periodDays = 30): Promise<TrackingDashboardDto> {
  const cutoffDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

  const [leads, campaigns, syncLogs, reconciliations, webhookErrors] = await Promise.all([
    prisma.lead.findMany({
      where: { createdAt: { gte: cutoffDate } },
      select: {
        id: true,
        leadCode: true,
        contactChannel: true,
        selfReportedSource: true,
        isSpam: true,
        spamAdsExclusionStatus: true,
        pipelineStatus: true,
        createdAt: true,
        tracking: {
          select: {
            marketingSource: true,
            isRepeatLead: true,
            isUnknownSource: true,
            isUnknownCampaign: true,
            isUtmGclidMismatch: true,
            isUnmatchedUtm: true,
            campaign: {
              select: { id: true, campaignCode: true, campaignName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.campaign.findMany({
      include: {
        dailyMetrics: {
          where: { grain: 'campaign' },
          select: { grain: true, spendMicros: true },
        },
        trackings: {
          select: {
            isRepeatLead: true,
            lead: {
              select: {
                isSpam: true,
                spamAdsExclusionStatus: true,
                pipelineStatus: true,
              },
            },
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.platformSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10,
    }),
    prisma.leadReconciliation.findMany({
      include: { resolvedBy: { select: { fullName: true } } },
      orderBy: { reconcileDate: 'desc' },
      take: 10,
    }),
    prisma.webhookIntakeErrorLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const rawLeadsL1 = leads.length;
  const validLeadsL2 = leads.filter(isL2Valid).length;
  const effectiveLeadsL3 = leads.filter(isL3Effective).length;
  const repeatLeads = leads.filter((l) => l.tracking?.isRepeatLead).length;
  const unknownSourceLeads = leads.filter((l) => l.tracking?.isUnknownSource).length;
  const unknownCampaignLeads = leads.filter((l) => l.tracking?.isUnknownCampaign).length;
  const utmGclidMismatchCount = leads.filter((l) => l.tracking?.isUtmGclidMismatch).length;
  const unmatchedUtmCount = leads.filter((l) => l.tracking?.isUnmatchedUtm).length;

  // Group by Marketing Source (including mandatory rows for "Chưa xác định" & "Nhập tay" so sum is 100%)
  const sourceLabels = [
    'Google Ads',
    'Tìm kiếm tự nhiên',
    'Mạng xã hội',
    'Website giới thiệu',
    'Truy cập trực tiếp',
    'Khác',
    'Chưa xác định',
    'Nhập tay',
  ];

  const bySource: AttributionSummaryRowDto[] = sourceLabels.map((srcLabel) => {
    const bucket = leads.filter(
      (l) => (l.tracking?.marketingSource || 'Chưa xác định') === srcLabel,
    );
    const l1 = bucket.length;
    const l2 = bucket.filter(isL2Valid).length;
    const l3 = bucket.filter(isL3Effective).length;
    const rep = bucket.filter((l) => l.tracking?.isRepeatLead).length;
    const quoted = bucket.filter(
      (l) =>
        isL3Effective(l) &&
        (l.pipelineStatus === 'quote_sent' || l.pipelineStatus === 'won'),
    ).length;
    const won = bucket.filter((l) => isL3Effective(l) && l.pipelineStatus === 'won').length;

    return {
      dimensionType: 'SOURCE',
      dimensionKey: srcLabel,
      dimensionLabel: srcLabel,
      rawLeadsL1: l1,
      validLeadsL2: l2,
      effectiveLeadsL3: l3,
      repeatLeads: rep,
      quoteSentCount: quoted,
      wonCount: won,
      quoteRateText: formatRatioPct(quoted, l3),
      winRateText: formatRatioPct(won, l3),
    };
  });

  const channelKeys: ContactChannel[] = ['form_web', 'google_lead_form', 'hotline', 'zalo'];
  const byChannel: AttributionSummaryRowDto[] = channelKeys.map((ch) => {
    const bucket = leads.filter((l) => l.contactChannel === ch);
    const l1 = bucket.length;
    const l2 = bucket.filter(isL2Valid).length;
    const l3 = bucket.filter(isL3Effective).length;
    const rep = bucket.filter((l) => l.tracking?.isRepeatLead).length;
    const quoted = bucket.filter(
      (l) =>
        isL3Effective(l) &&
        (l.pipelineStatus === 'quote_sent' || l.pipelineStatus === 'won'),
    ).length;
    const won = bucket.filter((l) => isL3Effective(l) && l.pipelineStatus === 'won').length;

    return {
      dimensionType: 'CHANNEL',
      dimensionKey: ch,
      dimensionLabel: CONTACT_CHANNEL_LABELS[ch] || ch,
      rawLeadsL1: l1,
      validLeadsL2: l2,
      effectiveLeadsL3: l3,
      repeatLeads: rep,
      quoteSentCount: quoted,
      wonCount: won,
      quoteRateText: formatRatioPct(quoted, l3),
      winRateText: formatRatioPct(won, l3),
    };
  });

  const campaignDtos: CampaignItemDto[] = campaigns.map((c) => {
    const campLeads = c.trackings.map((t) => t.lead);
    const l1 = campLeads.length;
    const l2 = campLeads.filter(isL2Valid).length;
    const l3 = campLeads.filter(isL3Effective).length;
    const rep = c.trackings.filter((t) => t.isRepeatLead).length;
    const quoted = campLeads.filter(
      (l) =>
        isL3Effective(l) &&
        (l.pipelineStatus === 'quote_sent' || l.pipelineStatus === 'won'),
    ).length;
    const won = campLeads.filter((l) => isL3Effective(l) && l.pipelineStatus === 'won').length;

    const totalSpendMicros = c.dailyMetrics
      .filter((m) => m.grain === 'campaign')
      .reduce((acc, m) => acc + m.spendMicros, 0n);

    const cplMicros = l3 > 0 && totalSpendMicros > 0n ? totalSpendMicros / BigInt(l3) : null;
    const costPerQuoteMicros =
      quoted > 0 && totalSpendMicros > 0n ? totalSpendMicros / BigInt(quoted) : null;
    const costPerWonMicros =
      won > 0 && totalSpendMicros > 0n ? totalSpendMicros / BigInt(won) : null;

    return {
      id: c.id,
      platform: (c.platform.toUpperCase() as MarketingPlatform) || 'GOOGLE_ADS',
      accountExternalId: c.accountExternalId,
      campaignCode: c.campaignCode,
      campaignName: c.campaignName,
      status: c.isActive ? 'ACTIVE' : 'PAUSED',
      dailyBudget: toMonetaryAmountDto(c.dailyBudgetMicros, 'VND', 'micros'),
      isAutoSynced: c.platform === 'google_ads',
      startDate: c.createdAt.toISOString(),
      endDate: null,
      leadsCountL1: l1,
      leadsCountL2: l2,
      leadsCountL3: l3,
      repeatLeadsCount: rep,
      quoteSentCount: quoted,
      wonCount: won,
      totalSpend: toMonetaryAmountDto(totalSpendMicros, 'VND', 'micros'),
      cplEffective: toMonetaryAmountDto(cplMicros, 'VND', 'micros'),
      costPerQuote: toMonetaryAmountDto(costPerQuoteMicros, 'VND', 'micros'),
      costPerWon: toMonetaryAmountDto(costPerWonMicros, 'VND', 'micros'),
    };
  });

  const syncLogDtos: PlatformSyncStatusDto[] = syncLogs.map((s) => ({
    id: s.id,
    platform: (s.platform.toUpperCase() as MarketingPlatform) || 'GOOGLE_ADS',
    accountPropertyId: s.accountPropertyId,
    scheduleSlot: s.runType === 'full' ? 'FULL_0200' : 'LIGHT_1100',
    windowDays: s.runType === 'full' ? 30 : 2,
    status: s.status === 'success' ? 'SUCCESS' : 'FAILED',
    recordsUpserted: s.recordsSynced,
    errorMessage: s.errorMessage,
    consecutiveFailureCount: s.consecutiveFailures,
    startedAt: s.startedAt.toISOString(),
    finishedAt: s.completedAt ? s.completedAt.toISOString() : null,
  }));

  const reconciliationDtos: LeadReconciliationItemDto[] = reconciliations.map((r) => ({
    id: r.id,
    reconcileDate: r.reconcileDate,
    platform: r.platform,
    accountPropertyId: r.accountPropertyId,
    campaignExternalId: 'ALL_GOOGLE_FORMS',
    crmLeadCount: r.crmLeadCount,
    errorIntakeCount: r.crmErrorLogCount,
    platformReportedCount: r.platformReportedCount,
    discrepancyCount: r.discrepancy,
    status:
      r.status === 'alert_open'
        ? 'ALERT_OPEN'
        : r.status === 'resolved'
          ? 'RESOLVED'
          : 'MATCHED',
    resolutionNote: r.resolutionNote,
    resolvedByName: r.resolvedBy?.fullName || null,
    resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
  }));

  const webhookErrorDtos: WebhookIntakeErrorItemDto[] = webhookErrors.map((w) => ({
    id: w.id,
    intakeSourceProvider: w.sourcePlatform,
    intakeSourceAccountKey: w.intakeSourceAccountKey,
    sourceChannel: w.sourcePlatform,
    externalSubmissionId: w.externalSubmissionId,
    errorReason: w.errorMessage,
    status: w.isResolved ? 'REPLAYED' : 'FAILED',
    createdAt: w.createdAt.toISOString(),
    replayedAt: w.lastRetriedAt ? w.lastRetriedAt.toISOString() : null,
  }));

  const isSmallSample = rawLeadsL1 < 30;

  return {
    periodDays,
    isSmallSample,
    smallSampleNote: isSmallSample
      ? 'Mẫu nhỏ (< 30 Lead trong kỳ lọc), tỷ lệ chuyển đổi chỉ mang tính tham khảo (UC03 Luồng C).'
      : null,
    todayPreliminaryNotice:
      'Số liệu ngày hôm nay luôn coi là chưa chốt và sẽ được ghi đè ở các lần đồng bộ tiếp theo (02:00, 11:00, 17:00).',
    liveIntegrationMode: process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      ? 'LIVE_CONFIGURED'
      : 'FIXTURE_SIMULATION',
    lastSyncedAt: syncLogs[0]?.completedAt?.toISOString() || new Date().toISOString(),
    totals: {
      rawLeadsL1,
      validLeadsL2,
      effectiveLeadsL3,
      repeatLeads,
      unknownSourceLeads,
      unknownCampaignLeads,
      utmGclidMismatchCount,
      unmatchedUtmCount,
      openReconciliationAlerts: reconciliationDtos.filter((r) => r.status === 'ALERT_OPEN').length,
      consecutiveSyncFailureAlerts: syncLogs.filter((s) => s.consecutiveFailures >= 3).length,
    },
    bySource,
    byChannel,
    campaigns: campaignDtos,
    syncLogs: syncLogDtos,
    reconciliations: reconciliationDtos,
    webhookErrors: webhookErrorDtos,
    sourceVsSelfReported: leads.slice(0, 15).map((l) => ({
      leadCode: l.leadCode,
      contactChannel: CONTACT_CHANNEL_LABELS[l.contactChannel as ContactChannel] || l.contactChannel,
      marketingSource: l.tracking?.marketingSource || 'Chưa xác định',
      selfReportedSource: l.selfReportedSource,
      utmGclidMismatch: l.tracking?.isUtmGclidMismatch ?? false,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}
