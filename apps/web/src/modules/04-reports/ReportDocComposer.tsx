'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Bell,
  Bold,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Heading1,
  Heading2,
  History,
  Italic,
  List,
  Lock,
  Printer,
  Send,
  ShieldCheck,
  Sparkles,
  Table,
  Underline,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { NotificationDto, ReportsDashboardDto, SessionUserDto } from '@toantrung/contracts';
import { apiRequest } from '../../core/http/client';
import { useSession } from '../../core/session/SessionContext';

interface DispatchedReportItem {
  id: number;
  reportCode: string;
  status?: 'DRAFT' | 'ISSUED';
  title: string;
  summary: string;
  contentHtml: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
}

interface ReportDocComposerProps {
  user: SessionUserDto | null;
  data: ReportsDashboardDto & { dispatchedReports?: DispatchedReportItem[] };
}

const DEPARTMENTS = [
  { id: 'KINH_DOANH', label: 'Phòng Kinh Doanh (Sales)' },
  { id: 'MARKETING_SEO', label: 'Phòng Marketing & Nội dung SEO' },
  { id: 'ADS', label: 'Bộ phận Quảng Cáo (Google Ads / Fanpage)' },
  { id: 'KY_THUAT_THIET_KE', label: 'Bộ phận Kỹ Thuật & Thiết kế 3D' },
] as const;

function getRoleDefaultDepartment(roleCode?: string): string {
  if (!roleCode) return 'KINH_DOANH';
  if (roleCode.includes('SALES')) return 'KINH_DOANH';
  if (roleCode.includes('MKT')) return 'MARKETING_SEO';
  if (roleCode === 'ADS') return 'ADS';
  if (roleCode === 'DESIGNER') return 'KY_THUAT_THIET_KE';
  return 'KINH_DOANH';
}

