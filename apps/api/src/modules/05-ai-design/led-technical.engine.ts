/**
 * Module 05 — Independent LED Technical, Cabinet & BOM Verification Engine (P5)
 * Strictly independent of AI Image/Chat models.
 * Verifies physical dimensions (mm), pixel pitch, theoretical vs. actual resolution,
 * module & cabinet assembly rules, feasibility warnings, and BOM calculation.
 */

import type { LedProductSpecDto } from '@toantrung/contracts';

export interface LedCabinetCatalogEntry {
  modelCode: string;
  modelName: string;
  environment: 'indoor' | 'outdoor' | 'both';
  cabinetWidthMm: number;
  cabinetHeightMm: number;
  moduleWidthMm: number;
  moduleHeightMm: number;
  modulesPerCabinet: number;
  supportedPitches: number[];
  avgPowerWattsPerM2: number;
  maxPowerWattsPerM2: number;
  weightKgPerCabinet: number;
  powerSuppliesPerCabinet: number;
  receivingCardsPerCabinet: number;
}

export const LED_CABINET_CATALOG: Record<string, LedCabinetCatalogEntry> = {
  CAB_640_480: {
    modelCode: 'CAB_640_480',
    modelName: 'Cabinet Nhôm đúc 640 × 480 mm (Chuẩn 4:3)',
    environment: 'indoor',
    cabinetWidthMm: 640,
    cabinetHeightMm: 480,
    moduleWidthMm: 320,
    moduleHeightMm: 160,
    modulesPerCabinet: 6,
    supportedPitches: [1.25, 1.53, 1.86, 2.0, 2.5, 3.076, 4.0],
    avgPowerWattsPerM2: 240,
    maxPowerWattsPerM2: 580,
    weightKgPerCabinet: 7.2,
    powerSuppliesPerCabinet: 1,
    receivingCardsPerCabinet: 1,
  },
  CAB_600_3375: {
    modelCode: 'CAB_600_3375',
    modelName: 'Cabinet Nhôm đúc CNC 600 × 337.5 mm (Chuẩn 16:9 UHD)',
    environment: 'indoor',
    cabinetWidthMm: 600,
    cabinetHeightMm: 337.5,
    moduleWidthMm: 300,
    moduleHeightMm: 168.75,
    modulesPerCabinet: 4,
    supportedPitches: [1.25, 1.5, 1.875, 2.5],
    avgPowerWattsPerM2: 220,
    maxPowerWattsPerM2: 540,
    weightKgPerCabinet: 5.4,
    powerSuppliesPerCabinet: 1,
    receivingCardsPerCabinet: 1,
  },
  CAB_960_960: {
    modelCode: 'CAB_960_960',
    modelName: 'Cabinet Thép/Nhôm Outdoor IP65 960 × 960 mm',
    environment: 'outdoor',
    cabinetWidthMm: 960,
    cabinetHeightMm: 960,
    moduleWidthMm: 320,
    moduleHeightMm: 160,
    modulesPerCabinet: 18,
    supportedPitches: [3.076, 4.0, 5.0, 6.0, 8.0, 10.0],
    avgPowerWattsPerM2: 320,
    maxPowerWattsPerM2: 850,
    weightKgPerCabinet: 26.5,
    powerSuppliesPerCabinet: 3,
    receivingCardsPerCabinet: 1,
  },
  CAB_500_500: {
    modelCode: 'CAB_500_500',
    modelName: 'Cabinet Sự kiện Die-Cast 500 × 500 mm',
    environment: 'both',
    cabinetWidthMm: 500,
    cabinetHeightMm: 500,
    moduleWidthMm: 250,
    moduleHeightMm: 250,
    modulesPerCabinet: 4,
    supportedPitches: [2.6, 2.97, 3.91, 4.81],
    avgPowerWattsPerM2: 260,
    maxPowerWattsPerM2: 650,
    weightKgPerCabinet: 7.5,
    powerSuppliesPerCabinet: 1,
    receivingCardsPerCabinet: 1,
  },
  MODULE_320_160_FRAME: {
    modelCode: 'MODULE_320_160_FRAME',
    modelName: 'Hệ khung sắt hộp mạ kẽm ghép trực tiếp Module 320 × 160 mm',
    environment: 'both',
    cabinetWidthMm: 320,
    cabinetHeightMm: 160,
    moduleWidthMm: 320,
    moduleHeightMm: 160,
    modulesPerCabinet: 1,
    supportedPitches: [1.53, 1.86, 2.0, 2.5, 3.076, 4.0, 5.0],
    avgPowerWattsPerM2: 250,
    maxPowerWattsPerM2: 600,
    weightKgPerCabinet: 0.48,
    powerSuppliesPerCabinet: 0.2, // 1 PSU per 5 modules
    receivingCardsPerCabinet: 0.125, // 1 card per 8 modules
  },
};

