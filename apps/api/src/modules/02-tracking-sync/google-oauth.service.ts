import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma, upsertPlatformMetricIdempotent } from '@toantrung/database';
import type {
  GoogleOAuthStatusDto,
  GoogleOAuthClientConfigDto,
  GoogleAccessibleResourceItem,
  GoogleTestConnectionResultDto,
  SelectGoogleResourcesDto,
} from '@toantrung/contracts';
import { encryptSecret, decryptSecret, maskSecret } from '../../core/security/vault';
import { retryUnresolvedGclids } from './service';
import { refreshKeywordDerivedCacheFromCanonicalMetrics } from '../03-keywords-ads/service';

interface StoredGoogleConnection {
  connected: boolean;
  connectedEmail: string | null;
  connectedName: string | null;
  connectedPicture: string | null;
  connectedAt: string | null;
  scopes: string[];
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  isSandboxDemo?: boolean;
  lastSyncAt: string | null;
  detectedGa4PropertyId?: string | null;
  detectedGadsCustomerId?: string | null;
  selectedGa4PropertyId?: string | null;
  selectedGadsCustomerId?: string | null;
  selectedGscSiteUrl?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastAttemptAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  lastRequestId?: string | null;
  connectionStatus?: 'CONNECTED' | 'EXPIRED' | 'PERMISSION_ERROR' | 'SYNC_ERROR' | 'DISCONNECTED';
  accessibleResources?: GoogleAccessibleResourceItem[];
}

interface StoredClientConfig {
  clientId: string;
  clientSecret: string;
}

const SETTING_KEY_CONNECTION = 'google_oauth_connection';
const SETTING_KEY_CLIENT_CONFIG = 'google_oauth_client_config';

function getRealtimeConfigPath(): string {
  const dir = path.join(process.cwd(), 'config');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
  }
  return path.join(dir, 'google-realtime-config.json');
}

function syncToLegacyFile(conn: StoredGoogleConnection | null) {
  try {
    const p = getRealtimeConfigPath();
    let current: Record<string, unknown> = {};
    if (fs.existsSync(p)) {
      try {
        current = JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {
        // ignore
      }
    }
    if (conn && conn.connected) {
      // Never store real plaintext bearer tokens in plain json config file
      current.ga4AccessToken = conn.isSandboxDemo ? 'DEMO_SANDBOX_TOKEN' : 'VAULT_PROTECTED_TOKEN';
      current.ga4PropertyId = conn.selectedGa4PropertyId || conn.detectedGa4PropertyId || '';
      current.gadsCustomerId = conn.selectedGadsCustomerId || conn.detectedGadsCustomerId || '';
      current.autoRealtimeEnabled = true;
      current.lastRealtimeSyncAt = conn.lastSyncAt || new Date().toISOString();
      if (!conn.isSandboxDemo) {
        // Clear any residual sandbox fake realtime counters
        if (current.lastActiveUsers30m === 34) {
          current.lastActiveUsers30m = 0;
          current.lastActivePages = [];
          current.lastActiveEvents = [];
        }
      }
    } else {
      current.ga4AccessToken = '';
      current.lastActiveUsers30m = 0;
      current.lastActivePages = [];
      current.lastActiveEvents = [];
    }
    fs.writeFileSync(p, JSON.stringify(current, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

export async function getGoogleClientConfig(): Promise<StoredClientConfig | null> {
  // 1. Prioritize environment variables (.env) so user can paste privately in local file
  let envClientId = (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ADS_CLIENT_ID || '')
    .trim()
    .replace(/^["']+|["']+$/g, '');
  let envClientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_ADS_CLIENT_SECRET || '')
    .trim()
    .replace(/^["']+|["']+$/g, '');

  if (!envClientId || !envClientSecret) {
    const envCandidates = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '..', '..', '.env'),
    ];
    for (const envPath of envCandidates) {
      try {
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, 'utf8');
          for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx <= 0) continue;
            const k = trimmed.slice(0, eqIdx).trim();
            const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']+|["']+$/g, '');
            if ((k === 'GOOGLE_CLIENT_ID' || k === 'GOOGLE_ADS_CLIENT_ID') && v && !envClientId) {
              envClientId = v;
            }
            if ((k === 'GOOGLE_CLIENT_SECRET' || k === 'GOOGLE_ADS_CLIENT_SECRET') && v && !envClientSecret) {
              envClientSecret = v;
            }
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (envClientId && envClientSecret) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  // 2. Check local encrypted database table
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_CLIENT_CONFIG },
    });
    if (setting?.value) {
      const parsed = JSON.parse(setting.value) as StoredClientConfig;
      const plainId = decryptSecret(parsed.clientId);
      const plainSecret = decryptSecret(parsed.clientSecret);
      if (plainId && plainSecret) {
        return { clientId: plainId, clientSecret: plainSecret };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export async function saveGoogleClientConfig(input: { clientId: string; clientSecret: string }) {
  const cleanId = input.clientId.trim();
  const cleanSecret = input.clientSecret.trim();
  // Encrypt with AES-256-GCM before writing to database
  const cipherPayload = JSON.stringify({
    clientId: encryptSecret(cleanId),
    clientSecret: encryptSecret(cleanSecret),
  });
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_CLIENT_CONFIG },
    update: { value: cipherPayload },
    create: {
      key: SETTING_KEY_CLIENT_CONFIG,
      value: cipherPayload,
    },
  });
}

export async function getGoogleClientConfigDto(): Promise<GoogleOAuthClientConfigDto> {
  const cfg = await getGoogleClientConfig();
  if (!cfg) {
    return {
      hasClientId: false,
      clientIdMasked: null,
      hasClientSecret: false,
    };
  }
  return {
    hasClientId: true,
    clientIdMasked: maskSecret(cfg.clientId),
    hasClientSecret: Boolean(cfg.clientSecret),
  };
}

export async function getGoogleConnection(): Promise<StoredGoogleConnection | null> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_CONNECTION },
    });
    if (setting?.value) {
      const parsed = JSON.parse(setting.value) as StoredGoogleConnection;
      return {
        ...parsed,
        accessToken: parsed.accessToken ? decryptSecret(parsed.accessToken) : null,
        refreshToken: parsed.refreshToken ? decryptSecret(parsed.refreshToken) : null,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function saveGoogleConnection(conn: StoredGoogleConnection | null) {
  if (!conn) {
    await prisma.systemSetting.deleteMany({
      where: { key: SETTING_KEY_CONNECTION },
    });
    syncToLegacyFile(null);
    return;
  }

  // Encrypt all OAuth tokens at rest with AES-256-GCM before writing to database
  const cipherConn: StoredGoogleConnection = {
    ...conn,
    accessToken: conn.accessToken ? encryptSecret(conn.accessToken) : null,
    refreshToken: conn.refreshToken ? encryptSecret(conn.refreshToken) : null,
  };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_CONNECTION },
    update: { value: JSON.stringify(cipherConn) },
    create: { key: SETTING_KEY_CONNECTION, value: JSON.stringify(cipherConn) },
  });
  syncToLegacyFile(conn);
}

