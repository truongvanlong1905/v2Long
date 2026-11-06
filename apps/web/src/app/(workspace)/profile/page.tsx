'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Check,
  KeyRound,
  Mail,
  Phone,
  RotateCcw,
  Shield,
  Trash2,
  User,
} from 'lucide-react';
import { DEPARTMENT_LABELS } from '@toantrung/contracts';
import { apiRequest, ApiClientError } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import { getInitials } from '@/core/layout/WorkspaceShell';

export default function ProfilePage() {
  const { user, refreshSession } = useSession();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [removeAvatarFlag, setRemoveAvatarFlag] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setPhone(user.phone || '');
      setPendingAvatarFile(null);
      setPendingAvatarPreview(null);
      setRemoveAvatarFlag(false);
    }
  }, [user]);

  if (!user) return null;

  const displayedAvatarUrl = removeAvatarFlag
    ? null
    : pendingAvatarPreview || user.avatarUrl || null;

  const hasProfileDraftChanges =
    fullName.trim() !== user.fullName ||
    phone.trim() !== (user.phone || '') ||
    pendingAvatarFile !== null ||
    removeAvatarFlag;

  const handleSelectAvatar = (file: File | undefined) => {
    if (!file) return;
    setProfileMsg(null);
    const previewUrl = URL.createObjectURL(file);
    setPendingAvatarFile(file);
    setPendingAvatarPreview(previewUrl);
    setRemoveAvatarFlag(false);
  };

  const handleMarkRemoveAvatar = () => {
    setProfileMsg(null);
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
    setRemoveAvatarFlag(true);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleCancelProfileDraft = () => {
    setFullName(user.fullName);
    setPhone(user.phone || '');
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
    setRemoveAvatarFlag(false);
    setProfileMsg(null);
    if (avatarInputRef.current) {
      avatarInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setSavingProfile(true);
    try {
      if (pendingAvatarFile) {
        const formData = new FormData();
        formData.append('fullName', fullName.trim());
        formData.append('phone', phone.trim());
        formData.append('removeAvatar', 'false');
        formData.append('avatar', pendingAvatarFile);

        await apiRequest('/api/v1/profile', {
          method: 'PATCH',
          csrfToken: user.csrfToken,
          body: formData,
          isFormData: true,
        });
      } else {
        await apiRequest('/api/v1/profile', {
          method: 'PATCH',
          csrfToken: user.csrfToken,
          body: {
            fullName: fullName.trim(),
            phone: phone.trim(),
            ...(removeAvatarFlag ? { removeAvatar: true } : {}),
          },
        });
      }

      await refreshSession();
      setPendingAvatarFile(null);
      setPendingAvatarPreview(null);
      setRemoveAvatarFlag(false);
      setProfileMsg({
        type: 'ok',
        text: 'Đã lưu thay đổi hồ sơ tài khoản thành công.',
      });
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: err instanceof ApiClientError ? err.message : 'Không thể lưu hồ sơ tài khoản.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    setSavingPassword(true);
    try {
      await apiRequest('/api/v1/profile', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: { currentPassword, newPassword, confirmPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({
        type: 'ok',
        text: 'Đổi mật khẩu thành công. Các phiên đăng nhập cũ khác đã được thu hồi.',
      });
    } catch (err) {
      setPasswordMsg({
        type: 'err',
        text: err instanceof ApiClientError ? err.message : 'Không thể đổi mật khẩu.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header — No decorative "Không gian làm việc" eyebrow */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
          Hồ sơ tài khoản
        </h1>
        <p className="text-[13px] text-ink-muted mt-1">
          Quản lý ảnh đại diện, thông tin liên hệ công việc và mật khẩu đăng nhập cá nhân.
        </p>
      </div>

      {/* Employee Summary Banner */}
      <section className="rounded-2xl border border-brand-border bg-gradient-to-r from-[#E8F1FF] via-[#F4F8FF] to-white p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4 shadow-card">
        <div className="flex items-center gap-4">
          {displayedAvatarUrl ? (
            <img
              src={displayedAvatarUrl}
              alt={fullName || user.fullName}
              className="w-16 h-16 rounded-2xl object-cover border-2 border-white shadow-sm shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-white border border-brand-border text-brand grid place-items-center font-display text-xl font-bold shadow-sm shrink-0">
              {getInitials(fullName || user.fullName)}
            </div>
          )}
          <div>
            <strong className="font-display text-xl font-bold text-ink block">
              {fullName || user.fullName}
            </strong>
            <p className="text-xs text-slate-600 mt-1">
              {user.roleName} · {DEPARTMENT_LABELS[user.department] || user.department}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Tài khoản đang hoạt động</span>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Essential Personal Work Profile + Avatar */}
        <section className="lg:col-span-7 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-card">
          <div className="pb-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand grid place-items-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-ink">
                Thông tin tài khoản công việc
              </h2>
              <p className="text-xs text-ink-muted">
                Chỉ bao gồm các thông tin thiết yếu phục vụ công việc nội bộ
              </p>
            </div>
          </div>

          <form onSubmit={(e) => void handleSaveProfile(e)} className="mt-5 space-y-5">
            {/* Avatar Upload, Replace, Remove & Preview */}
            <div className="p-4 rounded-2xl bg-slate-50/70 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {displayedAvatarUrl ? (
                  <img
                    src={displayedAvatarUrl}
                    alt="Xem trước ảnh đại diện"
                    className="w-16 h-16 rounded-full object-cover border-2 border-white ring-1 ring-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-brand-soft text-brand font-display font-bold text-lg grid place-items-center border-2 border-white ring-1 ring-brand-border shrink-0">
                    {getInitials(fullName || user.fullName)}
                  </div>
                )}
                <div>
                  <strong className="text-xs font-bold text-ink block">
                    Ảnh đại diện cá nhân
                  </strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Hỗ trợ PNG, JPG hoặc WebP (tối đa 2 MB). Xem trước trước khi lưu.
                  </p>
                  {pendingAvatarFile && (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-brand">
                      Bản nháp mới: {pendingAvatarFile.name}
                    </span>
                  )}
                  {removeAvatarFlag && (
                    <span className="inline-block mt-1 text-[11px] font-semibold text-amber-700">
                      Sẽ gỡ ảnh đại diện khi nhấn Lưu thay đổi
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleSelectAvatar(e.target.files?.[0])}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="h-9 px-3.5 rounded-xl bg-white border border-slate-200 hover:border-brand text-ink hover:text-brand text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{displayedAvatarUrl ? 'Thay ảnh' : 'Tải ảnh lên'}</span>
                </button>

                {(displayedAvatarUrl || user.avatarUrl) && !removeAvatarFlag && (
                  <button
                    type="button"
                    onClick={handleMarkRemoveAvatar}
                    className="h-9 px-3 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-red-600 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Gỡ ảnh</span>
                  </button>
                )}
              </div>
            </div>

            {/* Editable Fields: Full Name & Phone Number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="profile-fullname"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Họ và tên
                </label>
                <input
                  id="profile-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-sm text-ink focus:bg-white focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="profile-phone"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Số điện thoại
                </label>
                <div className="relative flex items-center">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    id="profile-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0903xxxxxx"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-sm text-ink focus:bg-white focus:border-brand focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Read-only Provisioned Fields: Work Email, Department, Role */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="sm:col-span-1">
                <label
                  htmlFor="profile-email"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Email công việc
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    id="profile-email"
                    type="email"
                    readOnly
                    disabled
                    value={user.email}
                    className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="profile-department"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Phòng ban (Chỉ đọc)
                </label>
                <div className="relative flex items-center">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    id="profile-department"
                    type="text"
                    readOnly
                    disabled
                    value={DEPARTMENT_LABELS[user.department] || user.department}
                    className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="profile-role"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Vai trò (Chỉ đọc)
                </label>
                <div className="relative flex items-center">
                  <Shield className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                  <input
                    id="profile-role"
                    type="text"
                    readOnly
                    disabled
                    value={user.roleName}
                    className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 bg-slate-100 text-xs text-slate-600 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {profileMsg && (
              <div
                role="status"
                className={`p-3.5 rounded-xl text-xs font-semibold ${
                  profileMsg.type === 'ok'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {profileMsg.text}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={!hasProfileDraftChanges || savingProfile}
                onClick={handleCancelProfileDraft}
                className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Hủy</span>
              </button>

              <button
                type="submit"
                disabled={savingProfile}
                className="h-10 px-5 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>{savingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Right: Separate Change Password Panel */}
        <section className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-card">
            <div className="pb-4 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand grid place-items-center">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-base font-bold text-ink">
                  Đổi mật khẩu đăng nhập
                </h2>
                <p className="text-xs text-ink-muted">Khu vực bảo mật mật khẩu riêng biệt</p>
              </div>
            </div>

            <form onSubmit={(e) => void handleChangePassword(e)} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="current-password"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Mật khẩu hiện tại
                </label>
                <input
                  id="current-password"
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Nhập mật khẩu đang sử dụng"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-sm text-ink focus:bg-white focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Mật khẩu mới (tối thiểu 8 ký tự, chữ hoa, chữ thường, số)
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-sm text-ink focus:bg-white focus:border-brand focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Xác nhận mật khẩu mới
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-sm text-ink focus:bg-white focus:border-brand focus:outline-none"
                />
              </div>

              {passwordMsg && (
                <div
                  role="status"
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    passwordMsg.type === 'ok'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border border-red-200 text-red-700'
                  }`}
                >
                  {passwordMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={savingPassword}
                className="w-full h-10 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{savingPassword ? 'Đang cập nhật...' : 'Đổi mật khẩu'}</span>
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
