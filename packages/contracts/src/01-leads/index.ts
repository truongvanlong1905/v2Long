import { z } from 'zod';
import type { MonetaryAmountDto } from '../common';

const BigIntStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+$/, 'Giá trị số nguyên lớn (BigInt) phải là chuỗi chữ số hợp lệ.');

export const PIPELINE_STATUSES = [
  'new_lead',
  'quoting',
  'quote_sent',
  'won',
  'lost',
] as const;

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  new_lead: 'Vừa nhận thông tin',
  quoting: 'Đang soạn báo giá',
  quote_sent: 'Đã gửi báo giá',
  won: 'Chốt thành công',
  lost: 'Thất bại',
};

export const CONTACT_CHANNELS = [
  'hotline',
  'form_web',
  'google_lead_form',
  'zalo',
  'email',
  'fanpage',
] as const;

export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  hotline: 'Hotline',
  form_web: 'Form Website',
  google_lead_form: 'Google Lead Form',
  zalo: 'Zalo',
  email: 'Email',
  fanpage: 'Fanpage',
};

export const AREA_TYPES = ['hcm', 'other_province'] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const HCM_DISTRICTS = [
  'TP. Thủ Đức',
  'Quận 1',
  'Quận 3',
  'Quận 4',
  'Quận 5',
  'Quận 6',
  'Quận 7',
  'Quận 8',
  'Quận 10',
  'Quận 11',
  'Quận 12',
  'Quận Bình Thạnh',
  'Quận Gò Vấp',
  'Quận Phú Nhuận',
  'Quận Tân Bình',
  'Quận Tân Phú',
  'Quận Bình Tân',
  'Huyện Bình Chánh',
  'Huyện Củ Chi',
  'Huyện Hóc Môn',
  'Huyện Nhà Bè',
  'Huyện Cần Giờ',
] as const;

export const VIETNAM_PROVINCES = [
  'Hà Nội',
  'Đà Nẵng',
  'Hải Phòng',
  'Cần Thơ',
  'Bình Dương',
  'Đồng Nai',
  'Bà Rịa - Vũng Tàu',
  'Long An',
  'Tây Ninh',
  'Bình Phước',
  'Tiền Giang',
  'Bến Tre',
  'Vĩnh Long',
  'Đắk Lắk',
  'Lâm Đồng',
  'Khánh Hòa',
  'Bình Thuận',
  'Ninh Thuận',
  'Quảng Nam',
  'Thừa Thiên Huế',
  'Nghệ An',
  'Thanh Hóa',
  'Bắc Ninh',
  'Bắc Giang',
  'Quảng Ninh',
  'Thái Nguyên',
  'Hưng Yên',
  'Hải Dương',
  'Vĩnh Phúc',
  'Kiên Giang',
  'An Giang',
  'Đồng Tháp',
  'Cà Mau',
  'Sóc Trăng',
  'Bạc Liêu',
  'Trà Vinh',
  'Hậu Giang',
  'Gia Lai',
  'Kon Tum',
  'Đắk Nông',
  'Bình Định',
  'Phú Yên',
  'Quảng Ngãi',
  'Quảng Bình',
  'Quảng Trị',
  'Hà Tĩnh',
  'Nam Định',
  'Thái Bình',
  'Ninh Bình',
  'Hà Nam',
  'Phú Thọ',
  'Tuyên Quang',
  'Lào Cai',
  'Yên Bái',
  'Sơn La',
  'Hòa Bình',
  'Lạng Sơn',
  'Cao Bằng',
  'Bắc Kạn',
  'Hà Giang',
  'Điện Biên',
  'Lai Châu',
] as const;

export const LOST_REASONS = [
  'Giá chưa tốt',
  'Khách còn xem xét lại option',
  'Đổi kế hoạch / Tạm hoãn dự án',
  'Không đúng tiến độ giao hàng',
  'Đã chọn nhà cung cấp khác',
  'Không liên hệ lại được',
  'Lý do khác',
] as const;

export const REASSIGN_REASONS = [
  'Bận',
  'Không đúng thế mạnh',
  'Lý do khác',
] as const;

export const SPAM_REASONS = [
  'SĐT không tồn tại',
  'Nhầm máy',
  'Sai số',
  'Đối thủ khảo giá',
  'Quảng cáo / Chào mời dịch vụ',
] as const;

export interface ProductCatalogDto {
  id: number;
  productCode: string;
  productName: string;
  category: 'MAN_HINH_LED' | 'BANG_DIEN_TU' | 'KHAC';
  isActive: boolean;
}

export interface LeadAttachmentDto {
  id: number;
  leadId: number;
  fileName: string;
  fileType: 'site_photo' | 'cad_drawing' | 'quote_doc' | 'other';
  downloadUrl: string;
  uploadedById: number;
  uploadedByName: string;
  createdAt: string;
}