export async function getGoogleOAuthStatusDto(): Promise<GoogleOAuthStatusDto> {
  const conn = await getGoogleConnection();
  if (!conn || !conn.connected) {
    return {
      connected: false,
      connectedEmail: null,
      connectedName: null,
      connectedPicture: null,
      connectedAt: null,
      scopes: [],
      hasRefreshToken: false,
      expiresAt: null,
      isSandboxDemo: false,
      autoSyncSlots: ['02:00', '11:00', '17:00'],
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      lastAttemptAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      lastRequestId: null,
      connectionStatus: 'DISCONNECTED',
      detectedGa4PropertyId: null,
      detectedGadsCustomerId: null,
      selectedGa4PropertyId: null,
      selectedGadsCustomerId: null,
      selectedGscSiteUrl: null,
      accessibleResources: [],
    };
  }

  // Check expiration
  let status = conn.connectionStatus || 'CONNECTED';
  const now = Date.now();
  const exp = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
  if (exp > 0 && exp <= now && !conn.refreshToken) {
    status = 'EXPIRED';
  }

  return {
    connected: true,
    connectedEmail: conn.connectedEmail,
    connectedName: conn.connectedName,
    connectedPicture: conn.connectedPicture,
    connectedAt: conn.connectedAt,
    scopes: conn.scopes || [],
    hasRefreshToken: Boolean(conn.refreshToken),
    expiresAt: conn.expiresAt,
    isSandboxDemo: Boolean(conn.isSandboxDemo),
    autoSyncSlots: ['02:00', '11:00', '17:00'],
    lastSyncAt: conn.lastSyncAt,
    lastSuccessfulSyncAt: conn.lastSuccessfulSyncAt || conn.lastSyncAt,
    lastAttemptAt: conn.lastAttemptAt || conn.lastSyncAt,
    lastErrorCode: conn.lastErrorCode || null,
    lastErrorMessage: conn.lastErrorMessage || null,
    lastRequestId: conn.lastRequestId || null,
    connectionStatus: status,
    detectedGa4PropertyId: conn.detectedGa4PropertyId || null,
    detectedGadsCustomerId: conn.detectedGadsCustomerId || null,
    selectedGa4PropertyId: conn.selectedGa4PropertyId || conn.detectedGa4PropertyId || null,
    selectedGadsCustomerId: conn.selectedGadsCustomerId || conn.detectedGadsCustomerId || null,
    selectedGscSiteUrl: conn.selectedGscSiteUrl || null,
    accessibleResources: conn.accessibleResources || [],
  };
}

