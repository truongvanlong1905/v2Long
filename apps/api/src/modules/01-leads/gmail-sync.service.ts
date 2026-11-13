import { prisma, ingestLeadWithTrackingIdempotent } from '@toantrung/database';
import {
  getGoogleConnection,
  getValidAccessToken,
} from '../02-tracking-sync/google-oauth.service';
import {
  generateNextLeadCode,
  inspectDuplicateAndPriceCheck,
  normalizeVietnamPhone,
  selectAutoAssignedSales,
} from './service';

const SETTING_KEY_GMAIL_SYNC = 'gmail_lead_sync_config';
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

export interface GmailSyncSummary {
  scanned: number;
  created: number;
  deduplicated: number;
  skippedNoise: number;
  failed: number;
  error: string | null;
}

export interface GmailLeadSyncConfig {
  enabled: boolean;
  query: string;
  maxMessages: number;
  onlyLeadKeywords: boolean;
  lastSyncAt: string | null;
  lastSyncSummary: GmailSyncSummary | null;
}

export interface GmailCreatedLeadPreview {
  id: number;
  leadCode: string;
  contactName: string | null;
  email: string | null;
  phone: string;
  projectName: string | null;
}

export interface GmailSyncRunResult {
  ok: boolean;
  needsAuth?: boolean;
  needsReauth?: boolean;
  isSandboxDemo?: boolean;
  connectedEmail: string | null;
  message: string;
  summary: GmailSyncSummary;
  createdLeads: GmailCreatedLeadPreview[];
}

const DEFAULT_CONFIG: GmailLeadSyncConfig = {
  enabled: true,
  query: 'in:inbox newer_than:7d -category:promotions -category:social',
  maxMessages: 20,
  onlyLeadKeywords: true,
  lastSyncAt: null,
  lastSyncSummary: null,
};

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.com.vn',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'ymail.com',
]);

const AUTOMATED_SENDER_PATTERNS = [
  'noreply',
  'no-reply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'postmaster@',
  'notifications@',
  'notification@',
  'newsletter@',
  'marketing@',
  'promo@',
  'accounts.google.com',
  'googlealerts-noreply',
  'facebookmail.com',
  'linkedin.com',
  'github.com',
];

const LEAD_KEYWORDS = [
  'báo giá',
  'bao gia',
  'tư vấn',
  'tu van',
  'màn hình',
  'man hinh',
  'led',
  'p2',
  'p2.5',
  'p3',
  'p4',
  'p5',
  'kích thước',
  'kich thuoc',
  'lắp đặt',
  'lap dat',
  'dự án',
  'du an',
  'liên hệ',
  'lien he',
  'cần mua',
  'can mua',
  'khảo sát',
  'khao sat',
  'hợp đồng',
  'hop dong',
  'quote',
  'quotation',
  'display',
  'screen',
];

export async function getGmailLeadSyncConfig(): Promise<GmailLeadSyncConfig> {
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_GMAIL_SYNC },
    });
    if (!row?.value) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(row.value) as Partial<GmailLeadSyncConfig>;
    return {
      enabled: Boolean(parsed.enabled),
      query:
        typeof parsed.query === 'string' && parsed.query.trim()
          ? parsed.query.trim()
          : DEFAULT_CONFIG.query,
      maxMessages:
        typeof parsed.maxMessages === 'number' && parsed.maxMessages > 0
          ? Math.min(50, Math.max(5, Math.round(parsed.maxMessages)))
          : DEFAULT_CONFIG.maxMessages,
      onlyLeadKeywords:
        typeof parsed.onlyLeadKeywords === 'boolean'
          ? parsed.onlyLeadKeywords
          : DEFAULT_CONFIG.onlyLeadKeywords,
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
      lastSyncSummary: parsed.lastSyncSummary ?? null,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveGmailLeadSyncConfig(
  patch: Partial<GmailLeadSyncConfig>,
): Promise<GmailLeadSyncConfig> {
  const current = await getGmailLeadSyncConfig();
  const next: GmailLeadSyncConfig = {
    ...current,
    ...patch,
    query:
      typeof patch.query === 'string' && patch.query.trim()
        ? patch.query.trim()
        : current.query,
    maxMessages:
      typeof patch.maxMessages === 'number' && patch.maxMessages > 0
        ? Math.min(50, Math.max(5, Math.round(patch.maxMessages)))
        : current.maxMessages,
  };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_GMAIL_SYNC },
    update: { value: JSON.stringify(next) },
    create: { key: SETTING_KEY_GMAIL_SYNC, value: JSON.stringify(next) },
  });

  return next;
}