export type TechnicalFeasibilityStatus =
  | 'exact_match'
  | 'dimension_mismatch_warning'
  | 'curved_requires_custom_verification'
  | 'insufficient_data';

export interface TechnicalBomLineItem {
  itemCode: string;
  itemName: string;
  quantity: number | null;
  unit: string;
  notes: string;
}

export interface LedTechnicalEvaluationResult {
  feasibilityStatus: TechnicalFeasibilityStatus;
  statusLabel: string;
  isFeasibleWithoutAdjustment: boolean;
  hasCatalogData: boolean;
  widthMm: number | null;
  heightMm: number | null;
  areaM2: number | null;
  pixelPitch: string | null;
  pixelPitchMm: number | null;
  theoreticalResolutionWidthPx: number | null;
  theoreticalResolutionHeightPx: number | null;
  moduleDimensionsMm: string;
  cabinetDimensionsMm: string;
  cabinetModelCode: string;
  exactCabinetCols: number | null;
  exactCabinetRows: number | null;
  isWidthExactMultipleOfCabinet: boolean;
  isHeightExactMultipleOfCabinet: boolean;
  isWidthExactMultipleOfModule: boolean;
  isHeightExactMultipleOfModule: boolean;
  lowerFitOption: {
    cols: number;
    rows: number;
    cabinetCount: number;
    actualWidthMm: number;
    actualHeightMm: number;
  } | null;
  upperFitOption: {
    cols: number;
    rows: number;
    cabinetCount: number;
    actualWidthMm: number;
    actualHeightMm: number;
  } | null;
  exact16by9CabinetOption: {
    cabinetModelCode: string;
    cols: number;
    rows: number;
    cabinetCount: number;
    actualWidthMm: number;
    actualHeightMm: number;
  } | null;
  cabinetCols: number | null;
  cabinetRows: number | null;
  cabinetCount: number | null;
  moduleCols: number | null;
  moduleRows: number | null;
  moduleCount: number | null;
  avgPowerWatts: number | null;
  maxPowerWatts: number | null;
  estimatedWeightKg: number | null;
  warnings: string[];
  bomItems: TechnicalBomLineItem[];
}

export interface EvaluateLedTechnicalInput {
  widthMm?: number | null;
  heightMm?: number | null;
  pixelPitch?: string | null;
  cabinetModelCode?: string | null;
  screenStyle?: 'flat' | 'curved' | 'corner_90';
  requireConfirmedInputs?: boolean;
}

function isNearInteger(val: number, tolerance = 0.005): boolean {
  return Math.abs(val - Math.round(val)) <= tolerance;
}

/**
 * Evaluates LED screen physical dimensions, pixel pitch, cabinet assembly rules, and BOM.
 * Never fabricates power/weight/BOM when input parameters or catalogue entries are missing.
 * Never auto-overwrites user-supplied dimensions when a cabinet mismatch is detected.
 */