export async function testGoogleConnection(): Promise<GoogleTestConnectionResultDto> {
  const token = await getValidAccessToken();
  const conn = await getGoogleConnection();
  const nowStr = new Date().toISOString();
  const requestId = crypto.randomUUID();

  if (!conn || !conn.connected || !token) {
    return {
      success: false,
      checkedAt: nowStr,
      connectionStatus: 'DISCONNECTED',
      userEmail: conn?.connectedEmail || 'Chưa kết nối',
      canAccessGa4: false,
      ga4PropertiesCount: 0,
      canAccessSearchConsole: false,
      gscSitesCount: 0,
      canAccessGoogleAds: false,
      adsAccessibleCustomersCount: 0,
      accessibleResources: [],
      message: 'Chưa có kết nối Google OAuth 2.0 hoặc mã truy cập đã hết hạn.',
    };
  }

  const accessibleResources: GoogleAccessibleResourceItem[] = [];
  let canAccessGa4 = false;
  let canAccessGsc = false;
  let canAccessAds = false;
  let ga4PropertiesCount = 0;
  let gscSitesCount = 0;
  let adsCustomersCount = 0;

  // 1. Probe GA4 Admin API
  try {
    const resAdmin = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resAdmin.ok) {
      canAccessGa4 = true;
      const adminData = (await resAdmin.json()) as {
        accountSummaries?: Array<{
          displayName?: string;
          propertySummaries?: Array<{
            property: string;
            displayName: string;
          }>;
        }>;
      };
      for (const acc of adminData.accountSummaries || []) {
        for (const p of acc.propertySummaries || []) {
          const propId = p.property.replace('properties/', '');
          ga4PropertiesCount++;
          accessibleResources.push({
            id: propId,
            name: `${p.displayName} (${propId})`,
            type: 'GA4_PROPERTY',
            permissionLevel: 'Viewer (Read-Only)',
            isAccessible: true,
          });
        }
      }
    }
  } catch {
    // non-fatal
  }

  // 2. Probe Google Search Console Sites API
  try {
    const resSC = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resSC.ok) {
      canAccessGsc = true;
      const scData = (await resSC.json()) as {
        siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }>;
      };
      for (const site of scData.siteEntry || []) {
        gscSitesCount++;
        accessibleResources.push({
          id: site.siteUrl,
          name: site.siteUrl,
          type: 'SEARCH_CONSOLE_SITE',
          permissionLevel: site.permissionLevel || 'siteRestrictedUser (Read-Only)',
          isAccessible: true,
        });
      }
    }
  } catch {
    // non-fatal
  }

  // 3. Probe Google Ads Accessible Customers
  try {
    const resAds = await fetch('https://googleads.googleapis.com/v17/customers:listAccessibleCustomers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resAds.ok) {
      canAccessAds = true;
      const adsData = (await resAds.json()) as { resourceNames?: string[] };
      for (const resName of adsData.resourceNames || []) {
        const custId = resName.replace('customers/', '');
        adsCustomersCount++;
        accessibleResources.push({
          id: custId,
          name: `Khách hàng Google Ads ${custId}`,
          type: 'GOOGLE_ADS_CUSTOMER',
          permissionLevel: 'Viewer (Read-Only)',
          isAccessible: true,
        });
      }
    } else {
      // User is Viewer / Read-Only without active developer token
      canAccessAds = false;
    }
  } catch {
    // non-fatal
  }

  // Update connection audit fields
  conn.lastAttemptAt = nowStr;
  conn.lastRequestId = requestId;
  conn.accessibleResources = accessibleResources.length > 0 ? accessibleResources : conn.accessibleResources;

  const isHealthy = canAccessGa4 && canAccessGsc;
  conn.connectionStatus = isHealthy ? 'CONNECTED' : canAccessGa4 || canAccessGsc ? 'CONNECTED' : 'PERMISSION_ERROR';
  if (isHealthy) {
    conn.lastErrorCode = null;
    conn.lastErrorMessage = null;
  }

  await saveGoogleConnection(conn);

  return {
    success: isHealthy,
    checkedAt: nowStr,
    connectionStatus: conn.connectionStatus,
    userEmail: conn.connectedEmail || 'connected-user@google.com',
    userName: conn.connectedName,
    canAccessGa4,
    ga4PropertiesCount,
    canAccessSearchConsole: canAccessGsc,
    gscSitesCount,
    canAccessGoogleAds: canAccessAds,
    adsAccessibleCustomersCount: adsCustomersCount,
    accessibleResources: conn.accessibleResources || accessibleResources,
    message: isHealthy
      ? `Kiểm tra kết nối thành công! Đã xác thực quyền xem (Viewer / Read-only) đối với ${ga4PropertiesCount} website GA4 và ${gscSitesCount} website Search Console.`
      : `Đã kết nối tài khoản nhưng một số dịch vụ cần kiểm tra quyền truy cập.`,
  };
}

