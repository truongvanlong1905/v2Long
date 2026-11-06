'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DESIGN_STATUS_LABELS,
  DESIGN_TYPE_LABELS,
  hasBaPermission,
  type CreateDesignRequestDto,
  type DesignRequestItemDto,
  type DesignType,
  type QuadCoordinatesDto,
} from '@toantrung/contracts';
import {
  Archive,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  Edit2,
  Expand,
  Eye,
  FileArchive,
  FileSpreadsheet,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Layers,
  Lock,
  Minus,
  Monitor,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  Maximize2,
  Minimize2,
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

interface ProjectParameterFormState {
  projectName: string;
  designType: DesignType;
  leadId: string;
  contactName: string;
  installationInfo: string;
  notes: string;
  productId: number;
  pixelPitch: string;
  screenStyle: 'flat' | 'curved' | 'corner_90';
  screenWidthM: number;
  screenHeightM: number;
  aspectRatio: string;
  aspectLocked: boolean;
  bannerWidthPx: number;
  bannerHeightPx: number;
}

const STORAGE_SELECTED_PROJECT_KEY = 'tt_studio_selected_project_id';

function parseAspectRatioValue(ratioStr: string): number | null {
  const m = ratioStr.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h || h <= 0) return null;
  return w / h;
}

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
  const canExport = Boolean(user && hasBaPermission(user.roleCode, 'EXPORT_DATA'));

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
  const [savingParams, setSavingParams] = useState(false);
  const [savingFinal, setSavingFinal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingFinalFile, setUploadingFinalFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Three Prominent Workspace Areas: 'perspective' (Phối cảnh) | 'assistant' (Trợ lý AI) | 'specs' (Thông số)
  const [activeWorkspaceArea, setActiveWorkspaceArea] = useState<'perspective' | 'assistant' | 'specs'>('perspective');
  // Side dock tab when viewing Phối cảnh on wide desktop
  const [sideDockTab, setSideDockTab] = useState<'assistant' | 'specs'>('assistant');

  // Canvas View Mode: 'original' (Ảnh gốc) | 'result' (Kết quả) | 'compare' (So sánh)
  const [viewMode, setViewMode] = useState<'original' | 'result' | 'compare'>('result');

  // Left Sidebar: Project Search, Archive toggle, Secondary menu (`...`), and Kho ảnh dự án folder
  const [searchProject, setSearchProject] = useState('');
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [openMenuProjectId, setOpenMenuProjectId] = useState<number | null>(null);
  const [assetFolder, setAssetFolder] = useState<'technical' | 'designs'>('technical');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  // Responsive Mobile Switcher
  const [mobilePane, setMobilePane] = useState<'projects' | 'canvas' | 'assistant'>('canvas');
  // Mở rộng ảnh: ẩn cột Dự án & Trợ lý để vùng Phối cảnh chiếm toàn bộ chiều ngang
  const [focusCanvas, setFocusCanvas] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFocusCanvas(window.localStorage.getItem('m05.focusCanvas') === '1');
  }, []);
  const toggleFocusCanvas = () => {
    setFocusCanvas((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') window.localStorage.setItem('m05.focusCanvas', next ? '1' : '0');
      return next;
    });
  };

  // Zoom & Canvas Tools
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showHandles, setShowHandles] = useState(true);
  const [compareSplit, setCompareSplit] = useState<number>(50);

  // AI Assistant Composer
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatQuality, setChatQuality] = useState<'draft' | 'high_quality'>('draft');
  const [piiAlert, setPiiAlert] = useState<string | null>(null);

  // Interactive 4-Corner Placement Handles
  const [quad, setQuad] = useState<QuadCoordinatesDto>({
    topLeft: { x: 64.2, y: 44.5 },
    topRight: { x: 93.8, y: 45.2 },
    bottomRight: { x: 94.5, y: 72.8 },
    bottomLeft: { x: 64.5, y: 70.1 },
  });
  const [draggingHandle, setDraggingHandle] = useState<keyof QuadCoordinatesDto | null>(null);
  const [draggingCompare, setDraggingCompare] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Controlled Form State for "Thông số" (isolated per project so switching/reloading never mixes state)
  const [paramForm, setParamForm] = useState<ProjectParameterFormState>({
    projectName: 'Showroom LED',
    designType: 'perspective_3d',
    leadId: '',
    contactName: '',
    installationInfo: 'Tường bên phải showroom, cách sàn 1.2m',
    notes: '',
    productId: 1,
    pixelPitch: 'P2.5',
    screenStyle: 'flat',
    screenWidthM: 4.8,
    screenHeightM: 2.7,
    aspectRatio: '16:9',
    aspectLocked: true,
    bannerWidthPx: 1920,
    bannerHeightPx: 1080,
  });
  const [paramValidationError, setParamValidationError] = useState<string | null>(null);

  // Modal: Create New Project
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Showroom LED');
  const [newProjectType, setNewProjectType] = useState<'perspective_3d' | 'banner'>('perspective_3d');
  const [newLeadId, setNewLeadId] = useState<string>('');
  const [newContactName, setNewContactName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPrompt, setNewPrompt] = useState(
    'Đặt màn hình ở tường bên phải, hiển thị sóng biển xanh và giữ nguyên nội thất.'
  );

  // Modal: Rename Project
  const [editingName, setEditingName] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const syncProjectSelection = useCallback((project: DesignRequestItemDto) => {
    setSelectedId(project.id);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_SELECTED_PROJECT_KEY, String(project.id));
      const url = new URL(window.location.href);
      url.searchParams.set('projectId', String(project.id));
      window.history.replaceState({}, '', url.toString());
    }
    if (project.placementQuad) {
      setQuad(project.placementQuad);
    }
    if (project.assetVersions.length > 0) {
      const approved = project.assetVersions.find((v) => v.isApprovedFinal);
      const latest = project.assetVersions[project.assetVersions.length - 1];
      setSelectedVersionId((approved || latest).id);
    } else {
      setSelectedVersionId(null);
    }
    setSelectedAssetIds([]);
    setParamValidationError(null);
    setParamForm({
      projectName: project.projectName || 'Dự án LED',
      designType: project.designType || 'perspective_3d',
      leadId: project.leadId ? String(project.leadId) : '',
      contactName: project.contactName && project.contactName !== 'Chưa cập nhật' ? project.contactName : '',
      installationInfo: project.installationInfo || 'Tường bên phải showroom, cách sàn 1.2m',
      notes: project.notes || '',
      productId: project.productId || project.productSpec?.productId || 1,
      pixelPitch: project.productSpec?.pixelPitch || 'P2.5',
      screenStyle: project.productSpec?.screenStyle || 'flat',
      screenWidthM: project.screenWidthM || 4.8,
      screenHeightM: project.screenHeightM || 2.7,
      aspectRatio: project.aspectRatio || '16:9',
      aspectLocked: project.aspectLocked ?? true,
      bannerWidthPx: project.bannerWidthPx || project.productSpec?.resolutionWidthPx || 1920,
      bannerHeightPx: project.bannerHeightPx || project.productSpec?.resolutionHeightPx || 1080,
    });
  }, []);

  // Load Data from API
  const loadData = useCallback(
    async (preferredProjectId?: number) => {
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
          let targetId = preferredProjectId ?? selectedId;
          if (!targetId && typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            const fromUrl = Number(urlParams.get('projectId'));
            const fromStorage = Number(window.localStorage.getItem(STORAGE_SELECTED_PROJECT_KEY));
            if (Number.isInteger(fromUrl) && fromUrl > 0) {
              targetId = fromUrl;
            } else if (Number.isInteger(fromStorage) && fromStorage > 0) {
              targetId = fromStorage;
            }
          }
          const currentReq = (targetId ? list.find((r) => r.id === targetId) : null) || list[0];
          syncProjectSelection(currentReq);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu Studio thiết kế.');
      } finally {
        setLoading(false);
      }
    },
    [selectedId, syncProjectSelection]
  );

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select or prefill project when navigated with ?leadId=<id> from LeadsWorkspace
  useEffect(() => {
    if (typeof window === 'undefined' || loading) return;
    const params = new URLSearchParams(window.location.search);
    const leadIdParam = Number(params.get('leadId'));
    if (Number.isInteger(leadIdParam) && leadIdParam > 0) {
      const existingReq = requests.find((r) => r.leadId === leadIdParam);
      if (existingReq) {
        syncProjectSelection(existingReq);
      } else {
        const opt = leadOptions.find((l) => l.id === leadIdParam);
        setNewLeadId(String(leadIdParam));
        if (opt) {
          setNewProjectName(`Phối cảnh ${opt.leadCode}`);
        }
        setShowCreateModal(true);
      }
    }
  }, [loading, requests, leadOptions, syncProjectSelection]);

  const currentProject = useMemo(
    () => requests.find((r) => r.id === selectedId) || requests[0] || null,
    [requests, selectedId]
  );

  const currentVersion = useMemo(
    () =>
      currentProject?.assetVersions.find((v) => v.id === selectedVersionId) ||
      currentProject?.assetVersions[currentProject.assetVersions.length - 1] ||
      null,
    [currentProject, selectedVersionId]
  );

  const selectedPhoto = useMemo(
    () => currentProject?.photos.find((p) => p.selected) || currentProject?.photos[0] || null,
    [currentProject]
  );

  // Resolve distinct URLs for Original input photo vs Output design version
  const sitePhotoUrl = resolveAssetUrl(selectedPhoto?.url || currentProject?.sitePhotoDownloadUrl);
  const versionImageUrl = currentVersion
    ? `/api/v1/design/asset/${currentVersion.id}`
    : resolveAssetUrl(currentProject?.aiDraftDownloadUrl || sitePhotoUrl);

  // Live computed LED hardware specs from paramForm
  const computedLiveSpecs = useMemo(() => {
    const w = Math.max(0.2, Number(paramForm.screenWidthM) || 4.8);
    const h = Math.max(0.2, Number(paramForm.screenHeightM) || 2.7);
    const areaM2 = Number((w * h).toFixed(2));
    const pitchMm = Number(paramForm.pixelPitch.replace(/[^0-9.]/g, '')) || 2.5;
    const resW = Math.round((w * 1000) / pitchMm);
    const resH = Math.round((h * 1000) / pitchMm);
    const cabinetCols = Math.max(1, Math.round((w * 1000) / 640));
    const cabinetRows = Math.max(1, Math.round((h * 1000) / 480));
    const cabinetCount = cabinetCols * cabinetRows;
    const moduleCount = cabinetCount * 6;
    const avgKw = Number(((areaM2 * 250) / 1000).toFixed(2));
    const maxKw = Number(((areaM2 * 600) / 1000).toFixed(2));
    return {
      areaM2,
      pitchMm,
      resW,
      resH,
      cabinetCount,
      moduleCount,
      avgKw,
      maxKw,
    };
  }, [paramForm.screenWidthM, paramForm.screenHeightM, paramForm.pixelPitch]);

  // Dragging logic for 4-corner placement & split comparison
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
      setPiiAlert(
        'Phát hiện SĐT/Email trong nội dung. Theo quy định bảo mật dữ liệu (UC06), tuyệt đối không gửi thông tin liên hệ khách hàng sang AI.'
      );
    } else {
      setPiiAlert(null);
    }
  };

  // Save Parameters ("Thông số") to Backend
  const handleSaveParameters = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentProject || savingParams) return;

    if (!paramForm.projectName.trim() || paramForm.projectName.trim().length < 2) {
      setParamValidationError('Tên dự án phải có tối thiểu 2 ký tự.');
      return;
    }
    if (paramForm.designType === 'perspective_3d') {
      if (paramForm.screenWidthM <= 0 || paramForm.screenHeightM <= 0) {
        setParamValidationError('Chiều ngang và chiều cao màn hình LED (m) phải lớn hơn 0.');
        return;
      }
    } else {
      if (paramForm.bannerWidthPx < 128 || paramForm.bannerHeightPx < 64) {
        setParamValidationError('Độ phân giải đầu ra tối thiểu là 128×64 px.');
        return;
      }
    }

    setParamValidationError(null);
    setSavingParams(true);
    setError(null);
    try {
      const selectedProduct = productOptions.find((p) => p.id === paramForm.productId);
      const ledModuleSpec = selectedProduct
        ? `${selectedProduct.name} (${paramForm.pixelPitch})`
        : `Màn hình LED ${paramForm.pixelPitch}`;

      await apiRequest(`/api/v1/design/${currentProject.id}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'update_project',
          projectName: paramForm.projectName.trim(),
          designType: paramForm.designType,
          leadId: paramForm.leadId ? Number(paramForm.leadId) : null,
          contactName: paramForm.contactName.trim() || null,
          installationInfo: paramForm.installationInfo.trim() || null,
          notes: paramForm.notes.trim() || null,
          productId: paramForm.productId,
          ledModuleSpec,
          pixelPitch: paramForm.pixelPitch,
          screenStyle: paramForm.screenStyle,
          screenWidthM: Number(paramForm.screenWidthM),
          screenHeightM: Number(paramForm.screenHeightM),
          bannerWidthPx: Math.round(Number(paramForm.bannerWidthPx)),
          bannerHeightPx: Math.round(Number(paramForm.bannerHeightPx)),
          aspectRatio: paramForm.aspectRatio,
          aspectLocked: paramForm.aspectLocked,
          placementQuad: quad,
        },
      });

      setSuccessToast(`Đã lưu thông số dự án "${paramForm.projectName.trim()}" vào cơ sở dữ liệu.`);
      await loadData(currentProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu thông số dự án.');
    } finally {
      setSavingParams(false);
    }
  };

  // Chat Edit Submit (creates new version vN without overwriting original)
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
        productId: paramForm.productId,
        screenWidthM: paramForm.screenWidthM,
        screenHeightM: paramForm.screenHeightM,
        bannerWidthPx: paramForm.bannerWidthPx,
        bannerHeightPx: paramForm.bannerHeightPx,
        aspectRatio: paramForm.aspectRatio,
        selectedPhotoUrl: sitePhotoUrl,
        idempotencyKey: `chat-design-${currentProject.id}-v${currentProject.assetVersions.length + 1}-${Date.now()}`,
      };

      const data = await apiRequest<{ versionNumber: number; versionId?: number }>(
        `/api/v1/design/${currentProject.id}`,
        {
          method: 'PATCH',
          csrfToken: user?.csrfToken,
          body: payload,
        }
      );

      setChatPrompt('');
      setViewMode('result');
      setSuccessToast(`Đã tạo phiên bản thiết kế mới (v${data.versionNumber}) trong Bản thiết kế.`);
      await loadData(currentProject.id);
      if (data.versionId) {
        setSelectedVersionId(data.versionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gửi yêu cầu dựng thiết kế AI.');
    } finally {
      setSubmitting(false);
    }
  };

  // Approve & Save Finished Version
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
          note: `Phê duyệt bản thiết kế v${currentVersion.versionNumber} bàn giao chính thức`,
        },
      });

      setSuccessToast(
        `Đã chốt duyệt phiên bản v${currentVersion.versionNumber} và đồng bộ sang hồ sơ Lead / NVKD.`
      );
      await loadData(currentProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi phê duyệt bản hoàn thiện.');
    } finally {
      setSavingFinal(false);
    }
  };

  // Multi-file Upload for "Ảnh kỹ thuật"
  const handleUploadTechnicalPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !currentProject) return;

    setUploadingPhoto(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
          reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
          reader.readAsDataURL(file);
        });
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
      }
      setSuccessToast(`Đã tải ${files.length} ảnh kỹ thuật vào Kho ảnh dự án.`);
      await loadData(currentProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải ảnh kỹ thuật.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  // Upload Designer Final Output into "Bản thiết kế"
  const handleUploadDesignerFinal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentProject) return;

    setUploadingFinalFile(true);
    setError(null);
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
        reader.onerror = () => reject(new Error('Không thể đọc tệp thiết kế.'));
        reader.readAsDataURL(file);
      });
      await apiRequest(`/api/v1/design/${currentProject.id}`, {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'upload_final',
          fileName: file.name,
          mimeType: file.type || 'image/png',
          base64Data: b64,
          note: `Bản thiết kế hoàn thiện tải lên: ${file.name}`,
        },
      });
      setSuccessToast(`Đã tải bản thiết kế hoàn thiện "${file.name}" vào thư mục Bản thiết kế.`);
      await loadData(currentProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải bản thiết kế hoàn thiện.');
    } finally {
      setUploadingFinalFile(false);
      e.target.value = '';
    }
  };

  // Import attachments from linked Lead into "Ảnh kỹ thuật"
  const handleImportLeadPhotos = async () => {
    if (!currentProject || !currentProject.leadId) return;
    try {
      await apiRequest(`/api/v1/design/${currentProject.id}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'update_project',
          importLeadAttachments: true,
        },
      });
      setSuccessToast('Đã đồng bộ ảnh hiện trạng từ hồ sơ Lead vào thư mục Ảnh kỹ thuật.');
      await loadData(currentProject.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể nhập ảnh từ Lead.');
    }
  };

  // Download ZIP of selected or all items in Kho ảnh dự án
  const handleDownloadProjectZip = (folderScope: 'all' | 'technical' | 'designs' = 'all') => {
    if (!currentProject) return;
    const params = new URLSearchParams();
    params.set('folder', folderScope);
    if (selectedAssetIds.length > 0) {
      params.set('ids', selectedAssetIds.join(','));
    }
    window.open(`/api/v1/design/${currentProject.id}/download-zip?${params.toString()}`, '_blank');
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
      setSuccessToast(`Đã tạo dự án "${newProjectName.trim()}" (#${data.id}) thành công.`);
      await loadData(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tạo dự án mới.');
    } finally {
      setSubmitting(false);
    }
  };

  // Rename Project Submit
  const handleRenameProject = async () => {
    const targetId = renameTargetId || currentProject?.id;
    if (!targetId || !renameValue.trim()) return;
    try {
      await apiRequest(`/api/v1/design/${targetId}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'update_project',
          projectName: renameValue.trim(),
        },
      });
      setEditingName(false);
      setRenameTargetId(null);
      setSuccessToast(`Đã đổi tên dự án thành "${renameValue.trim()}".`);
      await loadData(targetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi đổi tên dự án.');
    }
  };

  // Toggle Archive Project
  const handleToggleArchiveProject = async (proj: DesignRequestItemDto) => {
    try {
      const nextArchived = !proj.isArchived;
      await apiRequest(`/api/v1/design/${proj.id}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'update_project',
          isArchived: nextArchived,
        },
      });
      setOpenMenuProjectId(null);
      setSuccessToast(
        nextArchived
          ? `Đã lưu trữ dự án "${proj.projectName}".`
          : `Đã khôi phục dự án "${proj.projectName}".`
      );
      await loadData(proj.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu trữ dự án.');
    }
  };

  // Filter projects by search term & archive toggle
  const filteredProjects = useMemo(() => {
    return requests.filter((r) => {
      if (!showArchivedProjects && r.isArchived) return false;
      const q = searchProject.trim().toLowerCase();
      if (!q) return true;
      return (
        r.projectName.toLowerCase().includes(q) ||
        (r.leadCode && r.leadCode.toLowerCase().includes(q)) ||
        (r.leadProjectLabel && r.leadProjectLabel.toLowerCase().includes(q))
      );
    });
  }, [requests, searchProject, showArchivedProjects]);

  const isBannerProject = currentProject?.designType === 'banner';

  const toggleAssetSelection = (assetKey: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetKey) ? prev.filter((k) => k !== assetKey) : [...prev, assetKey]
    );
  };

  // Helper to update aspect ratio and auto-calculate dimensions when aspectLocked is true
  const handleAspectRatioChange = (nextRatio: string) => {
    const ratioNum = parseAspectRatioValue(nextRatio);
    setParamForm((prev) => {
      let nextW = prev.screenWidthM;
      let nextH = prev.screenHeightM;
      let nextPxW = prev.bannerWidthPx;
      let nextPxH = prev.bannerHeightPx;
      if (ratioNum && prev.aspectLocked) {
        nextH = Number((nextW / ratioNum).toFixed(2));
        nextPxH = Math.max(64, Math.round(nextPxW / ratioNum));
      }
      return {
        ...prev,
        aspectRatio: nextRatio,
        screenHeightM: nextH,
        bannerHeightPx: nextPxH,
      };
    });
  };

  const renderParametersFormContent = (compact = false) => (
    <form
      onSubmit={handleSaveParameters}
      className={compact ? 'space-y-4 text-sm' : 'grid grid-cols-1 lg:grid-cols-3 gap-5 text-sm'}
    >
      {/* SECTION 1: THÔNG TIN DỰ ÁN */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="text-base font-bold text-slate-900">1. Thông tin dự án</h3>
            <p className="text-xs text-slate-500">Định danh dự án, loại thiết kế & liên kết hồ sơ Lead</p>
          </div>
          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#1E3A8A] border border-blue-200">
            DA-{String(currentProject?.id || 1).padStart(4, '0')}
          </span>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Tên dự án <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            data-testid="param-project-name"
            value={paramForm.projectName}
            onChange={(e) => setParamForm((p) => ({ ...p, projectName: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Loại dự án thiết kế</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setParamForm((p) => ({ ...p, designType: 'perspective_3d' }))}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                paramForm.designType === 'perspective_3d'
                  ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Phối cảnh 3D LED
            </button>
            <button
              type="button"
              onClick={() => setParamForm((p) => ({ ...p, designType: 'banner' }))}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                paramForm.designType === 'banner'
                  ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Banner khung LED
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Hồ sơ Lead / Khách hàng liên kết
          </label>
          <select
            data-testid="param-lead-select"
            value={paramForm.leadId}
            onChange={(e) => setParamForm((p) => ({ ...p, leadId: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
          >
            <option value="">-- Thiết kế độc lập (Không gắn Lead) --</option>
            {leadOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Người liên hệ / Đại diện</label>
          <input
            type="text"
            value={paramForm.contactName}
            onChange={(e) => setParamForm((p) => ({ ...p, contactName: e.target.value }))}
            placeholder="VD: Anh Minh — Ban Quản lý Tòa nhà"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Vị trí & bối cảnh lắp đặt
          </label>
          <input
            type="text"
            data-testid="param-installation-info"
            value={paramForm.installationInfo}
            onChange={(e) => setParamForm((p) => ({ ...p, installationInfo: e.target.value }))}
            placeholder="VD: Vách sảnh chính tầng trệt, cách sàn 1.2m"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Ghi chú kỹ thuật</label>
          <textarea
            rows={2}
            value={paramForm.notes}
            onChange={(e) => setParamForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Ghi chú kết cấu khung, nguồn điện, yêu cầu thẩm mỹ..."
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
          />
        </div>
      </div>

      {/* SECTION 2: THÔNG SỐ KỸ THUẬT LED */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div>
            <h3 className="text-base font-bold text-slate-900">2. Thông số kỹ thuật LED</h3>
            <p className="text-xs text-slate-500">Sản phẩm phê duyệt, bước điểm ảnh (mm) & kích thước (m)</p>
          </div>
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-mono font-bold text-slate-700">
            {paramForm.pixelPitch} · {computedLiveSpecs.areaM2} m²
          </span>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Dòng sản phẩm Toàn Trung phê duyệt
          </label>
          <select
            data-testid="param-product-select"
            value={paramForm.productId}
            onChange={(e) => setParamForm((p) => ({ ...p, productId: Number(e.target.value) || 1 }))}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
          >
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Bước điểm ảnh (mm)
            </label>
            <select
              data-testid="param-pixel-pitch"
              value={paramForm.pixelPitch}
              onChange={(e) => setParamForm((p) => ({ ...p, pixelPitch: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-[#2563EB] focus:outline-none"
            >
              <option value="P1.25">P1.25 (1.25 mm)</option>
              <option value="P1.53">P1.53 (1.53 mm)</option>
              <option value="P1.86">P1.86 (1.86 mm)</option>
              <option value="P2.0">P2.0 (2.00 mm)</option>
              <option value="P2.5">P2.5 (2.50 mm)</option>
              <option value="P3.0">P3.0 (3.00 mm)</option>
              <option value="P4.0">P4.0 (4.00 mm)</option>
              <option value="P5.0">P5.0 (5.00 mm)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Kiểu màn hình</label>
            <select
              value={paramForm.screenStyle}
              onChange={(e) =>
                setParamForm((p) => ({
                  ...p,
                  screenStyle: e.target.value as 'flat' | 'curved' | 'corner_90',
                }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#2563EB] focus:outline-none"
            >
              <option value="flat">Màn hình phẳng</option>
              <option value="curved">Màn hình cong</option>
              <option value="corner_90">Vuông góc 90° (3D)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Chiều ngang LED (m)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="200"
              data-testid="param-screen-width-m"
              value={paramForm.screenWidthM}
              onChange={(e) => {
                const nextW = Number(e.target.value) || 0.5;
                const ratioNum = parseAspectRatioValue(paramForm.aspectRatio);
                setParamForm((prev) => ({
                  ...prev,
                  screenWidthM: nextW,
                  screenHeightM:
                    prev.aspectLocked && ratioNum
                      ? Number((nextW / ratioNum).toFixed(2))
                      : prev.screenHeightM,
                }));
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-semibold text-slate-900 focus:border-[#2563EB] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Chiều cao LED (m)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="100"
              data-testid="param-screen-height-m"
              value={paramForm.screenHeightM}
              onChange={(e) => {
                const nextH = Number(e.target.value) || 0.5;
                const ratioNum = parseAspectRatioValue(paramForm.aspectRatio);
                setParamForm((prev) => ({
                  ...prev,
                  screenHeightM: nextH,
                  screenWidthM:
                    prev.aspectLocked && ratioNum
                      ? Number((nextH * ratioNum).toFixed(2))
                      : prev.screenWidthM,
                }));
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-semibold text-slate-900 focus:border-[#2563EB] focus:outline-none"
            />
          </div>
        </div>

        {/* Computed LED Engineering Summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Diện tích hiển thị thực tế:</span>
            <span className="font-bold text-slate-900">{computedLiveSpecs.areaM2} m²</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Độ phân giải điểm ảnh thực:</span>
            <span className="font-mono font-bold text-[#1E3A8A]">
              {computedLiveSpecs.resW} × {computedLiveSpecs.resH} px
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Cấu hình Cabinet (640×480mm):</span>
            <span className="font-semibold text-slate-800">
              {computedLiveSpecs.cabinetCount} Cabinet ({computedLiveSpecs.moduleCount} Module 320×160mm)
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Bộ xử lý & Nguồn cấp:</span>
            <span className="font-semibold text-slate-800">Novastar VX600 · Meanwell 5V-40A</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Công suất tiêu thụ (TB / Cực đại):</span>
            <span className="font-semibold text-slate-800">
              {computedLiveSpecs.avgKw} kW / {computedLiveSpecs.maxKw} kW
            </span>
          </div>
        </div>
      </div>

      {/* SECTION 3: CÀI ĐẶT ĐẦU RA */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between space-y-3.5">
        <div className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-base font-bold text-slate-900">3. Cài đặt đầu ra</h3>
              <p className="text-xs text-slate-500">
                Tỷ lệ khung hình, khóa tỷ lệ & độ phân giải xuất file (px)
              </p>
            </div>
            <button
              type="button"
              data-testid="param-aspect-lock-btn"
              onClick={() => setParamForm((p) => ({ ...p, aspectLocked: !p.aspectLocked }))}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                paramForm.aspectLocked
                  ? 'border-blue-200 bg-blue-50 text-[#1E3A8A]'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
              title="Khóa hoặc mở khóa tỷ lệ khung hình khi nhập kích thước"
            >
              {paramForm.aspectLocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
              <span>{paramForm.aspectLocked ? 'Đã khóa tỷ lệ' : 'Tỷ lệ tự do'}</span>
            </button>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Tỷ lệ khung hình chuẩn
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['16:9', '9:16', '4:3', '21:9', '1:1', '32:9'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleAspectRatioChange(r)}
                  className={`rounded-xl border py-1.5 text-xs font-bold transition ${
                    paramForm.aspectRatio === r
                      ? 'border-[#1E3A8A] bg-[#1E3A8A] text-white'
                      : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Chiều rộng ảnh xuất (px)
              </label>
              <input
                type="number"
                min="128"
                max="15360"
                data-testid="param-banner-width-px"
                value={paramForm.bannerWidthPx}
                onChange={(e) => {
                  const nextPxW = Number(e.target.value) || 1920;
                  const ratioNum = parseAspectRatioValue(paramForm.aspectRatio);
                  setParamForm((prev) => ({
                    ...prev,
                    bannerWidthPx: nextPxW,
                    bannerHeightPx:
                      prev.aspectLocked && ratioNum
                        ? Math.max(64, Math.round(nextPxW / ratioNum))
                        : prev.bannerHeightPx,
                  }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-semibold text-slate-900 focus:border-[#2563EB] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Chiều cao ảnh xuất (px)
              </label>
              <input
                type="number"
                min="64"
                max="8640"
                data-testid="param-banner-height-px"
                value={paramForm.bannerHeightPx}
                onChange={(e) => {
                  const nextPxH = Number(e.target.value) || 1080;
                  const ratioNum = parseAspectRatioValue(paramForm.aspectRatio);
                  setParamForm((prev) => ({
                    ...prev,
                    bannerHeightPx: nextPxH,
                    bannerWidthPx:
                      prev.aspectLocked && ratioNum
                        ? Math.max(128, Math.round(nextPxH * ratioNum))
                        : prev.bannerWidthPx,
                  }));
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono font-semibold text-slate-900 focus:border-[#2563EB] focus:outline-none"
              />
            </div>
          </div>

          {paramForm.designType === 'perspective_3d' ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700 space-y-1">
              <div className="font-bold text-[#1E3A8A]">Tọa độ khung neo phối cảnh 4 góc (%)</div>
              <div className="font-mono text-[11px] text-slate-600">
                TL({quad.topLeft.x}%, {quad.topLeft.y}%) · TR({quad.topRight.x}%, {quad.topRight.y}%) · BR(
                {quad.bottomRight.x}%, {quad.bottomRight.y}%) · BL({quad.bottomLeft.x}%, {quad.bottomLeft.y}%)
              </div>
              <button
                type="button"
                onClick={() =>
                  setQuad({
                    topLeft: { x: 64.2, y: 44.5 },
                    topRight: { x: 93.8, y: 45.2 },
                    bottomRight: { x: 94.5, y: 72.8 },
                    bottomLeft: { x: 64.5, y: 70.1 },
                  })
                }
                className="text-xs font-semibold text-[#2563EB] hover:underline pt-0.5"
              >
                Đặt lại vị trí neo mặc định
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-slate-700">
              <div className="font-bold text-[#1E3A8A]">Chế độ thiết kế Banner truyền thông LED</div>
              <p className="mt-0.5 text-slate-600">
                Xuất file đồ họa chuẩn pixel theo đúng tỷ lệ module cabin LED để nạp trực tiếp vào bộ xử lý Novastar.
              </p>
            </div>
          )}

          {paramValidationError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
              {paramValidationError}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="submit"
            data-testid="save-project-params-btn"
            disabled={savingParams || !canUseAiDesign}
            className="w-full rounded-xl bg-[#1E3A8A] px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-[#2563EB] disabled:opacity-50"
          >
            {savingParams ? 'Đang lưu thông số...' : 'Lưu thông số dự án'}
          </button>
        </div>
      </div>
    </form>
  );

  const canvasRatio = (() => {
    const [w, h] = String(currentProject?.aspectRatio || '16:9').split(':').map(Number);
    return w > 0 && h > 0 ? w / h : 16 / 9;
  })();
  const aiConnected = Boolean(providerStatus?.isConfigured);

  return (
    <div className="flex h-full w-full flex-col bg-slate-50 font-sans text-slate-800 antialiased overflow-hidden select-none">
      {/* 1. COMPACT STUDIO TOOLBAR WITH 3 PROMINENT WORKSPACE AREAS */}
      <div className="flex h-12 w-full shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3">
        {/* Left: Active Project Title, Type Badge & Lead Reference */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span
            className="text-[15px] font-semibold text-slate-900 truncate max-w-[180px] xl:max-w-[320px]"
            title={currentProject ? `${currentProject.projectName} · ${DESIGN_TYPE_LABELS[currentProject.designType]} · ${DESIGN_STATUS_LABELS[currentProject.status]}` : undefined}
          >
            {currentProject ? currentProject.projectName : 'Dự án thiết kế'}
          </span>
          {currentProject?.leadCode && (
            <a
              href={`/leads?search=${encodeURIComponent(currentProject.leadCode)}`}
              className="hidden lg:inline-flex items-center gap-1 rounded-lg bg-blue-50/70 px-2 py-0.5 text-xs font-mono font-semibold text-[#1E3A8A] hover:bg-blue-100 transition"
              title="Mở hồ sơ Lead liên kết"
            >
              <span>Lead: {currentProject.leadCode}</span>
            </a>
          )}
        </div>

        {/* Center: THREE PROMINENT WORKSPACE AREAS ("Phối cảnh", "Trợ lý AI", "Thông số") */}
        <div
          role="tablist"
          aria-label="Khu vực làm việc Studio"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-0.5 border border-slate-200"
        >
          <button
            type="button"
            role="tab"
            data-testid="workspace-tab-perspective"
            aria-selected={activeWorkspaceArea === 'perspective'}
            onClick={() => {
              setActiveWorkspaceArea('perspective');
              setMobilePane('canvas');
            }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-sm font-semibold transition ${
              activeWorkspaceArea === 'perspective'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <Monitor className="h-4 w-4" />
            <span>Phối cảnh</span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="workspace-tab-assistant"
            aria-selected={activeWorkspaceArea === 'assistant'}
            onClick={() => {
              setActiveWorkspaceArea('assistant');
              setSideDockTab('assistant');
              setMobilePane('assistant');
            }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-sm font-semibold transition ${
              activeWorkspaceArea === 'assistant'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Tạo ảnh AI</span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="workspace-tab-specs"
            aria-selected={activeWorkspaceArea === 'specs'}
            onClick={() => {
              setActiveWorkspaceArea('specs');
              setSideDockTab('specs');
            }}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1 text-sm font-semibold transition ${
              activeWorkspaceArea === 'specs'
                ? 'bg-[#1E3A8A] text-white shadow-xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <Settings2 className="h-4 w-4" />
            <span>Thông số</span>
          </button>
        </div>

        {/* Right: Provider Status, Excel Export, ZIP Download & Approve Final */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleFocusCanvas}
            aria-pressed={focusCanvas}
            title={focusCanvas ? 'Hiện lại cột Dự án và Trợ lý AI' : 'Ẩn hai cột bên để xem ảnh to hơn'}
            className={`hidden md:inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] ${
              focusCanvas
                ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {focusCanvas ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden xl:inline">{focusCanvas ? 'Thu nhỏ ảnh' : 'Mở rộng ảnh'}</span>
          </button>
          <div
            className={`hidden xl:flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border ${
              providerStatus?.isConfigured
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
            title={providerStatus?.notes || providerStatus?.statusLabel}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                providerStatus?.isConfigured ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>{aiConnected ? `AI: ${providerStatus?.providerName || 'đã kết nối'}` : 'Chưa kết nối AI · mô phỏng'}</span>
          </div>

          {canExport && (
            <a
              href="/api/v1/design/export"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50"
              title="Xuất báo cáo Excel Dự án & Kho ảnh (05_DuAn_AI_KhoAnh.xlsx)"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="hidden 2xl:inline">Xuất Excel</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => handleDownloadProjectZip('all')}
            disabled={!currentProject}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
            title="Tải gói ZIP Kho ảnh dự án (Ảnh kỹ thuật + Bản thiết kế)"
          >
            <FileArchive className="h-4 w-4 text-[#1E3A8A]" />
            <span className="hidden 2xl:inline">Tải ZIP</span>
          </button>

          {canUseAiDesign && (
            <button
              type="button"
              onClick={handleSaveFinished}
              disabled={!currentProject || !currentVersion || savingFinal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A8A] px-3.5 py-1.5 text-sm font-semibold text-white shadow-2xs transition hover:bg-[#2563EB] disabled:opacity-50"
              title="Phê duyệt phiên bản đang chọn làm bản thiết kế chính thức bàn giao cho Lead / Sales"
            >
              <Check className="h-4 w-4" />
              <span>{savingFinal ? 'Đang duyệt...' : 'Duyệt bản chốt'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Error / Toast Banner */}
      {error && (
        <div className="flex items-center justify-between bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs font-bold underline ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Mobile Switcher (<768px) */}
      <div className="md:hidden grid grid-cols-3 gap-1 bg-white border-b border-slate-200 px-3 py-1.5 shrink-0 text-xs font-bold">
        {[
          { id: 'projects' as const, label: 'Dự án & Kho ảnh' },
          { id: 'canvas' as const, label: 'Phối cảnh' },
          { id: 'assistant' as const, label: 'Trợ lý & Thông số' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobilePane(tab.id)}
            className={`py-1.5 rounded-lg text-center transition ${
              mobilePane === tab.id ? 'bg-[#1E3A8A] text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 2. MAIN STUDIO BODY */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        {/* ================= LEFT SIDEBAR: "Dự án" & "Kho ảnh dự án" (NO PARAMETER INPUTS HERE) ================= */}
        <aside
          className={`${
            mobilePane === 'projects' ? 'flex w-full' : 'hidden'
          } ${focusCanvas ? 'md:hidden' : 'md:flex'} md:w-64 xl:w-72 shrink-0 flex-col h-full min-h-0 border-r border-slate-200 bg-white overflow-hidden`}
        >
          {/* SECTION A: "Dự án" (Compact Searchable List) */}
          <div className="flex flex-col min-h-0 basis-1/2 border-b border-slate-200 p-3.5">
            <div className="mb-2.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 whitespace-nowrap">Dự án</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {filteredProjects.length}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowArchivedProjects((v) => !v)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    showArchivedProjects
                      ? 'bg-amber-100 text-amber-800'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  title="Hiện/ẩn dự án đã lưu trữ"
                >
                  Lưu trữ
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#1E3A8A] px-2.5 py-1 text-xs font-bold text-white shadow-2xs transition hover:bg-[#2563EB]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Mới</span>
                </button>
              </div>
            </div>

            <div className="mb-2.5 shrink-0">
              <input
                type="text"
                placeholder="Tìm tên dự án, mã Lead..."
                value={searchProject}
                onChange={(e) => setSearchProject(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>

            {/* Scrollable Project List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1">
              {filteredProjects.map((proj) => {
                const isSelected = proj.id === currentProject?.id;
                const photoThumb = resolveAssetUrl(proj.photos[0]?.url || proj.sitePhotoDownloadUrl);
                const menuOpen = openMenuProjectId === proj.id;

                return (
                  <div
                    key={proj.id}
                    data-testid={`project-item-${proj.id}`}
                    title={[proj.projectName, proj.leadCode ? `Lead ${proj.leadCode}` : null, proj.isArchived ? 'Đã lưu trữ' : null].filter(Boolean).join(' · ')}
                    onClick={() => {
                      syncProjectSelection(proj);
                      setOpenMenuProjectId(null);
                      setMobilePane('canvas');
                    }}
                    className={`group relative flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 ring-1 ring-[#2563EB]/30'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
                        <img
                          src={photoThumb}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                        {proj.projectName}
                      </span>
                      <span
                        aria-label={proj.status === 'completed' ? 'Đã hoàn thành' : 'Đang thực hiện'}
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          proj.isArchived
                            ? 'bg-slate-300'
                            : proj.status === 'completed'
                              ? 'bg-emerald-500'
                              : 'bg-blue-500'
                        }`}
                      />
                    </div>

                    {/* Secondary Actions in `...` Menu */}
                    <div className="relative shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="Thao tác dự án"
                        onClick={() => setOpenMenuProjectId(menuOpen ? null : proj.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {menuOpen && (
                        <div className="absolute right-0 top-8 z-30 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg text-xs font-semibold text-slate-700">
                          <button
                            type="button"
                            onClick={() => {
                              setRenameTargetId(proj.id);
                              setRenameValue(proj.projectName);
                              setEditingName(true);
                              setOpenMenuProjectId(null);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                          >
                            <Edit2 className="h-3.5 w-3.5 text-slate-500" />
                            <span>Đổi tên dự án</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleArchiveProject(proj)}
                            className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                          >
                            <Archive className="h-3.5 w-3.5 text-slate-500" />
                            <span>{proj.isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ dự án'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              setOpenMenuProjectId(null);
                              if (!confirm(`Bạn có chắc chắn muốn xóa dự án "${proj.projectName}"?`)) {
                                return;
                              }
                              try {
                                await apiRequest(`/api/v1/design/${proj.id}`, {
                                  method: 'DELETE',
                                  csrfToken: user?.csrfToken,
                                });
                                setSuccessToast(`Đã xóa dự án "${proj.projectName}".`);
                                await loadData();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Không thể xóa dự án.');
                              }
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 text-left"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Xóa dự án</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION B: "Kho ảnh dự án" (Two Project-Scoped Folders: "Ảnh kỹ thuật" & "Bản thiết kế") */}
          <div className="flex flex-col flex-1 min-h-0 p-3.5 bg-slate-50/50">
            <div className="mb-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <FolderOpen className="h-4 w-4 text-[#1E3A8A]" />
                <h3 className="text-sm font-bold text-slate-900">Kho ảnh dự án</h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleDownloadProjectZip(assetFolder === 'technical' ? 'technical' : 'designs')
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-[#1E3A8A] hover:bg-blue-50 transition"
                title="Tải xuống thư mục đang chọn dưới dạng ZIP"
              >
                <Download className="h-3 w-3" />
                <span>
                  {selectedAssetIds.length > 0 ? `Tải ZIP (${selectedAssetIds.length})` : 'Tải ZIP'}
                </span>
              </button>
            </div>

            {/* Folder Tabs: "Ảnh kỹ thuật" vs "Bản thiết kế" */}
            <div className="mb-2.5 grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 text-xs font-bold shrink-0">
              <button
                type="button"
                data-testid="folder-tab-technical"
                onClick={() => setAssetFolder('technical')}
                className={`rounded-lg py-1.5 transition ${
                  assetFolder === 'technical'
                    ? 'bg-white text-[#1E3A8A] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Ảnh kỹ thuật ({currentProject?.photos.length || 0})
              </button>
              <button
                type="button"
                data-testid="folder-tab-designs"
                onClick={() => setAssetFolder('designs')}
                className={`rounded-lg py-1.5 transition ${
                  assetFolder === 'designs'
                    ? 'bg-white text-[#1E3A8A] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Bản thiết kế ({currentProject?.assetVersions.length || 0})
              </button>
            </div>

            {/* Folder Content List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {assetFolder === 'technical' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {currentProject?.photos.map((photo) => {
                      const resolvedSrc = resolveAssetUrl(photo.url);
                      const isChecked = selectedAssetIds.includes(photo.id);
                      return (
                        <div
                          key={photo.id}
                          onClick={async () => {
                            if (!currentProject) return;
                            setViewMode('original');
                            await apiRequest(`/api/v1/design/${currentProject.id}`, {
                              method: 'PATCH',
                              csrfToken: user?.csrfToken,
                              body: {
                                action: 'update_project',
                                selectedPhotoId: photo.id,
                              },
                            });
                            await loadData(currentProject.id);
                          }}
                          className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white transition ${
                            photo.selected
                              ? 'border-[#2563EB] ring-2 ring-blue-500/20'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="relative aspect-video w-full bg-slate-900">
                            <img
                              src={resolvedSrc}
                              alt={photo.name}
                              className="h-full w-full object-cover"
                            />
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleAssetSelection(photo.id)}
                              className="absolute left-1.5 top-1.5 h-3.5 w-3.5 rounded border-white"
                              title="Chọn ảnh để tải gói ZIP"
                            />
                            {photo.selected && (
                              <span className="absolute right-1.5 top-1.5 rounded bg-[#1E3A8A] px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                                Đang dùng
                              </span>
                            )}
                          </div>
                          <div className="p-1.5 text-xs">
                            <div className="truncate font-semibold text-slate-800">{photo.name}</div>
                            <div
                              className="mt-1 flex items-center justify-between text-[11px] text-slate-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!currentProject) return;
                                  const nextName = prompt('Đổi tên ảnh kỹ thuật:', photo.name);
                                  if (nextName && nextName.trim()) {
                                    await apiRequest(`/api/v1/design/${currentProject.id}`, {
                                      method: 'PATCH',
                                      csrfToken: user?.csrfToken,
                                      body: {
                                        action: 'update_project',
                                        renamePhotoId: photo.id,
                                        renamePhotoName: nextName.trim(),
                                      },
                                    });
                                    await loadData(currentProject.id);
                                  }
                                }}
                                className="hover:text-[#2563EB]"
                              >
                                Đổi tên
                              </button>
                              <a
                                href={resolvedSrc}
                                download={photo.name}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-[#1E3A8A]"
                              >
                                Tải
                              </a>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!currentProject) return;
                                  if (!confirm(`Xóa ảnh kỹ thuật "${photo.name}"?`)) return;
                                  try {
                                    await apiRequest(
                                      `/api/v1/design/${currentProject.id}?photoId=${encodeURIComponent(photo.id)}`,
                                      {
                                        method: 'DELETE',
                                        csrfToken: user?.csrfToken,
                                      }
                                    );
                                    await loadData(currentProject.id);
                                  } catch (err) {
                                    setError(err instanceof Error ? err.message : 'Không thể xóa ảnh.');
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

                  {/* Upload Multiple Technical Photos & Import from Lead */}
                  <div className="pt-1 space-y-1.5">
                    <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white py-2 text-xs font-semibold text-slate-700 transition hover:border-[#2563EB] hover:bg-blue-50/40 hover:text-[#1E3A8A]">
                      <Upload className="h-3.5 w-3.5" />
                      <span>{uploadingPhoto ? 'Đang tải ảnh...' : 'Tải ảnh kỹ thuật (Nhiều tệp)'}</span>
                      <input
                        type="file"
                        multiple
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleUploadTechnicalPhotos}
                      />
                    </label>

                    {currentProject?.leadId && (
                      <button
                        type="button"
                        onClick={handleImportLeadPhotos}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/60 py-1.5 text-xs font-semibold text-[#1E3A8A] hover:bg-blue-100 transition"
                      >
                        <ImageIcon className="h-3.5 w-3.5" />
                        <span>Nhập ảnh khảo sát từ hồ sơ Lead</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {currentProject?.assetVersions.map((ver) => {
                      const thumbUrl = `/api/v1/design/asset/${ver.id}`;
                      const isSelectedVer = ver.id === currentVersion?.id;
                      const isChecked = selectedAssetIds.includes(`ver-${ver.id}`);
                      return (
                        <div
                          key={ver.id}
                          onClick={() => {
                            setSelectedVersionId(ver.id);
                            setViewMode('result');
                            setActiveWorkspaceArea('perspective');
                          }}
                          className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white transition ${
                            isSelectedVer
                              ? 'border-[#2563EB] ring-2 ring-blue-500/20'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="relative aspect-video w-full bg-slate-900">
                            <img
                              src={thumbUrl}
                              alt={`Phiên bản v${ver.versionNumber}`}
                              className="h-full w-full object-cover"
                            />
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleAssetSelection(`ver-${ver.id}`)}
                              className="absolute left-1.5 top-1.5 h-3.5 w-3.5 rounded border-white"
                              title="Chọn bản thiết kế để tải ZIP"
                            />
                            {ver.isApprovedFinal && (
                              <span className="absolute right-1.5 top-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                                Bản chốt
                              </span>
                            )}
                          </div>
                          <div className="p-1.5 text-xs">
                            <div className="truncate font-bold text-slate-800">
                              v{ver.versionNumber} ·{' '}
                              {ver.sourceType === 'DESIGNER_FINAL_UPLOAD' ? 'Bản Designer' : 'Bản AI'}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">
                              {ver.promptUsed || `Phiên bản v${ver.versionNumber}`}
                            </div>
                            <div
                              className="mt-1 flex items-center justify-between text-[11px] text-slate-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!currentProject) return;
                                  const nextLabel = prompt(
                                    `Đổi tên/ghi chú phiên bản v${ver.versionNumber}:`,
                                    ver.promptUsed || `Bản thiết kế v${ver.versionNumber}`
                                  );
                                  if (nextLabel && nextLabel.trim()) {
                                    await apiRequest(`/api/v1/design/${currentProject.id}`, {
                                      method: 'PATCH',
                                      csrfToken: user?.csrfToken,
                                      body: {
                                        action: 'update_project',
                                        renameVersionId: ver.id,
                                        renameVersionLabel: nextLabel.trim(),
                                      },
                                    });
                                    await loadData(currentProject.id);
                                  }
                                }}
                                className="hover:text-[#2563EB]"
                              >
                                Đổi tên
                              </button>
                              <a
                                href={thumbUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-[#1E3A8A] hover:underline"
                              >
                                Tải ảnh
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Upload Final Render by Designer */}
                  {canUseAiDesign && (
                    <label className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-white py-2 text-xs font-semibold text-[#1E3A8A] transition hover:bg-blue-50">
                      <Upload className="h-3.5 w-3.5" />
                      <span>
                        {uploadingFinalFile ? 'Đang tải bản chốt...' : 'Tải bản thiết kế hoàn thiện'}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={handleUploadDesignerFinal}
                      />
                    </label>
                  )}
                </>
              )}
            </div>
          </div>
        </aside>

        {/* ================= MAIN WORKSPACE AREA ================= */}
        {activeWorkspaceArea === 'specs' ? (
          /* FULL-WIDTH "THÔNG SỐ" WORKSPACE AREA */
          <div className="flex-1 overflow-y-auto p-5 bg-slate-100">
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-2xs">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Thông số dự án & Cấu hình kỹ thuật LED
                  </h2>
                  <p className="text-sm text-slate-500">
                    Mọi thay đổi được lưu trực tiếp vào hồ sơ dự án và giữ nguyên khi chuyển dự án hoặc tải lại trang.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveWorkspaceArea('perspective')}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Quay lại Phối cảnh
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveParameters()}
                    disabled={savingParams || !canUseAiDesign}
                    className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-[#2563EB] disabled:opacity-50"
                  >
                    {savingParams ? 'Đang lưu...' : 'Lưu thông số dự án'}
                  </button>
                </div>
              </div>

              {renderParametersFormContent(false)}
            </div>
          </div>
        ) : (
          /* "PHỐI CẢNH" CANVAS + RIGHT DOCK ("TRỢ LÝ AI" / "THÔNG SỐ") */
          <>
            <div
              className={`${
                mobilePane === 'canvas' ? 'flex' : 'hidden md:flex'
              } flex-1 flex-col overflow-hidden bg-slate-100`}
            >
              {/* MAIN CENTERED CANVAS */}
              <div className="relative flex-1 min-h-0 overflow-hidden p-2 flex items-center justify-center [container-type:size]">
                {/* Lớp nổi: chế độ xem + thông báo ngắn (không chiếm chiều cao riêng) */}
                <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
                  <div
                    role="group"
                    aria-label="Chế độ xem ảnh"
                    className="flex items-center rounded-lg bg-white/95 p-0.5 text-[13px] font-semibold shadow-md ring-1 ring-slate-200"
                  >
                    {(
                      [
                        { id: 'original', label: 'Ảnh gốc' },
                        { id: 'result', label: 'Kết quả' },
                        { id: 'compare', label: 'So sánh' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`view-mode-${m.id}`}
                        aria-pressed={viewMode === m.id}
                        onClick={() => setViewMode(m.id)}
                        className={`rounded-md px-3 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] ${
                          viewMode === m.id ? 'bg-[#1E3A8A] text-white' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {currentVersion && viewMode !== 'original' && (
                    <span className="rounded-lg bg-slate-900/75 px-2.5 py-1 text-[13px] font-medium text-white">
                      v{currentVersion.versionNumber} · {currentProject?.aspectRatio || '16:9'}
                    </span>
                  )}
                </div>
                {successToast && (
                  <div
                    role="status"
                    className="absolute left-1/2 top-3 z-20 -translate-x-1/2 max-w-[60%] truncate rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-medium text-white shadow-md"
                  >
                    {successToast}
                  </div>
                )}
                <div
                  ref={canvasContainerRef}
                  onMouseMove={handleMouseMoveCanvas}
                  onMouseUp={handleMouseUpCanvas}
                  onMouseLeave={handleMouseUpCanvas}
                  style={{
                    aspectRatio: String(canvasRatio),
                    width: `min(100cqw, calc(100cqh * ${canvasRatio}))`,
                    transform: `scale(${zoomLevel / 100})`,
                    transformOrigin: 'center center',
                    transition:
                      draggingHandle || draggingCompare ? 'none' : 'transform 0.15s ease-out',
                  }}
                  className="relative select-none overflow-hidden rounded-xl bg-slate-900 shadow-lg"
                >
                  {/* 1. MODE: ORIGINAL ("Ảnh gốc") -> Renders Input Photo from Ảnh kỹ thuật */}
                  {viewMode === 'original' && (
                    <img
                      data-testid="canvas-original-image"
                      src={sitePhotoUrl}
                      alt={selectedPhoto?.name || 'Ảnh kỹ thuật gốc'}
                      className="h-full w-full object-cover"
                    />
                  )}

                  {/* 2. MODE: RESULT ("Kết quả") -> Renders Selected Output Version from Bản thiết kế */}
                  {viewMode === 'result' && (
                    <img
                      data-testid="canvas-result-image"
                      src={versionImageUrl}
                      alt={
                        currentVersion
                          ? `Bản thiết kế v${currentVersion.versionNumber}`
                          : 'Bản thiết kế AI'
                      }
                      className="h-full w-full object-cover"
                    />
                  )}

                  {/* 3. MODE: COMPARE ("So sánh") -> Renders TWO ACTUAL DISTINCT IMAGES (Original left, Result right) */}
                  {viewMode === 'compare' && (
                    <div className="relative h-full w-full">
                      {/* Left / Base Layer: Original Input Photo */}
                      <img
                        data-testid="compare-original-image"
                        src={sitePhotoUrl}
                        alt="Ảnh kỹ thuật gốc (Trước)"
                        className="h-full w-full object-cover"
                      />
                      {/* Right / Clipped Layer: Selected Output Version Image */}
                      <img
                        data-testid="compare-result-image"
                        src={versionImageUrl}
                        alt={
                          currentVersion
                            ? `Bản thiết kế v${currentVersion.versionNumber} (Sau)`
                            : 'Bản thiết kế (Sau)'
                        }
                        style={{
                          clipPath: `inset(0 0 0 ${compareSplit}%)`,
                        }}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <span className="absolute left-3 bottom-12 rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs font-bold text-white">
                        Ảnh gốc: {selectedPhoto?.name || 'Hiện trạng'}
                      </span>
                      <span className="absolute right-3 bottom-12 rounded-lg bg-[#1E3A8A]/90 px-2.5 py-1 text-xs font-bold text-white">
                        Kết quả: v{currentVersion?.versionNumber || 1}
                      </span>
                    </div>
                  )}

                  {/* Interactive 4-Corner Placement Quad Overlay for 3D Perspective */}
                  {!isBannerProject && showHandles && (
                    <div className="absolute inset-0 pointer-events-none">
                      <svg className="absolute inset-0 h-full w-full pointer-events-none">
                        <polygon
                          points={`${quad.topLeft.x}%,${quad.topLeft.y}% ${quad.topRight.x}%,${quad.topRight.y}% ${quad.bottomRight.x}%,${quad.bottomRight.y}% ${quad.bottomLeft.x}%,${quad.bottomLeft.y}%`}
                          fill="rgba(37, 99, 235, 0.14)"
                          stroke="#60a5fa"
                          strokeWidth="2"
                          strokeDasharray="6 4"
                        />
                      </svg>

                      {/* Floating Dimension Badge */}
                      <div
                        style={{
                          left: `${(quad.topLeft.x + quad.topRight.x) / 2}%`,
                          top: `${Math.max(6, Math.min(quad.topLeft.y, quad.topRight.y) - 5)}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className="pointer-events-auto absolute flex items-center rounded-full bg-slate-900/90 px-3 py-1 text-xs font-bold text-white shadow-lg border border-white/20"
                      >
                        <span>
                          {paramForm.screenWidthM.toFixed(2).replace('.', ',')} ×{' '}
                          {paramForm.screenHeightM.toFixed(2).replace('.', ',')} m ·{' '}
                          {paramForm.pixelPitch}
                        </span>
                      </div>

                      {(['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const).map(
                        (corner) => (
                          <div
                            key={corner}
                            onMouseDown={handleMouseDownHandle(corner)}
                            style={{
                              left: `${quad[corner].x}%`,
                              top: `${quad[corner].y}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            className={`pointer-events-auto absolute h-4 w-4 cursor-crosshair rounded-full border-2 border-white bg-[#2563EB] shadow-lg transition-transform hover:scale-125 ${
                              draggingHandle === corner ? 'ring-4 ring-blue-400' : ''
                            }`}
                            title={`Kéo góc neo ${corner}`}
                          />
                        )
                      )}
                    </div>
                  )}

                  {/* Compare Mode Draggable Split Handle */}
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
                        className="pointer-events-auto absolute top-1/2 -ml-4 -mt-4 flex h-8 w-8 cursor-ew-resize items-center justify-center rounded-full bg-white shadow-lg text-xs font-bold text-slate-800 hover:scale-110 transition-transform"
                        title="Kéo để so sánh Ảnh gốc và Bản thiết kế"
                      >
                        ↔
                      </div>
                    </div>
                  )}

                  {/* Top-Right Canvas Controls (Placement Handles & Fullscreen) */}
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-xl bg-slate-900/80 p-1 backdrop-blur-xs text-white text-xs">
                    {!isBannerProject && (
                      <button
                        type="button"
                        onClick={() => setShowHandles(!showHandles)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 font-semibold transition ${
                          showHandles ? 'bg-white/20' : 'hover:bg-white/10'
                        }`}
                        title="Hiện/Ẩn khung neo màn hình LED"
                      >
                        <Edit2 className="h-3 w-3" />
                        <span>Khung neo LED</span>
                      </button>
                    )}
                    <button
                      type="button"
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

                  {/* Bottom-Right Zoom & Fit Controls */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-xl bg-slate-900/80 px-2.5 py-1 backdrop-blur-xs text-white text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                      className="p-1 hover:text-blue-300"
                      title="Thu nhỏ"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-11 text-center">{zoomLevel}%</span>
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.min(200, z + 10))}
                      className="p-1 hover:text-blue-300"
                      title="Phóng to"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(100)}
                      className="ml-1 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-xs"
                      title="Vừa khung hình"
                    >
                      Vừa khung
                    </button>
                  </div>
                </div>
              </div>

              {/* Dải phiên bản: 1 hàng gọn */}
              <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 flex items-center gap-3">
                <span className="text-[13px] font-semibold text-slate-700 whitespace-nowrap">
                  Phiên bản ({currentProject?.assetVersions.length || 0})
                </span>
                <div className="flex flex-1 min-w-0 items-center gap-2 overflow-x-auto">
                  {(currentProject?.assetVersions.length || 0) === 0 && (
                    <span className="text-[13px] text-slate-500">Chưa có phiên bản nào.</span>
                  )}
                  {currentProject?.assetVersions.map((ver) => {
                    const isSelected = ver.id === currentVersion?.id;
                    return (
                      <button
                        key={ver.id}
                        type="button"
                        data-testid={`version-card-v${ver.versionNumber}`}
                        title={`Phiên bản v${ver.versionNumber}${ver.isApprovedFinal ? ' · Đã duyệt' : ''}`}
                        onClick={() => {
                          setSelectedVersionId(ver.id);
                          if (viewMode === 'original') setViewMode('result');
                        }}
                        className={`relative shrink-0 h-10 w-16 overflow-hidden rounded-md border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E3A8A] ${
                          isSelected ? 'border-[#2563EB]' : 'border-transparent hover:border-slate-300'
                        }`}
                      >
                        <img
                          src={`/api/v1/design/asset/${ver.id}`}
                          alt={`Phiên bản v${ver.versionNumber}`}
                          className="h-full w-full object-cover bg-slate-900"
                        />
                        <span className="absolute bottom-0 left-0 rounded-tr bg-slate-900/80 px-1 text-[11px] font-semibold text-white">
                          v{ver.versionNumber}
                        </span>
                        {ver.isApprovedFinal && (
                          <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {currentVersion && (
                  <a
                    href={`/api/v1/design/asset/${currentVersion.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-[13px] font-semibold text-[#1E3A8A] hover:underline"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải v{currentVersion.versionNumber}
                  </a>
                )}
              </div>
            </div>

            {/* ================= RIGHT STUDIO DOCK: "TRỢ LÝ AI" & COMPACT "THÔNG SỐ" ================= */}
            <aside
              className={`${
                mobilePane === 'assistant' || activeWorkspaceArea === 'assistant'
                  ? 'flex w-full md:w-80 xl:w-[22rem]'
                  : focusCanvas
                ? 'hidden'
                : 'hidden xl:flex xl:w-[22rem]'
              } shrink-0 flex-col border-l border-slate-200 bg-white h-full min-h-0`}
            >
              {/* Side Dock Switcher */}
              <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSideDockTab('assistant');
                      setActiveWorkspaceArea('assistant');
                    }}
                    className={`flex items-center gap-1.5 whitespace-nowrap py-2.5 text-sm font-semibold border-b-2 transition ${
                      sideDockTab === 'assistant'
                        ? 'border-[#1E3A8A] text-[#1E3A8A]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Sparkles className="h-4 w-4 text-[#2563EB]" />
                    <span>Tạo ảnh AI</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSideDockTab('specs')}
                    className={`flex items-center gap-1.5 whitespace-nowrap py-2.5 text-sm font-semibold border-b-2 transition ml-4 ${
                      sideDockTab === 'specs'
                        ? 'border-[#1E3A8A] text-[#1E3A8A]'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Settings2 className="h-4 w-4 text-slate-500" />
                    <span>Thông số</span>
                  </button>
                </div>

              </div>

              {sideDockTab === 'assistant' ? (
                <div className="flex flex-1 flex-col min-h-0 overflow-hidden p-3.5">
                  {/* Context Summary Card */}
                  <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        {paramForm.projectName} ({paramForm.pixelPitch})
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveWorkspaceArea('specs')}
                        className="font-semibold text-[#2563EB] hover:underline"
                      >
                        Sửa thông số
                      </button>
                    </div>
                    <div className="text-slate-600">
                      Kích thước: {paramForm.screenWidthM}m × {paramForm.screenHeightM}m (
                      {computedLiveSpecs.areaM2} m²) · Tỷ lệ {paramForm.aspectRatio}
                    </div>
                    <div className="text-slate-500 truncate">
                      Ảnh gốc đang chọn: {selectedPhoto?.name || 'Ảnh chính diện showroom'}
                    </div>
                  </div>

                  {/* Conversation History */}
                  <div className="min-h-0 shrink space-y-3 overflow-y-auto pr-1 text-sm">
                    {currentProject?.chatMessages.map((msg) => {
                      const isUser = msg.role === 'user';
                      return (
                        <div key={msg.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>{isUser ? 'Yêu cầu' : aiConnected ? `Kết quả từ ${providerStatus?.providerName || 'AI'}` : 'Kết quả mô phỏng'}</span>
                            {msg.versionNumber && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[11px] font-bold text-[#1E3A8A]">
                                Phiên bản v{msg.versionNumber}
                              </span>
                            )}
                          </div>
                          <div
                            className={`rounded-xl p-3 leading-relaxed text-sm ${
                              isUser
                                ? 'bg-slate-100 text-slate-900'
                                : msg.status === 'timeout' || msg.status === 'failed'
                                  ? 'border border-amber-200 bg-amber-50 text-amber-900'
                                  : 'border border-blue-100 bg-blue-50/60 text-slate-900 font-medium'
                            }`}
                          >
                            {!isUser && (
                              <Sparkles className="h-4 w-4 text-[#2563EB] inline mr-1.5 -mt-0.5" />
                            )}
                            <span>{msg.text}</span>
                            {aiConnected && msg.cost && (
                              <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 border-t border-slate-200/60 pt-1 font-normal">
                                <span>Thời gian: {msg.durationSec}s</span>
                                <span>·</span>
                                <span>Token: {msg.tokenUsed ?? '—'}</span>
                                <span>·</span>
                                <span>Chi phí: {msg.cost}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick Prompt Suggestions */}
                  <div className="mt-3 flex flex-wrap gap-1.5 shrink-0">
                    {[
                      'Giữ nguyên nội thất, hiển thị video sóng biển 4K sắc nét',
                      'Tăng độ sáng viền cabinet LED, ánh sáng phản chiếu sàn',
                      'Hiển thị slide hội nghị Toàn Trung nền xanh navy',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePromptChange(preset)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-[#1E3A8A] transition truncate max-w-full"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>

                  {/* PII Security Guard */}
                  {piiAlert && (
                    <div className="mt-2 flex items-start gap-2 rounded-xl bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                      <span>{piiAlert}</span>
                    </div>
                  )}

                  {/* Prompt Composer */}
                  <div className="flex-1" />
                  <form
                    onSubmit={handleSendChatEdit}
                    className="mt-2.5 shrink-0 pt-2.5 border-t border-slate-200"
                  >
                    <textarea
                      rows={3}
                      data-testid="ai-chat-prompt-input"
                      value={chatPrompt}
                      onChange={(e) => handlePromptChange(e.target.value)}
                      placeholder={aiConnected ? 'Mô tả yêu cầu dựng phối cảnh / chỉnh nội dung màn hình LED…' : 'Chưa kết nối AI — yêu cầu sẽ tạo ảnh mô phỏng để thử quy trình…'}
                      className="w-full resize-none rounded-xl border border-slate-200 p-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-[#2563EB] focus:outline-none"
                    />

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <span className="font-semibold whitespace-nowrap">Chế độ</span>
                        <select
                          value={chatQuality}
                          onChange={(e) =>
                            setChatQuality(e.target.value as 'draft' | 'high_quality')
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none"
                        >
                          <option value="draft">Nháp nhanh</option>
                          <option value="high_quality">Độ nét cao</option>
                        </select>
                      </div>

                      <button
                        type="submit"
                        data-testid="ai-chat-submit-btn"
                        disabled={!chatPrompt.trim() || submitting || Boolean(piiAlert) || !canUseAiDesign}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-bold text-white shadow-xs transition hover:bg-[#2563EB] disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Đang dựng...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            <span className="whitespace-nowrap">Tạo phiên bản</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto p-3.5">
                  {renderParametersFormContent(true)}
                </div>
              )}
            </aside>
          </>
        )}
      </div>

      {/* MODAL: CREATE PROJECT */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-3">Tạo dự án thiết kế mới</h3>
            <form onSubmit={handleCreateProject} className="space-y-3.5 text-sm">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Loại dự án:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProjectType('perspective_3d')}
                    className={`rounded-xl p-2.5 font-bold border text-center transition ${
                      newProjectType === 'perspective_3d'
                        ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Phối cảnh 3D LED
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProjectType('banner')}
                    className={`rounded-xl p-2.5 font-bold border text-center transition ${
                      newProjectType === 'banner'
                        ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Banner khung LED
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Hồ sơ Lead liên kết (Tùy chọn):
                </label>
                <select
                  value={newLeadId}
                  onChange={(e) => setNewLeadId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">-- Không gắn Lead (Thiết kế độc lập) --</option>
                  {leadOptions.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Người liên hệ:</label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Tên khách hàng / đại diện dự án"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mô tả yêu cầu dựng ban đầu *:
                </label>
                <textarea
                  rows={2}
                  required
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#1E3A8A] px-5 py-2 text-sm font-bold text-white hover:bg-[#2563EB] shadow-xs"
                >
                  {submitting ? 'Đang khởi tạo...' : 'Tạo dự án'}
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
            <h4 className="text-base font-bold text-slate-900 mb-2">Đổi tên dự án</h4>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingName(false);
                  setRenameTargetId(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleRenameProject}
                className="rounded-xl bg-[#1E3A8A] px-4 py-1.5 text-sm font-bold text-white"
              >
                Lưu tên mới
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
