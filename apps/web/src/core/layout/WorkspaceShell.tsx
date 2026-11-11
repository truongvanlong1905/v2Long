'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  FileSpreadsheet,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Settings,
  Sparkles,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import {
  hasBaPermission,
  type BaPermissionKey,
  type NotificationDto,
} from '@toantrung/contracts';
import { apiRequest } from '../http/client';
import { useSession } from '../session/SessionContext';

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  adminOnly?: boolean;
  requiredPermission?: BaPermissionKey;
  accentColor?: string;
  activeBg?: string;
}

const ROUTE_REQUIRED_PERMISSION: Record<string, BaPermissionKey> = {
  '/dashboard': 'DASHBOARD_VIEW',
  '/leads': 'LEAD_VIEW_OWN',
  '/tracking': 'TRACKING_ADS_OPTIMIZE',
  '/ads': 'AI_MARKETING_SEO',
  '/reports': 'DASHBOARD_VIEW',
  '/design': 'AI_DESIGN',
  '/admin/users': 'SYSTEM_USER_ADMIN',
  '/settings': 'SYSTEM_USER_ADMIN',
};

const BREADCRUMB_LABELS: Record<string, string> = {
  '/dashboard': 'Tổng quan',
  '/leads': 'Leads',
  '/tracking': 'Chiến dịch',
  '/ads': 'Từ khóa SEO',
  '/reports': 'Báo cáo',
  '/design': 'Thiết kế 3D',
  '/notifications': 'Thông báo',
  '/profile': 'Tài khoản',
  '/admin/users': 'Nhân sự',
  '/settings': 'Cài đặt',
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'TT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const { user, loading, branding, unreadCount, setUnreadCountState, logout } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    pathname === '/design' || pathname === '/ai-design',
  );
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [globalSearchText, setGlobalSearchText] = useState('');
  const [activeSearchScope, setActiveSearchScope] = useState<string>(
    BREADCRUMB_LABELS[pathname] || 'Leads',
  );
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setActiveSearchScope(BREADCRUMB_LABELS[pathname] || 'Toàn hệ thống');
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('search');
    if (q !== null) {
      setGlobalSearchText(q);
    } else {
      setGlobalSearchText('');
      window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
      window.dispatchEvent(new CustomEvent('tt-lead-search', { detail: '' }));
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleScopeChange = (e: Event) => {
      const custom = e as CustomEvent<{ label?: string } | string>;
      const label =
        typeof custom.detail === 'string'
          ? custom.detail
          : custom.detail?.label || '';
      if (label.trim()) {
        setActiveSearchScope(label.trim());
      }
    };
    window.addEventListener('tt-search-scope-change', handleScopeChange as EventListener);
    return () =>
      window.removeEventListener('tt-search-scope-change', handleScopeChange as EventListener);
  }, []);

  // Guard against browser password manager autofilling user email (e.g. admin@toantrung.vn) into search bar
  useEffect(() => {
    if (
      user?.email &&
      globalSearchText.trim().toLowerCase() === user.email.trim().toLowerCase() &&
      document.activeElement !== globalSearchInputRef.current
    ) {
      setGlobalSearchText('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
        window.dispatchEvent(new CustomEvent('tt-lead-search', { detail: '' }));
      }
    }
  }, [user?.email, globalSearchText]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isInputFocused && e.key === '/') {
        e.preventDefault();
        globalSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Bell Notification Popover state (Step 1 & Step 4.1)
  const [bellOpen, setBellOpen] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<NotificationDto[]>([]);
  const [loadingBell, setLoadingBell] = useState(false);
  const bellRef = useRef<HTMLDivElement | null>(null);

  // Smart Auto-Collapse Sidebar: auto-collapse on /design, auto-expand on standard routes
  useEffect(() => {
    setSidebarCollapsed(pathname === '/design' || pathname === '/ai-design');
  }, [pathname]);

  const fetchBellNotifications = useCallback(async () => {
    setLoadingBell(true);
    try {
      const res = await apiRequest<{ items: NotificationDto[]; unreadCount: number }>(
        '/api/v1/notifications',
      );
      setRecentNotifications((res.items || []).slice(0, 5));
      setUnreadCountState(res.unreadCount ?? 0);
    } catch {
      // ignore
    } finally {
      setLoadingBell(false);
    }
  }, [setUnreadCountState]);

  useEffect(() => {
    if (bellOpen) {
      void fetchBellNotifications();
    }
  }, [bellOpen, fetchBellNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    if (bellOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [bellOpen]);

  const handleMarkAllReadQuick = async () => {
    if (!user || unreadCount === 0) return;
    try {
      const res = await apiRequest<{ items: NotificationDto[]; unreadCount: number }>(
        '/api/v1/notifications',
        {
          method: 'PATCH',
          csrfToken: user.csrfToken,
          body: { markAll: true },
        },
      );
      setRecentNotifications((res.items || []).slice(0, 5));
      setUnreadCountState(res.unreadCount ?? 0);
    } catch {
      // ignore
    }
  };

  const isFullBleed = pathname === '/design';

  const requiredPermForCurrentRoute = ROUTE_REQUIRED_PERMISSION[pathname];
  const isRouteUnauthorized = Boolean(
    user &&
      requiredPermForCurrentRoute &&
      !hasBaPermission(user.roleCode, requiredPermForCurrentRoute),
  );

  useEffect(() => {
    if (!loading && isRouteUnauthorized) {
      router.replace('/dashboard');
    }
  }, [loading, isRouteUnauthorized, router]);

  const workNav: NavItem[] = [
    {
      href: '/dashboard',
      label: 'Tổng quan',
      shortLabel: 'Tổng quan',
      icon: LayoutGrid,
      requiredPermission: 'DASHBOARD_VIEW',
    },
    {
      href: '/leads',
      label: 'Leads',
      shortLabel: 'Leads',
      icon: FileSpreadsheet,
      requiredPermission: 'LEAD_VIEW_OWN',
    },
    {
      href: '/tracking',
      label: 'Chiến dịch',
      shortLabel: 'Chiến dịch',
      icon: Crosshair,
      requiredPermission: 'TRACKING_ADS_OPTIMIZE',
    },
    {
      href: '/ads',
      label: 'Từ khóa SEO',
      shortLabel: 'Từ khóa SEO',
      icon: Megaphone,
      requiredPermission: 'AI_MARKETING_SEO',
    },
    {
      href: '/reports',
      label: 'Báo cáo',
      shortLabel: 'Báo cáo',
      icon: BarChart3,
      requiredPermission: 'DASHBOARD_VIEW',
    },
    {
      href: '/design',
      label: 'Thiết kế 3D',
      shortLabel: 'Thiết kế 3D',
      icon: Sparkles,
      requiredPermission: 'AI_DESIGN',
    },
  ];

  const personalNav: NavItem[] = [
    {
      href: '/notifications',
      label: 'Thông báo',
      shortLabel: 'Thông báo',
      icon: Bell,
      badge: unreadCount,
    },
    { href: '/profile', label: 'Tài khoản', shortLabel: 'Tài khoản', icon: UserCircle2 },
  ];

  const systemNav: NavItem[] = [
    {
      href: '/admin/users',
      label: 'Nhân sự',
      shortLabel: 'Nhân sự',
      icon: Users,
      adminOnly: true,
      requiredPermission: 'SYSTEM_USER_ADMIN',
    },
    {
      href: '/settings',
      label: 'Cài đặt',
      shortLabel: 'Cài đặt',
      icon: Settings,
      adminOnly: true,
      requiredPermission: 'SYSTEM_USER_ADMIN',
    },
  ];

  const currentBreadcrumb = BREADCRUMB_LABELS[pathname] || 'Tổng quan';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl px-8 py-7 shadow-lg flex items-center gap-4">
          <div className="w-5 h-5 rounded-full border-2 border-[#1E3A8A] border-t-transparent animate-spin" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Đang khởi tạo Toàn Trung CRM...</p>
            <p className="text-xs text-slate-400 mt-0.5">Vui lòng đợi trong giây lát</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user || isRouteUnauthorized) {
    return null;
  }

  const visibleWorkNav = workNav.filter(
    (item) =>
      (!item.adminOnly || user.roleCode === 'ADMIN') &&
      (!item.requiredPermission || hasBaPermission(user.roleCode, item.requiredPermission)),
  );

  const visibleSystemNav = systemNav.filter(
    (item) =>
      (!item.adminOnly || user.roleCode === 'ADMIN') &&
      (!item.requiredPermission || hasBaPermission(user.roleCode, item.requiredPermission)),
  );

  const renderNavGroup = (items: NavItem[], withTopBorder = false) => {
    if (items.length === 0) return null;
    return (
      <div className={withTopBorder ? 'mt-3 pt-3 border-t border-white/[0.08]' : ''}>
        <div className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => setMobileOpen(false)}
                title={item.label}
                className={`group relative flex items-center gap-3.5 h-11 rounded-xl px-3.5 text-sm transition-all ${
                  sidebarCollapsed
                    ? 'lg:justify-center lg:px-0'
                    : 'lg:justify-start lg:px-3.5'
                } ${
                  active
                    ? 'bg-[#1B2B48] text-white font-bold shadow-xs'
                    : 'text-[#94A3B8] font-medium hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-colors ${
                    active ? 'text-white' : 'text-[#64748B] group-hover:text-slate-200'
                  }`}
                />
                <span
                  className={`truncate flex-1 text-[14px] ${
                    sidebarCollapsed ? 'lg:hidden' : 'lg:inline'
                  }`}
                >
                  {item.label}
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full bg-[#2563EB] text-white text-[11px] font-bold ${
                      sidebarCollapsed
                        ? 'lg:absolute lg:top-1 lg:right-1 lg:min-w-[16px] lg:h-4 lg:text-[9px] lg:px-1'
                        : 'lg:static'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
                {/* Hover Tooltip when Sidebar is Collapsed */}
                <span
                  className={`pointer-events-none fixed left-16 z-50 ml-2 hidden rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg opacity-0 transition-opacity group-hover:opacity-100 ${
                    sidebarCollapsed ? 'lg:block' : 'lg:hidden'
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-800 flex w-full overflow-hidden">
      {/* Tablet / Mobile Slide-over Drawer Scrim */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Đóng thanh điều hướng"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Main Left Sidebar — Dark Navy Theme matching reference screenshot */}
      <aside
        className={`group/sidebar fixed inset-y-0 left-0 z-50 lg:sticky lg:top-0 lg:h-screen bg-[#0B1426] text-white border-r border-slate-800/80 flex flex-col transition-all duration-200 shadow-xl ${
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-[248px]'
        } w-[264px] ${
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header with TOÀN TRUNG Logo & Top Collapse/Expand Button */}
        <div
          className={`relative h-16 flex items-center justify-between border-b border-white/[0.08] ${
            sidebarCollapsed ? 'px-2 lg:justify-center' : 'px-5'
          }`}
        >
          {sidebarCollapsed ? (
            <div className="relative w-9 h-9 flex items-center justify-center">
              {/* Default TT Logo when not hovered */}
              <Link
                href="/dashboard"
                className="w-9 h-9 rounded-xl bg-[#1E3A8A] flex items-center justify-center text-white font-black text-sm shadow-sm transition-opacity duration-150 group-hover/sidebar:opacity-0 group-hover/sidebar:pointer-events-none"
              >
                TT
              </Link>
              {/* Expand Button ONLY appears on hover when collapsed */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                title="Mở rộng menu"
                className="hidden lg:flex absolute inset-0 w-9 h-9 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white items-center justify-center shadow-md opacity-0 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:pointer-events-auto transition-all duration-150"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
                <div className="min-w-0 flex flex-col">
                  <span className="font-display font-black italic tracking-wider text-lg text-white leading-none block truncate">
                    TOÀN TRUNG
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="h-[1.5px] flex-1 bg-amber-500/80 rounded-full" />
                    <span className="text-[9px] font-extrabold tracking-widest text-[#38BDF8] uppercase">
                      SINCE 2006
                    </span>
                  </div>
                </div>
              </Link>

              {/* Collapse Button when expanded */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="Thu gọn menu"
                className="hidden lg:grid w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 place-items-center shrink-0 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng menu"
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {renderNavGroup(visibleWorkNav, false)}
          {renderNavGroup(personalNav, true)}
          {renderNavGroup(visibleSystemNav, true)}
        </nav>

        {/* Bottom User Account Summary */}
        <div className="p-3.5 border-t border-white/[0.08]">
          <Link
            href="/profile"
            title={`${user.fullName} (${user.email})`}
            className={`flex items-center gap-3 rounded-xl p-1.5 hover:bg-white/[0.05] transition-colors ${
              sidebarCollapsed ? 'lg:justify-center' : 'lg:justify-start'
            }`}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-9 h-9 rounded-full object-cover border border-white/20 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#3B66F5] text-white font-extrabold text-xs grid place-items-center shrink-0 shadow-sm">
                {getInitials(user.fullName)}
              </div>
            )}
            <div
              className={`min-w-0 flex-1 ${
                sidebarCollapsed ? 'lg:hidden' : 'lg:block'
              }`}
            >
              <p className="text-[13px] font-bold text-white truncate">{user.fullName}</p>
              <p className="text-[11px] text-[#94A3B8] truncate">{user.roleName}</p>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main Right Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 h-16 shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-5">
          <div className="flex items-center gap-2.5 shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden w-11 h-11 -ml-1 rounded-xl text-slate-600 hover:text-[#2563EB] hover:bg-slate-100 grid place-items-center"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Mobile TT Logo Badge */}
            <Link
              href="/dashboard"
              className="lg:hidden w-8 h-8 rounded-lg bg-[#1E3A8A] text-white font-black text-xs grid place-items-center shrink-0"
            >
              TT
            </Link>

            {/* Breadcrumb Title */}
            <nav aria-label="Breadcrumb" className="flex items-center min-w-0 space-x-2">
              <span className="text-xs font-semibold text-slate-400 hidden sm:inline">
                {branding.organizationName || 'Toàn Trung CRM'}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <strong className="text-slate-900 font-bold text-sm sm:text-base truncate">
                {currentBreadcrumb}
              </strong>
            </nav>
          </div>

          {/* Desktop Context-Aware Scoped Search Bar (Expanded & Prominent) */}
          <div className="hidden md:flex flex-1 max-w-xl lg:max-w-2xl items-center gap-2.5 h-10 sm:h-11 px-3.5 rounded-2xl bg-slate-50/90 hover:bg-slate-100/70 focus-within:bg-white border border-slate-200/90 focus-within:border-[#1553A2] focus-within:ring-4 focus-within:ring-blue-500/10 text-sm text-slate-800 shadow-2xs transition-all">
            <Search className="w-4 h-4 text-[#1553A2] shrink-0" />
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200/80 text-[#1553A2] text-[11px] font-bold shrink-0 max-w-[230px] truncate"
              title={`Phạm vi tìm kiếm hiện tại: ${activeSearchScope}`}
            >
              <span>📍 {activeSearchScope}</span>
            </span>
            <input
              ref={globalSearchInputRef}
              type="search"
              name="tt-crm-scoped-search"
              autoComplete="off"
              spellCheck={false}
              value={globalSearchText}
              onChange={(e) => {
                const val = e.target.value;
                setGlobalSearchText(val);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('tt-global-search', { detail: val }));
                  window.dispatchEvent(new CustomEvent('tt-lead-search', { detail: val }));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && globalSearchText) {
                  setGlobalSearchText('');
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
                    window.dispatchEvent(new CustomEvent('tt-lead-search', { detail: '' }));
                  }
                }
              }}
              placeholder={`Nhập từ khóa để lọc ngay trong mục "${activeSearchScope}"...`}
              className="flex-1 bg-transparent outline-none text-sm font-medium text-slate-900 placeholder:text-slate-400 placeholder:font-normal min-w-0"
            />
            {globalSearchText ? (
              <button
                type="button"
                onClick={() => {
                  setGlobalSearchText('');
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
                    window.dispatchEvent(new CustomEvent('tt-lead-search', { detail: '' }));
                  }
                }}
                className="w-6 h-6 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-600 hover:text-slate-900 text-xs font-bold grid place-items-center shrink-0 transition"
                title="Xóa từ khóa tìm kiếm"
              >
                ×
              </button>
            ) : (
              <kbd className="ml-auto text-[11px] font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-400 shrink-0 shadow-2xs">
                /
              </kbd>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Mobile Search Toggle */}
            <button
              type="button"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              aria-label="Tìm kiếm nhanh"
              className="md:hidden w-10 h-10 rounded-xl border border-slate-200 bg-white text-slate-600 grid place-items-center"
            >
              <Search className="w-4 h-4" />
            </button>

            {/* Notification Bell + Quick Popover (Step 4.1) */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((prev) => !prev)}
                aria-label="Thông báo"
                className="relative w-10 h-10 sm:w-9 sm:h-9 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-[#2563EB] grid place-items-center transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#2563EB] text-white text-[10px] font-bold grid place-items-center shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </button>

              {bellOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-extrabold text-slate-900">
                        Thông báo mới nhất
                      </span>
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-100 text-[#1E3A8A] text-[10px] font-bold">
                        {unreadCount} chưa đọc
                      </span>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleMarkAllReadQuick()}
                        className="text-[11px] font-bold text-[#2563EB] hover:underline inline-flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Đọc tất cả</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {loadingBell ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Đang tải thông báo...
                      </div>
                    ) : recentNotifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        Chưa có thông báo mới.
                      </div>
                    ) : (
                      recentNotifications.map((item) => {
                        const isWarn =
                          item.category.toLowerCase().includes('cảnh báo') ||
                          item.category.toLowerCase().includes('dò giá');
                        return (
                          <Link
                            key={item.id}
                            href={item.actionUrl || '/notifications'}
                            onClick={() => setBellOpen(false)}
                            className={`block px-4 py-3 hover:bg-slate-50 transition ${
                              !item.isRead ? 'bg-blue-50/40' : ''
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div
                                className={`mt-0.5 w-7 h-7 rounded-lg grid place-items-center shrink-0 ${
                                  isWarn
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-blue-100 text-[#1E3A8A]'
                                }`}
                              >
                                {isWarn ? (
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                ) : (
                                  <Bell className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold text-slate-900 truncate">
                                    {item.title}
                                  </p>
                                  {!item.isRead && (
                                    <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0" />
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                                  {item.summary}
                                </p>
                                <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-1">
                                  <Clock className="w-3 h-3" />
                                  {new Date(item.createdAt).toLocaleString('vi-VN')}
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center">
                    <Link
                      href="/notifications"
                      onClick={() => setBellOpen(false)}
                      className="w-full py-1.5 rounded-xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition"
                    >
                      <span>Xem tất cả thông báo</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Pill */}
            <Link
              href="/profile"
              title={`${user.fullName} (${user.email})`}
              className="hidden sm:flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border border-slate-200 bg-white hover:border-blue-300 transition-colors"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-blue-100 text-[#1E3A8A] font-bold text-[11px] grid place-items-center shrink-0">
                  {getInitials(user.fullName)}
                </span>
              )}
              <span className="hidden md:inline text-xs font-semibold text-slate-700 max-w-[130px] truncate">
                {user.fullName}
              </span>
            </Link>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => void logout()}
              title="Đăng xuất"
              className="h-9 px-2.5 sm:px-3 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-600 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        {/* Mobile Quick Search Bar Collapse */}
        {mobileSearchOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
            <Search className="w-4 h-4 text-[#1553A2] shrink-0" />
            <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-[#1553A2] text-[10px] font-bold shrink-0 max-w-[140px] truncate">
              📍 {activeSearchScope}
            </span>
            <input
              type="search"
              name="tt-crm-scoped-search-mobile"
              autoComplete="off"
              value={globalSearchText}
              onChange={(e) => {
                const val = e.target.value;
                setGlobalSearchText(val);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('tt-global-search', { detail: val }));
                  window.dispatchEvent(new CustomEvent('tt-lead-search', { detail: val }));
                }
              }}
              placeholder={`Tìm trong ${activeSearchScope}...`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setMobileSearchOpen(false);
                }
              }}
              className="flex-1 text-xs bg-transparent outline-none text-slate-800"
            />
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              className="text-xs text-slate-400 px-2 py-1"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Page Container */}
        <main
          className={
            isFullBleed
              ? 'flex-1 w-full h-[calc(100vh-64px)] overflow-hidden flex flex-col p-0 pb-16 md:pb-0 bg-slate-100/70'
              : 'flex-1 w-full max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-5 py-3 sm:py-3.5 pb-20 md:pb-5 overflow-y-auto bg-slate-100/60'
          }
        >
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (< 768px) with Glassmorphism & 44x44px touch targets */}
        <nav
          aria-label="Điều hướng di động"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 h-16 backdrop-blur-md bg-white/90 border-t border-slate-200/90 px-2 flex items-center justify-around shadow-lg"
        >
          {[
            { href: '/leads', label: 'Leads', icon: FileSpreadsheet },
            ...(hasBaPermission(user.roleCode, 'AI_DESIGN')
              ? [{ href: '/design', label: 'AI Studio', icon: Sparkles }]
              : []),
            { href: '/reports', label: 'Báo cáo', icon: BarChart3 },
            { href: '/notifications', label: 'Thông báo', icon: Bell, badge: unreadCount },
          ].map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative min-w-[60px] min-h-[44px] px-2 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
                  active ? 'text-[#2563EB]' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-0.5 right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#2563EB] text-white text-[9px] font-bold grid place-items-center">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="min-w-[60px] min-h-[44px] px-2 py-1 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold text-slate-500 hover:text-slate-900"
          >
            <Menu className="w-5 h-5" />
            <span>Thêm</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