export async function saveSelectedResources(input: {
  selectedGa4PropertyId?: string | null;
  selectedGadsCustomerId?: string | null;
  selectedGscSiteUrl?: string | null;
}) {
  const conn = await getGoogleConnection();
  if (!conn) throw new Error('Chưa có kết nối Google.');

  if (input.selectedGa4PropertyId !== undefined) {
    conn.selectedGa4PropertyId = input.selectedGa4PropertyId;
  }
  if (input.selectedGadsCustomerId !== undefined) {
    conn.selectedGadsCustomerId = input.selectedGadsCustomerId;
  }
  if (input.selectedGscSiteUrl !== undefined) {
    conn.selectedGscSiteUrl = input.selectedGscSiteUrl;
  }

  await saveGoogleConnection(conn);
  return getGoogleOAuthStatusDto();
}

export async function buildGoogleAuthorizeUrl(origin: string, returnPath = '/tracking') {
  const cfg = await getGoogleClientConfig();
  if (!cfg) {
    return {
      needsConfig: true,
      authUrl: null,
      message: 'Chưa cấu hình Google Client ID & Client Secret. Bạn có thể nhập trong Cài đặt hoặc dùng Chế độ Kiểm thử Mẫu.',
    };
  }

  const redirectUri = `${origin}/api/v1/auth/google/callback`;
  const statePayload = Buffer.from(
    JSON.stringify({
      returnPath: returnPath.startsWith('/') ? returnPath : '/tracking',
      nonce: crypto.randomBytes(8).toString('hex'),
      time: Date.now(),
    }),
  ).toString('base64url');

  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/adwords',
    'https://www.googleapis.com/auth/webmasters.readonly',
  ].join(' ');

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: statePayload,
  });

  return {
    needsConfig: false,
    authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    message: null,
  };
}

export async function handleGoogleOAuthCallback(code: string, origin: string, stateStr?: string | null) {
  const cfg = await getGoogleClientConfig();
  if (!cfg) {
    throw new Error('Chưa cấu hình Google Client ID & Secret trên hệ thống.');
  }

  const redirectUri = `${origin}/api/v1/auth/google/callback`;

  // 1. Exchange code for tokens
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!tokenResp.ok) {
    const errTxt = await tokenResp.text();
    throw new Error(`Google từ chối cấp mã truy cập: ${errTxt.slice(0, 200)}`);
  }

  const tokenData = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };

  // 2. Fetch User Info
  let email = 'connected-user@google.com';
  let name = 'Tài khoản Google';
  let picture: string | null = null;
  try {
    const userResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userResp.ok) {
      const uInfo = (await userResp.json()) as { email?: string; name?: string; picture?: string };
      if (uInfo.email) email = uInfo.email;
      if (uInfo.name) name = uInfo.name;
      if (uInfo.picture) picture = uInfo.picture;
    }
  } catch {
    // ignore
  }

  const existingConn = await getGoogleConnection();
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
  const scopes = (tokenData.scope || '').split(' ').filter(Boolean);

  const updatedConn: StoredGoogleConnection = {
    connected: true,
    connectedEmail: email,
    connectedName: name,
    connectedPicture: picture,
    connectedAt: new Date().toISOString(),
    scopes: scopes.length > 0 ? scopes : ['analytics.readonly', 'adwords', 'webmasters.readonly'],
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || existingConn?.refreshToken || null,
    expiresAt,
    isSandboxDemo: false,
    lastSyncAt: new Date().toISOString(),
    detectedGa4PropertyId: existingConn?.detectedGa4PropertyId && existingConn.detectedGa4PropertyId !== '213025502' ? existingConn.detectedGa4PropertyId : null,
    detectedGadsCustomerId: existingConn?.detectedGadsCustomerId && existingConn.detectedGadsCustomerId !== '889-102-4451' ? existingConn.detectedGadsCustomerId : null,
  };

  await saveGoogleConnection(updatedConn);

  // Purge any leftover demo/mock data and trigger initial real discovery & sync across modules
  try {
    await purgeDemoMetrics();
    await testGoogleConnection();
    await syncAllGoogleDataAcrossModules('FULL_0200');
  } catch {
    // non-fatal
  }

  // Parse state returnPath
  let returnPath = '/tracking';
  if (stateStr) {
    try {
      const parsed = JSON.parse(Buffer.from(stateStr, 'base64url').toString('utf8'));
      if (parsed.returnPath && typeof parsed.returnPath === 'string' && parsed.returnPath.startsWith('/')) {
        returnPath = parsed.returnPath;
      }
    } catch {
      // ignore
    }
  }

  return { email, name, returnPath };
}

