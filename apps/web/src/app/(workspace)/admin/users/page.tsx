'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RoleCode } from '@toantrung/contracts';
import {
  CheckCircle2,
  ChevronRight,
  Lock,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Unlock,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { useSession } from '@/core/session/SessionContext';
import { apiRequest } from '@/core/http/client';

interface ManagedUserDto {
  id: number;
  email: string;
  phone: string | null;
  fullName: string;
  roleCode: RoleCode;
  roleName: string;
  department: string | null;
  specialtyGroup: string | null;
  isReceivingLeads: boolean;
  isOnline: boolean;
  isActive: boolean;
  createdAt: string;
}

interface RoleOptionDto {
  id: number;
  roleCode: RoleCode;
  roleName: string;
}

const DEPARTMENT_GROUPS = [
  { key: 'ALL', label: 'Tất cả nhân sự' },
  { key: 'Ban Giám đốc', label: 'Ban Giám đốc' },
  { key: 'Phòng Kinh doanh', label: 'Phòng Kinh doanh' },
  { key: 'Phòng Marketing', label: 'Phòng Marketing & SEO' },
  { key: 'Bộ phận Quảng cáo', label: 'Bộ phận Quảng cáo' },
  { key: 'Bộ phận Thiết kế', label: 'Bộ phận Thiết kế' },
  { key: 'Quản trị Hệ thống', label: 'Quản trị Hệ thống' },
];

function isTeamLeadRole(roleCode: RoleCode): boolean {
  return roleCode === 'SALES_LEAD' || roleCode === 'MKT_LEAD';
}

function isExecutiveRole(roleCode: RoleCode): boolean {
  return roleCode === 'BOD' || roleCode === 'ADMIN';
}

export default function AdminUsersPage() {
  const { user: currentUser } = useSession();
  const [users, setUsers] = useState<ManagedUserDto[]>([]);
  const [roles, setRoles] = useState<RoleOptionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');

  // Selected User Detail Modal (Click row to view full details & manage)
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  // Create User Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleCode, setRoleCode] = useState<RoleCode>('SALES');
  const [department, setDepartment] = useState('Phòng Kinh doanh');
  const [password, setPassword] = useState('ToanTrung@2026');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await apiRequest<{
        users: ManagedUserDto[];
        roles: RoleOptionDto[];
      }>('/api/v1/admin/users');
      setUsers(data.users);
      setRoles(data.roles);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId],
  );

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (deptFilter !== 'ALL' && (u.department || '') !== deptFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.roleName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [users, deptFilter, searchQuery]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setBusyId(-1);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await apiRequest('/api/v1/admin/users', {
        method: 'POST',
        csrfToken: currentUser.csrfToken,
        body: {
          fullName,
          email,
          phone: phone || null,
          roleCode,
          department,
          password,
        },
      });
      setFeedbackMsg(`Đã tạo tài khoản nhân sự "${fullName}" (${email}) thành công.`);
      setFullName('');
      setEmail('');
      setPhone('');
      setShowCreateModal(false);
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi tạo tài khoản mới.');
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateUser = async (
    targetUser: ManagedUserDto,
    patch: { roleCode?: RoleCode; isActive?: boolean; department?: string },
  ) => {
    if (!currentUser) return;
    setBusyId(targetUser.id);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await apiRequest(`/api/v1/admin/users/${targetUser.id}`, {
        method: 'PATCH',
        csrfToken: currentUser.csrfToken,
        body: patch,
      });
      setFeedbackMsg(`Đã cập nhật tài khoản "${targetUser.fullName}" thành công.`);
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi cập nhật tài khoản.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteUser = async (targetUser: ManagedUserDto) => {
    if (!currentUser) return;
    setBusyId(targetUser.id);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      await apiRequest(`/api/v1/admin/users/${targetUser.id}`, {
        method: 'DELETE',
        csrfToken: currentUser.csrfToken,
      });
      setFeedbackMsg(`Đã xóa tài khoản "${targetUser.fullName}" khỏi danh sách hoạt động.`);
      setSelectedUserId(null);
      await fetchUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi xóa tài khoản.');
    } finally {
      setBusyId(null);
    }
  };

  const totalLeadsCount = users.filter((u) => isTeamLeadRole(u.roleCode)).length;
  const activeCount = users.filter((u) => u.isActive).length;

  return (
    <div className="space-y-3.5 text-sm">
      {/* 1. CLEAN MODERN WHITE HEADER */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:px-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200/80 text-[#1E3A8A] text-xs font-bold">
              <Shield className="w-3.5 h-3.5" />
              <span>Quản lý Tài khoản &amp; Phân quyền</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              <span>{totalLeadsCount} Trưởng nhóm (Lead)</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium">
              <span>
                {activeCount}/{users.length} đang hoạt động
              </span>
            </span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Danh sách Nhân sự &amp; Vai trò Hệ thống
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Giao diện rút gọn: Nhấn trực tiếp vào tên nhân sự để xem chi tiết thông tin liên hệ và chỉnh sửa phân quyền
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchUsers()}
            className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="h-9 px-3.5 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>Cấp tài khoản mới</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm text-rose-700 font-medium flex items-center justify-between">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="font-bold">
            Đóng
          </button>
        </div>
      )}

      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs sm:text-sm text-emerald-800 font-medium flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button type="button" onClick={() => setFeedbackMsg(null)} className="font-bold">
            Đóng
          </button>
        </div>
      )}

      {/* 2. COMPACT FILTER BAR */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {DEPARTMENT_GROUPS.map((grp) => (
            <button
              key={grp.key}
              type="button"
              onClick={() => setDeptFilter(grp.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                deptFilter === grp.key
                  ? 'bg-[#1E3A8A] text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {grp.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm tên nhân sự hoặc vai trò..."
            className="h-9 pl-8 pr-3.5 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-none focus:border-[#1E3A8A] w-full md:w-64"
          />
        </div>
      </div>

      {/* 3. STREAMLINED ACCOUNT LIST: ONLY NAME + ROLE (WITH LEAD HIGHLIGHT), CLICK TO OPEN DETAILS */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
          <span>Họ và tên nhân sự ({filteredUsers.length})</span>
          <span>Vai trò &amp; Điểm nhấn Trưởng nhóm</span>
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="py-10 text-center text-slate-400">
              Đang tải danh sách tài khoản...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-10 text-center text-slate-500">
              Không tìm thấy nhân sự phù hợp với bộ lọc.
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isLead = isTeamLeadRole(u.roleCode);
              const isExec = isExecutiveRole(u.roleCode);

              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUserId(u.id)}
                  className={`w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3 text-left transition ${
                    !u.isActive
                      ? 'bg-slate-50/60 opacity-60 hover:bg-slate-100/70'
                      : isLead
                        ? 'bg-amber-50/20 hover:bg-amber-50/50 border-l-2 border-l-amber-500'
                        : 'bg-white hover:bg-slate-50/80'
                  }`}
                >
                  {/* Left: Avatar + Name */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`relative w-9 h-9 rounded-xl font-bold text-xs grid place-items-center shrink-0 border ${
                        isLead
                          ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                          : isExec
                            ? 'bg-blue-50 text-[#1E3A8A] border-blue-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200/80'
                      }`}
                    >
                      {u.fullName
                        .split(' ')
                        .slice(-2)
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          u.isActive ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm truncate">
                        {u.fullName}
                      </span>

                      {isLead && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold">
                          <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                          <span>Lead / Trưởng nhóm</span>
                        </span>
                      )}

                      {!u.isActive && (
                        <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold">
                          Đã khóa
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Role Pill + Subtle Chevron */}
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`px-3 py-1 rounded-lg border text-xs font-semibold ${
                        isLead
                          ? 'bg-amber-50/90 text-amber-900 border-amber-300 font-bold'
                          : isExec
                            ? 'bg-blue-50 text-[#1E3A8A] border-blue-200 font-bold'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {u.roleName}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 4. MODAL XEM CHI TIẾT & QUẢN LÝ TÀI KHOẢN KHI ẤN VÀO NHÂN SỰ */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedUserId(null)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 py-4 bg-slate-50/80 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-xl font-bold text-sm grid place-items-center border ${
                    isTeamLeadRole(selectedUser.roleCode)
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : 'bg-blue-50 text-[#1E3A8A] border-blue-200'
                  }`}
                >
                  {selectedUser.fullName
                    .split(' ')
                    .slice(-2)
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-base sm:text-lg font-bold text-slate-900">
                      {selectedUser.fullName}
                    </h2>
                    {isTeamLeadRole(selectedUser.roleCode) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 text-[11px] font-bold">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        <span>Trưởng nhóm</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedUser.roleName} · {selectedUser.department || 'Chưa gắn phòng ban'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Full Details & Edit Controls */}
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="space-y-0.5">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email đăng nhập</span>
                  </span>
                  <strong className="font-mono text-xs sm:text-sm text-slate-900 block break-all">
                    {selectedUser.email}
                  </strong>
                </div>

                <div className="space-y-0.5">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    <span>Số điện thoại</span>
                  </span>
                  <strong className="font-mono text-xs sm:text-sm text-slate-900 block">
                    {selectedUser.phone || 'Chưa cập nhật'}
                  </strong>
                </div>

                <div className="space-y-0.5">
                  <span className="text-xs text-slate-500">Trạng thái tài khoản</span>
                  <div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        selectedUser.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {selectedUser.isActive ? 'Đang hoạt động' : 'Đang tạm khóa'}
                    </span>
                  </div>
                </div>

                <div className="space-y-0.5">
                  <span className="text-xs text-slate-500">Ngày khởi tạo</span>
                  <strong className="text-xs sm:text-sm text-slate-800 block">
                    {new Date(selectedUser.createdAt).toLocaleDateString('vi-VN')}
                  </strong>
                </div>
              </div>

              {/* Role & Department Assignment */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vai trò Phân quyền (RBAC)
                  </label>
                  <select
                    disabled={busyId === selectedUser.id || selectedUser.id === currentUser?.id}
                    value={selectedUser.roleCode}
                    onChange={(e) =>
                      void handleUpdateUser(selectedUser, {
                        roleCode: e.target.value as RoleCode,
                      })
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1E3A8A] disabled:opacity-60"
                  >
                    {roles.map((r) => (
                      <option key={r.roleCode} value={r.roleCode}>
                        {r.roleName} ({r.roleCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phòng ban trực thuộc
                  </label>
                  <select
                    disabled={busyId === selectedUser.id}
                    value={selectedUser.department || 'Phòng Kinh doanh'}
                    onChange={(e) =>
                      void handleUpdateUser(selectedUser, {
                        department: e.target.value,
                      })
                    }
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#1E3A8A]"
                  >
                    {DEPARTMENT_GROUPS.filter((d) => d.key !== 'ALL').map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lock / Delete Actions */}
              {selectedUser.id !== currentUser?.id && (
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={busyId === selectedUser.id}
                    onClick={() =>
                      void handleUpdateUser(selectedUser, {
                        isActive: !selectedUser.isActive,
                      })
                    }
                    className={`h-9 px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                      selectedUser.isActive
                        ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {selectedUser.isActive ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        <span>Tạm khóa tài khoản</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Mở khóa tài khoản</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={busyId === selectedUser.id}
                    onClick={() => void handleDeleteUser(selectedUser)}
                    className="h-9 px-3.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1.5 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa tài khoản</span>
                  </button>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setSelectedUserId(null)}
                className="h-9 px-4 rounded-xl bg-[#1E3A8A] text-white text-xs font-semibold"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL CẤP TÀI KHOẢN MỚI */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#1E3A8A]" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Cấp Tài khoản Nhân sự Mới
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateUser(e)} className="p-5 space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Họ và tên nhân sự *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="VD: Nguyễn Văn A"
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email công việc *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ten@toantrung.vn"
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0908xxxxxx"
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#1E3A8A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vai trò *
                  </label>
                  <select
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value as RoleCode)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                  >
                    {roles.map((r) => (
                      <option key={r.roleCode} value={r.roleCode}>
                        {r.roleName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phòng ban *
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-sm font-semibold"
                  >
                    {DEPARTMENT_GROUPS.filter((d) => d.key !== 'ALL').map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mật khẩu khởi tạo *
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-300 font-mono text-sm focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-9 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busyId === -1}
                  className="h-9 px-4 rounded-xl bg-[#1E3A8A] hover:bg-blue-800 text-white text-xs font-semibold"
                >
                  {busyId === -1 ? 'Đang tạo...' : 'Xác nhận cấp tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