export function ReportDocComposer({ user, data }: ReportDocComposerProps) {
  const { unreadCount, setUnreadCountState } = useSession();
  const isDirectorOrAdmin = user?.roleCode === 'BOD' || user?.roleCode === 'ADMIN';
  const lockedDeptId = getRoleDefaultDepartment(user?.roleCode);

  const [dispatchScope, setDispatchScope] = useState<'BROADCAST_ALL' | 'CUSTOM_DEPARTMENTS'>(
    isDirectorOrAdmin ? 'BROADCAST_ALL' : 'CUSTOM_DEPARTMENTS',
  );
  const [selectedDepts, setSelectedDepts] = useState<string[]>(
    isDirectorOrAdmin ? ['KINH_DOANH', 'MARKETING_SEO'] : [lockedDeptId],
  );
  const [docTitle, setDocTitle] = useState(
    `BÁO CÁO ĐIỀU HÀNH HIỆU SUẤT KINH DOANH & MARKETING TOÀN TRUNG`,
  );
  const [fontScale, setFontScale] = useState<number>(100);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dispatchToast, setDispatchToast] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);

  const initialHtml = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('vi-VN');
    const f = data.overview;
    return `
      <h2>1. Tóm tắt Chỉ số Trọng yếu</h2>
      <p>Báo cáo tổng hợp số liệu thực tế từ hệ thống CRM &amp; Đồng bộ Đa nền tảng Toàn Trung tính đến ngày <strong>${todayStr}</strong> (${data.scopeDescription}):</p>
      <ul>
        <li><strong>Tổng số Lead thu thập (L1):</strong> ${f.totalLeadsL1} hồ sơ</li>
        <li><strong>Lead hợp lệ đã loại trừ Spam (L2):</strong> ${f.validLeadsL2} hồ sơ</li>
        <li><strong>Lead hiệu quả tính CPL (L3):</strong> ${f.effectiveLeadsL3} hồ sơ</li>
        <li><strong>Số dự án chốt thành công (Won):</strong> ${f.wonCount} dự án (Tỷ lệ chốt: ${f.winRateText})</li>
        <li><strong>Hồ sơ báo giá quá hạn &gt; 7 ngày:</strong> ${f.overdue7DaysQuoteCount} hồ sơ</li>
      </ul>
      <h2>2. Đánh giá Phễu Chuyển đổi &amp; Hiệu quả Kênh</h2>
      <p>Hệ thống đang theo dõi <strong>${f.newLeadCount}</strong> Lead mới, <strong>${f.quotingCount}</strong> hồ sơ đang làm báo giá và <strong>${f.quoteSentCount}</strong> hồ sơ đã gửi báo giá cho khách hàng.</p>
      <h2>3. Kiến nghị &amp; Chỉ đạo Triển khai</h2>
      <p>- Đội ngũ Kinh doanh ưu tiên rà soát và liên hệ lại các hồ sơ đã gửi báo giá quá 7 ngày chưa phản hồi.</p>
      <p>- Bộ phận Quảng cáo &amp; SEO tiếp tục tối ưu từ khóa màn hình LED hội trường P2.5/P3 Indoor và bảng điện tử công nghiệp.</p>
    `.trim();
  }, [data]);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const [docHtml, setDocHtml] = useState<string>(initialHtml);
  const [archivedReports, setArchivedReports] = useState<DispatchedReportItem[]>(
    data.dispatchedReports || [],
  );
  const [activeArchivedId, setActiveArchivedId] = useState<number | null>(null);

  useEffect(() => {
    if (data.dispatchedReports) {
      setArchivedReports(data.dispatchedReports);
      const latestDraft = data.dispatchedReports.find((r) => r.status === 'DRAFT');
      if (latestDraft && !activeArchivedId) {
        setActiveDraftId(latestDraft.id);
        setDocTitle(latestDraft.title);
        setDocHtml(latestDraft.contentHtml);
        if (editorRef.current) {
          editorRef.current.innerHTML = latestDraft.contentHtml;
        }
      }
    }
  }, [data.dispatchedReports, activeArchivedId]);

  useEffect(() => {
    if (typeof window === 'undefined' || archivedReports.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const viewId = Number(params.get('viewReportId'));
    if (Number.isInteger(viewId) && viewId > 0) {
      const found = archivedReports.find((r) => r.id === viewId);
      if (found) {
        setActiveArchivedId(found.id);
        setDocTitle(found.title);
        setDocHtml(found.contentHtml);
        if (editorRef.current) {
          editorRef.current.innerHTML = found.contentHtml;
        }
      }
    }
  }, [archivedReports]);

  const handleLoadArchivedReport = (item: DispatchedReportItem) => {
    setActiveArchivedId(item.id);
    setDocTitle(item.title);
    setDocHtml(item.contentHtml);
    if (editorRef.current) {
      editorRef.current.innerHTML = item.contentHtml;
    }
  };

  const handleSaveDraft = async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    setDispatchError(null);
    try {
      const currentContent = editorRef.current ? editorRef.current.innerHTML : docHtml;
      const targetDeptList =
        isDirectorOrAdmin && dispatchScope === 'BROADCAST_ALL'
          ? ['ALL']
          : isDirectorOrAdmin
            ? selectedDepts
            : [lockedDeptId];

      const res = await apiRequest<{
        id: number;
        reportCode: string;
        status: 'DRAFT';
        updatedAt: string;
      }>('/api/v1/reports', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'save_draft',
          draftId: activeDraftId,
          title: docTitle,
          summary: `Bản nháp lưu lúc ${new Date().toLocaleTimeString('vi-VN')}`,
          contentHtml: currentContent,
          targetDepartments: targetDeptList,
          reportingPeriod: `${data.fromDate} → ${data.toDate}`,
        },
      });
      setActiveDraftId(res.id);
      const draftEntry: DispatchedReportItem = {
        id: res.id,
        reportCode: res.reportCode,
        status: 'DRAFT',
        title: docTitle,
        summary: 'Bản nháp đang soạn thảo (Đã lưu an toàn trên máy chủ)',
        contentHtml: currentContent,
        authorName: user?.fullName || 'Điều hành',
        authorRole: user?.roleName || '',
        createdAt: res.updatedAt,
      };
      setArchivedReports((prev) => [
        draftEntry,
        ...prev.filter((r) => r.id !== res.id),
      ]);
      setDispatchToast(`Đã lưu bản nháp "${docTitle}" (${res.reportCode}) vào cơ sở dữ liệu.`);
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Không thể lưu bản nháp báo cáo.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleExportWordDoc = async () => {
    const currentContent = editorRef.current ? editorRef.current.innerHTML : docHtml;
    const dateStamp = new Date().toISOString().slice(0, 10);
    try {
      const res = await fetch('/api/v1/reports/docx', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
        },
        body: JSON.stringify({
          title: docTitle,
          reportingPeriod: `${data.fromDate} → ${data.toDate}`,
          contentHtml: currentContent,
        }),
      });
      if (!res.ok) {
        throw new Error('Không thể tạo tệp Word (.docx).');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `04_BaoCao_DieuHanh_ToanTrung_${dateStamp}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : 'Không thể kết xuất tệp Word (.docx).'
      );
    }
  };

  const applyCommand = (command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    setDocHtml(editorRef.current.innerHTML);
  };

  const insertKpiTableBlock = () => {
    const f = data.overview;
    const tableHtml = `
      <table style="width:100%; border-collapse:collapse; margin: 14px 0; font-size: 13px;">
        <thead>
          <tr style="background:#1E3A8A; color:#ffffff;">
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Chỉ tiêu báo cáo</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:right;">Giá trị thực tế</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Ghi chú BA</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px;">Tổng Lead thô (L1)</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${f.totalLeadsL1}</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Toàn bộ Lead phát sinh</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="border:1px solid #cbd5e1; padding:8px;">Lead hợp lệ (L2)</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${f.validLeadsL2}</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Đã trừ Spam xác nhận</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px;">Lead hiệu quả (L3)</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${f.effectiveLeadsL3}</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Dùng tính CPL thực tế</td>
          </tr>
        </tbody>
      </table>
    `;
    if (editorRef.current) {
      editorRef.current.innerHTML += tableHtml;
      setDocHtml(editorRef.current.innerHTML);
    }
  };

  const insertSignatureBlock = () => {
    const sigHtml = `
      <div style="margin-top:28px; display:flex; justify-content:space-between; font-size:12px;">
        <div>
          <strong>NGƯỜI LẬP BÁO CÁO</strong>
          <p style="margin-top:36px;">${user?.fullName || 'Nhân sự Toàn Trung'} (${user?.roleName || ''})</p>
        </div>
        <div style="text-align:right;">
          <strong>PHÊ DUYỆT ĐIỀU HÀNH</strong>
          <p style="margin-top:36px;">Ban Giám Đốc Công ty Toàn Trung</p>
        </div>
      </div>
    `;
    if (editorRef.current) {
      editorRef.current.innerHTML += sigHtml;
      setDocHtml(editorRef.current.innerHTML);
    }
  };

  const handleToggleDepartment = (deptId: string) => {
    if (!isDirectorOrAdmin) return;
    setSelectedDepts((prev) =>
      prev.includes(deptId) ? prev.filter((d) => d !== deptId) : [...prev, deptId],
    );
  };

  const handleDispatchReport = async () => {
    if (dispatching) return;
    setDispatching(true);
    setDispatchError(null);
    const targetNames =
      isDirectorOrAdmin && dispatchScope === 'BROADCAST_ALL'
        ? 'Toàn hệ thống'
        : DEPARTMENTS.filter((d) =>
            (isDirectorOrAdmin ? selectedDepts : [lockedDeptId]).includes(d.id),
          )
            .map((d) => d.label)
            .join(', ') || 'Phòng ban';

    const toastMessage = `Báo cáo mới đã được gửi thành công đến [${targetNames}]`;

    try {
      const currentHtml = editorRef.current ? editorRef.current.innerHTML : docHtml;
      const targetDeptList =
        isDirectorOrAdmin && dispatchScope === 'BROADCAST_ALL'
          ? ['ALL']
          : isDirectorOrAdmin
            ? selectedDepts
            : [lockedDeptId];

      const res = await apiRequest<{
        items: NotificationDto[];
        unreadCount: number;
        savedReportId?: number | null;
      }>('/api/v1/notifications', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          title: `Báo cáo mới: ${docTitle}`,
          summary: `${toastMessage} · Người phát hành: ${user?.fullName || 'Điều hành'}.`,
          category: 'Báo cáo & Điều hành',
          actionLabel: 'Mở đọc toàn văn báo cáo',
          actionUrl: '/reports',
          contentHtml: currentHtml,
          targetDepartments: targetDeptList,
        },
      });
      if (typeof res.unreadCount === 'number') {
        setUnreadCountState(res.unreadCount);
      } else {
        setUnreadCountState(unreadCount + 1);
      }
      const newEntry: DispatchedReportItem = {
        id: res.savedReportId || Date.now(),
        reportCode: `TT-RPT-${res.savedReportId || Date.now()}`,
        title: docTitle,
        summary: toastMessage,
        contentHtml: currentHtml,
        authorName: user?.fullName || 'Điều hành',
        authorRole: user?.roleName || '',
        createdAt: new Date().toISOString(),
      };
      setArchivedReports((prev) => [newEntry, ...prev]);
      setDispatchToast(toastMessage);
      setPreviewOpen(false);
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : 'Không thể phát hành báo cáo. Vui lòng thử lại.',
      );
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="space-y-5 text-sm">
      {dispatchError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-center justify-between">
          <span>{dispatchError}</span>
          <button
            type="button"
            onClick={() => setDispatchError(null)}
            className="font-bold hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {dispatchToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-2xl bg-slate-900 text-white border border-slate-700 shadow-2xl flex items-start justify-between gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 grid place-items-center shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{dispatchToast}</p>
              <p className="text-xs text-slate-300 mt-0.5">
                Đã cập nhật chuông thông báo và ghi nhận vào Trung tâm Thông báo.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <Link
                  href="/notifications"
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                >
                  <span>Mở Trung tâm Thông báo</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDispatchToast(null)}
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Granular RBAC Distribution Engine Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1E3A8A] grid place-items-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-slate-900">
                Cơ chế Phân phối Báo cáo theo Phân quyền
              </h2>
              <p className="text-xs text-slate-500">
                Vai trò hiện tại: <strong>{user?.roleName}</strong> ({user?.roleCode})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={savingDraft}
              onClick={() => void handleSaveDraft()}
              className="h-9 px-3.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-800 inline-flex items-center gap-1.5 transition"
              title="Lưu bản nháp báo cáo lên máy chủ để không mất dữ liệu khi tải lại trang"
            >
              <FileText className="w-4 h-4 text-[#1E3A8A]" />
              <span>{savingDraft ? 'Đang lưu nháp...' : 'Lưu bản nháp'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleExportWordDoc()}
              className="h-9 px-3.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-600 text-sm font-bold text-emerald-800 hover:text-white inline-flex items-center gap-1.5 transition"
              title="Tải xuống toàn văn báo cáo định dạng Microsoft Word chuẩn OpenXML (.docx)"
            >
              <Download className="w-4 h-4" />
              <span>Xuất Word (.docx)</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="h-9 px-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold text-slate-700 inline-flex items-center gap-1.5"
            >
              <Eye className="w-4 h-4 text-[#2563EB]" />
              <span>Xem trước bản in A4</span>
            </button>
            <button
              type="button"
              disabled={dispatching}
              onClick={handleDispatchReport}
              className="h-9 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white text-sm font-bold inline-flex items-center gap-1.5 shadow-sm transition"
            >
              <Send className="w-4 h-4" />
              <span>{dispatching ? 'Đang gửi...' : 'Phát hành & Gửi thông báo'}</span>
            </button>
          </div>
        </div>

        {isDirectorOrAdmin ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-6 font-bold text-slate-800">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dispatchScope === 'BROADCAST_ALL'}
                  onChange={() => setDispatchScope('BROADCAST_ALL')}
                />
                <span>Toàn hệ thống (Broadcast tất cả phòng ban)</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dispatchScope === 'CUSTOM_DEPARTMENTS'}
                  onChange={() => setDispatchScope('CUSTOM_DEPARTMENTS')}
                />
                <span>Chọn danh sách phòng ban nhận báo cáo</span>
              </label>
            </div>

            {dispatchScope === 'CUSTOM_DEPARTMENTS' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2">
                {DEPARTMENTS.map((dept) => {
                  const checked = selectedDepts.includes(dept.id);
                  return (
                    <label
                      key={dept.id}
                      onClick={() => handleToggleDepartment(dept.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer flex items-center gap-2 font-semibold transition ${
                        checked
                          ? 'bg-blue-50 border-[#2563EB] text-[#1E3A8A]'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input type="checkbox" checked={checked} readOnly />
                      <span>{dept.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Kho Lưu Trữ Văn Bản Báo Cáo Điều Hành Đã Phát Hành */}
      {archivedReports.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-card space-y-2.5 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <History className="w-4 h-4 text-[#1E3A8A]" />
              <span>Kho lưu trữ Văn bản Báo cáo Điều hành đã phát hành ({archivedReports.length})</span>
            </div>
            <span className="text-xs text-slate-500">
              Bấm vào bất kỳ báo cáo nào để nạp lại toàn văn nội dung lên trang A4 bên dưới
            </span>
          </div>
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {archivedReports.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleLoadArchivedReport(item)}
                className={`shrink-0 text-left p-3 rounded-xl border transition max-w-xs ${
                  activeArchivedId === item.id
                    ? 'bg-blue-50 border-[#2563EB] text-[#1E3A8A]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-[#2563EB]">
                    {item.reportCode}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </span>
                </div>
                <p className="font-bold text-sm text-slate-900 truncate mt-1">{item.title}</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  Người lập: {item.authorName}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating Format Toolbar */}
      <div className="sticky top-16 z-20 max-w-4xl mx-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-2xl px-3 py-2 shadow-md flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => applyCommand('formatBlock', 'H2')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 font-bold inline-flex items-center gap-1"
            title="Tiêu đề mục lớn (H2)"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('formatBlock', 'H3')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700 font-bold inline-flex items-center gap-1"
            title="Tiêu đề mục con (H3)"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <span className="h-4 w-px bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={() => applyCommand('bold')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
            title="In đậm"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('italic')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
            title="In nghiêng"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('underline')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
            title="Gạch chân"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('insertUnorderedList')}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
            title="Danh sách gạch đầu dòng"
          >
            <List className="w-4 h-4" />
          </button>
          <span className="h-4 w-px bg-slate-200 mx-1" />
          <button
            type="button"
            onClick={insertKpiTableBlock}
            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E3A8A] font-bold inline-flex items-center gap-1"
          >
            <Table className="w-3.5 h-3.5" />
            <span>Chèn Bảng KPI</span>
          </button>
          <button
            type="button"
            onClick={insertSignatureBlock}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold inline-flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Chèn Chữ ký</span>
          </button>
        </div>

        {/* Mobile/Desktop Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFontScale((s) => Math.max(85, s - 10))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="Thu nhỏ cỡ chữ"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] font-bold text-slate-600 w-11 text-center">
            {fontScale}%
          </span>
          <button
            type="button"
            onClick={() => setFontScale((s) => Math.min(135, s + 10))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="Phóng to cỡ chữ"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-1 p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="In A4"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center-Aligned A4 Paper Sheet (Google Docs / MS Word Canvas) */}
      <div className="bg-slate-200/70 py-6 px-2 sm:px-6 rounded-2xl overflow-x-auto">
        <div
          style={{ fontSize: `${fontScale}%` }}
          className="max-w-4xl mx-auto bg-white shadow-xl min-h-[842px] p-6 sm:p-10 md:p-14 border border-slate-200 rounded-sm text-slate-800"
        >
          {/* Official Corporate Letterhead */}
          <div className="pb-5 mb-6 border-b-2 border-[#1E3A8A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1E3A8A] text-white font-black text-sm grid place-items-center">
                TT
              </div>
              <div>
                <p className="font-bold text-xs uppercase tracking-wider text-[#1E3A8A]">
                  CÔNG TY CỔ PHẦN ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG
                </p>
                <p className="text-[11px] text-slate-500">
                  Hệ thống Báo cáo Nội bộ · Mã tài liệu: TT-RPT-{new Date().toISOString().slice(0, 10)}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right text-[11px] text-slate-500">
              <p>TP. Hồ Chí Minh, ngày {new Date().toLocaleDateString('vi-VN')}</p>
              <p className="font-semibold text-slate-700">Người lập: {user?.fullName}</p>
            </div>
          </div>

          {/* Editable Document Title */}
          <input
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            className="w-full font-display font-extrabold text-lg sm:text-xl text-center text-[#1E3A8A] mb-6 pb-2 border-b border-dashed border-slate-200 focus:border-[#2563EB] outline-none"
          />

          {/* Editable Rich Text Body */}
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setDocHtml((e.currentTarget as HTMLDivElement).innerHTML)}
            dangerouslySetInnerHTML={{ __html: initialHtml }}
            className="prose prose-slate max-w-none min-h-[540px] focus:outline-none leading-relaxed text-sm space-y-3"
          />
        </div>
      </div>

      {/* Live Preview Modal before Dispatching */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <FileText className="w-4 h-4 text-[#2563EB]" />
                <span>Xem trước Bản phát hành Báo cáo A4</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-100">
              <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-lg border border-slate-200">
                <h1 className="font-display font-extrabold text-lg text-center text-[#1E3A8A] mb-6">
                  {docTitle}
                </h1>
                <div
                  className="prose prose-slate max-w-none text-sm leading-relaxed space-y-3"
                  dangerouslySetInnerHTML={{ __html: docHtml }}
                />
              </div>
            </div>

            <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="h-9 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Quay lại chỉnh sửa
              </button>
              <button
                type="button"
                onClick={handleDispatchReport}
                className="h-9 px-5 rounded-xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Xác nhận &amp; Gửi Báo cáo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