export async function getGmailLeadSyncStatus() {
  const [conn, config] = await Promise.all([
    getGoogleConnection(),
    getGmailLeadSyncConfig(),
  ]);
  const scopes = conn?.scopes || [];
  const hasGmailScope = scopes.some(
    (s) => s === GMAIL_READONLY_SCOPE || s.includes('gmail.readonly') || s.includes('mail.google.com'),
  );

  return {
    connected: Boolean(conn?.connected),
    connectedEmail: conn?.connectedEmail ?? null,
    isSandboxDemo: Boolean(conn?.isSandboxDemo),
    hasGmailScope,
    config,
  };
}

/**
 * Tách Tên liên hệ, Email và gợi ý tên Công ty (từ domain doanh nghiệp) trong header `From`.
 */
export function parseEmailAddressHeader(fromHeader: string): {
  contactName: string | null;
  email: string | null;
  companyHint: string | null;
} {
  const raw = (fromHeader || '').trim();
  if (!raw) return { contactName: null, email: null, companyHint: null };

  const angleMatch = raw.match(/^(.*?)\s*<([^<>@\s]+@[^<>@\s]+)>$/);
  let contactName: string | null = null;
  let email: string | null = null;

  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^["']+|["']+$/g, '');
    contactName = rawName || null;
    email = angleMatch[2].trim().toLowerCase();
  } else {
    const emailOnly = raw.match(/([^\s<>,"']+@[^\s<>,"']+)/);
    if (emailOnly) {
      email = emailOnly[1].trim().toLowerCase();
    }
  }

  let companyHint: string | null = null;
  if (email) {
    const domain = email.split('@')[1] || '';
    if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
      const label = domain.split('.')[0] || '';
      if (label.length >= 2) {
        companyHint = label.charAt(0).toUpperCase() + label.slice(1);
      }
    }
  }

  return { contactName, email, companyHint };
}

/**
 * Tìm số điện thoại Việt Nam hợp lệ đầu tiên trong tiêu đề hoặc nội dung email.
 */
export function extractVietnamPhoneFromText(text: string): {
  normalizedPhone: string | null;
  isUnstandardized: boolean;
} {
  if (!text) return { normalizedPhone: null, isUnstandardized: true };
  const candidates = text.match(/(?:\+?84|0)(?:[\s.\-]*\d){8,10}/g) || [];
  for (const raw of candidates) {
    const { normalizedPhone, isUnstandardized } = normalizeVietnamPhone(raw);
    if (!isUnstandardized && /^0[35789]\d{8}$/.test(normalizedPhone)) {
      return { normalizedPhone, isUnstandardized: false };
    }
  }
  for (const raw of candidates) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 9 && digits.length <= 12) {
      const { normalizedPhone, isUnstandardized } = normalizeVietnamPhone(raw);
      return { normalizedPhone, isUnstandardized };
    }
  }
  return { normalizedPhone: null, isUnstandardized: true };
}

