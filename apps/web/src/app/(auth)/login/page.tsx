'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, HelpCircle, Lock, User } from 'lucide-react';
import { apiRequest, ApiClientError } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import type { SessionUserDto } from '@toantrung/contracts';

const REMEMBER_USER_KEY = 'tt_v2_remembered_identifier';

export default function LoginPage() {
  const router = useRouter();
  const { user, branding, refreshSession, refreshUnreadCount } = useSession();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberUsername, setRememberUsername] = useState(false);
  const [showForgotHelp, setShowForgotHelp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(REMEMBER_USER_KEY);
      if (saved) {
        setIdentifier(saved);
        setRememberUsername(true);
      }
    } catch {
      // Ignore storage access errors
    }
  }, []);

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      await apiRequest<{ user: SessionUserDto }>('/api/v1/auth/login', {
        method: 'POST',
        body: {
          identifier: identifier.trim(),
          password,
          rememberUsername,
        },
      });

      try {
        if (rememberUsername && identifier.trim()) {
          window.localStorage.setItem(REMEMBER_USER_KEY, identifier.trim());
        } else {
          window.localStorage.removeItem(REMEMBER_USER_KEY);
        }
      } catch {
        // Ignore storage write issues
      }

      await refreshSession();
      await refreshUnreadCount();
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(
          'Không thể kết nối máy chủ xác thực. Vui lòng kiểm tra trạng thái dịch vụ.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const crop = branding.loginHero.crop || { zoom: 1, offsetX: 0, offsetY: 0, frameScale: 1 };
  const effectiveZoom = Math.max(1, crop.zoom / Math.max(0.6, crop.frameScale || 1));
  const posX = Math.max(0, Math.min(100, 50 - crop.offsetX));
  const posY = Math.max(0, Math.min(100, 50 - crop.offsetY));

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col justify-between bg-slate-950">
      {/* Full-Page Login Background Image */}
      <div aria-hidden="true" className="fixed inset-0 z-0 overflow-hidden">
        <img
          src={branding.loginHero.url || '/brand/showroom-toan-trung.webp'}
          alt={branding.loginHero.altText || 'Hình nền trang đăng nhập'}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/brand/showroom-toan-trung.webp';
          }}
          style={{
            objectPosition: `${posX}% ${posY}%`,
            transform: `scale(${effectiveZoom.toFixed(3)})`,
            transformOrigin: `${posX}% ${posY}%`,
          }}
          className="w-full h-full object-cover select-none"
        />
        {/* Subtle readability overlay */}
        <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1.5px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/40 via-transparent to-slate-950/60" />
      </div>

      {/* Single Logo Placement at Top-Left of Screen */}
      <header className="relative z-10 w-full px-5 sm:px-9 pt-5 sm:pt-7 flex items-center justify-start">
        <div className="inline-flex items-center bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-lg border border-white/60">
          <img
            src={branding.logo.url || '/brand/logo-toan-trung.png'}
            alt={branding.logo.altText || 'Logo'}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/brand/logo-toan-trung.png';
            }}
            className="h-9 sm:h-10 w-auto max-w-[200px] object-contain"
          />
        </div>
      </header>

      {/* Compact Login Form Centered on Full-Page Background (No duplicate logo or top image strip) */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-[436px] bg-white/95 backdrop-blur-md border border-white/80 rounded-2xl shadow-2xl p-7 sm:p-9">
          {/* Heading & Essential Instruction */}
          <div className="mb-6">
            <h1 className="font-display text-2xl sm:text-[28px] font-bold text-ink tracking-tight">
              Đăng nhập
            </h1>
            <p className="text-[13px] text-ink-muted mt-1.5 leading-relaxed">
              Vui lòng nhập thông tin tài khoản để tiếp tục
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium leading-relaxed"
            >
              {errorMessage}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="login-identifier"
                className="block text-[13px] font-semibold text-ink mb-2"
              >
                Email hoặc tên đăng nhập
              </label>
              <div className="flex items-center gap-3 h-12 px-3.5 rounded-xl border border-slate-200 bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10 transition-all">
                <User className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  id="login-identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="Nhập email hoặc tên đăng nhập"
                  className="w-full h-full bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-[13px] font-semibold text-ink mb-2"
              >
                Mật khẩu
              </label>
              <div className="flex items-center gap-3 h-12 px-3.5 rounded-xl border border-slate-200 bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10 transition-all">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  className="w-full h-full bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  className="p-1 text-slate-400 hover:text-brand rounded-lg transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Username & Forgot Password Guidance */}
            <div className="flex items-center justify-between pt-0.5 text-xs">
              <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberUsername}
                  onChange={(e) => setRememberUsername(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand"
                />
                <span>Ghi nhớ đăng nhập</span>
              </label>

              <button
                type="button"
                onClick={() => setShowForgotHelp((v) => !v)}
                className="font-semibold text-brand hover:underline inline-flex items-center gap-1"
              >
                <span>Quên mật khẩu?</span>
              </button>
            </div>

            {showForgotHelp && (
              <div className="p-3.5 rounded-xl bg-brand-soft/70 border border-brand-border text-xs text-slate-700 leading-relaxed flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold text-ink block mb-0.5">
                    Cấp lại mật khẩu
                  </strong>
                  Vui lòng liên hệ Quản trị viên hệ thống để được xác minh và đặt lại mật khẩu.
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-brand hover:bg-brand-deep text-white font-semibold text-sm inline-flex items-center justify-center gap-2 shadow-md shadow-brand/20 transition-all disabled:opacity-60"
            >
              <span>{submitting ? 'Đang xác thực...' : 'Đăng nhập'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>

      {/* Bottom spacer for balanced vertical centering */}
      <div aria-hidden="true" className="h-6 sm:h-10 relative z-10" />
    </div>
  );
}
