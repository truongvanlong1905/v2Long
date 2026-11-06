'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  ROLE_CODES,
  ROLE_LABELS,
  type AdminUserDto,
  type DepartmentCode,
  type RoleCode,
} from '@toantrung/contracts';
import { apiRequest, ApiClientError } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

export default function AdminUsersPage() {
  const { user } = useSession();
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Create user form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleCode, setRoleCode] = useState<RoleCode>('SALES');
  const [department, setDepartment] = useState<DepartmentCode>('sales');
  const [initialPassword, setInitialPassword] = useState('');
  const [creating, setCreating] = useState(false);

  // Account deletion dialog state
  const [userToDelete, setUserToDelete] = useState<AdminUserDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ users: AdminUserDto[] }>('/api/v1/users');
      setUsers(res.users);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiClientError
          ? err.message
          : 'Không thể tải danh sách tài khoản nhân sự.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.roleCode === 'ADMIN') {
      void loadUsers();
    } else {
      setLoading(false);
    }
  }, [user?.roleCode, loadUsers]);

  if (!user) return null;

  if (user.roleCode !== 'ADMIN') {
    return (
      <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center max-w-xl mx-auto my-8 shadow-card">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 grid place-items-center mx-auto mb-4">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h1 className="font-display text-xl font-bold text-ink">
          Khu vực chỉ dành cho Quản trị viên
        </h1>
        <p className="text-xs text-ink-muted mt-2 leading-relaxed">
          Theo ma trận phân quyền BA, chỉ vai trò <strong>Quản trị viên (ADMIN)</strong> mới có
          quyền Cấu hình hệ thống và Quản lý tài khoản nhân sự.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
        >
          Trở về Tổng quan
        </Link>
      </div>
    );
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setCreating(true);
    try {
      await apiRequest('/api/v1/users', {
        method: 'POST',
        csrfToken: user.csrfToken,
        body: {
          fullName,
          email,
          phone,
          roleCode,
          department,
          initialPassword,
        },
      });
      setFullName('');
      setEmail('');
      setPhone('');
      setInitialPassword('');
      setFeedback({ type: 'ok', text: 'Đã cấp tài khoản nhân sự mới thành công.' });
      await loadUsers();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiClientError ? err.message : 'Không thể tạo tài khoản.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (target: AdminUserDto) => {
    setFeedback(null);
    try {
      await apiRequest('/api/v1/users', {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          userId: target.id,
          isActive: !target.isActive,
        },
      });
      setFeedback({
        type: 'ok',
        text: target.isActive
          ? `Đã khóa tài khoản ${target.fullName} (${target.email}).`
          : `Đã mở khóa tài khoản ${target.fullName} (${target.email}).`,
      });
      await loadUsers();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiClientError ? err.message : 'Không thể đổi trạng thái tài khoản.',
      });
    }
  };

  const handleChangeRole = async (target: AdminUserDto, nextRole: RoleCode) => {
    setFeedback(null);
    try {
      await apiRequest('/api/v1/users', {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          userId: target.id,
          roleCode: nextRole,
        },
      });
      setFeedback({
        type: 'ok',
        text: `Đã đổi vai trò của ${target.fullName} sang ${ROLE_LABELS[nextRole]}.`,
      });
      await loadUsers();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof ApiClientError ? err.message : 'Không thể đổi vai trò.',
      });
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setDeleting(true);
    setDeleteDialogError(null);
    setFeedback(null);

    try {
      await apiRequest('/api/v1/users', {
        method: 'DELETE',
        csrfToken: user.csrfToken,
        body: { userId: userToDelete.id },
      });

      const deletedName = userToDelete.fullName;
      const deletedEmail = userToDelete.email;
      setUserToDelete(null);
      setFeedback({
        type: 'ok',
        text: `Đã xóa tài khoản ${deletedName} (${deletedEmail}) và thu hồi toàn bộ phiên đăng nhập liên quan.`,
      });
      await loadUsers();
    } catch (err) {
      setDeleteDialogError(
        err instanceof ApiClientError ? err.message : 'Không thể xóa tài khoản nhân sự lúc này.',
      );
    } finally {
      setDeleting(false);
    }
  };

  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header — No decorative "Không gian làm việc" eyebrow */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink tracking-tight">
          Quản lý tài khoản
        </h1>
        <p className="text-[13px] text-ink-muted mt-1">
          Cấp tài khoản nội bộ, gán đúng 1 trong 8 vai trò BA, khóa/mở khóa hoặc xóa tài khoản.
        </p>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Tổng tài khoản nhân sự</p>
            <strong className="font-display text-2xl font-bold text-ink">{users.length}</strong>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Đang hoạt động</p>
            <strong className="font-display text-2xl font-bold text-ink">{activeCount}</strong>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-card flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 grid place-items-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-ink-muted">Ma trận chuẩn BA</p>
            <strong className="font-display text-2xl font-bold text-ink">8 vai trò</strong>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl text-xs font-semibold ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Accounts List Table */}
        <section className="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-card">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-ink">
                Danh sách tài khoản nội bộ
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Khách hàng là dữ liệu Lead, không có tài khoản đăng nhập hệ thống
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200/80">
                  <th className="py-3.5 px-5 font-bold">Nhân sự</th>
                  <th className="py-3.5 px-5 font-bold">Phòng ban</th>
                  <th className="py-3.5 px-5 font-bold">Vai trò BA</th>
                  <th className="py-3.5 px-5 font-bold">Trạng thái</th>
                  <th className="py-3.5 px-5 font-bold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Đang tải danh sách nhân sự...
                    </td>
                  </tr>
                ) : (
                  users.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/60">
                      <td className="py-3.5 px-5">
                        <strong className="font-bold text-ink block">{item.fullName}</strong>
                        <span className="text-slate-500">{item.email}</span>
                        {item.phone && (
                          <span className="block text-[11px] text-slate-400">{item.phone}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-slate-600">
                        {DEPARTMENT_LABELS[item.department] || item.department}
                      </td>
                      <td className="py-3.5 px-5">
                        <select
                          aria-label={`Đổi vai trò của ${item.fullName}`}
                          value={item.roleCode}
                          disabled={item.id === user.id}
                          onChange={(e) =>
                            void handleChangeRole(item, e.target.value as RoleCode)
                          }
                          className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-ink focus:border-brand focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                        >
                          {ROLE_CODES.map((code) => (
                            <option key={code} value={code}>
                              {ROLE_LABELS[code]} ({code})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-5">
                        {item.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" />
                            Hoạt động
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold">
                            <Lock className="w-3 h-3" />
                            Đã khóa
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        {item.id === user.id ? (
                          <span className="text-[11px] text-slate-400 font-medium">
                            Tài khoản của bạn
                          </span>
                        ) : (
                          <div className="inline-flex items-center justify-end gap-2">
                            {/* Lock / Unlock Action */}
                            <button
                              type="button"
                              onClick={() => void handleToggleActive(item)}
                              className={`h-8 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors ${
                                item.isActive
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              {item.isActive ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Khóa</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Mở khóa</span>
                                </>
                              )}
                            </button>

                            {/* Visually separated Delete Account Action */}
                            <span aria-hidden="true" className="h-4 w-px bg-slate-200" />

                            <button
                              type="button"
                              onClick={() => {
                                setDeleteDialogError(null);
                                setUserToDelete(item);
                              }}
                              className="h-8 px-3 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Xóa tài khoản</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right: Provision New Employee Account */}
        <section className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-card">
          <div className="pb-4 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand grid place-items-center">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-ink">
                Cấp tài khoản nhân sự
              </h2>
              <p className="text-xs text-ink-muted">Không mở đăng ký công khai</p>
            </div>
          </div>

          <form onSubmit={(e) => void handleCreateUser(e)} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Họ và tên nhân viên
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50/40 text-xs text-ink focus:bg-white focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Email công việc
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ten.nv@toantrung.vn"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50/40 text-xs text-ink focus:bg-white focus:border-brand focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Số điện thoại
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0903xxxxxx"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50/40 text-xs text-ink focus:bg-white focus:border-brand focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vai trò BA
                </label>
                <select
                  value={roleCode}
                  onChange={(e) => setRoleCode(e.target.value as RoleCode)}
                  className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs text-ink focus:bg-white focus:border-brand focus:outline-none"
                >
                  {ROLE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {ROLE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phòng ban
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as DepartmentCode)}
                  className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs text-ink focus:bg-white focus:border-brand focus:outline-none"
                >
                  {DEPARTMENTS.map((dep) => (
                    <option key={dep} value={dep}>
                      {DEPARTMENT_LABELS[dep]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mật khẩu khởi tạo (tối thiểu 8 ký tự)
              </label>
              <input
                type="password"
                required
                value={initialPassword}
                onChange={(e) => setInitialPassword(e.target.value)}
                placeholder="Nhập mật khẩu khởi tạo"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-slate-50/40 text-xs text-ink focus:bg-white focus:border-brand focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full h-10 rounded-xl bg-brand hover:bg-brand-deep text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? 'Đang tạo...' : 'Cấp tài khoản'}</span>
            </button>
          </form>
        </section>
      </div>

      {/* Confirmation Dialog for Account Deletion */}
      {userToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-elevated space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-red-50 border border-red-200 text-red-600 grid place-items-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="delete-account-dialog-title"
                    className="font-display text-base font-bold text-ink"
                  >
                    Xác nhận xóa tài khoản nhân sự
                  </h2>
                  <p className="text-xs text-slate-500">
                    Thao tác thu hồi vĩnh viễn quyền truy cập hệ thống
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setUserToDelete(null)}
                aria-label="Đóng hộp thoại"
                className="p-1.5 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
              <p className="text-slate-500">Tài khoản được chọn:</p>
              <strong className="font-bold text-ink text-sm block">
                {userToDelete.fullName}
              </strong>
              <p className="text-slate-600">{userToDelete.email}</p>
              <p className="text-slate-500">
                Vai trò: <strong>{userToDelete.roleName}</strong> ·{' '}
                {DEPARTMENT_LABELS[userToDelete.department] || userToDelete.department}
              </p>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Sau khi xóa, tài khoản này sẽ bị gỡ khỏi danh sách nhân sự hoạt động và mọi phiên
              đăng nhập hiện tại sẽ bị hủy ngay lập tức. Toàn bộ hồ sơ Lead, lịch sử công việc và
              nhật ký kiểm toán liên quan vẫn được bảo toàn nguyên vẹn.
            </p>

            {deleteDialogError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold"
              >
                {deleteDialogError}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setUserToDelete(null)}
                className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors disabled:opacity-50"
              >
                Hủy
              </button>

              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDeleteUser()}
                className="h-10 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Đang xóa...' : 'Xóa tài khoản'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