function decodeBase64Url(data: string): string {
  try {
    const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface GmailMimePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailMimePart[];
}

export function decodeGmailBody(payload?: GmailMimePart | null): string {
  if (!payload) return '';
  let plainText = '';
  let htmlText = '';

  const walk = (part: GmailMimePart) => {
    const mime = (part.mimeType || '').toLowerCase();
    if (part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (mime === 'text/plain' && !plainText) {
        plainText = decoded;
      } else if (mime === 'text/html' && !htmlText) {
        htmlText = stripHtmlTags(decoded);
      } else if (!mime.startsWith('multipart/') && !plainText && !htmlText) {
        plainText = decoded;
      }
    }
    if (Array.isArray(part.parts)) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  };

  walk(payload);
  return (plainText || htmlText).replace(/\r\n/g, '\n').trim();
}

export function parseStructuredFormEmailBody(subject: string, bodyText: string): {
  isStructuredForm: boolean;
  formSource: string | null;
  contactName: string | null;
  phone: string | null;
  isPhoneUnstandardized: boolean;
  email: string | null;
  address: string | null;
  areaType: 'tphcm' | 'other_province' | null;
  province: string | null;
  productNote: string | null;
} {
  const normalizedBody = (bodyText || '')
    .replace(/\r\n/g, '\n')
    .replace(/--+\s*Thông báo biểu mẫu[\s\S]*$/i, '')
    .trim();

  const extractField = (labels: string[]): string | null => {
    const labelGroup = labels.join('|');
    const regex = new RegExp(
      `(?:^|\\n|\\s-\\s*)(?:${labelGroup})\\s*:\\s*([^\\n]+?)(?=\\s+-\\s*(?:Gửi đến từ|Khách hàng|Họ tên|Tên|Số điện thoại|SĐT|Điện thoại|Email|Địa chỉ|Sản phẩm|Nhu cầu)\\s*:|\\n|$)`,
      'i',
    );
    const match = normalizedBody.match(regex);
    const val = match?.[1]?.trim();
    return val || null;
  };

  const formSource = extractField(['Gửi đến từ', 'Nguồn form', 'Form']);
  const contactName = extractField(['Khách hàng', 'Họ và tên', 'Họ tên', 'Tên khách hàng', 'Tên']);
  const rawPhone = extractField(['Số điện thoại', 'SĐT', 'Điện thoại', 'Phone']);
  const rawEmail = extractField(['Email', 'E-mail']);
  const address = extractField(['Địa chỉ', 'Khu vực', 'Tỉnh/Thành']);
  const productNote = extractField(['Sản phẩm', 'Nhu cầu', 'Màn hình']);

  const phoneExtract = rawPhone
    ? normalizeVietnamPhone(rawPhone)
    : { normalizedPhone: '', isUnstandardized: true };
  const validPhone =
    phoneExtract.normalizedPhone && phoneExtract.normalizedPhone.replace(/\D/g, '').length >= 8
      ? phoneExtract.normalizedPhone
      : null;

  const emailMatch = rawEmail?.match(/([^\s<>,"']+@[^\s<>,"']+)/);
  const email = emailMatch ? emailMatch[1].toLowerCase() : null;

  let areaType: 'tphcm' | 'other_province' | null = null;
  let province: string | null = null;
  if (address) {
    const addrLower = address.toLowerCase();
    if (
      addrLower === 'hcm' ||
      addrLower.includes('tp.hcm') ||
      addrLower.includes('tp hcm') ||
      addrLower.includes('hồ chí minh') ||
      addrLower.includes('ho chi minh') ||
      addrLower.includes('sài gòn')
    ) {
      areaType = 'tphcm';
      province = 'TP. Hồ Chí Minh';
    } else {
      areaType = 'other_province';
      province = address.slice(0, 80);
    }
  }

  const isStructuredForm = Boolean(
    formSource ||
      contactName ||
      productNote ||
      subject.toLowerCase().includes('form báo giá'),
  );

  return {
    isStructuredForm,
    formSource,
    contactName,
    phone: validPhone,
    isPhoneUnstandardized: validPhone ? phoneExtract.isUnstandardized : true,
    email,
    address,
    areaType,
    province,
    productNote,
  };
}

export function isLikelyLeadEmail(params: {
  fromEmail: string;
  subject: string;
  bodyText: string;
  hasPhone: boolean;
  onlyLeadKeywords: boolean;
}): boolean {
  const fromLower = params.fromEmail.toLowerCase();
  if (AUTOMATED_SENDER_PATTERNS.some((pat) => fromLower.includes(pat))) {
    return false;
  }

  if (!params.onlyLeadKeywords) {
    return true;
  }

  if (params.hasPhone) {
    return true;
  }

  const haystack = `${params.subject}\n${params.bodyText}`.toLowerCase();
  return LEAD_KEYWORDS.some((kw) => haystack.includes(kw));
}

function getHeaderValue(
  headers: Array<{ name?: string; value?: string }> | undefined,
  name: string,
): string {
  if (!headers) return '';
  const target = name.toLowerCase();
  return headers.find((h) => (h.name || '').toLowerCase() === target)?.value || '';
}

const globalForGmailSync = globalThis as typeof globalThis & {
  __gmailSyncInFlight?: Promise<GmailSyncRunResult> | null;
  __gmailAutoSyncPollerStarted?: boolean;
};

export function ensureGmailAutoSyncPollerStarted(): void {
  if (globalForGmailSync.__gmailAutoSyncPollerStarted) return;
  globalForGmailSync.__gmailAutoSyncPollerStarted = true;

  const timer = setInterval(async () => {
    try {
      const [conn, cfg] = await Promise.all([
        getGoogleConnection(),
        getGmailLeadSyncConfig(),
      ]);
      if (!cfg.enabled || !conn?.connected || conn.isSandboxDemo) return;
      const hasGmailScope = (conn.scopes || []).some(
        (s) =>
          s === GMAIL_READONLY_SCOPE ||
          s.includes('gmail.readonly') ||
          s.includes('mail.google.com'),
      );
      if (!hasGmailScope) return;
      await syncLeadsFromGmail();
    } catch {
      // Background poll errors should never crash the server process
    }
  }, 20_000);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

export async function syncLeadsFromGmail(options?: {
  query?: string;
  maxMessages?: number;
  onlyLeadKeywords?: boolean;
}): Promise<GmailSyncRunResult> {
  if (globalForGmailSync.__gmailSyncInFlight) {
    return globalForGmailSync.__gmailSyncInFlight;
  }

  const runPromise = runSyncLeadsFromGmailInternal(options).finally(() => {
    globalForGmailSync.__gmailSyncInFlight = null;
  });
  globalForGmailSync.__gmailSyncInFlight = runPromise;
  return runPromise;
}

async function runSyncLeadsFromGmailInternal(options?: {
  query?: string;
  maxMessages?: number;
  onlyLeadKeywords?: boolean;
}): Promise<GmailSyncRunResult> {
  const conn = await getGoogleConnection();
  const config = await getGmailLeadSyncConfig();

  const query = (options?.query || config.query).trim();
  const maxMessages = options?.maxMessages
    ? Math.min(50, Math.max(5, Math.round(options.maxMessages)))
    : config.maxMessages;
  const onlyLeadKeywords =
    typeof options?.onlyLeadKeywords === 'boolean'
      ? options.onlyLeadKeywords
      : config.onlyLeadKeywords;

  if (!conn || !conn.connected || !conn.connectedEmail) {
    return {
      ok: false,
      needsAuth: true,
      connectedEmail: null,
      message: 'Chưa kết nối tài khoản Google / Gmail. Vui lòng kết nối Google OAuth trước.',
      summary: { scanned: 0, created: 0, deduplicated: 0, skippedNoise: 0, failed: 0, error: 'NOT_CONNECTED' },
      createdLeads: [],
    };
  }

  if (conn.isSandboxDemo) {
    return {
      ok: false,
      isSandboxDemo: true,
      connectedEmail: conn.connectedEmail,
      message:
        'Đang ở chế độ Kiểm thử Mẫu (Sandbox Demo) nên không có hộp thư Gmail thực tế. Vui lòng kết nối tài khoản Google thật để quét Gmail.',
      summary: { scanned: 0, created: 0, deduplicated: 0, skippedNoise: 0, failed: 0, error: 'SANDBOX_DEMO' },
      createdLeads: [],
    };
  }

  const hasGmailScope = (conn.scopes || []).some(
    (s) => s === GMAIL_READONLY_SCOPE || s.includes('gmail.readonly') || s.includes('mail.google.com'),
  );
  if (!hasGmailScope) {
    return {
      ok: false,
      needsReauth: true,
      connectedEmail: conn.connectedEmail,
      message:
        'Tài khoản Google hiện tại chưa được cấp quyền đọc Gmail (gmail.readonly). Vui lòng bấm "Cấp quyền đọc Gmail" để xác nhận lại.',
      summary: { scanned: 0, created: 0, deduplicated: 0, skippedNoise: 0, failed: 0, error: 'MISSING_GMAIL_SCOPE' },
      createdLeads: [],
    };
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return {
      ok: false,
      needsAuth: true,
      connectedEmail: conn.connectedEmail,
      message: 'Token Google đã hết hạn và không thể làm mới. Vui lòng kết nối lại Google.',
      summary: { scanned: 0, created: 0, deduplicated: 0, skippedNoise: 0, failed: 0, error: 'TOKEN_EXPIRED' },
      createdLeads: [],
    };
  }

  const accountKey = conn.connectedEmail.trim().toLowerCase();
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('maxResults', String(maxMessages));

  const listResp = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (listResp.status === 401 || listResp.status === 403) {
    const errText = await listResp.text();
    const isScopeErr = errText.includes('insufficientPermissions') || errText.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT');
    return {
      ok: false,
      needsReauth: isScopeErr || listResp.status === 403,
      needsAuth: listResp.status === 401,
      connectedEmail: conn.connectedEmail,
      message: isScopeErr
        ? 'Google từ chối quyền đọc Gmail. Vui lòng bấm "Cấp quyền đọc Gmail" để cấp lại quyền gmail.readonly.'
        : `Lỗi xác thực Gmail API (${listResp.status}): ${errText.slice(0, 180)}`,
      summary: { scanned: 0, created: 0, deduplicated: 0, skippedNoise: 0, failed: 0, error: `HTTP_${listResp.status}` },
      createdLeads: [],
    };
  }

  if (!listResp.ok) {
    const errText = await listResp.text();
    throw new Error(`Gmail API trả lỗi ${listResp.status}: ${errText.slice(0, 200)}`);
  }

  const listJson = (await listResp.json()) as {
    messages?: Array<{ id: string; threadId?: string }>;
  };
  const messageRefs = listJson.messages || [];

  const summary: GmailSyncSummary = {
    scanned: messageRefs.length,
    created: 0,
    deduplicated: 0,
    skippedNoise: 0,
    failed: 0,
    error: null,
  };
  const createdLeads: GmailCreatedLeadPreview[] = [];

  for (const ref of messageRefs) {
    try {
      // Pre-check idempotency key before downloading full email payload
      const existingTracking = await prisma.marketingTracking.findUnique({
        where: {
          uq_tracking_source_submission: {
            intakeSourceProvider: 'gmail_sync',
            intakeSourceAccountKey: accountKey,
            externalSubmissionId: ref.id,
          },
        },
        select: { id: true },
      });

      if (existingTracking) {
        summary.deduplicated += 1;
        continue;
      }

      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(ref.id)}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!msgResp.ok) {
        summary.failed += 1;
        continue;
      }

      const msgData = (await msgResp.json()) as {
        id: string;
        snippet?: string;
        internalDate?: string;
        payload?: GmailMimePart & {
          headers?: Array<{ name?: string; value?: string }>;
        };
      };

      const headers = msgData.payload?.headers;
      const fromHeader = getHeaderValue(headers, 'From');
      const subject = getHeaderValue(headers, 'Subject').trim() || '(Không có tiêu đề)';
      const parsedFrom = parseEmailAddressHeader(fromHeader);

      const bodyText = decodeGmailBody(msgData.payload) || msgData.snippet || '';
      const structured = parseStructuredFormEmailBody(subject, bodyText);
      const fallbackPhone = extractVietnamPhoneFromText(`${subject}\n${bodyText}`);
      const resolvedPhone = structured.phone || fallbackPhone.normalizedPhone;
      const isPhoneUnstandardized = structured.phone
        ? structured.isPhoneUnstandardized
        : fallbackPhone.isUnstandardized;

      if (!parsedFrom.email) {
        summary.skippedNoise += 1;
        continue;
      }

      // Skip self-sent emails ONLY if they are NOT structured form-quote notifications
      if (parsedFrom.email === accountKey && !structured.isStructuredForm && !resolvedPhone) {
        summary.skippedNoise += 1;
        continue;
      }

      const shouldImport =
        structured.isStructuredForm ||
        isLikelyLeadEmail({
          fromEmail: parsedFrom.email,
          subject,
          bodyText,
          hasPhone: Boolean(resolvedPhone),
          onlyLeadKeywords,
        });

      if (!shouldImport) {
        summary.skippedNoise += 1;
        continue;
      }

      const leadEmail = structured.email || parsedFrom.email;
      const leadContactName = structured.contactName || parsedFrom.contactName;
      const leadProjectName = structured.productNote
        ? `${structured.productNote}${structured.formSource ? ` (${structured.formSource})` : ''}`.slice(0, 160)
        : subject.slice(0, 160);
      const phoneForLead = resolvedPhone || 'Chưa có SĐT';

      const dupCheck = await inspectDuplicateAndPriceCheck({
        phone: resolvedPhone || '',
        email: leadEmail,
        companyName: parsedFrom.companyHint,
        projectName: leadProjectName,
      });

      const assignment = await selectAutoAssignedSales(dupCheck.matchedOldLead?.assignedSalesId);
      const leadCode = await generateNextLeadCode();

      const ingested = await ingestLeadWithTrackingIdempotent(prisma, {
        intakeSourceProvider: 'gmail_sync',
        intakeSourceAccountKey: accountKey,
        externalSubmissionId: ref.id,
        leadCode,
        contactChannel: 'email',
        phone: phoneForLead,
        email: leadEmail,
        contactName: leadContactName,
        companyName: parsedFrom.companyHint,
        projectName: leadProjectName,
        areaType: structured.areaType,
        province: structured.province,
        installationAddress: structured.address,
        selfReportedSource: structured.formSource || `Gmail (${conn.connectedEmail})`,
        assignedSalesId: assignment.assignedSalesId,
        marketingSource: structured.formSource ? 'Website Toàn Trung' : 'Email Dự án',
        sourceResolutionMethod: 'gmail_sync',
      });

      if (ingested.deduplicated) {
        summary.deduplicated += 1;
        continue;
      }

      const emailDate = msgData.internalDate
        ? new Date(Number(msgData.internalDate))
        : new Date();
      const excerpt = (bodyText || msgData.snippet || '').slice(0, 700).trim();

      await prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: ingested.lead.id },
          data: {
            isPhoneUnstandardized,
            normalizedLookupKey: dupCheck.lookupKey,
            isDuplicateAlert: dupCheck.isDuplicateAlert,
            duplicateStatus: dupCheck.duplicateStatus,
            matchedOldLeadId: dupCheck.matchedOldLead?.id ?? null,
            isSuspectedPriceCheck: dupCheck.isSuspectedPriceCheck,
            needsManagerAttention: assignment.needsManagerAttention,
            contactedAt: emailDate,
          },
        });

        await tx.marketingTracking.update({
          where: { leadId: ingested.lead.id },
          data: {
            isRepeatLead: Boolean(dupCheck.matchedOldLead),
          },
        });

        await tx.leadActivity.create({
          data: {
            leadId: ingested.lead.id,
            actionType: 'add_note',
            actorType: 'webhook',
            note: [
              `[Đồng bộ tự động từ Gmail: ${conn.connectedEmail}]`,
              `Người gửi: ${fromHeader}`,
              `Tiêu đề: ${subject}`,
              excerpt ? `Nội dung tóm tắt:\n${excerpt}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        });
      });

      summary.created += 1;
      createdLeads.push({
        id: ingested.lead.id,
        leadCode: ingested.lead.leadCode,
        contactName: ingested.lead.contactName,
        email: ingested.lead.email,
        phone: ingested.lead.phone,
        projectName: ingested.lead.projectName,
      });
    } catch {
      summary.failed += 1;
    }
  }

  const nowIso = new Date().toISOString();
  await saveGmailLeadSyncConfig({
    query,
    maxMessages,
    onlyLeadKeywords,
    lastSyncAt: nowIso,
    lastSyncSummary: summary,
  });

  return {
    ok: true,
    connectedEmail: conn.connectedEmail,
    message:
      summary.created > 0
        ? `Đã tạo ${summary.created} Lead mới từ Gmail (${summary.scanned} thư quét, ${summary.deduplicated} thư đã có, ${summary.skippedNoise} thư lọc bỏ).`
        : `Đã quét ${summary.scanned} thư từ Gmail — chưa có Lead mới (${summary.deduplicated} thư đã đồng bộ trước đó, ${summary.skippedNoise} thư lọc bỏ).`,
    summary,
    createdLeads,
  };
}

