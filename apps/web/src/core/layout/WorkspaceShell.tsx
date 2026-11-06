'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FileSpreadsheet,
  LayoutGrid,
  LogOut,
  Menu,
  Megaphone,
  Search,
  Settings,
  Sparkles,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { useSession } from '../session/SessionContext';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  adminOnly?: boolean;
}

const BREADCRUMB_LABELS: Record<string, string> = {
  '/dashboard': 'Tổng quan điều hành',
  '/leads': 'Quản lý Lead & Khách hàng',
  '/tracking': 'Tracking & Đồng bộ nguồn',
  '/ads': 'Quảng cáo, Từ khóa & SEO',
  '/reports': 'Báo cáo & Phân tích',
  '/design': 'Hỗ trợ thiết kế & Phối cảnh AI',
  '/notifications': 'Thông báo hệ thống',
  '/profile': 'Hồ sơ tài khoản',
  '/admin/users': 'Quản lý tài khoản',
  '/settings': 'Cài đặt thương hiệu',
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'TT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard';
  const { user, loading, branding, unreadCount, logout } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(pathname === '/design');

  React.useEffect(() => {
    if (pathname === '/design') {
      setSidebarCollapsed(true);
    }
  }, [pathname]);

  const isFullBleed = pathname === '/design';

  const workNav: NavItem[] = [
    { href: '/dashboard', label: 'Tổng quan', icon: LayoutGrid },
    { href: '/leads', label: 'Quản lý Lead', icon: FileSpreadsheet },
    { href: '/tracking', label: 'Tracking & đồng bộ', icon: Crosshair },
    { href: '/ads', label: 'Quảng cáo & từ khóa', icon: Megaphone },
    { href: '/reports', label: 'Báo cáo', icon: BarChart3 },
    { href: '/design', label: 'AI thiết kế', icon: Sparkles },
  ];

  const personalNav: NavItem[] = [
    { href: '/notifications', label: 'Thông báo', icon: Bell, badge: unreadCount },
    { href: '/profile', label: 'Hồ sơ tài khoản', icon: UserCircle2 },
  ];

  const systemNav: NavItem[] = [
    { href: '/admin/users', label: 'Quản lý tài khoản', icon: Users, adminOnly: true },
    { href: '/settings', label: 'Cài đặt thương hiệu', icon: Settings },
  ];

  const currentBreadcrumb = BREADCRUMB_LABELS[pathname] || 'Tổng quan';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl px-8 py-7 shadow-lg flex items-center gap-4">
          <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Đang kiểm tra phiên đăng nhập...</p>
            <p className="text-xs text-slate-400 mt-0.5">Vui lòng đợi trong giây lát</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const visibleSystemNav = systemNav.filter(
    (item) => !item.adminOnly || user.roleCode === 'ADMIN',
  );

  const renderNavGroup = (title: string, items: NavItem[]) => (
    <div className="mb-5">
      {!sidebarCollapsed && (
        <p className="px-3 mb-2 text-[11px] font-bold tracking-wider uppercase text-slate-400">
          {title}
        </p>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`group relative flex items-center gap-3 h-10 rounded-xl px-3 text-sm transition-colors ${
                sidebarCollapsed ? 'justify-center px-0' : ''
              } ${
                active
                  ? 'bg-blue-50 text-blue-700 font-bold'
                  : 'text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700'
                }`}
              />
              {!sidebarCollapsed && <span className="truncate flex-1 text-[13.5px]">{item.label}</span>}
              {!sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold">
                  {item.badge}
                </span>
              )}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-l bg-blue-600"
                />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex w-full overflow-hidden">
      {/* Mobile Scrim */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Đóng thanh điều hướng"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Main Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 lg:sticky lg:top-0 lg:h-screen bg-white border-r border-slate-200/90 flex flex-col transition-all duration-200 shadow-xs ${
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-[256px]'
        } w-[264px] ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100">
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            {sidebarCollapsed ? (
              <div className="w-9 h-9 rounded-xl bg-blue-700 flex items-center justify-center text-white font-black text-sm shadow">
                TT
              </div>
            ) : (
              <img
                src={branding.logo.url || '/brand/logo-toan-trung.png'}
                alt={branding.logo.altText}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/brand/logo-toan-trung.png';
                }}
                className="h-8 w-auto max-w-[172px] object-contain"
              />
            )}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng menu"
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {renderNavGroup('CÔNG VIỆC', workNav)}
          {renderNavGroup('CÁ NHÂN', personalNav)}
          {renderNavGroup('HỆ THỐNG', visibleSystemNav)}
        </nav>

        {/* Sidebar Collapse Toggle (Desktop) */}
        <div className="hidden lg:flex items-center justify-end px-3 py-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="flex items-center gap-2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xs w-full justify-center transition"
            title={sidebarCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!sidebarCollapsed && <span className="text-[11px] font-medium">Thu gọn menu</span>}
          </button>
        </div>

        {/* Bottom User Account Summary */}
        <div className="p-3 border-t border-slate-100">
          <Link
            href="/profile"
            title={`${user.fullName} (${user.email})`}
            className={`flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-slate-50 transition-colors ${
              sidebarCollapsed ? 'justify-center' : ''
            }`}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-extrabold text-xs grid place-items-center shrink-0">
                {getInitials(user.fullName)}
              </div>
            )}
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-800 truncate">{user.fullName}</p>
                <p className="text-[11px] text-slate-400 truncate">{user.roleName}</p>
              </div>
            )}
          </Link>
        </div>
      </aside>

      {/* Main Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 h-16 shrink-0 bg-white/95 backdrop-blur-xs border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden p-2 -ml-1 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Title */}
            <nav aria-label="Breadcrumb" className="flex items-center min-w-0 space-x-2">
              <span className="text-xs font-semibold text-slate-400 hidden sm:inline">Toàn Trung CRM</span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <strong className="text-slate-900 font-bold text-sm sm:text-base truncate">
                {currentBreadcrumb}
              </strong>
            </nav>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
            {/* Quick Search */}
            <div className="hidden md:flex items-center gap-2 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-400 w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Tìm kiếm dữ liệu...</span>
              <kbd className="ml-auto text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-400">
                ⌘K
              </kbd>
            </div>

            {/* Notification Bell */}
            <Link
              href="/notifications"
              aria-label="Thông báo"
              className="relative w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-700 grid place-items-center transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold grid place-items-center">
                  {unreadCount}
                </span>
              )}
            </Link>

            {/* User Profile Pill */}
            <Link
              href="/profile"
              title={`${user.fullName} (${user.email})`}
              className="flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border border-slate-200 bg-white hover:border-blue-300 transition-colors"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-[11px] grid place-items-center shrink-0">
                  {getInitials(user.fullName)}
                </span>
              )}
              <span className="hidden sm:inline text-xs font-semibold text-slate-700 max-w-[130px] truncate">
                {user.fullName}
              </span>
            </Link>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => void logout()}
              title="Đăng xuất"
              className="h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        {/* Page Container: Full-bleed for /design studio, spacious max-w container for other modules */}
        <main
          className={
            isFullBleed
              ? 'flex-1 w-full h-[calc(100vh-64px)] overflow-hidden flex flex-col p-0 bg-slate-50'
              : 'flex-1 w-full max-w-[1520px] mx-auto px-4 sm:px-7 py-6 sm:py-8 overflow-y-auto'
          }
        >
          {children}
        </main>
      </div>
    </div>
  );
}