export interface LeadActivityDto {
  id: number;
  leadId: number;
  actionType: string;
  actorType: 'USER' | 'WEBHOOK' | 'SYSTEM';
  actorName: string;
  fromStatus: string | null;
  toStatus: string | null;
  fromSalesName: string | null;
  toSalesName: string | null;
  reason: string | null;
  noteContent: string | null;
  createdAt: string;
}

export interface PriceCheckAlertDto {
  id: number;
  leadId: number;
  leadCode: string;
  phone: string;
  companyName: string | null;
  reasonEvidence: string;
  chatScreenshotDownloadUrl: string | null;
  status: 'ACTIVE' | 'DISMISSED';
  reportedById: number;
  reportedByName: string;
  createdAt: string;
}

export interface LeadTrackingSummaryDto {
  marketingSource: string;
  attributionMethod: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  campaignCode: string | null;
  campaignName: string | null;
  gclid: string | null;
  landingPageUrl: string | null;
  deviceType: string | null;
  isUnmatchedUtm: boolean;
  isUnknownSource: boolean;
  isUnknownCampaign: boolean;
  utmGclidMismatch: boolean;
}

export interface LeadQuoteVersionDto {
  id: number;
  quoteCode: string;
  versionNumber: number;
  scopeSummary: string;
  validUntilDate: string | null;
  createdByName: string;
  createdAt: string;
  bypassPriceCheckConfirmed: boolean;
}

export interface LeadDesignSummaryDto {
  id: number;
  requestType: 'perspective_3d' | 'banner';
  status: 'pending' | 'ai_drafted' | 'in_review' | 'completed';
  ledCategory: string | null;
  screenDimensions: string | null;
  designerName: string;
  latestVersionNumber: number;
  previewImageUrl: string | null;
  updatedAt: string;
}

export interface LeadItemDto {
  id: number;
  leadCode: string;
  version: number;
  contactName: string | null;
  companyName: string | null;
  projectName: string | null;
  phone: string;
  email: string | null;
  isPhoneNormalized: boolean;
  contactChannel: ContactChannel;
  selfReportedSource: string | null;
  areaType: AreaType | null;
  hcmDistrict: string | null;
  province: string | null;
  installationAddress: string | null;
  customProductNote: string | null;
  assignedSalesId: number | null;
  assignedSalesName: string | null;
  receivedConfirmedAt: string | null;
  receivedConfirmedByName: string | null;
  pipelineStatus: PipelineStatus;
  lostReason: string | null;
  reopenReason: string | null;
  quoteSentAt: string | null;
  quoteRespondedAt: string | null;
  isQuoteOverdue7Days: boolean;
  isDuplicateAlert: boolean;
  duplicateType: 'NONE' | 'ACTIVE_RED' | 'PRIOR_LEAD';
  duplicateOfLeadId: number | null;
  duplicateOfLeadCode: string | null;
  duplicateOfLeadStatus: string | null;
  isRepeatLead: boolean;
  isPriceCheckSuspect: boolean;
  spamStatus: 'NONE' | 'PENDING_REVIEW' | 'CONFIRMED';
  spamReason: string | null;
  slaStatus: 'NORMAL' | 'WARN_UNRECEIVED' | 'WARN_STALE' | 'ESCALATED';
  initialNote: string | null;
  createdByActorType: 'USER' | 'WEBHOOK' | 'SYSTEM';
  createdByName: string;
  contactedAt: string;
  createdAt: string;
  updatedAt: string;
  /** Cho biết bản ghi đã được ẩn danh theo UC01 (Marketing/Ads) hay chưa */
  isAnonymized: boolean;
  products: ProductCatalogDto[];
  tracking: LeadTrackingSummaryDto | null;
  attachmentsCount: number;
  attachments?: LeadAttachmentDto[];
  activities?: LeadActivityDto[];
  /** Tiến độ các lần gửi báo giá (không chứa số tiền) — trả về cho BOD, Admin, Sales Lead, Sales phụ trách */
  quoteVersions?: LeadQuoteVersionDto[];
  /** Liên thông hai chiều với Studio Thiết kế & Phối cảnh 3D AI (M05) */
  designRequests?: LeadDesignSummaryDto[];
}

export interface SalesAssigneeOptionDto {
  id: number;
  fullName: string;
  email: string;
  isOnline: boolean;
  isReceivingLeads: boolean;
  activeLeadCount: number;
  eligibleForBusyTransfer: boolean;
}