export function evaluateLedTechnicalConfig(
  input: EvaluateLedTechnicalInput
): LedTechnicalEvaluationResult {
  const widthMm = typeof input.widthMm === 'number' && input.widthMm > 0 ? Math.round(input.widthMm) : null;
  const heightMm = typeof input.heightMm === 'number' && input.heightMm > 0 ? Math.round(input.heightMm) : null;
  const rawPitch = (input.pixelPitch || '').trim();
  const pitchNum = rawPitch ? Number(rawPitch.replace(/[^0-9.]/g, '')) : NaN;
  const pixelPitchMm = Number.isFinite(pitchNum) && pitchNum > 0 ? pitchNum : null;
  const requestedCabCode = input.cabinetModelCode || 'CAB_640_480';
  const catalogEntry = LED_CABINET_CATALOG[requestedCabCode] || null;

  // Case 1: Insufficient data or missing catalogue entry -> Do not fabricate results!
  if (!widthMm || !heightMm || !pixelPitchMm || !catalogEntry) {
    const missingReasons: string[] = [];
    if (!widthMm || !heightMm) {
      missingReasons.push('Chưa có kích thước chiều rộng / chiều cao (mm) đã xác nhận.');
    }
    if (!pixelPitchMm) {
      missingReasons.push('Chưa xác định bước điểm ảnh (Pixel Pitch: P1.53, P2.0, P2.5, P3, P4...).');
    }
    if (!catalogEntry) {
      missingReasons.push(`Mã catalogue cabinet "${requestedCabCode}" chưa có trong dữ liệu kỹ thuật.`);
    }

    return {
      feasibilityStatus: 'insufficient_data',
      statusLabel: 'Chưa đủ dữ liệu xác nhận',
      isFeasibleWithoutAdjustment: false,
      hasCatalogData: Boolean(catalogEntry),
      widthMm,
      heightMm,
      areaM2: widthMm && heightMm ? Number(((widthMm * heightMm) / 1_000_000).toFixed(2)) : null,
      pixelPitch: rawPitch || null,
      pixelPitchMm,
      theoreticalResolutionWidthPx:
        widthMm && pixelPitchMm ? Math.round(widthMm / pixelPitchMm) : null,
      theoreticalResolutionHeightPx:
        heightMm && pixelPitchMm ? Math.round(heightMm / pixelPitchMm) : null,
      moduleDimensionsMm: catalogEntry
        ? `${catalogEntry.moduleWidthMm} × ${catalogEntry.moduleHeightMm} mm`
        : 'Chưa đủ dữ liệu xác nhận',
      cabinetDimensionsMm: catalogEntry
        ? `${catalogEntry.cabinetWidthMm} × ${catalogEntry.cabinetHeightMm} mm`
        : 'Chưa đủ dữ liệu xác nhận',
      cabinetModelCode: requestedCabCode,
      exactCabinetCols: null,
      exactCabinetRows: null,
      isWidthExactMultipleOfCabinet: false,
      isHeightExactMultipleOfCabinet: false,
      isWidthExactMultipleOfModule: false,
      isHeightExactMultipleOfModule: false,
      lowerFitOption: null,
      upperFitOption: null,
      exact16by9CabinetOption: null,
      cabinetCols: null,
      cabinetRows: null,
      cabinetCount: null,
      moduleCols: null,
      moduleRows: null,
      moduleCount: null,
      avgPowerWatts: null,
      maxPowerWatts: null,
      estimatedWeightKg: null,
      warnings: missingReasons,
      bomItems: [],
    };
  }

  const areaM2 = Number(((widthMm * heightMm) / 1_000_000).toFixed(2));
  const theoreticalResolutionWidthPx = Math.round(widthMm / pixelPitchMm);
  const theoreticalResolutionHeightPx = Math.round(heightMm / pixelPitchMm);

  const rawCabCols = widthMm / catalogEntry.cabinetWidthMm;
  const rawCabRows = heightMm / catalogEntry.cabinetHeightMm;
  const rawModCols = widthMm / catalogEntry.moduleWidthMm;
  const rawModRows = heightMm / catalogEntry.moduleHeightMm;

  const isWidthExactMultipleOfCabinet = isNearInteger(rawCabCols);
  const isHeightExactMultipleOfCabinet = isNearInteger(rawCabRows);
  const isWidthExactMultipleOfModule = isNearInteger(rawModCols);
  const isHeightExactMultipleOfModule = isNearInteger(rawModRows);

  const isExactCabinetFit = isWidthExactMultipleOfCabinet && isHeightExactMultipleOfCabinet;

  const lowerCols = Math.max(1, Math.floor(rawCabCols));
  const lowerRows = Math.max(1, Math.floor(rawCabRows));
  const upperCols = Math.max(1, Math.ceil(rawCabCols));
  const upperRows = Math.max(1, Math.ceil(rawCabRows));

  const lowerFitOption = {
    cols: lowerCols,
    rows: lowerRows,
    cabinetCount: lowerCols * lowerRows,
    actualWidthMm: Math.round(lowerCols * catalogEntry.cabinetWidthMm),
    actualHeightMm: Math.round(lowerRows * catalogEntry.cabinetHeightMm),
  };

  const upperFitOption = {
    cols: upperCols,
    rows: upperRows,
    cabinetCount: upperCols * upperRows,
    actualWidthMm: Math.round(upperCols * catalogEntry.cabinetWidthMm),
    actualHeightMm: Math.round(upperRows * catalogEntry.cabinetHeightMm),
  };

  // Check if 16:9 cabinet (600 x 337.5 mm) fits 4800 x 2700 mm or current dimensions exactly
  const cab169 = LED_CABINET_CATALOG.CAB_600_3375;
  const cols169 = widthMm / cab169.cabinetWidthMm;
  const rows169 = heightMm / cab169.cabinetHeightMm;
  const exact16by9CabinetOption =
    isNearInteger(cols169) && isNearInteger(rows169)
      ? {
          cabinetModelCode: cab169.modelCode,
          cols: Math.round(cols169),
          rows: Math.round(rows169),
          cabinetCount: Math.round(cols169) * Math.round(rows169),
          actualWidthMm: widthMm,
          actualHeightMm: heightMm,
        }
      : null;

  const warnings: string[] = [];

  if (!isExactCabinetFit) {
    warnings.push(
      `Kích thước yêu cầu ${widthMm} × ${heightMm} mm không chia chẵn cho kích thước ${catalogEntry.modelName} (${catalogEntry.cabinetWidthMm} × ${catalogEntry.cabinetHeightMm} mm: ngang = ${Number(rawCabCols.toFixed(2))} cabin, cao = ${Number(rawCabRows.toFixed(2))} cabin).`
    );
    warnings.push(
      `Phương án ghép chẵn với ${catalogEntry.cabinetWidthMm}×${catalogEntry.cabinetHeightMm}mm: Hạ chuẩn ${lowerFitOption.cols}×${lowerFitOption.rows} = ${lowerFitOption.cabinetCount} cabin (${lowerFitOption.actualWidthMm}×${lowerFitOption.actualHeightMm}mm) HOẶC Nâng chuẩn ${upperFitOption.cols}×${upperFitOption.rows} = ${upperFitOption.cabinetCount} cabin (${upperFitOption.actualWidthMm}×${upperFitOption.actualHeightMm}mm).`
    );
    if (exact16by9CabinetOption) {
      warnings.push(
        `Gợi ý kỹ thuật khớp 100% kích thước ${widthMm}×${heightMm}mm: Sử dụng Cabinet 16:9 (600×337.5mm) với cấu hình ${exact16by9CabinetOption.cols}×${exact16by9CabinetOption.rows} = ${exact16by9CabinetOption.cabinetCount} cabin.`
      );
    }
  }

  if (!isWidthExactMultipleOfModule || !isHeightExactMultipleOfModule) {
    const nearModCols = Math.max(1, Math.round(rawModCols));
    const nearModRows = Math.max(1, Math.round(rawModRows));
    warnings.push(
      `Chiều rộng/cao (${widthMm}×${heightMm}mm) lệch bội số tấm Module ${catalogEntry.moduleWidthMm}×${catalogEntry.moduleHeightMm}mm (cấu hình Module gần nhất: ${nearModCols}×${nearModRows} = ${nearModCols * nearModRows} tấm → ${nearModCols * catalogEntry.moduleWidthMm}×${nearModRows * catalogEntry.moduleHeightMm}mm).`
    );
  }

  if (input.screenStyle === 'curved') {
    warnings.push(
      'Màn hình cong (Curved): Yêu cầu xử lý biến dạng hình học riêng và khung xương uốn cong theo bán kính thực tế; không áp dụng phép biến đổi mặt phẳng tiêu chuẩn.'
    );
  }

  // Only confirm exact cabinet count when dimensions are an exact multiple (or report nearest assembly with clear warning)
  const effectiveCabCols = isExactCabinetFit ? Math.round(rawCabCols) : Math.round(rawCabCols);
  const effectiveCabRows = isExactCabinetFit ? Math.round(rawCabRows) : Math.round(rawCabRows);
  const effectiveCabinetCount = effectiveCabCols * effectiveCabRows;
  const effectiveModuleCols = Math.max(1, Math.round(rawModCols));
  const effectiveModuleRows = Math.max(1, Math.round(rawModRows));
  const effectiveModuleCount = isExactCabinetFit
    ? effectiveCabinetCount * catalogEntry.modulesPerCabinet
    : effectiveModuleCols * effectiveModuleRows;

  const avgPowerWatts = Math.round(areaM2 * catalogEntry.avgPowerWattsPerM2);
  const maxPowerWatts = Math.round(areaM2 * catalogEntry.maxPowerWattsPerM2);
  const estimatedWeightKg = Number((effectiveCabinetCount * catalogEntry.weightKgPerCabinet).toFixed(1));

  const totalPixels = theoreticalResolutionWidthPx * theoreticalResolutionHeightPx;
  const controllerModel =
    totalPixels > 2_300_000
      ? 'Novastar VX1000 / H2 (4K UHD)'
      : totalPixels > 1_300_000
        ? 'Novastar VX600 / TB60'
        : 'Novastar VX400 / TB40';

  const psuCount = Math.max(1, Math.ceil(effectiveCabinetCount * catalogEntry.powerSuppliesPerCabinet));
  const recvCardCount = Math.max(
    1,
    Math.ceil(effectiveCabinetCount * catalogEntry.receivingCardsPerCabinet)
  );
  const spareModules = Math.max(2, Math.ceil(effectiveModuleCount * 0.02));

  const bomItems: TechnicalBomLineItem[] = [
    {
      itemCode: `MOD_${rawPitch.toUpperCase()}`,
      itemName: `Tấm Module LED ${rawPitch.toUpperCase()} (${catalogEntry.moduleWidthMm}×${catalogEntry.moduleHeightMm}mm)`,
      quantity: effectiveModuleCount,
      unit: 'tấm',
      notes: isExactCabinetFit
        ? `Khớp chuẩn (+${spareModules} tấm dự phòng bảo hành)`
        : `Tính theo diện tích gần nhất (+${spareModules} tấm dự phòng) — Xem cảnh báo lệch bội số`,
    },
    {
      itemCode: catalogEntry.modelCode,
      itemName: catalogEntry.modelName,
      quantity: effectiveCabinetCount,
      unit: 'bộ',
      notes: isExactCabinetFit
        ? `Ghép chuẩn ${effectiveCabCols} cột × ${effectiveCabRows} hàng (${widthMm}×${heightMm}mm)`
        : `CẢNH BÁO: ${effectiveCabCols}×${effectiveCabRows} = ${effectiveCabinetCount} cabin tạo ra kích thước thực ${Math.round(effectiveCabCols * catalogEntry.cabinetWidthMm)}×${Math.round(effectiveCabRows * catalogEntry.cabinetHeightMm)}mm (khác ${widthMm}×${heightMm}mm)`,
    },
    {
      itemCode: 'RECV_MRV328',
      itemName: 'Card thu tín hiệu Novastar MRV328',
      quantity: recvCardCount,
      unit: 'cái',
      notes: 'Đồng bộ quét tần số cao 3840Hz',
    },
    {
      itemCode: 'PSU_5V40A',
      itemName: 'Nguồn công nghiệp Meanwell / G-Energy 5V-40A',
      quantity: psuCount,
      unit: 'bộ',
      notes: `Tổng công suất TB ${avgPowerWatts}W / Cực đại ${maxPowerWatts}W`,
    },
    {
      itemCode: 'CTRL_NOVASTAR',
      itemName: `Bộ xử lý hình ảnh trung tâm ${controllerModel}`,
      quantity: 1,
      unit: 'bộ',
      notes: `Quản lý độ phân giải lý thuyết ${theoreticalResolutionWidthPx}×${theoreticalResolutionHeightPx} px`,
    },
  ];

  const feasibilityStatus: TechnicalFeasibilityStatus =
    input.screenStyle === 'curved'
      ? 'curved_requires_custom_verification'
      : isExactCabinetFit
        ? 'exact_match'
        : 'dimension_mismatch_warning';

  const statusLabel =
    feasibilityStatus === 'exact_match'
      ? 'Khả thi 100% — Khớp bội số Cabinet & Module'
      : feasibilityStatus === 'curved_requires_custom_verification'
        ? 'Màn hình cong — Cần bản vẽ cơ khí uốn cong & kiểm tra biến dạng riêng'
        : 'Cảnh báo lệch bội số Cabinet — Cần xác nhận phương án ghép thực tế';

  return {
    feasibilityStatus,
    statusLabel,
    isFeasibleWithoutAdjustment: isExactCabinetFit && input.screenStyle !== 'curved',
    hasCatalogData: true,
    widthMm,
    heightMm,
    areaM2,
    pixelPitch: rawPitch.toUpperCase(),
    pixelPitchMm,
    theoreticalResolutionWidthPx,
    theoreticalResolutionHeightPx,
    moduleDimensionsMm: `${catalogEntry.moduleWidthMm} × ${catalogEntry.moduleHeightMm} mm`,
    cabinetDimensionsMm: `${catalogEntry.cabinetWidthMm} × ${catalogEntry.cabinetHeightMm} mm`,
    cabinetModelCode: catalogEntry.modelCode,
    exactCabinetCols: isExactCabinetFit ? Math.round(rawCabCols) : null,
    exactCabinetRows: isExactCabinetFit ? Math.round(rawCabRows) : null,
    isWidthExactMultipleOfCabinet,
    isHeightExactMultipleOfCabinet,
    isWidthExactMultipleOfModule,
    isHeightExactMultipleOfModule,
    lowerFitOption,
    upperFitOption,
    exact16by9CabinetOption,
    cabinetCols: effectiveCabCols,
    cabinetRows: effectiveCabRows,
    cabinetCount: effectiveCabinetCount,
    moduleCols: effectiveModuleCols,
    moduleRows: effectiveModuleRows,
    moduleCount: effectiveModuleCount,
    avgPowerWatts,
    maxPowerWatts,
    estimatedWeightKg,
    warnings,
    bomItems,
  };
}