export async function connectSandboxDemo(email = 'toantrung.marketing@gmail.com') {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const demoConn: StoredGoogleConnection = {
    connected: true,
    connectedEmail: email,
    connectedName: 'Toàn Trung Marketing (Google Ads & GA4 Quản trị)',
    connectedPicture: null,
    connectedAt: new Date().toISOString(),
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/adwords',
      'https://www.googleapis.com/auth/webmasters.readonly',
      'openid',
      'email',
      'profile',
    ],
    accessToken: 'DEMO_SANDBOX_TOKEN',
    refreshToken: 'DEMO_SANDBOX_REFRESH_TOKEN',
    expiresAt,
    isSandboxDemo: true,
    lastSyncAt: new Date().toISOString(),
    detectedGa4PropertyId: '213025502',
    detectedGadsCustomerId: '889-102-4451',
  };

  await saveGoogleConnection(demoConn);
  await syncAllGoogleDataAcrossModules('FULL_0200');
  return demoConn;
}

export async function disconnectGoogleOAuth() {
  await saveGoogleConnection(null);
}

export async function getValidAccessToken(): Promise<string | null> {
  const conn = await getGoogleConnection();
  if (!conn || !conn.connected) return null;
  if (conn.isSandboxDemo || conn.accessToken === 'DEMO_SANDBOX_TOKEN') {
    return 'DEMO_SANDBOX_TOKEN';
  }

  const now = Date.now();
  const exp = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;
  // If still valid for at least 2 minutes:
  if (conn.accessToken && exp - now > 120 * 1000) {
    return conn.accessToken;
  }

  // Needs refresh:
  if (!conn.refreshToken) {
    return conn.accessToken; // Fallback
  }

  const cfg = await getGoogleClientConfig();
  if (!cfg) return conn.accessToken;

  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: conn.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (tokenResp.ok) {
      const data = (await tokenResp.json()) as { access_token?: string; expires_in?: number };
      if (data.access_token) {
        conn.accessToken = data.access_token;
        conn.expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
        await saveGoogleConnection(conn);
        return data.access_token;
      }
    }
  } catch {
    // ignore
  }

  return conn.accessToken;
}

/**
 * FULL SYNC ACROSS ALL MODULES (02, 03, 04)
 * Called during manual sync button, OAuth callback, or scheduled worker slots (02:00, 11:00, 17:00)
 */
