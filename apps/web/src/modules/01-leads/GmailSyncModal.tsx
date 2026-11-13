'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiRequest } from '@/core/http/client';

interface GmailSyncSummary {
  scanned: number;
  created: number;
  deduplicated: number;
  skippedNoise: number;
  failed: number;
  error: string | null;
}

interface GmailSyncStatusPayload {
  connected: boolean;
  connectedEmail: string | null;
  isSandboxDemo: boolean;
  hasGmailScope: boolean;
  config: {
    enabled: boolean;
    query: string;
    maxMessages: number;
    onlyLeadKeywords: boolean;
    lastSyncAt: string | null;
    lastSyncSummary: GmailSyncSummary | null;
  };
}

interface GmailCreatedLeadPreview {
  id: number;
  leadCode: string;
  contactName: string | null;
  email: string | null;
  phone: string;
  projectName: string | null;
}

interface GmailSyncRunPayload {
  ok: boolean;
  needsAuth?: boolean;
  needsReauth?: boolean;
  isSandboxDemo?: boolean;
  connectedEmail: string | null;
  message: string;
  summary: GmailSyncSummary;
  createdLeads: GmailCreatedLeadPreview[];
  status?: GmailSyncStatusPayload;
}

interface GmailSyncModalProps {
  open: boolean;
  onClose: () => void;
  csrfToken?: string;
  onSynced: () => void;
}