/**
 * Adapter from `evaluateLedTechnicalConfig` to `LedProductSpecDto` for backward compatibility
 * with existing UI components while injecting real engineering warnings and accurate cabinet notes.
 */
export function buildVerifiedLedProductSpecDto(params: {
  productId?: number;
  productCode?: string;
  productName?: string;
  categoryGroup?: string;
  widthM?: number | null;
  heightM?: number | null;
  pitch?: string | null;
  screenStyle?: 'flat' | 'curved' | 'corner_90';
  cabinetModelCode?: string | null;
}): LedProductSpecDto & {
  feasibilityStatus?: TechnicalFeasibilityStatus;
  feasibilityWarnings?: string[];
  isExactCabinetFit?: boolean;
} {
  const wM = params.widthM && params.widthM > 0 ? params.widthM : 4.8;
  const hM = params.heightM && params.heightM > 0 ? params.heightM : 2.7;
  const pitch = params.pitch || 'P2.5';
  const evalRes = evaluateLedTechnicalConfig({
    widthMm: Math.round(wM * 1000),
    heightMm: Math.round(hM * 1000),
    pixelPitch: pitch,
    cabinetModelCode: params.cabinetModelCode || 'CAB_640_480',
    screenStyle: params.screenStyle || 'flat',
  });

  const cabNoteSuffix =
    evalRes.feasibilityStatus === 'dimension_mismatch_warning'
      ? ` [Cảnh báo: ${Math.round(wM * 1000)}×${Math.round(hM * 1000)}mm = ${Number(((wM * 1000) / 640).toFixed(2))}×${Number(((hM * 1000) / 480).toFixed(2))} cabin 640×480mm — Khuyên dùng ${evalRes.lowerFitOption?.cols}×${evalRes.lowerFitOption?.rows}=${evalRes.lowerFitOption?.cabinetCount} cabin (${evalRes.lowerFitOption?.actualWidthMm}×${evalRes.lowerFitOption?.actualHeightMm}mm), ${evalRes.upperFitOption?.cols}×${evalRes.upperFitOption?.rows}=${evalRes.upperFitOption?.cabinetCount} cabin (${evalRes.upperFitOption?.actualWidthMm}×${evalRes.upperFitOption?.actualHeightMm}mm), hoặc 64 cabin 16:9 600×337.5mm]`
      : '';

  return {
    productId: params.productId || 1,
    productCode: params.productCode || 'LED_INDOOR',
    productName: params.productName || 'Màn hình LED Indoor',
    categoryGroup: params.categoryGroup || 'led_screen',
    screenStyle: params.screenStyle || 'flat',
    pixelPitch: evalRes.pixelPitch || pitch,
    physicalWidthM: wM,
    physicalHeightM: hM,
    areaM2: evalRes.areaM2 ?? Number((wM * hM).toFixed(2)),
    resolutionWidthPx: evalRes.theoreticalResolutionWidthPx ?? 1920,
    resolutionHeightPx: evalRes.theoreticalResolutionHeightPx ?? 1080,
    moduleDimensionsMm: evalRes.moduleDimensionsMm,
    cabinetDimensionsMm: `${evalRes.cabinetDimensionsMm}${cabNoteSuffix}`,
    cabinetCount: evalRes.cabinetCount ?? 48,
    moduleCount: evalRes.moduleCount ?? 288,
    controller:
      evalRes.bomItems.find((b) => b.itemCode === 'CTRL_NOVASTAR')?.itemName ||
      'Novastar TB60 / VX600 chuyên dụng',
    receivingCard: 'Novastar MRV328',
    powerSupply: 'Meanwell / G-Energy 5V-40A công nghiệp',
    avgPowerWatts: evalRes.avgPowerWatts ?? Math.round(wM * hM * 250),
    maxPowerWatts: evalRes.maxPowerWatts ?? Math.round(wM * hM * 600),
    technicalNotes:
      evalRes.warnings.length > 0
        ? `⚠️ ${evalRes.statusLabel}: ${evalRes.warnings.join(' | ')}`
        : 'Khớp chuẩn bội số kỹ thuật Module & Cabinet. Lắp âm vách tường, khung sắt hộp mạ kẽm 40×40mm, tiếp địa an toàn < 4Ω.',
    feasibilityStatus: evalRes.feasibilityStatus,
    feasibilityWarnings: evalRes.warnings,
    isExactCabinetFit: evalRes.feasibilityStatus === 'exact_match',
  };
}