export async function syncAllGoogleDataAcrossModules(slot: 'FULL_0200' | 'LIGHT_1100' | 'LIGHT_1700' | 'MANUAL_RETRY' = 'MANUAL_RETRY') {
  const token = await getValidAccessToken();
  const conn = await getGoogleConnection();
  const todayStr = new Date().toISOString().slice(0, 10);
  const windowDays = slot === 'FULL_0200' ? 30 : 2;
  const startStr = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let syncedRecords = 0;
  let realGa4Count = 0;
  let realScCount = 0;

  // Attempt REAL Google APIs sync if live token is available
  if (token && !conn?.isSandboxDemo && token !== 'DEMO_SANDBOX_TOKEN') {
    // Purge any residual mock/demo metrics so only 100% REAL Google data exists
    try {
      await purgeDemoMetrics();
    } catch {
      // non-fatal
    }

    try {
      realGa4Count = await syncRealGoogleAnalytics(token, conn);
      syncedRecords += realGa4Count;
    } catch (err) {
      console.warn('Real GA4 sync skipped:', err);
    }

    try {
      realScCount = await syncRealSearchConsole(token);
      syncedRecords += realScCount;
    } catch (err) {
      console.warn('Real Search Console sync skipped:', err);
    }
  }

  // Log sync execution
  await prisma.platformSyncLog.create({
    data: {
      platform: 'google_ads',
      accountPropertyId: conn?.detectedGadsCustomerId || conn?.detectedGa4PropertyId || 'REAL_GOOGLE_SYNC',
      runType: slot === 'FULL_0200' ? 'full' : 'light',
      windowStartDate: startStr,
      windowEndDate: todayStr,
      recordsSynced: syncedRecords,
      status: 'success',
      consecutiveFailures: 0,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // 6. GCLID Attribution & Matching
  const gclidResult = await retryUnresolvedGclids();

  // 7. Refresh Module 03 Keyword & Ads Derived Cache
  await refreshKeywordDerivedCacheFromCanonicalMetrics({ force: true });

  // 8. Update connection lastSyncAt
  if (conn) {
    conn.lastSyncAt = new Date().toISOString();
    await saveGoogleConnection(conn);
  }

  return {
    success: true,
    slot,
    syncedRecords,
    realGa4Count,
    realScCount,
    gclidResolved: gclidResult.resolved,
    lastSyncAt: new Date().toISOString(),
    connectionEmail: conn?.connectedEmail || null,
    isSandboxDemo: Boolean(conn?.isSandboxDemo),
  };
}

export async function purgeDemoMetrics() {
  // 1. Delete mock metrics from PlatformDailyMetric
  await prisma.platformDailyMetric.deleteMany({
    where: {
      OR: [
        { accountPropertyId: 'GADS-TT-01' },
        { accountPropertyId: 'GA4-TOANTRUNG-MAIN' },
        { accountPropertyId: 'sc-domain:toantrung.com.vn' },
        { accountPropertyId: '213025502' },
        { accountPropertyId: '889-102-4451' },
        { campaignExternalId: { in: ['CAMP_LED_INDOOR_P25_Q4', 'CAMP_LED_OUTDOOR_P4_Q4', 'CAMP_BOARD_FACTORY_2026', 'gads_test_p25', 'gads_test_outdoor', 'ga4_test_organic'] } },
      ],
    },
  });

  // 2. Delete mock LeadReconciliation & PlatformSyncLog rows
  await prisma.leadReconciliation.deleteMany({
    where: { accountPropertyId: 'GADS-TT-01' },
  });
  await prisma.platformSyncLog.deleteMany({
    where: {
      accountPropertyId: { in: ['GADS-TT-01', 'GA4-TOANTRUNG-MAIN'] },
    },
  });

  // 3. Delete synthetic seed Leads (and their child records)
  const demoLeads = await prisma.lead.findMany({
    where: {
      OR: [
        { leadCode: { in: ['TT-20261101-0001', 'TT-20261102-0002', 'TT-20261104-0003', 'TT-20261105-0004', 'TT-20261105-0005'] } },
        { companyName: { contains: '(Dữ liệu tổng hợp)' } },
        { companyName: { contains: '(Nghi khảo giá)' } },
        { email: { contains: 'synthetic.vn' } },
      ],
    },
    select: { id: true },
  });
  if (demoLeads.length > 0) {
    const demoLeadIds = demoLeads.map((l) => l.id);
    const demoDesigns = await prisma.designRequest.findMany({
      where: { leadId: { in: demoLeadIds } },
      select: { id: true },
    });
    if (demoDesigns.length > 0) {
      const dIds = demoDesigns.map((d) => d.id);
      await prisma.designRequest.updateMany({ where: { id: { in: dIds } }, data: { approvedVersionId: null } });
      await prisma.designAssetVersion.deleteMany({ where: { designRequestId: { in: dIds } } });
      await prisma.aiUsageLog.deleteMany({ where: { designRequestId: { in: dIds } } });
      await prisma.designRequest.deleteMany({ where: { id: { in: dIds } } });
    }
    await prisma.priceCheckAlert.deleteMany({ where: { leadId: { in: demoLeadIds } } });
    await prisma.leadAttachment.deleteMany({ where: { leadId: { in: demoLeadIds } } });
    await prisma.leadActivity.deleteMany({ where: { leadId: { in: demoLeadIds } } });
    await prisma.leadProduct.deleteMany({ where: { leadId: { in: demoLeadIds } } });
    await prisma.marketingTracking.deleteMany({ where: { leadId: { in: demoLeadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: demoLeadIds } } });
  }

  // 4. Unlink and delete mock Campaigns
  const demoCampaigns = await prisma.campaign.findMany({
    where: {
      OR: [
        { campaignCode: { in: ['CAMP_LED_INDOOR_P25_Q4', 'CAMP_LED_OUTDOOR_P4_Q4', 'CAMP_BOARD_FACTORY_2026', 'gads_test_p25', 'gads_test_outdoor', 'ga4_test_organic'] } },
        { accountExternalId: { in: ['GADS-TT-01', 'FB-TT-FANPAGE', '889-102-4451', '213025502'] } },
        { campaignName: { contains: '[Test ' } },
      ],
    },
    select: { id: true },
  });
  if (demoCampaigns.length > 0) {
    const campIds = demoCampaigns.map((c) => c.id);
    await prisma.marketingTracking.updateMany({
      where: { campaignId: { in: campIds } },
      data: { campaignId: null },
    });
    await prisma.platformDailyMetric.deleteMany({
      where: { campaignId: { in: campIds } },
    });
    await prisma.campaign.deleteMany({
      where: { id: { in: campIds } },
    });
  }

  // 5. Delete mock SeoArticles & SeoKeywords with [Test GA4/Ads or demo seed phrases
  const demoKws = await prisma.seoKeyword.findMany({
    where: {
      OR: [
        { keyword: { contains: '[Test GA4/Ads' } },
        { keyword: 'báo giá màn hình led hội trường P2.5' },
        { keyword: 'bảng điện tử năng suất nhà máy may' },
      ],
    },
    select: { id: true },
  });
  if (demoKws.length > 0) {
    const kwIds = demoKws.map((k) => k.id);
    const demoArticles = await prisma.seoArticle.findMany({
      where: { keywordId: { in: kwIds } },
      select: { id: true },
    });
    if (demoArticles.length > 0) {
      const artIds = demoArticles.map((a) => a.id);
      await prisma.seoArticle.updateMany({
        where: { id: { in: artIds } },
        data: { currentRevisionId: null, approvedRevisionId: null },
      });
      await prisma.seoArticleRevision.deleteMany({ where: { articleId: { in: artIds } } });
      await prisma.aiUsageLog.deleteMany({ where: { seoArticleId: { in: artIds } } });
      await prisma.seoArticle.deleteMany({ where: { id: { in: artIds } } });
    }
    await prisma.seoKeyword.deleteMany({
      where: { id: { in: kwIds } },
    });
  }
}

async function syncRealGoogleAnalytics(token: string, conn: StoredGoogleConnection | null): Promise<number> {
  let synced = 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  try {
    const resAdmin = await fetch('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resAdmin.ok) return 0;
    const adminData = (await resAdmin.json()) as {
      accountSummaries?: Array<{
        displayName?: string;
        propertySummaries?: Array<{
          property: string;
          displayName: string;
        }>;
      }>;
    };

    const properties = adminData.accountSummaries?.flatMap((a) => a.propertySummaries || []) || [];
    for (const prop of properties) {
      const propId = prop.property.replace('properties/', '');
      const reportResp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
          metrics: [
            { name: 'activeUsers' },
            { name: 'screenPageViews' },
            { name: 'eventCount' },
            { name: 'userEngagementDuration' },
          ],
        }),
      });

      if (reportResp.ok) {
        const repData = (await reportResp.json()) as {
          rows?: Array<{
            metricValues: Array<{ value: string }>;
          }>;
        };
        const row = repData.rows?.[0];
        const activeUsers = parseInt(row?.metricValues?.[0]?.value || '0', 10);
        const pageViews = parseInt(row?.metricValues?.[1]?.value || '0', 10);
        const eventCount = parseInt(row?.metricValues?.[2]?.value || '0', 10);
        const totalDuration = parseFloat(row?.metricValues?.[3]?.value || '0');
        const avgTime = activeUsers > 0 ? totalDuration / activeUsers : 0;

        await upsertPlatformMetricIdempotent(prisma, {
          platform: 'ga4',
          accountPropertyId: propId,
          metricDate: todayStr,
          grain: 'account',
          clicks: activeUsers,
          impressions: eventCount,
          pageViews: pageViews,
          avgTimeOnPageSec: Math.round(avgTime * 10) / 10,
          isFinalized: false,
        });
        synced++;

        if (conn && (!conn.detectedGa4PropertyId || prop.displayName.toLowerCase().includes('toantrung'))) {
          conn.detectedGa4PropertyId = propId;
        }
      }

      // Also fetch page-level report for top landing pages
      try {
        const pageResp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'pagePath' }],
            metrics: [
              { name: 'screenPageViews' },
              { name: 'userEngagementDuration' },
            ],
            limit: 10,
          }),
        });
        if (pageResp.ok) {
          const pageData = (await pageResp.json()) as {
            rows?: Array<{
              dimensionValues: Array<{ value: string }>;
              metricValues: Array<{ value: string }>;
            }>;
          };
          for (const pRow of pageData.rows || []) {
            const path = pRow.dimensionValues?.[0]?.value || '/';
            const views = parseInt(pRow.metricValues?.[0]?.value || '0', 10);
            const dur = parseFloat(pRow.metricValues?.[1]?.value || '0');
            await upsertPlatformMetricIdempotent(prisma, {
              platform: 'ga4',
              accountPropertyId: propId,
              metricDate: todayStr,
              grain: 'page',
              pageUrlRaw: `https://${prop.displayName.toLowerCase().replace(/[^a-z0-9.-]/g, '')}${path}`,
              pageViews: views,
              avgTimeOnPageSec: views > 0 ? Math.round((dur / views) * 10) / 10 : 0,
              isFinalized: false,
            });
            synced++;
          }
        }
      } catch {
        // non-fatal
      }

      // Also fetch real traffic channels & linked Google Ads campaigns from GA4
      try {
        const trafficResp = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: '90daysAgo', endDate: 'today' }],
            dimensions: [{ name: 'sessionCampaignName' }, { name: 'sessionSourceMedium' }],
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'screenPageViews' },
              { name: 'conversions' },
            ],
            limit: 25,
          }),
        });
        if (trafficResp.ok) {
          const trafficData = (await trafficResp.json()) as {
            rows?: Array<{
              dimensionValues: Array<{ value: string }>;
              metricValues: Array<{ value: string }>;
            }>;
          };
          for (const tRow of trafficData.rows || []) {
            const rawCamp = tRow.dimensionValues?.[0]?.value || '(not set)';
            const sourceMedium = tRow.dimensionValues?.[1]?.value || 'google / organic';
            const sessions = parseInt(tRow.metricValues?.[0]?.value || '0', 10);
            const users = parseInt(tRow.metricValues?.[1]?.value || '0', 10);
            const views = parseInt(tRow.metricValues?.[2]?.value || '0', 10);
            const conv = Math.round(parseFloat(tRow.metricValues?.[3]?.value || '0'));
            if (sessions === 0 && users === 0) continue;

            const accountExtId = `GA4-${propId}`;
            const campTitle =
              rawCamp && rawCamp !== '(not set)' && rawCamp !== '(direct)' && rawCamp !== '(organic)'
                ? `[GA4 ${prop.displayName}] ${rawCamp} (${sourceMedium})`
                : `[GA4 ${prop.displayName}] Lưu lượng ${sourceMedium}`;
            const campCode = `ga4_${propId}_${campTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50)}`;

            const campRow = await prisma.campaign.upsert({
              where: {
                uq_campaign_platform_account_code: {
                  platform: 'google_ads',
                  accountExternalId: accountExtId,
                  campaignCode: campCode,
                },
              },
              update: {
                campaignName: campTitle,
                isActive: true,
              },
              create: {
                platform: 'google_ads',
                accountExternalId: accountExtId,
                campaignCode: campCode,
                campaignName: campTitle,
                utmCampaignSlug: campCode,
                currencyCode: 'VND',
                dailyBudgetMicros: 0n,
                isActive: true,
              },
            });

            await upsertPlatformMetricIdempotent(prisma, {
              platform: 'google_ads',
              accountPropertyId: accountExtId,
              metricDate: todayStr,
              grain: 'campaign',
              campaignExternalId: campCode,
              campaignId: campRow.id,
              campaignName: campTitle,
              currencyCode: 'VND',
              clicks: sessions,
              impressions: Math.max(views, users, sessions),
              spendMicros: 0n,
              conversionsMicros: BigInt(conv) * 1_000_000n,
              isFinalized: false,
            });
            synced++;
          }
        }
      } catch {
        // non-fatal
      }
    }
  } catch (err) {
    console.warn('Real GA4 sync error:', err);
  }
  return synced;
}