export const CreateManualLeadSchema = z.object({
  contactChannel: z.enum(['hotline', 'zalo', 'email', 'form_web']),
  phone: z.string().trim().min(6, 'Vui lòng nhập số điện thoại liên hệ.').max(30),
  contactName: z.string().trim().max(150).optional().nullable(),
  companyName: z.string().trim().max(200).optional().nullable(),
  projectName: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email('Email không hợp lệ.').or(z.literal('')).optional().nullable(),
  selfReportedSource: z.string().trim().max(150).optional().nullable(),
  areaType: z.enum(AREA_TYPES).optional().nullable(),
  hcmDistrict: z.string().trim().max(100).optional().nullable(),
  province: z.string().trim().max(100).optional().nullable(),
  installationAddress: z.string().trim().max(500).optional().nullable(),
  productIds: z.array(z.number().int().positive()).default([]),
  customProductNote: z.string().trim().max(500).optional().nullable(),
  initialNote: z.string().trim().max(2000).optional().nullable(),
  contactedAt: z.string().datetime().optional(),
  reassignToSalesId: z.number().int().positive().optional().nullable(),
  reassignReason: z.string().trim().max(300).optional().nullable(),
});

export type CreateManualLeadDto = z.infer<typeof CreateManualLeadSchema>;

export const UpdateLeadDetailsSchema = z.object({
  expectedVersion: z.number().int().positive(),
  contactName: z.string().trim().max(150).optional().nullable(),
  companyName: z.string().trim().max(200).optional().nullable(),
  projectName: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().min(6).max(30).optional(),
  email: z.string().trim().email().or(z.literal('')).optional().nullable(),
  selfReportedSource: z.string().trim().max(150).optional().nullable(),
  areaType: z.enum(AREA_TYPES).optional().nullable(),
  hcmDistrict: z.string().trim().max(100).optional().nullable(),
  province: z.string().trim().max(100).optional().nullable(),
  installationAddress: z.string().trim().max(500).optional().nullable(),
  productIds: z.array(z.number().int().positive()).optional(),
  customProductNote: z.string().trim().max(500).optional().nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateLeadDetailsDto = z.infer<typeof UpdateLeadDetailsSchema>;

export const TransitionPipelineSchema = z.object({
  expectedVersion: z.number().int().positive(),
  toStatus: z.enum(PIPELINE_STATUSES),
  reason: z.string().trim().max(500).optional().nullable(),
  noteContent: z.string().trim().max(2000).optional().nullable(),
  markQuoteResponded: z.boolean().optional(),
  bypassPriceCheckConfirmed: z.boolean().optional(),
});

export type TransitionPipelineDto = z.infer<typeof TransitionPipelineSchema>;

/**
 * Quy tắc nghiệp vụ mới nhất: hệ thống KHÔNG lưu/hiển thị giá sản phẩm, giá trị báo giá,
 * giá trị hợp đồng, doanh thu hay lợi nhuận. Một "lần gửi báo giá" chỉ ghi nhận tiến độ:
 * phạm vi kỹ thuật, hạn hiệu lực, người phụ trách và thời điểm.
 */
const MONEY_LIKE_PATTERN =
  /(\d[\d.,\s]*\s*(đ|₫|vnđ|vnd|đồng|triệu|tr\b|tỷ|ty\b|k\b|usd|\$))|((đ|₫|vnđ|vnd|usd|\$)\s*\d)/i;

export function containsMonetaryAmountText(text: string | null | undefined): boolean {
  if (!text) return false;
  return MONEY_LIKE_PATTERN.test(text);
}

export const CreatePrivateQuoteVersionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  scopeSummary: z
    .string()
    .trim()
    .min(3, 'Vui lòng nhập tóm tắt phạm vi kỹ thuật của lần gửi báo giá.')
    .max(1500)
    .refine((v) => !containsMonetaryAmountText(v), {
      message:
        'Không nhập số tiền, đơn giá hay giá trị báo giá vào hệ thống. Chỉ ghi phạm vi kỹ thuật và tiến độ.',
    }),
  validUntilDate: z.string().trim().max(40).optional().nullable(),
  transitionToQuoteSent: z.boolean().optional(),
  bypassPriceCheckConfirmed: z.boolean().optional(),
});

export type CreatePrivateQuoteVersionDto = z.infer<typeof CreatePrivateQuoteVersionSchema>;

export const ReassignLeadSchema = z.object({
  expectedVersion: z.number().int().positive(),
  toSalesId: z.number().int().positive('Vui lòng chọn Nhân viên kinh doanh nhận bàn giao.'),
  reasonCategory: z.enum(REASSIGN_REASONS),
  reasonDetail: z.string().trim().max(500).optional().nullable(),
});

export type ReassignLeadDto = z.infer<typeof ReassignLeadSchema>;

export const MarkLeadSpamSchema = z.object({
  expectedVersion: z.number().int().positive(),
  spamReason: z.enum(SPAM_REASONS),
  noteContent: z.string().trim().max(500).optional().nullable(),
});

export type MarkLeadSpamDto = z.infer<typeof MarkLeadSpamSchema>;

export const CreatePriceCheckAlertSchema = z.object({
  leadId: z.number().int().positive(),
  reasonEvidence: z
    .string()
    .trim()
    .min(5, 'Vui lòng nhập căn cứ xác định đối thủ dò giá (tối thiểu 5 ký tự).')
    .max(1000),
});

export type CreatePriceCheckAlertDto = z.infer<typeof CreatePriceCheckAlertSchema>;
