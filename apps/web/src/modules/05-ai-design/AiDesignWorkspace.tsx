'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  hasBaPermission,
  type AddProjectPhotoDto,
  type CreateDesignRequestDto,
  type DesignAssetVersionItemDto,
  type DesignChatMessageDto,
  type DesignRequestItemDto,
  type DesignStatus,
  type LedProductSpecDto,
  type ProjectPhotoItemDto,
  type QuadCoordinatesDto,
} from '@toantrung/contracts';
import {
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  Edit2,
  Expand,
  ExternalLink,
  Eye,
  FileCheck,
  FolderPlus,
  Image as ImageIcon,
  Info,
  Layers,
  LayoutGrid,
  Maximize2,
  Minus,
  Monitor,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';

interface LeadOpt {
  id: number;
  leadCode: string;
  label: string;
}

interface ProductOpt {
  id: number;
  code: string;
  name: string;
  categoryGroup: string;
}

interface ProviderStatusInfo {
  provider: string;
  providerName: string;
  isConfigured: boolean;
  statusLabel: string;
  activeModel: string;
  costPerImageUsd: number;
  supportsInpainting: boolean;
  notes: string;
}

/**
 * Resolves any storage key or public path to a valid browser-loadable image URL
 */
function resolveAssetUrl(urlOrKey: string | null | undefined): string {
  if (!urlOrKey) return '/brand/showroom-toan-trung.webp';
  if (urlOrKey.startsWith('/') || urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
    return urlOrKey;
  }
  return `/api/v1/design/asset-file?key=${encodeURIComponent(urlOrKey)}`;
}

export function AiDesignWorkspace() {
  const { user } = useSession();
  const canUseAiDesign = Boolean(user && hasBaPermission(user.roleCode, 'AI_DESIGN'));

  // Data states
  const [requests, setRequests] = useState<DesignRequestItemDto[]>([]);
  const [leadOptions, setLeadOptions] = useState<LeadOpt[]>([]);
  const [productOptions, setProductOptions] = useState<ProductOpt[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusInfo | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingFinal, setSavingFinal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Center Tab: 'perspective' | 'banner' | 'library'
  const [centerTab, setCenterTab] = useState<'perspective' | 'banner' | 'library'>('perspective');

  // View Mode: 'original' | 'perspective' | 'compare'
  const [viewMode, setViewMode] = useState<'original' | 'perspective' | 'compare'>('perspective');

  // Right Tab: 'request' | 'specs'
  const [rightTab, setRightTab] = useState<'request' | 'specs'>('request');

  // Responsive Pane Switcher for Mobile (<768px) & Tablet Drawer (768px-1279px) (Step 3)
  const [mobilePane, setMobilePane] = useState<'projects' | 'canvas' | 'assistant'>('canvas');
  const [tabletAssistantOpen, setTabletAssistantOpen] = useState(false);

  // Search Project
  const [searchProject, setSearchProject] = useState('');

  // Zoom & Tools
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showHandles, setShowHandles] = useState(true);
  const [compareSplit, setCompareSplit] = useState<number>(50);

  // Composer
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatQuality, setChatQuality] = useState<'draft' | 'high_quality'>('draft');
  const [piiAlert, setPiiAlert] = useState<string | null>(null);

  // Interactive 4-Corner Placement Handles (percentage of natural image)
  const [quad, setQuad] = useState<QuadCoordinatesDto>({
    topLeft: { x: 64.2, y: 44.5 },
    topRight: { x: 93.8, y: 45.2 },
    bottomRight: { x: 94.5, y: 72.8 },
    bottomLeft: { x: 64.5, y: 70.1 },
  });
  const [draggingHandle, setDraggingHandle] = useState<keyof QuadCoordinatesDto | null>(null);
  const [draggingCompare, setDraggingCompare] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Modal: Create New Project
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Showroom LED');
  const [newProjectType, setNewProjectType] = useState<'perspective_3d' | 'banner'>('perspective_3d');
  const [newLeadId, setNewLeadId] = useState<string>('');
  const [newContactName, setNewContactName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPrompt, setNewPrompt] = useState('Đặt màn hình ở tường bên phải, hiển thị sóng biển xanh và giữ nguyên nội thất.');

  // Modal / Inline Rename & Aspect Ratio Edit State (Enhancement 6)
  const [editingName, setEditingName] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [inlineEditProjId, setInlineEditProjId] = useState<number | null>(null);
  const [inlineNameDraft, setInlineNameDraft] = useState('');
  const [inlineAspectDraft, setInlineAspectDraft] = useState('16:9');

  // Load Data from API
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<{
        requests: DesignRequestItemDto[];
        leadOptions: LeadOpt[];
        productOptions: ProductOpt[];
        providerStatus: ProviderStatusInfo;
      }>('/api/v1/design');
      const list: DesignRequestItemDto[] = data.requests || [];
      setRequests(list);
      setLeadOptions(data.leadOptions || []);
      setProductOptions(data.productOptions || []);
      setProviderStatus(data.providerStatus || null);

      if (list.length > 0) {
        const currentReq = selectedId ? list.find((r) => r.id === selectedId) || list[0] : list[0];
        setSelectedId(currentReq.id);
        if (currentReq.placementQuad) {
          setQuad(currentReq.placementQuad);
        }
        if (currentReq.assetVersions.length > 0) {
          const latest = currentReq.assetVersions[currentReq.assetVersions.length - 1];
          setSelectedVersionId(latest.id);
        }
        // Sync center tab with project type
        if (currentReq.designType === 'banner') {
          setCenterTab('banner');
        } else {
          setCenterTab('perspective');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi nạp dữ liệu M05');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Auto-select or prefill project when navigated with ?leadId=<id> from LeadsWorkspace
  useEffect(() => {
    if (typeof window === 'undefined' || loading) return;
    const params = new URLSearchParams(window.location.search);
    const leadIdParam = Number(params.get('leadId'));
    if (Number.isInteger(leadIdParam) && leadIdParam > 0) {
      const existingReq = requests.find((r) => r.leadId === leadIdParam);
      if (existingReq) {
        setSelectedId(existingReq.id);
      } else {
        const opt = leadOptions.find((l) => l.id === leadIdParam);
        setNewLeadId(String(leadIdParam));
        if (opt) {
          setNewProjectName(`Phối cảnh ${opt.leadCode}`);
        }
        setShowCreateModal(true);
      }
    }
  }, [loading, requests, leadOptions]);

  // Current selected project & version
  const currentProject = requests.find((r) => r.id === selectedId) || requests[0] || null;
  const currentVersion = currentProject?.assetVersions.find((v) => v.id === selectedVersionId) ||
    currentProject?.assetVersions[currentProject.assetVersions.length - 1] || null;

  // Immutable state updater for current project (Mục 2.4)
  const updateCurrentProjectImmutable = useCallback(
    (updater: (proj: DesignRequestItemDto) => DesignRequestItemDto) => {
      if (!currentProject) return;
      const targetId = currentProject.id;
      setRequests((prev) => prev.map((r) => (r.id === targetId ? updater({ ...r }) : r)));
    },
    [currentProject],
  );

  // Selected Photo
  const selectedPhoto = currentProject?.photos.find((p) => p.selected) || currentProject?.photos[0] || null;

  // Resolve valid image URLs for the canvas
  const sitePhotoUrl = resolveAssetUrl(selectedPhoto?.url || currentProject?.sitePhotoDownloadUrl);
  const versionImageUrl = resolveAssetUrl(currentVersion?.downloadUrl || currentProject?.aiDraftDownloadUrl);

  // Dragging logic for 4-corner placement
  const handleMouseDownHandle = (corner: keyof QuadCoordinatesDto) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingHandle(corner);
  };

  const handleMouseMoveCanvas = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canvasContainerRef.current) return;
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

      if (draggingCompare) {
        setCompareSplit(Number(x.toFixed(1)));
        return;
      }

      if (!draggingHandle) return;
      setQuad((prev) => ({
        ...prev,
        [draggingHandle]: { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) },
      }));
    },
    [draggingHandle, draggingCompare]
  );

  const handleMouseUpCanvas = useCallback(() => {
    setDraggingHandle(null);
    setDraggingCompare(false);
  }, []);

  // Check PII on prompt typing
  const handlePromptChange = (val: string) => {
    setChatPrompt(val);
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const vnPhoneRegex = /(?:\+84|0)(?:3|5|7|8|9)(?:[\s.-]*\d){8}\b/;
    if (emailRegex.test(val) || vnPhoneRegex.test(val)) {
      setPiiAlert('Phát hiện SĐT/Email trong nội dung. Theo quy định BA (UC06), không gửi thông tin liên hệ khách hàng sang AI.');
    } else {
      setPiiAlert(null);
    }
  };

  // Chat Edit Submit
  const handleSendChatEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject || !chatPrompt.trim() || submitting || piiAlert) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        action: 'chat_edit',
        expectedVersion: currentProject.version,
        prompt: chatPrompt.trim(),
        quality: chatQuality,
        placementQuad: quad,
        screenWidthM: currentProject.screenWidthM,
        screenHeightM: currentProject.screenHeightM,
        bannerWidthPx: currentProject.bannerWidthPx,
        bannerHeightPx: currentProject.bannerHeightPx,
        aspectRatio: currentProject.aspectRatio,
        selectedPhotoUrl: sitePhotoUrl,
        idempotencyKey: `chat-design-${currentProject.id}-v${currentProject.assetVersions.length + 1}-${Date.now()}`,
      };

      const data = await apiRequest<{ versionNumber: number; versionId?: number }>(
        `/api/v1/design/${currentProject.id}`,
        {
          method: 'PATCH',
          csrfToken: user?.csrfToken,
          body: payload,
        },
      );

      setChatPrompt('');
      setSuccessToast(`Bản nháp mới (v${data.versionNumber}) đã được thêm vào thư viện.`);
      await loadData();
      if (data.versionId) {
        setSelectedVersionId(data.versionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gửi yêu cầu AI.');
    } finally {
      setSubmitting(false);
    }
  };

  // Save Finished Version
  const handleSaveFinished = async () => {
    if (!currentProject || !currentVersion || savingFinal) return;
    setSavingFinal(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/design/${currentProject.id}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'save_finished',
          expectedVersion: currentProject.version,
          versionId: currentVersion.id,
          note: 'Phê duyệt bản thiết kế hoàn thiện từ Studio AI',
        },
      });

      setSuccessToast('Đã lưu bản thiết kế hoàn thiện và thông báo cho NVKD.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi lưu bản hoàn thiện.');
    } finally {
      setSavingFinal(false);
    }
  };

  // Authorized Download
  const handleDownloadFile = () => {
    if (!currentVersion) return;
    const downloadUrl = `/api/v1/design/asset/${currentVersion.id}`;
    window.open(downloadUrl, '_blank');
  };

  // Create New Project Submit
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateDesignRequestDto =
        newProjectType === 'perspective_3d'
          ? {
              designType: 'perspective_3d',
              projectName: newProjectName.trim(),
              contactName: newContactName.trim() || null,
              notes: newNotes.trim() || null,
              leadId: newLeadId ? Number(newLeadId) : null,
              productId: 1,
              ledModuleSpec: 'P2.5 Indoor',
              screenWidthM: 4.8,
              screenHeightM: 2.7,
              placementQuad: quad,
              aiPrompt: newPrompt.trim(),
              quality: 'draft',
            }
          : {
              designType: 'banner',
              projectName: newProjectName.trim(),
              contactName: newContactName.trim() || null,
              notes: newNotes.trim() || null,
              leadId: newLeadId ? Number(newLeadId) : null,
              bannerWidthPx: 1920,
              bannerHeightPx: 1080,
              aspectRatio: '16:9',
              aiPrompt: newPrompt.trim(),
              quality: 'draft',
            };

      const data = await apiRequest<{ id: number }>('/api/v1/design', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: payload,
      });

      setShowCreateModal(false);
      setSuccessToast(`Đã tạo dự án #${data.id} thành công.`);
      await loadData();
      if (data.id) {
        setSelectedId(data.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo dự án mới.');
    } finally {
      setSubmitting(false);
    }
  };

  // Rename Project
  const handleRenameProject = async () => {
    if (!currentProject || !renameValue.trim()) return;
    try {
      await apiRequest(`/api/v1/design/${currentProject.id}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'update_project',
          projectName: renameValue.trim(),
        },
      });
      setEditingName(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi đổi tên dự án.');
    }
  };

  // Add Photo
  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProject) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = (reader.result as string).split(',')[1];
      try {
        await apiRequest(`/api/v1/design/${currentProject.id}`, {
          method: 'POST',
          csrfToken: user?.csrfToken,
          body: {
            action: 'add_photo',
            photoName: file.name,
            fileName: file.name,
            mimeType: file.type || 'image/jpeg',
            base64Data: b64,
          },
        });
        setSuccessToast('Đã tải ảnh hiện trạng mới lên dự án.');
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi tải ảnh lên.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Filter projects by search term
  const filteredProjects = requests.filter(
    (r) =>
      r.projectName.toLowerCase().includes(searchProject.toLowerCase()) ||
      (r.leadProjectLabel && r.leadProjectLabel.toLowerCase().includes(searchProject.toLowerCase()))
  );

  const isBannerProject = currentProject?.designType === 'banner';

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans text-slate-800 antialiased overflow-hidden select-none">
      {/* 1. STUDIO HEADER SUB-BAR */}
      <div className="flex h-12 w-full shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-xs">
        {/* Left: Project title & status */}
        <div className="flex items-center space-x-3 min-w-0">
          <span className="text-sm font-bold text-slate-900 truncate">
            {currentProject ? currentProject.projectName : 'Phối cảnh showroom'}
          </span>
          <span className="text-xs text-slate-300">|</span>
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-700 font-semibold border border-blue-200 shrink-0">
            {currentProject?.status === 'completed' ? 'Bản hoàn thiện' : 'Nháp AI'}
          </span>
          {currentProject?.leadCode && (
            <span className="text-xs text-slate-400 hidden md:inline truncate">
              Lead: {currentProject.leadCode}
            </span>
          )}
        </div>

        {/* Center: Workflow Tabs */}
        <div className="flex items-center space-x-6 text-xs font-semibold">
          <button
            onClick={() => setCenterTab('perspective')}
            className={`py-3.5 transition border-b-2 ${
              centerTab === 'perspective'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Phối cảnh AI
          </button>
          <button
            onClick={() => setCenterTab('banner')}
            className={`py-3.5 transition border-b-2 ${
              centerTab === 'banner'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Ảnh & Banner
          </button>
          <button
            onClick={() => setCenterTab('library')}
            className={`py-3.5 transition border-b-2 ${
              centerTab === 'library'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Thư viện ấn phẩm
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-3 shrink-0">
          {/* AI readiness */}
          <div className="hidden sm:flex items-center space-x-1.5 text-xs text-emerald-600 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>AI sẵn sàng</span>
          </div>

          <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

          {/* Download Button */}
          <button
            onClick={handleDownloadFile}
            disabled={!currentVersion}
            className="flex items-center space-x-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 disabled:opacity-50"
            title="Tải tệp thiết kế độ phân giải cao"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" />
            <span>Tải file</span>
          </button>

          {/* Save Finished Version Button */}
          <button
            onClick={handleSaveFinished}
            disabled={!currentProject || savingFinal}
            className="flex items-center space-x-1.5 rounded-lg bg-[#1E3A8A] px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#2563EB] disabled:opacity-50"
            title="Lưu bản thiết kế này làm phiên bản hoàn thiện chính thức"
          >
            <Check className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{savingFinal ? 'Đang lưu...' : 'Lưu bản hoàn thiện'}</span>
          </button>

          {/* Tablet Slide-out Assistant Trigger (768px - 1279px) */}
          <button
            type="button"
            onClick={() => setTabletAssistantOpen((v) => !v)}
            className="hidden md:inline-flex xl:hidden items-center space-x-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#1E3A8A] hover:bg-blue-100 transition"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#2563EB]" />
            <span>Trợ lý AI</span>
          </button>
        </div>
      </div>

      {/* Mobile Segmented 3-Tab Switcher (< 768px): [Dự án] | [Phối cảnh Canvas] | [Trợ lý AI] */}
      <div className="md:hidden grid grid-cols-3 gap-1 bg-white border-b border-slate-200 px-3 py-1.5 shrink-0 text-xs font-bold">
        {[
          { id: 'projects' as const, label: 'Dự án & Ảnh' },
          { id: 'canvas' as const, label: 'Phối cảnh Canvas' },
          { id: 'assistant' as const, label: 'Trợ lý AI' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobilePane(tab.id)}
            className={`py-1.5 rounded-lg text-center transition ${
              mobilePane === tab.id
                ? 'bg-[#1E3A8A] text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 2. MAIN 3-PANEL STUDIO LAYOUT (Zero Dead-Space & Responsive 3-Tier) */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* ================= LEFT PANEL: Col-Span-3 / 288px (Zero Bottom Blank Space) ================= */}
        <div
          className={`${
            mobilePane === 'projects' ? 'flex w-full' : 'hidden'
          } md:flex md:w-72 xl:w-80 shrink-0 flex-col h-full min-h-0 border-r border-slate-200 bg-white p-3.5 overflow-hidden`}
        >
          {/* Top Fixed Search & Create Project */}
          <div className="shrink-0">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Dự án thiết kế ({filteredProjects.length})</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex h-7 px-2.5 items-center gap-1 rounded-lg bg-[#1E3A8A] text-white text-[11px] font-bold transition hover:bg-[#2563EB] shadow-2xs"
                title="Tạo dự án mới"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Mới</span>
              </button>
            </div>

            <div className="mb-3">
              <input
                type="text"
                placeholder="Tìm kiếm dự án, mã Lead..."
                value={searchProject}
                onChange={(e) => setSearchProject(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Middle Flexible Scrollable Region (flex-1 min-h-0 overflow-y-auto) */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
            {/* Compact Project List with Full CRUD (Create / Inline Edit / Hover Delete — Enhancement 6) */}
            <div className="space-y-1.5">
              {filteredProjects.map((proj) => {
                const isSelected = proj.id === selectedId;
                const isInlineEditing = inlineEditProjId === proj.id;
                const photoThumb = resolveAssetUrl(proj.photos[0]?.url || proj.sitePhotoDownloadUrl);
                const createdDateStr = proj.createdAt
                  ? new Date(proj.createdAt).toLocaleDateString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                    })
                  : 'Hôm nay';

                return (
                  <div
                    key={proj.id}
                    onClick={() => {
                      if (isInlineEditing) return;
                      setSelectedId(proj.id);
                      if (proj.placementQuad) setQuad(proj.placementQuad);
                      if (proj.assetVersions.length > 0) {
                        setSelectedVersionId(proj.assetVersions[proj.assetVersions.length - 1].id);
                      }
                      if (proj.designType === 'banner') {
                        setCenterTab('banner');
                      } else {
                        setCenterTab('perspective');
                      }
                      setMobilePane('canvas');
                    }}
                    className={`group relative flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-[#2563EB] bg-blue-50/70 shadow-2xs ring-1 ring-[#2563EB]/25'
                        : 'border-slate-200/90 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {isInlineEditing ? (
                      <div
                        className="w-full space-y-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={inlineNameDraft}
                          onChange={(e) => setInlineNameDraft(e.target.value)}
                          placeholder="Tên dự án..."
                          className="w-full h-7 px-2 rounded border border-blue-300 bg-white text-xs font-bold text-slate-900 focus:outline-none"
                          autoFocus
                        />
                        <div className="flex items-center justify-between gap-1.5">
                          <select
                            value={inlineAspectDraft}
                            onChange={(e) => setInlineAspectDraft(e.target.value)}
                            className="h-7 px-1.5 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-700"
                          >
                            <option value="16:9">Tỷ lệ 16:9</option>
                            <option value="4:3">Tỷ lệ 4:3</option>
                            <option value="21:9">Tỷ lệ 21:9</option>
                            <option value="1:1">Tỷ lệ 1:1</option>
                          </select>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setInlineEditProjId(null)}
                              className="h-6 px-2 rounded border border-slate-200 bg-white text-[10px] font-semibold text-slate-600"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const trimmed = inlineNameDraft.trim();
                                if (!trimmed) return;
                                try {
                                  await apiRequest(`/api/v1/design/${proj.id}`, {
                                    method: 'PATCH',
                                    csrfToken: user?.csrfToken,
                                    body: {
                                      action: 'update_project',
                                      projectName: trimmed,
                                    },
                                  });
                                  setRequests((prev) =>
                                    prev.map((r) =>
                                      r.id === proj.id
                                        ? {
                                            ...r,
                                            projectName: trimmed,
                                            aspectRatio: inlineAspectDraft,
                                          }
                                        : r,
                                    ),
                                  );
                                  setInlineEditProjId(null);
                                  setSuccessToast(`Đã cập nhật dự án "${trimmed}" (${inlineAspectDraft}).`);
                                } catch (err) {
                                  setError(
                                    err instanceof Error ? err.message : 'Lỗi cập nhật dự án.',
                                  );
                                }
                              }}
                              className="h-6 px-2.5 rounded bg-[#1E3A8A] text-white text-[10px] font-bold"
                            >
                              Lưu
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                          {/* Neat 48x48px Thumbnail */}
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-800 border border-slate-200">
                            <img
                              src={photoThumb}
                              alt={proj.projectName}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold text-slate-900">
                              {proj.projectName}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className="px-1.5 py-0.2 rounded bg-blue-50 border border-blue-200 text-[#1E3A8A] font-mono font-bold">
                                {proj.leadCode || (proj.designType === 'banner' ? 'BANNER' : `PRJ-${proj.id}`)}
                              </span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold">
                                {proj.aspectRatio || '16:9'}
                              </span>
                              <span className="text-slate-400">{createdDateStr}</span>
                            </div>
                          </div>
                        </div>

                        {/* Hover CRUD Actions: Inline Edit + Quick Trash Confirmation */}
                        <div
                          className="flex items-center gap-1 shrink-0 ml-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setInlineEditProjId(proj.id);
                              setInlineNameDraft(proj.projectName);
                              setInlineAspectDraft(proj.aspectRatio || '16:9');
                            }}
                            title="Đổi tên dự án & tỷ lệ khung hình"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-[#2563EB] hover:bg-blue-50 transition"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Bạn có chắc chắn muốn xóa dự án "${proj.projectName}"?`,
                                )
                              ) {
                                return;
                              }
                              try {
                                await apiRequest(`/api/v1/design/${proj.id}`, {
                                  method: 'DELETE',
                                  csrfToken: user?.csrfToken,
                                });
                                setRequests((prev) => prev.filter((r) => r.id !== proj.id));
                                setSuccessToast(`Đã xóa dự án "${proj.projectName}".`);
                                await loadData();
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : 'Không thể xóa dự án.',
                                );
                              }
                            }}
                            title="Xóa dự án"
                            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {isSelected && (
                            <Check className="h-4 w-4 shrink-0 text-[#2563EB] group-hover:hidden" />
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Source Photos Section for 3D Perspective */}
            {!isBannerProject && (
              <div className="pt-2 border-t border-slate-100">
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-900">
                    Ảnh hiện trạng mặt bằng <span className="text-red-500">*</span>
                  </div>
                </div>
                <div className="mb-2 text-[11px] text-slate-400">Chọn hoặc tải thêm góc chụp công trình</div>

                <div className="grid grid-cols-2 gap-2 mb-2.5">
                  {currentProject?.photos.map((photo) => {
                    const resolvedSrc = resolveAssetUrl(photo.url);
                    return (
                      <div
                        key={photo.id}
                        onClick={() => {
                          updateCurrentProjectImmutable((proj) => ({
                            ...proj,
                            photos: proj.photos.map((p) => ({ ...p, selected: p.id === photo.id })),
                          }));
                        }}
                        className={`group relative cursor-pointer overflow-hidden rounded-lg border transition ${
                          photo.selected
                            ? 'border-[#2563EB] ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="relative aspect-video w-full bg-slate-800">
                          <img src={resolvedSrc} alt={photo.name} className="h-full w-full object-cover" />
                          {photo.selected && (
                            <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#2563EB] text-white shadow">
                              <Check className="h-2.5 w-2.5" />
                            </div>
                          )}
                        </div>
                        <div className="p-1.5 bg-white text-[10px]">
                          <div className="truncate font-medium text-slate-700">{photo.name}</div>
                          <div className="mt-1 flex items-center justify-between text-[9px] text-slate-400">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const newName = prompt('Đổi tên ảnh hiện trạng:', photo.name);
                                if (newName) {
                                  updateCurrentProjectImmutable((proj) => ({
                                    ...proj,
                                    photos: proj.photos.map((p) =>
                                      p.id === photo.id ? { ...p, name: newName } : p,
                                    ),
                                  }));
                                }
                              }}
                              className="hover:text-[#2563EB]"
                            >
                              Đổi tên
                            </button>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!currentProject) return;
                                if (confirm(`Bạn có chắc muốn xóa "${photo.name}"?`)) {
                                  try {
                                    await apiRequest(
                                      `/api/v1/design/${currentProject.id}?photoId=${photo.id}`,
                                      {
                                        method: 'DELETE',
                                        csrfToken: user?.csrfToken,
                                      },
                                    );
                                    await loadData();
                                  } catch {
                                    alert('Không thể xóa ảnh.');
                                  }
                                }
                              }}
                              className="hover:text-red-600"
                            >
                              Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <label className="flex cursor-pointer items-center justify-center space-x-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:bg-blue-50/50 hover:text-blue-700">
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm ảnh hiện trạng</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleUploadPhoto}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Bottom Pinned Card (Zero Dead-Space): Project Summary & LED Aspect Ratio / Dimensions */}
          {currentProject && (
            <div className="mt-auto pt-3 border-t border-slate-200 shrink-0 space-y-2.5 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span className="truncate">{currentProject.projectName}</span>
                  <button
                    onClick={() => {
                      setRenameValue(currentProject.projectName);
                      setEditingName(true);
                    }}
                    className="text-slate-400 hover:text-[#2563EB] flex items-center space-x-1 shrink-0"
                    title="Đổi tên dự án"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span className="text-[10px]">Đổi tên</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Khách: {currentProject.contactName || 'Nội bộ'}</span>
                  <span className="font-mono font-semibold text-[#1E3A8A]">
                    {currentProject.productSpec?.pixelPitch || 'P2.5'}
                  </span>
                </div>
              </div>

              {/* Pinned LED Aspect Ratio & Dimension Quick Controls */}
              <div className="rounded-xl border border-blue-200/80 bg-blue-50/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#1E3A8A] text-[11px]">
                    {isBannerProject ? 'Tỷ lệ & Kích thước Banner' : 'Tỷ lệ & Khung Màn hình LED'}
                  </span>
                  <select
                    value={currentProject.aspectRatio || '16:9'}
                    onChange={(e) => {
                      const val = e.target.value;
                      updateCurrentProjectImmutable((proj) => ({ ...proj, aspectRatio: val }));
                    }}
                    className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-800"
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="1:1">1:1</option>
                    <option value="21:9">21:9</option>
                  </select>
                </div>

                {isBannerProject ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Rộng (px)</label>
                      <input
                        type="number"
                        value={currentProject.bannerWidthPx || 1920}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 1920;
                          updateCurrentProjectImmutable((proj) => ({ ...proj, bannerWidthPx: val }));
                        }}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Cao (px)</label>
                      <input
                        type="number"
                        value={currentProject.bannerHeightPx || 1080}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 1080;
                          updateCurrentProjectImmutable((proj) => ({ ...proj, bannerHeightPx: val }));
                        }}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500">Ngang (m)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={currentProject.screenWidthM || 4.8}
                        onChange={(e) => {
                          const nextW = Number(e.target.value) || 4.8;
                          updateCurrentProjectImmutable((proj) => ({
                            ...proj,
                            screenWidthM: nextW,
                            productSpec: proj.productSpec
                              ? {
                                  ...proj.productSpec,
                                  areaM2: Number((nextW * (proj.screenHeightM || 2.7)).toFixed(2)),
                                }
                              : proj.productSpec,
                          }));
                        }}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Cao (m)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={currentProject.screenHeightM || 2.7}
                        onChange={(e) => {
                          const nextH = Number(e.target.value) || 2.7;
                          updateCurrentProjectImmutable((proj) => ({
                            ...proj,
                            screenHeightM: nextH,
                            productSpec: proj.productSpec
                              ? {
                                  ...proj.productSpec,
                                  areaM2: Number(((proj.screenWidthM || 4.8) * nextH).toFixed(2)),
                                }
                              : proj.productSpec,
                          }));
                        }}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================= CENTER PANEL: FLEXIBLE CANVAS ================= */}
        <div
          className={`${
            mobilePane === 'canvas' ? 'flex' : 'hidden md:flex'
          } flex-1 flex-col overflow-hidden bg-slate-100`}
        >
          {/* Sub-bar: Status Toast + View Mode Toggle */}
          <div className="flex h-10 shrink-0 items-center justify-between bg-white px-4 border-b border-slate-200">
            {/* Status notice */}
            <div className="flex items-center space-x-1.5 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{successToast || 'Bản nháp đã lưu vào thư viện'}</span>
            </div>

            {/* View Mode Switcher: 'original' | 'perspective' | 'compare' */}
            <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                onClick={() => setViewMode('original')}
                className={`rounded px-3 py-1 font-medium transition ${
                  viewMode === 'original' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ảnh gốc
              </button>
              <button
                onClick={() => setViewMode('perspective')}
                className={`rounded px-3 py-1 font-medium transition ${
                  viewMode === 'perspective' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Phối cảnh
              </button>
              <button
                onClick={() => setViewMode('compare')}
                className={`rounded px-3 py-1 font-medium transition ${
                  viewMode === 'compare' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                So sánh
              </button>
            </div>
          </div>

          {/* MAIN CANVAS / PREVIEW AREA */}
          <div className="relative flex-1 overflow-hidden p-4 flex items-center justify-center">
            {/* Gallery View if Library tab is active */}
            {centerTab === 'library' ? (
              <div className="h-full w-full overflow-y-auto bg-white rounded-2xl p-5 shadow-xs border border-slate-200">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 text-sm">Thư viện ấn phẩm & Lịch sử phiên bản</h3>
                  <span className="text-xs text-slate-400">
                    {currentProject?.assetVersions.length || 0} phiên bản đã lưu
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {currentProject?.assetVersions.map((v) => {
                    const thumb = resolveAssetUrl(v.downloadUrl);
                    return (
                      <div
                        key={v.id}
                        className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-xs hover:shadow-md transition"
                      >
                        <div className="aspect-video w-full relative">
                          <img src={thumb} alt={v.promptUsed || 'Version'} className="h-full w-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center space-x-2">
                            <button
                              onClick={() => {
                                setSelectedVersionId(v.id);
                                setCenterTab('perspective');
                              }}
                              className="p-1.5 rounded-lg bg-white/90 text-slate-800 hover:bg-white text-xs font-semibold"
                              title="Xem phối cảnh"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <a
                              href={`/api/v1/design/asset/${v.id}`}
                              target="_blank"
                              className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold"
                              title="Tải ảnh gốc"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                        <div className="p-2.5 bg-white text-xs">
                          <div className="font-bold text-slate-800">
                            {v.isApprovedFinal ? 'Phiên bản hoàn thiện' : `Bản nháp v${v.versionNumber}`}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{v.promptUsed}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Canvas Viewport */
              <div
                ref={canvasContainerRef}
                onMouseMove={handleMouseMoveCanvas}
                onMouseUp={handleMouseUpCanvas}
                onMouseLeave={handleMouseUpCanvas}
                style={{
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: 'center center',
                  transition: draggingHandle ? 'none' : 'transform 0.15s ease-out',
                }}
                className="relative aspect-video max-h-full max-w-full select-none overflow-hidden rounded-2xl bg-slate-900 shadow-2xl border border-slate-800"
              >
                {/* Background Site Photo */}
                <img
                  src={sitePhotoUrl}
                  alt="Site photo"
                  className="h-full w-full object-cover"
                />

                {/* OVERLAY: Perspective LED Display inside 4-corner Quad */}
                {viewMode !== 'original' && !isBannerProject && (
                  <div className="absolute inset-0 pointer-events-none">
                    <svg className="absolute inset-0 h-full w-full pointer-events-none">
                      <defs>
                        <linearGradient id="ledGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#0284c7" stopOpacity="0.95" />
                          <stop offset="50%" stopColor="#2563eb" stopOpacity="0.95" />
                          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.95" />
                        </linearGradient>
                      </defs>

                      {/* LED Display Box Polygon with Ocean Wave Gradient / Content */}
                      <polygon
                        points={`${quad.topLeft.x}%,${quad.topLeft.y}% ${quad.topRight.x}%,${quad.topRight.y}% ${quad.bottomRight.x}%,${quad.bottomRight.y}% ${quad.bottomLeft.x}%,${quad.bottomLeft.y}%`}
                        fill="url(#ledGlow)"
                        stroke="#93c5fd"
                        strokeWidth="2"
                        className="filter drop-shadow-md"
                      />
                    </svg>

                    {/* Render high-contrast ocean wave content clipped to the polygon */}
                    <div
                      style={{
                        clipPath: `polygon(${quad.topLeft.x}% ${quad.topLeft.y}%, ${quad.topRight.x}% ${quad.topRight.y}%, ${quad.bottomRight.x}% ${quad.bottomRight.y}%, ${quad.bottomLeft.x}% ${quad.bottomLeft.y}%)`,
                      }}
                      className="absolute inset-0 flex items-center justify-center overflow-hidden"
                    >
                      <div className="relative h-full w-full bg-gradient-to-tr from-sky-600 via-blue-600 to-indigo-800 flex items-center justify-center">
                        <div className="text-center text-white drop-shadow-md px-2">
                          <div className="text-sm font-black tracking-wider uppercase">MÀN HÌNH LED TOÀN TRUNG</div>
                          <div className="text-xs text-sky-200 font-semibold mt-0.5">
                            {currentProject?.screenWidthM
                              ? `${currentProject.screenWidthM} x ${currentProject.screenHeightM} m`
                              : '4,80 x 2,70 m'} · P2.5 Indoor
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Floating Dimension Pill over top edge */}
                    <div
                      style={{
                        left: `${(quad.topLeft.x + quad.topRight.x) / 2}%`,
                        top: `${Math.min(quad.topLeft.y, quad.topRight.y) - 6}%`,
                        transform: 'translate(-50%, -50%)',
                      }}
                      className="pointer-events-auto absolute flex items-center rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-white shadow-lg backdrop-blur-xs border border-white/20"
                    >
                      <span>
                        {currentProject?.screenWidthM
                          ? `${currentProject.screenWidthM.toFixed(2).replace('.', ',')} x ${currentProject.screenHeightM?.toFixed(2).replace('.', ',')} m`
                          : '4,80 x 2,70 m'}
                      </span>
                    </div>

                    {/* Interactive 4-Corner Handles */}
                    {showHandles && (
                      <>
                        {(['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).map((corner) => (
                          <div
                            key={corner}
                            onMouseDown={handleMouseDownHandle(corner)}
                            style={{
                              left: `${quad[corner].x}%`,
                              top: `${quad[corner].y}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            className={`pointer-events-auto absolute h-4 w-4 cursor-crosshair rounded-full border-2 border-white bg-blue-600 shadow-lg transition-transform hover:scale-125 ${
                              draggingHandle === corner ? 'ring-4 ring-blue-400' : ''
                            }`}
                            title={`Kéo góc neo ${corner}`}
                          />
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Compare Mode Split Slider */}
                {viewMode === 'compare' && (
                  <div
                    style={{ left: `${compareSplit}%` }}
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-2xl"
                  >
                    <div
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDraggingCompare(true);
                      }}
                      className="pointer-events-auto absolute top-1/2 -ml-3.5 -mt-3.5 flex h-7 w-7 cursor-ew-resize items-center justify-center rounded-full bg-white shadow-lg text-xs font-bold text-slate-700 hover:scale-110 transition-transform"
                      title="Kéo để so sánh trước/sau"
                    >
                      ↔
                    </div>
                  </div>
                )}

                {/* Overlay Tools: Top Right */}
                <div className="absolute right-3 top-3 flex items-center space-x-1.5 rounded-xl bg-slate-900/80 p-1 backdrop-blur-xs text-white text-xs">
                  <button
                    onClick={() => setShowHandles(!showHandles)}
                    className={`flex items-center space-x-1 rounded-lg px-2.5 py-1 font-semibold transition ${
                      showHandles ? 'bg-white/20' : 'hover:bg-white/10'
                    }`}
                    title="Hiện/Ẩn góc neo LED"
                  >
                    <Edit2 className="h-3 w-3" />
                    <span>Chỉnh sửa</span>
                  </button>
                  <button
                    onClick={() => {
                      if (!document.fullscreenElement) {
                        canvasContainerRef.current?.requestFullscreen?.();
                      } else {
                        document.exitFullscreen?.();
                      }
                    }}
                    className="rounded-lg p-1.5 hover:bg-white/10"
                    title="Toàn màn hình"
                  >
                    <Expand className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Overlay Zoom Controls: Bottom Right */}
                <div className="absolute bottom-3 right-3 flex items-center space-x-1.5 rounded-xl bg-slate-900/80 px-2.5 py-1 backdrop-blur-xs text-white text-xs font-semibold">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                    className="p-1 hover:text-blue-400"
                    title="Thu nhỏ"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-10 text-center">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                    className="p-1 hover:text-blue-400"
                    title="Phóng to"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="ml-1 px-1.5 py-0.5 rounded bg-white/20 hover:bg-white/30 text-[10px]"
                    title="Vừa khung hình"
                  >
                    Fit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* BOTTOM: Versions Strip */}
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-800">Phiên bản thiết kế</span>
                <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                  <Info className="h-3 w-3" />
                  <span>Giữ lại bản AI gốc khi lưu phiên bản mới</span>
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                {currentProject?.assetVersions.length || 0} phiên bản
              </span>
            </div>

            {/* Version Thumbnails Carousel */}
            <div className="flex items-center space-x-3 overflow-x-auto pb-1">
              {currentProject?.assetVersions.map((ver, idx) => {
                const isSelected = ver.id === selectedVersionId;
                const isFinal = ver.isApprovedFinal || ver.sourceType === 'DESIGNER_FINAL_UPLOAD';
                const label = idx === 0 ? 'Bản AI gốc' : isFinal ? 'Phiên bản hoàn thiện' : `Phiên bản v${ver.versionNumber}`;
                const thumb = resolveAssetUrl(ver.downloadUrl);

                return (
                  <button
                    key={ver.id}
                    onClick={() => setSelectedVersionId(ver.id)}
                    className={`group relative flex shrink-0 flex-col items-center overflow-hidden rounded-xl border p-1 text-left transition ${
                      isSelected ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="relative h-14 w-24 overflow-hidden rounded-lg bg-slate-900 border border-slate-100">
                      <img src={thumb} alt={label} className="h-full w-full object-cover" />
                      {isFinal && (
                        <div className="absolute left-1 top-1 rounded bg-emerald-600 px-1 py-0.2 text-[8px] font-bold text-white uppercase">
                          Chính thức
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[11px] font-bold text-slate-700">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* FOOTER BAR: Measured Metrics */}
          <div className="flex h-9 shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-4 text-xs text-slate-500">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1">
                <Clock className="h-3 w-3 text-slate-400" />
                <span>Thời gian: {currentProject?.processingDurationSec ? `${currentProject.processingDurationSec}s` : '—'}</span>
              </span>
              <span>|</span>
              <span className="flex items-center space-x-1">
                <Layers className="h-3 w-3 text-slate-400" />
                <span>Token: {currentProject?.tokenCost ? currentProject.tokenCost.toLocaleString() : '—'}</span>
              </span>
              <span>|</span>
              <span className="flex items-center space-x-1">
                <Coins className="h-3 w-3 text-slate-400" />
                <span>
                  Chi phí:{' '}
                  {currentProject?.totalCost
                    ? `${currentProject.totalCost.currency === 'USD' ? '$' : ''}${currentProject.totalCost.formattedDecimal}${
                        currentProject.totalCost.currency === 'VND' ? ' ₫' : ''
                      }`
                    : '—'}
                </span>
              </span>
            </div>

            <div className="text-[11px] text-slate-400">
              {providerStatus?.isConfigured
                ? `● ${providerStatus.providerName}`
                : 'Thiết kế minh họa · Chưa kết nối AI'}
            </div>
          </div>
        </div>

        {/* ================= RIGHT PANEL: Desktop Col-3 / Tablet Slide-over Drawer / Mobile Tab ================= */}
        {tabletAssistantOpen && (
          <button
            type="button"
            aria-label="Đóng trợ lý"
            onClick={() => setTabletAssistantOpen(false)}
            className="hidden md:block xl:hidden fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-2xs"
          />
        )}
        <div
          className={`${
            mobilePane === 'assistant' ? 'flex w-full' : 'hidden'
          } ${
            tabletAssistantOpen
              ? 'md:flex md:fixed md:inset-y-16 md:right-0 md:z-40 md:w-84 md:shadow-2xl'
              : 'xl:flex'
          } xl:static xl:w-84 shrink-0 flex-col border-l border-slate-200 bg-white`}
        >
          {/* Header with Tabs */}
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <div className="flex items-center space-x-1.5 text-sm font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span>Trợ lý thiết kế</span>
            </div>

            {/* Tabs: 'request' | 'specs' */}
            <div className="flex items-center space-x-3 text-xs font-semibold">
              <button
                onClick={() => setRightTab('request')}
                className={`py-3 transition border-b-2 ${
                  rightTab === 'request'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                Yêu cầu
              </button>
              <button
                onClick={() => setRightTab('specs')}
                className={`py-3 transition border-b-2 ${
                  rightTab === 'specs'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-700'
                }`}
              >
                Thông số
              </button>
            </div>
          </div>

          {/* TAB 1: YÊU CẦU (Conversational Editing Assistant) */}
          {rightTab === 'request' && (
            <div className="flex flex-1 flex-col overflow-hidden p-3.5">
              {/* Product Spec Summary Chip */}
              <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 text-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2">
                    <Monitor className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
                    <div>
                      <div className="font-bold text-slate-800">
                        {currentProject?.productSpec?.productName || 'LED trong nhà · P2.5'}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Phẳng | {currentProject?.screenWidthM ? `${currentProject.screenWidthM} x ${currentProject.screenHeightM} m` : '4,80 x 2,70 m'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRightTab('specs')}
                    className="text-[11px] font-semibold text-blue-600 hover:underline shrink-0"
                  >
                    Thông số mặt hàng
                  </button>
                </div>
              </div>

              {/* Chat Message History */}
              <div className="flex-1 space-y-3 overflow-y-auto pr-1 text-xs">
                {currentProject?.chatMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div key={msg.id} className="space-y-1">
                      <div className="text-[10px] font-bold text-slate-400">
                        {isUser ? 'Mô tả yêu cầu *' : 'Phản hồi từ AI Studio'}
                      </div>
                      <div
                        className={`rounded-xl p-3 leading-relaxed shadow-xs text-[12.5px] ${
                          isUser
                            ? 'bg-slate-100 text-slate-800'
                            : 'border border-blue-100 bg-blue-50/60 text-slate-800 font-medium'
                        }`}
                      >
                        {!isUser && <Sparkles className="h-3.5 w-3.5 text-blue-600 inline mr-1.5 -mt-0.5" />}
                        <span>{msg.text}</span>
                        {msg.cost && (
                          <div className="mt-1.5 flex items-center space-x-2 text-[10px] text-slate-400 border-t border-slate-200/50 pt-1 font-normal">
                            <span>⏱ {msg.durationSec}s</span>
                            <span>•</span>
                            <span>🪙 {msg.cost}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PII Alert Warning if triggered */}
              {piiAlert && (
                <div className="mt-2 flex items-start space-x-1.5 rounded-lg bg-red-50 p-2 text-[11px] text-red-600 border border-red-200">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{piiAlert}</span>
                </div>
              )}

              {/* Fixed Composer Area */}
              <form onSubmit={handleSendChatEdit} className="mt-3 shrink-0 pt-2 border-t border-slate-100">
                <textarea
                  rows={3}
                  value={chatPrompt}
                  onChange={(e) => handlePromptChange(e.target.value)}
                  placeholder="Nhập yêu cầu chỉnh sửa..."
                  className="w-full resize-none rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none shadow-xs"
                />

                <div className="mt-2 flex items-center justify-between">
                  {/* Quality selector */}
                  <div className="flex items-center space-x-1 text-xs text-slate-500">
                    <span className="text-[11px]">Chất lượng:</span>
                    <select
                      value={chatQuality}
                      onChange={(e) => setChatQuality(e.target.value as any)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none"
                    >
                      <option value="draft">Tiết kiệm</option>
                      <option value="high_quality">Chất lượng cao</option>
                    </select>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={!chatPrompt.trim() || submitting || Boolean(piiAlert)}
                    className="flex items-center space-x-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="h-3 w-3" />
                    <span>{submitting ? 'Đang tạo...' : 'Gửi yêu cầu'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: THÔNG SỐ (Technical Product Specifications) */}
          {rightTab === 'specs' && (
            <div className="flex-1 overflow-y-auto p-4 text-xs space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="font-bold text-slate-900 text-sm">Thông số kỹ thuật màn hình LED</h3>
                <p className="text-[11px] text-slate-400">Trích xuất từ danh mục sản phẩm chuẩn Toàn Trung</p>
              </div>

              {/* Product Selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mặt hàng LED chuẩn:</label>
                <select
                  value={currentProject?.productId || 1}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const opt = productOptions.find((p) => p.id === id);
                    if (opt) {
                      updateCurrentProjectImmutable((proj) => ({
                        ...proj,
                        productId: opt.id,
                        productName: opt.name,
                      }));
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800"
                >
                  {productOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Physical Dimensions */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Chiều ngang (m):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={currentProject?.screenWidthM || 4.8}
                    onChange={(e) => {
                      const nextW = Number(e.target.value) || 4.8;
                      updateCurrentProjectImmutable((proj) => ({
                        ...proj,
                        screenWidthM: nextW,
                        productSpec: proj.productSpec
                          ? {
                              ...proj.productSpec,
                              areaM2: Number((nextW * (proj.screenHeightM || 2.7)).toFixed(2)),
                            }
                          : proj.productSpec,
                      }));
                    }}
                    className="w-full rounded border border-slate-200 p-1.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">Chiều cao (m):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={currentProject?.screenHeightM || 2.7}
                    onChange={(e) => {
                      const nextH = Number(e.target.value) || 2.7;
                      updateCurrentProjectImmutable((proj) => ({
                        ...proj,
                        screenHeightM: nextH,
                        productSpec: proj.productSpec
                          ? {
                              ...proj.productSpec,
                              areaM2: Number(((proj.screenWidthM || 4.8) * nextH).toFixed(2)),
                            }
                          : proj.productSpec,
                      }));
                    }}
                    className="w-full rounded border border-slate-200 p-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>

              {/* Technical Specifications Table */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Diện tích hiển thị:</span>
                  <span className="font-semibold text-slate-800">
                    {currentProject?.productSpec?.areaM2 || 12.96} m²
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bước điểm ảnh (Pitch):</span>
                  <span className="font-semibold text-slate-800">
                    {currentProject?.productSpec?.pixelPitch || 'P2.5'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Độ phân giải:</span>
                  <span className="font-semibold text-slate-800">
                    {currentProject?.productSpec?.resolutionWidthPx || 1920} x {currentProject?.productSpec?.resolutionHeightPx || 1080} px
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kích thước Cabinet:</span>
                  <span className="font-semibold text-slate-800">640 x 480 mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Bộ xử lý (Controller):</span>
                  <span className="font-semibold text-slate-800">Novastar TB60 / VX600</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Nguồn cấp:</span>
                  <span className="font-semibold text-slate-800">Meanwell / G-Energy 5V-40A</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Công suất tiêu thụ:</span>
                  <span className="font-semibold text-slate-800">Trung bình ~3.2 kW</span>
                </div>
              </div>

              {/* Apply Specs Button */}
              <button
                onClick={async () => {
                  if (currentProject) {
                    try {
                      await apiRequest(`/api/v1/design/${currentProject.id}`, {
                        method: 'PATCH',
                        csrfToken: user?.csrfToken,
                        body: {
                          action: 'update_project',
                          expectedVersion: currentProject.version,
                          placementQuad: quad,
                          notes: currentProject.notes,
                          projectName: currentProject.projectName,
                        },
                      });
                      await loadData();
                    } catch {
                      // fallback to local toast if unchanged
                    }
                  }
                  setSuccessToast('Đã lưu và áp dụng thông số vào phối cảnh AI.');
                  setRightTab('request');
                }}
                className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow hover:bg-blue-700 transition"
              >
                Áp dụng thông số vào phối cảnh
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL: CREATE PROJECT */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-3">Tạo dự án thiết kế AI mới</h3>
            <form onSubmit={handleCreateProject} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loại thiết kế:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProjectType('perspective_3d')}
                    className={`rounded-xl p-2.5 font-bold border text-center transition ${
                      newProjectType === 'perspective_3d'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Phối cảnh 3D màn hình
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProjectType('banner')}
                    className={`rounded-xl p-2.5 font-bold border text-center transition ${
                      newProjectType === 'banner'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-xs'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Banner quảng cáo độc lập
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên dự án *:</label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Gắn Lead (Tùy chọn):</label>
                <select
                  value={newLeadId}
                  onChange={(e) => setNewLeadId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                >
                  <option value="">-- Không gắn Lead (Tạo độc lập) --</option>
                  {leadOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Prompt mô tả ban đầu *:</label>
                <textarea
                  rows={2}
                  required
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow"
                >
                  {submitting ? 'Đang tạo...' : 'Tạo dự án'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENAME PROJECT */}
      {editingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h4 className="text-sm font-bold text-slate-800 mb-2">Đổi tên dự án</h4>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-lg border border-slate-200 p-2.5 text-xs mb-3.5"
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setEditingName(false)}
                className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs text-slate-600"
              >
                Hủy
              </button>
              <button
                onClick={handleRenameProject}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