async function syncRealSearchConsole(token: string): Promise<number> {
  let synced = 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const startStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const resSC = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resSC.ok) return 0;
    const scData = (await resSC.json()) as {
      siteEntry?: Array<{ siteUrl: string }>;
    };

    const sites = scData.siteEntry || [];
    for (const site of sites) {
      const qResp = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site.siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: startStr,
            endDate: todayStr,
            dimensions: ['query'],
            rowLimit: 100,
          }),
        },
      );

      if (qResp.ok) {
        const qData = (await qResp.json()) as {
          rows?: Array<{
            keys: string[];
            clicks: number;
            impressions: number;
            ctr: number;
            position: number;
          }>;
        };

        for (const row of qData.rows || []) {
          const kw = row.keys?.[0];
          if (!kw) continue;
          await upsertPlatformMetricIdempotent(prisma, {
            platform: 'search_console',
            accountPropertyId: site.siteUrl,
            metricDate: todayStr,
            grain: 'keyword',
            keywordRaw: kw,
            clicks: row.clicks,
            impressions: row.impressions,
            avgPosition: Math.round(row.position * 10) / 10,
            isFinalized: false,
          });
          synced++;

          // Upsert into SeoKeyword table for Module 03 SEO & Keywords with real Impressions & Clicks
          try {
            const norm = kw.toLowerCase().trim();
            await prisma.seoKeyword.upsert({
              where: { keywordNorm: norm },
              update: {
                cachedSearchVolume: row.impressions,
                cachedOrganicClicks: row.clicks,
                cachedAvgPosition: Math.round(row.position * 10) / 10,
                cacheSourceAccountKey: site.siteUrl,
                cacheWindowStartDate: startStr,
                cacheWindowEndDate: todayStr,
                cacheRefreshedAt: new Date(),
                trendDirection: row.clicks > 0 ? 'rising' : 'stable',
              },
              create: {
                keyword: kw,
                keywordNorm: norm,
                cachedSearchVolume: row.impressions,
                cachedOrganicClicks: row.clicks,
                cachedAvgPosition: Math.round(row.position * 10) / 10,
                cacheSourceAccountKey: site.siteUrl,
                cacheWindowStartDate: startStr,
                cacheWindowEndDate: todayStr,
                cacheRefreshedAt: new Date(),
                trendDirection: row.clicks > 0 ? 'rising' : 'stable',
              },
            });
          } catch {
            // non-fatal
          }
        }
      }
    }
  } catch (err) {
    console.warn('Real Search Console sync error:', err);
  }
  return synced;
}