export function GmailSyncModal({
  open,
  onClose,
  csrfToken,
  onSynced,
}: GmailSyncModalProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [status, setStatus] = useState<GmailSyncStatusPayload | null>(null);
  const [query, setQuery] = useState('in:inbox newer_than:7d -category:promotions -category:social');
  const [onlyLeadKeywords, setOnlyLeadKeywords] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [maxMessages, setMaxMessages] = useState(20);
  const [runResult, setRunResult] = useState<GmailSyncRunPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<GmailSyncStatusPayload>('/api/v1/leads/gmail-sync');
      setStatus(data);
      setQuery(data.config.query);
      setOnlyLeadKeywords(data.config.onlyLeadKeywords);
      setEnabled(data.config.enabled);
      setMaxMessages(data.config.maxMessages);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải cấu hình Gmail.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setRunResult(null);
      loadStatus();
    }
  }, [open, loadStatus]);

  const handleAuthorizeGmail = async () => {
    setAuthorizing(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{
        needsConfig?: boolean;
        authUrl?: string | null;
        message?: string | null;
      }>('/api/v1/auth/google/authorize?returnPath=/leads');
      if (res.authUrl) {
        window.location.href = res.authUrl;
        return;
      }
      setErrorMsg(res.message || 'Chưa cấu hình Google Client ID & Client Secret.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể mở trang cấp quyền Google.');
    } finally {
      setAuthorizing(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setErrorMsg(null);
    setRunResult(null);
    try {
      const res = await apiRequest<GmailSyncRunPayload>('/api/v1/leads/gmail-sync', {
        method: 'POST',
        csrfToken,
        body: JSON.stringify({
          action: 'sync_now',
          enabled,
          query,
          maxMessages,
          onlyLeadKeywords,
        }),
      });
      setRunResult(res);
      if (res.status) setStatus(res.status);
      if (res.ok && res.summary.created > 0) {
        onSynced();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi khi quét Gmail.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveConfig = async () => {
    setErrorMsg(null);
    try {
      const res = await apiRequest<GmailSyncStatusPayload>('/api/v1/leads/gmail-sync', {
        method: 'POST',
        csrfToken,
        body: JSON.stringify({
          action: 'save_config',
          enabled,
          query,
          maxMessages,
          onlyLeadKeywords,
        }),
      });
      setStatus(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu cấu hình.');
    }
  };

  if (!open) return null;

  const needsReauth = Boolean(
    (status && status.connected && !status.isSandboxDemo && !status.hasGmailScope) ||
      runResult?.needsReauth,
  );
  const needsAuth = Boolean((status && !status.connected) || runResult?.needsAuth);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Tạo Lead Tự Động Từ Gmail
              </h3>
              <p className="text-xs text-slate-500">
                Quét hộp thư đến, tự lọc thư hỏi báo giá / có SĐT và chống trùng lặp theo mã thư
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang kiểm tra kết nối Google / Gmail...</span>
            </div>
          ) : (
            <>
              {/* Connection Status Banner */}
              <div
                className={`rounded-xl border p-3.5 flex flex-wrap items-center justify-between gap-3 ${
                  status?.connected && status?.hasGmailScope && !status?.isSandboxDemo
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-amber-50/80 border-amber-200'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {status?.connected && status?.hasGmailScope && !status?.isSandboxDemo ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  <div className="text-xs">
                    <div className="font-semibold text-slate-900">
                      {status?.connected
                        ? `Đang kết nối: ${status.connectedEmail}`
                        : 'Chưa kết nối tài khoản Google / Gmail'}
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      {status?.isSandboxDemo
                        ? 'Đang ở chế độ Sandbox Demo — cần kết nối Google thật để đọc Gmail.'
                        : needsReauth
                          ? 'Thiếu quyền đọc Gmail (gmail.readonly). Bấm nút bên cạnh để cấp quyền.'
                          : status?.connected
                            ? 'Đã có quyền đọc Gmail (gmail.readonly).'
                            : 'Bấm Kết nối Google để cấp quyền đọc hộp thư đến.'}
                    </div>
                  </div>
                </div>

                {(needsAuth || needsReauth || status?.isSandboxDemo) && (
                  <button
                    type="button"
                    disabled={authorizing}
                    onClick={handleAuthorizeGmail}
                    className="h-8 px-3 rounded-lg bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {authorizing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Mail className="w-3.5 h-3.5" />
                    )}
                    <span>{needsReauth ? 'Cấp quyền đọc Gmail' : 'Kết nối Google'}</span>
                  </button>
                )}
              </div>

              {/* Filter & Config */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bộ lọc tìm kiếm Gmail (Gmail Query)
                  </label>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="in:inbox newer_than:7d -category:promotions -category:social"
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Ví dụ: <code>in:inbox newer_than:7d</code> hoặc{' '}
                    <code>subject:(báo giá OR màn hình LED)</code>
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Số thư tối đa mỗi lần quét
                    </label>
                    <select
                      value={maxMessages}
                      onChange={(e) => setMaxMessages(Number(e.target.value))}
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-300 text-xs text-slate-800 bg-white"
                    >
                      <option value={10}>10 thư gần nhất</option>
                      <option value={20}>20 thư gần nhất</option>
                      <option value={35}>35 thư gần nhất</option>
                      <option value={50}>50 thư gần nhất</option>
                    </select>
                  </div>

                  <div className="flex flex-col justify-end gap-1.5 pb-1">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={onlyLeadKeywords}
                        onChange={(e) => setOnlyLeadKeywords(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>Chỉ tạo Lead từ thư hỏi báo giá / có SĐT</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span>Tự động tạo Lead ngay khi có mail mới (mỗi 20 giây)</span>
                    </label>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  {errorMsg}
                </div>
              )}

              {runResult && (
                <div
                  className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                    runResult.ok
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <div className="flex items-start gap-2 font-semibold">
                    {runResult.ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <span>{runResult.message}</span>
                  </div>

                  {runResult.createdLeads.length > 0 && (
                    <div className="bg-white/90 rounded-lg border border-emerald-200/80 divide-y divide-slate-100">
                      {runResult.createdLeads.map((l) => (
                        <div key={l.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-bold text-[#1E3A8A] mr-1.5">{l.leadCode}</span>
                            <span className="font-medium text-slate-800">
                              {l.contactName || l.email}
                            </span>
                            {l.projectName && (
                              <span className="text-slate-500 ml-1.5 truncate">
                                — {l.projectName}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-600 shrink-0">
                            {l.phone}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {status?.config.lastSyncAt && !runResult && (
                <div className="text-[11px] text-slate-500">
                  Lần đồng bộ gần nhất:{' '}
                  <span className="font-medium text-slate-700">
                    {new Date(status.config.lastSyncAt).toLocaleString('vi-VN')}
                  </span>
                  {status.config.lastSyncSummary && (
                    <span>
                      {' '}
                      — Quét {status.config.lastSyncSummary.scanned} thư, tạo{' '}
                      {status.config.lastSyncSummary.created} Lead mới
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={loading || syncing}
            className="h-9 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
          >
            Lưu cấu hình
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={loading || syncing}
              className="h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60 shadow-2xs"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>{syncing ? 'Đang quét Gmail...' : 'Quét & Tạo Lead ngay'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

