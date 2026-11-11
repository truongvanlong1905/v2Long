'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Key,
  Layers,
  Link as LinkIcon,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlink,
  Zap,
} from 'lucide-react';
import type { GoogleOAuthStatusDto, GoogleOAuthClientConfigDto } from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

interface GoogleOAuthManagerProps {
  compact?: boolean;
  returnPath?: string;
  onSyncCompleted?: () => void;
}

export function GoogleOAuthManager({
  compact = false,
  returnPath = '/tracking',
  onSyncCompleted,
}: GoogleOAuthManagerProps) {
  const { user } = useSession();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<GoogleOAuthStatusDto | null>(null);
  const [clientConfig, setClientConfig] = useState<GoogleOAuthClientConfigDto | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Config modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await apiRequest<{
        status: GoogleOAuthStatusDto;
        clientConfig: GoogleOAuthClientConfigDto;
      }>('/api/v1/auth/google/status');
      setStatus(res.status);
      setClientConfig(res.clientConfig);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lấy trạng thái kết nối Google.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();

    // Check if redirected from Google OAuth callback
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const authState = params.get('google_auth');
      if (authState === 'success') {
        const email = params.get('email') || 'tài khoản Google';
        setFeedbackMsg(`Đã kết nối Google OAuth 2.0 thành công với email: ${email}!`);
        // Remove query params cleanly
        window.history.replaceState({}, document.title, window.location.pathname);
        void fetchStatus();
      } else if (authState === 'error') {
        const msg = params.get('msg') || 'Xác thực Google không thành công.';
        setErrorMsg(`Lỗi Google OAuth: ${msg}`);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [fetchStatus]);

  const handleStartOAuth = async () => {
    setBusy(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await apiRequest<{
        needsConfig: boolean;
        authUrl: string | null;
        message: string | null;
      }>(`/api/v1/auth/google/authorize?returnPath=${encodeURIComponent(returnPath)}`);

      if (res.needsConfig || !res.authUrl) {
        setShowConfigModal(true);
        return;
      }

      // Redirect browser directly to Google OAuth Consent screen
      window.location.href = res.authUrl;
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể khởi động kết nối Google.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveClientConfig = async () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim()) {
      setErrorMsg('Vui lòng điền đầy đủ cả Google Client ID và Client Secret.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        message: string;
        status: GoogleOAuthStatusDto;
        clientConfig: GoogleOAuthClientConfigDto;
      }>('/api/v1/auth/google/status', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'save_client_config',
          clientId: clientIdInput.trim(),
          clientSecret: clientSecretInput.trim(),
        },
      });
      setStatus(res.status);
      setClientConfig(res.clientConfig);
      setShowConfigModal(false);
      setFeedbackMsg(res.message);
      // Immediately start OAuth flow with saved credentials
      const authRes = await apiRequest<{
        needsConfig: boolean;
        authUrl: string | null;
      }>(`/api/v1/auth/google/authorize?returnPath=${encodeURIComponent(returnPath)}`);
      if (authRes.authUrl) {
        window.location.href = authRes.authUrl;
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lưu cấu hình Google Client.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemoConnect = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        message: string;
        status: GoogleOAuthStatusDto;
      }>('/api/v1/auth/google/status', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: { action: 'demo_connect' },
      });
      setStatus(res.status);
      setShowConfigModal(false);
      setFeedbackMsg(res.message);
      if (onSyncCompleted) onSyncCompleted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi kích hoạt kết nối mẫu.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Bạn có chắc chắn muốn ngắt kết nối tài khoản Google khỏi hệ thống?')) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        message: string;
        status: GoogleOAuthStatusDto;
      }>('/api/v1/auth/google/status', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: { action: 'disconnect' },
      });
      setStatus(res.status);
      setFeedbackMsg(res.message);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi ngắt kết nối Google.');
    } finally {
      setBusy(false);
    }
  };

  const handleSyncAllNow = async () => {
    setBusy(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await apiRequest<{
        message: string;
        status: GoogleOAuthStatusDto;
      }>('/api/v1/auth/google/sync', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: { slot: 'MANUAL_RETRY' },
      });
      setStatus(res.status);
      setFeedbackMsg(res.message);
      if (onSyncCompleted) onSyncCompleted();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đồng bộ dữ liệu Google.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
        <span>Đang kiểm tra kết nối Google OAuth...</span>
      </div>
    );
  }

  // COMPACT MODE: Top bar banner in Module 02 & Module 03 (Enhanced large legible design)
  if (compact) {
    if (status?.connected) {
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50/90 to-emerald-50/80 border border-emerald-300/80 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-extrabold text-base shrink-0 shadow-sm ring-2 ring-emerald-500/20">
              G
            </div>
            <div>
              <div className="flex items-center gap-2 font-extrabold text-sm sm:text-base text-emerald-950 flex-wrap">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Google OAuth 2.0 Đã kết nối:</span>
                <span className="font-mono text-emerald-900 underline font-bold">{status.connectedEmail}</span>
                {status.isSandboxDemo && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300">
                    Demo Sandbox
                  </span>
                )}
              </div>
              <div className="text-xs sm:text-sm text-emerald-800 mt-1 flex items-center gap-2.5 flex-wrap font-medium">
                <span>⚡ Đồng bộ tự động 3 ca: <strong>02:00 · 11:00 · 17:00</strong></span>
                <span>•</span>
                <span>Lần cuối: <strong>{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleTimeString('vi-VN') : 'Vừa xong'}</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSyncAllNow()}
              className="h-10 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-xs transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              <span>{busy ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDisconnect()}
              className="h-10 px-3 rounded-xl bg-white border border-slate-300 hover:bg-rose-50 hover:text-rose-700 text-slate-700 font-bold inline-flex items-center gap-1.5 transition shadow-2xs"
              title="Ngắt kết nối Google"
            >
              <Unlink className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200 text-xs shadow-2xs">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
            G
          </div>
          <div>
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>Kết nối dữ liệu Google Analytics 4 &amp; Google Ads</span>
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              1-Click Đăng nhập &amp; Cấp quyền OAuth 2.0 để hệ thống tự động tải số liệu về mỗi ngày (02:00, 11:00, 17:00).
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleStartOAuth()}
            className="h-8 px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white font-bold inline-flex items-center gap-1.5 shadow-2xs transition"
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Đăng nhập Google (OAuth 2.0)</span>
          </button>
        </div>
      </div>
    );
  }

  // FULL HUB MODE: Settings Page
  return (
    <div className="space-y-6">
      {/* Notifications */}
      {feedbackMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{feedbackMsg}</div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-xs text-emerald-700 hover:underline font-bold"
          >
            Đóng
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2.5 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs text-rose-700 hover:underline font-bold"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Main Connection Status Card */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-slate-50 via-white to-blue-50/40">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-center shrink-0">
              <svg className="w-7 h-7" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>Google OAuth 2.0 Hub Toàn diện</span>
                {status?.connected ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Đang hoạt động
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                    Chưa kết nối
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đăng nhập 1 lần cấp quyền đọc Google Analytics 4, Google Ads và Google Search Console cho toàn bộ dự án.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {status?.connected ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSyncAllNow()}
                  className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                  <span>{busy ? 'Đang đồng bộ...' : 'Đồng bộ toàn bộ ngay'}</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleDisconnect()}
                  className="h-10 px-3.5 rounded-xl bg-white border border-rose-200 hover:bg-rose-50 text-rose-700 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition"
                >
                  <Unlink className="w-4 h-4" />
                  <span>Ngắt kết nối</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartOAuth()}
                  className="h-10 px-5 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center gap-2 shadow-2xs transition"
                >
                  <LinkIcon className="w-4 h-4" />
                  <span>Đăng nhập bằng Google</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Detail Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Box 1: Account Info */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Tài khoản Google liên kết
              </div>
              {status?.connected ? (
                <div>
                  <div className="font-bold text-slate-900 text-sm">{status.connectedName || 'Toàn Trung Marketing'}</div>
                  <div className="font-mono text-xs text-blue-700 mt-0.5 break-all">{status.connectedEmail}</div>
                  <div className="text-[11px] text-slate-500 mt-2">
                    Kết nối lúc: {status.connectedAt ? new Date(status.connectedAt).toLocaleString('vi-VN') : '—'}
                  </div>
                  {status.isSandboxDemo && (
                    <div className="mt-2 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                      Chế độ Kiểm thử Mẫu (Sandbox Demo)
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400 italic">
                  Chưa có tài khoản nào được kết nối. Bấm nút phía trên để đăng nhập.
                </div>
              )}
            </div>

            {/* Box 2: Automated Schedules */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>Lịch tải dữ liệu tự động</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Ca 1 (Đồng bộ đầy đủ 30 ngày):</span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">02:00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ca 2 (Cập nhật buổi trưa):</span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">11:00</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Ca 3 (Chốt ca chiều):</span>
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">17:00</span>
                </div>
              </div>
              <div className="text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-200/60">
                Tự động gia hạn Refresh Token mà không cần đăng nhập lại.
              </div>
            </div>

            {/* Box 3: Modules Coverage */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Phạm vi phủ sóng Dự án</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700">
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span><strong>Module 02 (Tracking):</strong> GCLID &amp; UTM Ads</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span><strong>Module 03 (Từ khóa):</strong> GA4 &amp; Search Console</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span><strong>Module 04 (Báo cáo):</strong> Chi phí Ads &amp; ROAS</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Scopes Section */}
          <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100 space-y-2">
            <div className="text-xs font-bold text-blue-950 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Các quyền hạn (OAuth 2.0 Scopes) được hệ thống sử dụng:</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-white border border-blue-100 shadow-2xs">
                <div className="font-semibold text-slate-900">Google Analytics 4</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Quyền Chỉ xem (Viewer) báo cáo phiên, số người truy cập, tỷ lệ thoát trang LED.
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-blue-100 shadow-2xs">
                <div className="font-semibold text-slate-900">Google Ads</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Đọc ngân sách tiêu hao, lượt nhấp, hiển thị, chi phí CPL từng chiến dịch.
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-white border border-blue-100 shadow-2xs">
                <div className="font-semibold text-slate-900">Search Console &amp; Trends</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Đọc từ khóa tìm kiếm tự nhiên, vị trí trung bình trên Google và độ thịnh hành.
                </div>
              </div>
            </div>
          </div>

          {/* Client ID Config Trigger */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-slate-400" />
              <span>Google Cloud Client ID: </span>
              {clientConfig?.hasClientId ? (
                <span className="font-mono text-slate-700 font-semibold">{clientConfig.clientIdMasked}</span>
              ) : (
                <span className="text-amber-700 font-semibold">Chưa cấu hình (đang dùng Demo/Mặc định)</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowConfigModal(true);
              }}
              className="text-blue-700 hover:underline font-semibold"
            >
              Cấu hình Google Client ID riêng →
            </button>
          </div>
        </div>
      </div>

      {/* Config Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
                <span>Cấu hình Google OAuth Client</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Để dùng tài khoản Google thật của công ty, bạn cần tạo OAuth Client ID trên{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline font-semibold inline-flex items-center gap-0.5"
              >
                Google Cloud Console <ExternalLink className="w-3 h-3" />
              </a>
              . Thêm đường dẫn Callback sau vào mục <strong>Authorized redirect URIs</strong>:
            </p>

            <div className="p-2.5 rounded-xl bg-slate-100 font-mono text-[11px] text-slate-800 break-all select-all border border-slate-200">
              {typeof window !== 'undefined' ? `${window.location.origin}/api/v1/auth/google/callback` : 'http://localhost:3000/api/v1/auth/google/callback'}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Google Client ID</label>
                <input
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="xxxx.apps.googleusercontent.com"
                  value={clientIdInput}
                  onChange={(e) => setClientIdInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Google Client Secret</label>
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="GOCSPX-xxxxxx"
                  value={clientSecretInput}
                  onChange={(e) => setClientSecretInput(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Bảo mật &amp; Quyền riêng tư tuyệt đối</span>
              </div>
              <p className="text-slate-600">
                Mã này được lưu trữ riêng biệt trên máy tính của bạn và không bao giờ hiển thị công khai. Bạn cũng có thể mở file <code>.env</code> trực tiếp trong mã nguồn để dán vào biến <code>GOOGLE_CLIENT_ID</code> và <code>GOOGLE_CLIENT_SECRET</code> nếu không muốn thao tác trên giao diện.
              </p>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveClientConfig()}
                  className="h-9 px-4 rounded-xl bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-2xs transition"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>Lưu &amp; Đăng nhập ngay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

