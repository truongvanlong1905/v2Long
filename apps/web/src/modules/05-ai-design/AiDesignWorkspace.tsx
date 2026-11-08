'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DESIGN_STATUS_LABELS,
  DESIGN_TYPE_LABELS,
  hasBaPermission,
  type AiProviderCatalogItemDto,
  type AiProviderId,
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
  Cpu,
  Download,
  Edit2,
  Expand,
  Eye,
  FileArchive,
  FileSpreadsheet,
  FolderOpen,
  Image as ImageIcon,
  Info,
  KeyRound,
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
  Wand2,
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
  provider: AiProviderId;
  providerName: string;
  isConfigured: boolean;
  statusLabel: string;
  activeModel: string;
  costPerImageUsd: number;
  supportsInpainting: boolean;
  notes: string;
  defaultProviderId?: AiProviderId;
  defaultModelId?: string;
  autoFallbackToLocal?: boolean;
  availableProviders?: AiProviderCatalogItemDto[];
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

  // Canvas View Mode: 'original' (Ảnh gốc) | 'result' (Kết quả AI) | 'live_3d' (Ghép 3D Thực tế) | 'compare' (So sánh)
  const [viewMode, setViewMode] = useState<'original' | 'result' | 'live_3d' | 'compare'>('result');
  const [live3dTheme, setLive3dTheme] = useState<
    'ai_version' | 'conference_navy' | 'ocean_4k' | 'gala_stage' | 'factory_andon'
  >('conference_navy');
  const [savingComposite, setSavingComposite] = useState(false);

  // Multi-AI Provider & Model Switcher States
  const [selectedProviderId, setSelectedProviderId] = useState<AiProviderId>('google_imagen');
  const [selectedModelId, setSelectedModelId] = useState<string>('imagen-3.0-generate-002');
  const [showAiConfigModal, setShowAiConfigModal] = useState(false);
  const [configModalProviderId, setConfigModalProviderId] = useState<AiProviderId>('google_imagen');
  const [configApiKeyInput, setConfigApiKeyInput] = useState('');
  const [configEndpointInput, setConfigEndpointInput] = useState('');
  const [configCustomModelInput, setConfigCustomModelInput] = useState('');
  const [autoFallbackToLocal, setAutoFallbackToLocal] = useState(true);
  const [savingAiConfig, setSavingAiConfig] = useState(false);

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
  const [unmeasuredMode, setUnmeasuredMode] = useState<boolean>(false);
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

  // Modal: Quick Edit / Rename Project
  const [editingName, setEditingName] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [quickEditDesignType, setQuickEditDesignType] = useState<'perspective_3d' | 'banner'>('perspective_3d');
  const [quickEditLeadId, setQuickEditLeadId] = useState<string>('');
  const [quickEditContactName, setQuickEditContactName] = useState('');
  const [quickEditInstallInfo, setQuickEditInstallInfo] = useState('');
  const [quickEditWidthM, setQuickEditWidthM] = useState<number>(4.8);
  const [quickEditHeightM, setQuickEditHeightM] = useState<number>(2.7);
  const [quickEditPitch, setQuickEditPitch] = useState<string>('P2.5');
  const [savingQuickEdit, setSavingQuickEdit] = useState(false);

  // Multi-select Projects for Bulk Delete
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);

  // Custom Aesthetic Web Confirm & Input Modals (replaces native window.confirm / window.prompt)
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    subtitle?: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [promptModal, setPromptModal] = useState<{
    title: string;
    label: string;
    value: string;
    placeholder?: string;
    onConfirm: (val: string) => Promise<void> | void;
  } | null>(null);
  const [promptBusy, setPromptBusy] = useState(false);

  // Auto-dismiss successToast after 3.8s so it never clutters the screen
  useEffect(() => {
    if (!successToast) return;
    const timer = window.setTimeout(() => {
      setSuccessToast(null);
    }, 3800);
    return () => window.clearTimeout(timer);
  }, [successToast]);

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
        if (data.providerStatus) {
          const defPid = data.providerStatus.defaultProviderId || data.providerStatus.provider || 'google_imagen';
          setSelectedProviderId(defPid);
          setConfigModalProviderId(defPid);
          setSelectedModelId(data.providerStatus.defaultModelId || data.providerStatus.activeModel || 'imagen-3.0-generate-002');
          setAutoFallbackToLocal(data.providerStatus.autoFallbackToLocal ?? true);
          const activeCat = data.providerStatus.availableProviders?.find((p) => p.providerId === defPid);
          if (activeCat) {
            setConfigEndpointInput(activeCat.apiEndpoint || '');
            setConfigCustomModelInput(activeCat.activeModel || '');
          }
        }

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

  // Auto-estimated LED Cabinet dimensions directly from the 4 blue corner dots (when customer has no measurements yet)
  const quadEstimatedSpecs = useMemo(() => {
    const topW = Math.hypot(quad.topRight.x - quad.topLeft.x, (quad.topRight.y - quad.topLeft.y) * 0.56);
    const botW = Math.hypot(quad.bottomRight.x - quad.bottomLeft.x, (quad.bottomRight.y - quad.bottomLeft.y) * 0.56);
    const leftH = Math.hypot((quad.bottomLeft.x - quad.topLeft.x) * 1.77, quad.bottomLeft.y - quad.topLeft.y);
    const rightH = Math.hypot((quad.bottomRight.x - quad.topRight.x) * 1.77, quad.bottomRight.y - quad.topRight.y);

    const avgSpanW = Math.max(6, (topW + botW) / 2);
    const avgSpanH = Math.max(6, (leftH + rightH) / 2);

    // Map visual span % on a standard 16:9 room/hall photo to standard 640x480mm LED cabinets
    const cabinetCols = Math.max(2, Math.min(30, Math.round((avgSpanW / 100) * 18)));
    const cabinetRows = Math.max(2, Math.min(20, Math.round((avgSpanH / 100) * 12)));
    const estWidthM = Number((cabinetCols * 0.64).toFixed(2));
    const estHeightM = Number((cabinetRows * 0.48).toFixed(2));
    const visualRatio = Number((estWidthM / Math.max(0.48, estHeightM)).toFixed(2));

    let nearestStandardRatio = '16:9';
    if (Math.abs(visualRatio - 16 / 9) <= 0.25) nearestStandardRatio = '16:9';
    else if (Math.abs(visualRatio - 4 / 3) <= 0.22) nearestStandardRatio = '4:3';
    else if (Math.abs(visualRatio - 21 / 9) <= 0.35) nearestStandardRatio = '21:9';
    else if (Math.abs(visualRatio - 1) <= 0.2) nearestStandardRatio = '1:1';
    else if (visualRatio > 2.7) nearestStandardRatio = '32:9';

    return {
      cabinetCols,
      cabinetRows,
      totalCabinets: cabinetCols * cabinetRows,
      estWidthM,
      estHeightM,
      nearestStandardRatio,
    };
  }, [quad]);

  // Live computed LED hardware specs from paramForm (or quadEstimatedSpecs when in unmeasuredMode)
  const computedLiveSpecs = useMemo(() => {
    const w = unmeasuredMode
      ? quadEstimatedSpecs.estWidthM
      : Math.max(0.2, Number(paramForm.screenWidthM) || 4.8);
    const h = unmeasuredMode
      ? quadEstimatedSpecs.estHeightM
      : Math.max(0.2, Number(paramForm.screenHeightM) || 2.7);
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
      w,
      h,
      areaM2,
      pitchMm,
      resW,
      resH,
      cabinetCols,
      cabinetRows,
      cabinetCount,
      moduleCount,
      avgKw,
      maxKw,
    };
  }, [unmeasuredMode, quadEstimatedSpecs, paramForm.screenWidthM, paramForm.screenHeightM, paramForm.pixelPitch]);

  // Dragging logic for 4-corner placement & split comparison
  const handleMouseDownHandle = (corner: keyof QuadCoordinatesDto) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Automatically switch to live_3d perspective warping when dragging any of the 4 blue corner dots
    // so the LED screen immediately stretches with the 4 dots instead of staying frozen
    if (viewMode === 'result' || viewMode === 'original') {
      setViewMode('live_3d');
    }
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
      setQuad((prev) => {
        const nextQuad = {
          ...prev,
          [draggingHandle]: { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) },
        };
        if (unmeasuredMode) {
          const topW = Math.hypot(
            nextQuad.topRight.x - nextQuad.topLeft.x,
            (nextQuad.topRight.y - nextQuad.topLeft.y) * 0.56
          );
          const botW = Math.hypot(
            nextQuad.bottomRight.x - nextQuad.bottomLeft.x,
            (nextQuad.bottomRight.y - nextQuad.bottomLeft.y) * 0.56
          );
          const leftH = Math.hypot(
            (nextQuad.bottomLeft.x - nextQuad.topLeft.x) * 1.77,
            nextQuad.bottomLeft.y - nextQuad.topLeft.y
          );
          const rightH = Math.hypot(
            (nextQuad.bottomRight.x - nextQuad.topRight.x) * 1.77,
            nextQuad.bottomRight.y - nextQuad.topRight.y
          );
          const cols = Math.max(2, Math.min(30, Math.round(((topW + botW) / 200) * 18)));
          const rows = Math.max(2, Math.min(20, Math.round(((leftH + rightH) / 200) * 12)));
          setParamForm((pf) => ({
            ...pf,
            screenWidthM: Number((cols * 0.64).toFixed(2)),
            screenHeightM: Number((rows * 0.48).toFixed(2)),
          }));
        }
        return nextQuad;
      });
    },
    [draggingHandle, draggingCompare, unmeasuredMode]
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
        providerId: selectedProviderId,
        modelId: selectedModelId,
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
              providerId: selectedProviderId,
              modelId: selectedModelId,
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
              providerId: selectedProviderId,
              modelId: selectedModelId,
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

  // Save Multi-AI Provider Configuration & Switch Default AI Engine
  const handleSaveAiProviderConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAiConfig(true);
    setError(null);
    try {
      const targetCat = providerStatus?.availableProviders?.find(
        (p) => p.providerId === configModalProviderId
      );
      const effectiveModel =
        configCustomModelInput.trim() ||
        targetCat?.activeModel ||
        targetCat?.models[0]?.id ||
        'imagen-3.0-generate-002';

      const res = await apiRequest<{ ok: boolean; providerStatus: ProviderStatusInfo }>(
        '/api/v1/design',
        {
          method: 'POST',
          csrfToken: user?.csrfToken,
          body: {
            action: 'configure_ai_providers',
            defaultProviderId: configModalProviderId,
            defaultModelId: effectiveModel,
            autoFallbackToLocal,
            providerConfig: {
              providerId: configModalProviderId,
              apiKey: configApiKeyInput.trim() ? configApiKeyInput.trim() : undefined,
              apiEndpoint: configEndpointInput.trim() ? configEndpointInput.trim() : undefined,
              activeModel: effectiveModel,
            },
          },
        }
      );

      if (res.providerStatus) {
        setProviderStatus(res.providerStatus);
        setSelectedProviderId(configModalProviderId);
        setSelectedModelId(effectiveModel);
      }
      setConfigApiKeyInput('');
      setShowAiConfigModal(false);
      setSuccessToast(
        `Đã chuyển đổi & lưu cấu hình AI Engine sang "${targetCat?.providerName || configModalProviderId}" (${effectiveModel}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể lưu cấu hình Đa AI.');
    } finally {
      setSavingAiConfig(false);
    }
  };

  // Render & Save Real-Photo 4-Corner Perspective Composite as a New Version vN
  const handleSaveLiveCompositeToVersion = async () => {
    if (!currentProject || savingComposite) return;
    setSavingComposite(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      const W = 1280;
      const H = 720;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Trình duyệt không hỗ trợ HTML5 Canvas.');

      // 1. Load & draw base site photo
      const baseImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Không thể tải ảnh hiện trạng gốc để ghép.'));
        img.src = sitePhotoUrl;
      });
      ctx.drawImage(baseImg, 0, 0, W, H);

      // 2. Compute 4 corners in pixel coordinates
      const tl = { x: (quad.topLeft.x / 100) * W, y: (quad.topLeft.y / 100) * H };
      const tr = { x: (quad.topRight.x / 100) * W, y: (quad.topRight.y / 100) * H };
      const br = { x: (quad.bottomRight.x / 100) * W, y: (quad.bottomRight.y / 100) * H };
      const bl = { x: (quad.bottomLeft.x / 100) * W, y: (quad.bottomLeft.y / 100) * H };

      // Ambient wall backlight glow around the LED screen
      ctx.save();
      ctx.shadowColor =
        live3dTheme === 'gala_stage'
          ? 'rgba(245, 158, 11, 0.55)'
          : live3dTheme === 'factory_andon'
            ? 'rgba(16, 185, 129, 0.45)'
            : 'rgba(37, 99, 235, 0.55)';
      ctx.shadowBlur = 32;
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.fillStyle = '#090d16';
      ctx.fill();
      ctx.restore();

      // Clip to the 4-corner quadrilateral and render the LED screen graphic
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.clip();

      const minX = Math.min(tl.x, bl.x);
      const maxX = Math.max(tr.x, br.x);
      const minY = Math.min(tl.y, tr.y);
      const maxY = Math.max(bl.y, br.y);
      const boxW = Math.max(40, maxX - minX);
      const boxH = Math.max(30, maxY - minY);

      if (live3dTheme === 'ai_version' && versionImageUrl) {
        try {
          const aiImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Fallback'));
            img.src = versionImageUrl;
          });
          ctx.drawImage(aiImg, minX, minY, boxW, boxH);
        } catch {
          const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
          grad.addColorStop(0, '#0f172a');
          grad.addColorStop(1, '#1d4ed8');
          ctx.fillStyle = grad;
          ctx.fillRect(minX, minY, boxW, boxH);
        }
      } else {
        const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
        if (live3dTheme === 'conference_navy') {
          grad.addColorStop(0, '#0a192f');
          grad.addColorStop(0.5, '#1e3a8a');
          grad.addColorStop(1, '#1d4ed8');
        } else if (live3dTheme === 'ocean_4k') {
          grad.addColorStop(0, '#083344');
          grad.addColorStop(0.5, '#0284c7');
          grad.addColorStop(1, '#22d3ee');
        } else if (live3dTheme === 'gala_stage') {
          grad.addColorStop(0, '#31102f');
          grad.addColorStop(0.5, '#7c2d12');
          grad.addColorStop(1, '#f59e0b');
        } else {
          grad.addColorStop(0, '#064e3b');
          grad.addColorStop(0.5, '#0f172a');
          grad.addColorStop(1, '#047857');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(minX, minY, boxW, boxH);

        // Render crisp presentation typography on the LED wall
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.font = `bold ${Math.max(14, Math.round(boxH * 0.11))}px sans-serif`;
        ctx.textAlign = 'center';
        const titleText =
          live3dTheme === 'conference_navy'
            ? 'TOÀN TRUNG LED · HỘI NGHỊ & SỰ KIỆN'
            : live3dTheme === 'ocean_4k'
              ? 'TOÀN TRUNG DISPLAY · ULTRA HD 4K'
              : live3dTheme === 'gala_stage'
                ? 'GALA STAGE LED · HIGH BRIGHTNESS'
                : 'BẢNG ĐIỆN TỬ NĂNG SUẤT · ANDON SYSTEM';
        ctx.fillText(titleText, minX + boxW / 2, minY + boxH * 0.46);

        ctx.fillStyle = 'rgba(191, 219, 254, 0.92)';
        ctx.font = `600 ${Math.max(11, Math.round(boxH * 0.075))}px monospace`;
        ctx.fillText(
          `${paramForm.pixelPitch} · ${paramForm.screenWidthM}m × ${paramForm.screenHeightM}m (${computedLiveSpecs.resW}×${computedLiveSpecs.resH}px)`,
          minX + boxW / 2,
          minY + boxH * 0.64
        );
      }

      // Subtle LED cabinet grid lines inside the quadrilateral
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        const t = i / 6;
        ctx.beginPath();
        ctx.moveTo(tl.x + (tr.x - tl.x) * t, tl.y + (tr.y - tl.y) * t);
        ctx.lineTo(bl.x + (br.x - bl.x) * t, bl.y + (br.y - bl.y) * t);
        ctx.stroke();
      }
      for (let j = 1; j < 4; j++) {
        const t = j / 4;
        ctx.beginPath();
        ctx.moveTo(tl.x + (bl.x - tl.x) * t, tl.y + (bl.y - tl.y) * t);
        ctx.lineTo(tr.x + (br.x - tr.x) * t, tr.y + (br.y - tr.y) * t);
        ctx.stroke();
      }
      ctx.restore();

      // Anodized aluminum LED frame border
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tl.x, tl.y);
      ctx.lineTo(tr.x, tr.y);
      ctx.lineTo(br.x, br.y);
      ctx.lineTo(bl.x, bl.y);
      ctx.closePath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#1e293b';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(147, 197, 253, 0.75)';
      ctx.stroke();
      ctx.restore();

      const dataUrl = canvas.toDataURL('image/png');
      const b64 = dataUrl.split(',')[1] || '';

      const saved = await apiRequest<{ versionId: number; versionNumber: number }>(
        `/api/v1/design/${currentProject.id}`,
        {
          method: 'POST',
          csrfToken: user?.csrfToken,
          body: {
            action: 'save_composited_version',
            fileName: `phoi-canh-3d-thuc-te-req-${currentProject.id}.png`,
            mimeType: 'image/png',
            base64Data: b64,
            note: `Ghép phối cảnh 3D thực tế (${paramForm.pixelPitch} · ${paramForm.screenWidthM}×${paramForm.screenHeightM}m) trên ảnh hiện trạng`,
            placementQuad: quad,
          },
        }
      );

      setViewMode('result');
      setSuccessToast(
        `Đã lưu bản ghép phối cảnh 3D thực tế thành phiên bản v${saved.versionNumber} trong Bản thiết kế!`
      );
      await loadData(currentProject.id);
      if (saved.versionId) {
        setSelectedVersionId(saved.versionId);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể xuất & lưu bản ghép phối cảnh 3D thực tế.'
      );
    } finally {
      setSavingComposite(false);
    }
  };

  // Open Quick Edit Modal for any project
  const openQuickEditProject = (proj: DesignRequestItemDto) => {
    setRenameTargetId(proj.id);
    setRenameValue(proj.projectName || 'Dự án thiết kế');
    setQuickEditDesignType(proj.designType || 'perspective_3d');
    setQuickEditLeadId(proj.leadId ? String(proj.leadId) : '');
    setQuickEditContactName(
      proj.contactName && proj.contactName !== 'Chưa cập nhật' ? proj.contactName : ''
    );
    setQuickEditInstallInfo(proj.installationInfo || '');
    setQuickEditWidthM(proj.screenWidthM || 4.8);
    setQuickEditHeightM(proj.screenHeightM || 2.7);
    setQuickEditPitch(proj.productSpec?.pixelPitch || 'P2.5');
    setOpenMenuProjectId(null);
    setEditingName(true);
  };

  // Quick Edit / Rename Project Submit
  const handleRenameProject = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const targetId = renameTargetId || currentProject?.id;
    if (!targetId || !renameValue.trim()) return;
    setSavingQuickEdit(true);
    try {
      await apiRequest(`/api/v1/design/${targetId}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'update_project',
          projectName: renameValue.trim(),
          designType: quickEditDesignType,
          leadId: quickEditLeadId ? Number(quickEditLeadId) : null,
          contactName: quickEditContactName.trim() || 'Chưa cập nhật',
          installationInfo: quickEditInstallInfo.trim() || 'Tường bên phải showroom',
          screenWidthM: Number(quickEditWidthM) || 4.8,
          screenHeightM: Number(quickEditHeightM) || 2.7,
          pixelPitch: quickEditPitch,
        },
      });
      setEditingName(false);
      setRenameTargetId(null);
      setSuccessToast(`Đã cập nhật thông tin dự án "${renameValue.trim()}".`);
      await loadData(targetId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi cập nhật dự án.');
    } finally {
      setSavingQuickEdit(false);
    }
  };

  // Request Single Project Delete with Sleek Custom Confirm Modal
  const requestDeleteProject = (proj: DesignRequestItemDto) => {
    setOpenMenuProjectId(null);
    setConfirmModal({
      title: 'Xác nhận xóa dự án thiết kế',
      subtitle: `Mã dự án: DA-${String(proj.id).padStart(4, '0')}${proj.leadCode ? ` · Lead: ${proj.leadCode}` : ''}`,
      message: `Bạn có chắc chắn muốn xóa dự án "${proj.projectName}"? Toàn bộ phiên bản hình ảnh AI và ảnh kỹ thuật thuộc dự án này sẽ được xóa khỏi danh sách.`,
      confirmLabel: 'Xóa dự án này',
      onConfirm: async () => {
        await apiRequest(`/api/v1/design/${proj.id}`, {
          method: 'DELETE',
          csrfToken: user?.csrfToken,
        });
        setSelectedProjectIds((prev) => prev.filter((id) => id !== proj.id));
        setSuccessToast(`Đã xóa dự án "${proj.projectName}".`);
        const remaining = requests.filter((r) => r.id !== proj.id);
        await loadData(remaining[0]?.id);
      },
    });
  };

  // Request Bulk Delete Selected Projects
  const requestBulkDeleteProjects = () => {
    if (selectedProjectIds.length === 0) return;
    const count = selectedProjectIds.length;
    setConfirmModal({
      title: `Xóa ${count} dự án đã chọn`,
      subtitle: 'Thao tác dọn dẹp nhanh danh sách dự án',
      message: `Bạn có chắc chắn muốn xóa ${count} dự án đang đánh dấu? Thao tác này giúp làm gọn danh sách dự án ngay lập tức.`,
      confirmLabel: `Xóa ${count} dự án`,
      onConfirm: async () => {
        const res = await apiRequest<{ ok: boolean; deletedCount: number }>('/api/v1/design', {
          method: 'POST',
          csrfToken: user?.csrfToken,
          body: {
            action: 'bulk_delete_projects',
            projectIds: selectedProjectIds,
          },
        });
        const deleted = res.deletedCount || count;
        const deletedSet = new Set(selectedProjectIds);
        setSelectedProjectIds([]);
        setBulkSelectMode(false);
        setSuccessToast(`Đã xóa thành công ${deleted} dự án thiết kế.`);
        const remaining = requests.filter((r) => !deletedSet.has(r.id));
        await loadData(remaining[0]?.id);
      },
    });
  };

  const toggleSelectProjectId = (id: number) => {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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

        {/* Toggle for Unmeasured Projects (Chưa có số liệu đo đạc thực tế -> Ước tính theo 4 điểm chấm) */}
        <div className="rounded-xl border border-blue-200/80 bg-blue-50/50 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 font-bold text-[#1E3A8A]">
              <input
                type="checkbox"
                checked={unmeasuredMode}
                onChange={(e) => {
                  const next = e.target.checked;
                  setUnmeasuredMode(next);
                  if (next) {
                    setParamForm((prev) => ({
                      ...prev,
                      screenWidthM: quadEstimatedSpecs.estWidthM,
                      screenHeightM: quadEstimatedSpecs.estHeightM,
                    }));
                  }
                }}
                className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
              />
              <span>Chưa có số liệu đo đạc (Tự tính theo 4 điểm chấm)</span>
            </label>
            <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 border border-blue-200">
              {quadEstimatedSpecs.cabinetCols}×{quadEstimatedSpecs.cabinetRows} Cabin
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
            Khi khách chưa đo kích thước tường thực tế, bạn chỉ cần kéo 4 điểm chấm xanh trên ảnh. Hệ thống tự động quy đổi vùng kéo sang bội số chuẩn Cabin LED Toàn Trung (640×480mm):{' '}
            <strong className="text-slate-900">
              ~{quadEstimatedSpecs.estWidthM}m × {quadEstimatedSpecs.estHeightM}m
            </strong>
            .
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {unmeasuredMode ? 'Ngang ước tính (m)' : 'Chiều ngang LED (m)'}
            </label>
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="200"
              data-testid="param-screen-width-m"
              value={unmeasuredMode ? quadEstimatedSpecs.estWidthM : paramForm.screenWidthM}
              onChange={(e) => {
                setUnmeasuredMode(false);
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
              {unmeasuredMode ? 'Cao ước tính (m)' : 'Chiều cao LED (m)'}
            </label>
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="100"
              data-testid="param-screen-height-m"
              value={unmeasuredMode ? quadEstimatedSpecs.estHeightM : paramForm.screenHeightM}
              onChange={(e) => {
                setUnmeasuredMode(false);
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
        {/* Left: Active Project Title, Quick Edit / Delete & Lead Reference */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className="text-[15px] font-semibold text-slate-900 truncate max-w-[160px] xl:max-w-[260px]"
            title={
              currentProject
                ? `${currentProject.projectName} · ${DESIGN_TYPE_LABELS[currentProject.designType]} · ${DESIGN_STATUS_LABELS[currentProject.status]}`
                : undefined
            }
          >
            {currentProject ? currentProject.projectName : 'Dự án thiết kế'}
          </span>

          {currentProject && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                data-testid="toolbar-quick-edit-project-btn"
                onClick={() => openQuickEditProject(currentProject)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-[#1E3A8A] transition"
                title="Sửa nhanh tên dự án, loại thiết kế, Lead liên kết & kích thước"
              >
                <Edit2 className="h-3 w-3" />
                <span className="hidden sm:inline">Sửa</span>
              </button>
              <button
                type="button"
                data-testid="toolbar-quick-delete-project-btn"
                onClick={() => requestDeleteProject(currentProject)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition"
                title="Xóa dự án đang chọn"
              >
                <Trash2 className="h-3 w-3" />
                <span className="hidden xl:inline">Xóa</span>
              </button>
            </div>
          )}

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
          <button
            type="button"
            data-testid="open-multi-ai-hub-btn"
            onClick={() => {
              const currentPid = selectedProviderId || providerStatus?.defaultProviderId || 'google_imagen';
              setConfigModalProviderId(currentPid);
              const cat = providerStatus?.availableProviders?.find((p) => p.providerId === currentPid);
              if (cat) {
                setConfigEndpointInput(cat.apiEndpoint || '');
                setConfigCustomModelInput(cat.activeModel || selectedModelId || '');
              }
              setShowAiConfigModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/80 px-2.5 py-1.5 text-xs font-semibold text-[#1E3A8A] shadow-2xs transition hover:bg-blue-100"
            title="Bấm để chuyển đổi qua lại giữa nhiều con AI (Google Imagen 3, OpenAI GPT-Image-1, FLUX.1 Pro, Stability SD 3.5, Custom AI, Studio v3) hoặc cấu hình API Key"
          >
            <Cpu className="h-3.5 w-3.5 text-[#2563EB]" />
            <span className="hidden lg:inline">
              AI:{' '}
              {providerStatus?.availableProviders?.find((p) => p.providerId === selectedProviderId)
                ?.shortName ||
                providerStatus?.providerName ||
                'Đa AI Studio'}{' '}
              ({selectedModelId})
            </span>
            <span className="lg:hidden">Đổi AI</span>
            <span className="rounded bg-[#1E3A8A] px-1.5 py-0.5 text-[10px] font-bold text-white">
              Đổi AI
            </span>
          </button>

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

      {/* SLEEK FLOATING WEB NOTIFICATION STACK (Success & Error Toasts) */}
      {(successToast || error) && (
        <div className="fixed right-5 top-16 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
          {successToast && (
            <div
              role="status"
              data-testid="studio-toast-notification"
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-emerald-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-md ring-1 ring-emerald-500/10 transition-all"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/70">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-900">Đã cập nhật thành công</div>
                <div className="mt-0.5 text-xs text-slate-600 leading-relaxed">{successToast}</div>
              </div>
              <button
                type="button"
                onClick={() => setSuccessToast(null)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                Đóng
              </button>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-red-200/90 bg-white/95 p-3.5 shadow-xl backdrop-blur-md ring-1 ring-red-500/10 transition-all"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 border border-red-200/70">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-red-900">Thông báo hệ thống</div>
                <div className="mt-0.5 text-xs text-red-700 leading-relaxed">{error}</div>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                Đóng
              </button>
            </div>
          )}
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
          {/* SECTION A: "Dự án" (Compact Searchable List with Direct Add / Edit / Delete & Bulk Clean) */}
          <div className="flex flex-col min-h-0 basis-1/2 border-b border-slate-200 p-3.5">
            <div className="mb-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-semibold text-slate-900 whitespace-nowrap">Dự án</h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                  {filteredProjects.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setBulkSelectMode((v) => {
                      if (v) setSelectedProjectIds([]);
                      return !v;
                    });
                  }}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    bulkSelectMode || selectedProjectIds.length > 0
                      ? 'bg-blue-50 text-[#1E3A8A] border border-blue-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                  title="Chọn nhiều dự án để xóa nhanh cùng lúc"
                >
                  {bulkSelectMode ? 'Bỏ chọn' : 'Chọn xóa'}
                </button>
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
                  data-testid="create-new-project-btn"
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#1E3A8A] px-2.5 py-1 text-xs font-bold text-white shadow-2xs transition hover:bg-[#2563EB]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Mới</span>
                </button>
              </div>
            </div>

            {/* Bulk Action Bar when bulkSelectMode is active or projects are ticked */}
            {(bulkSelectMode || selectedProjectIds.length > 0) && (
              <div className="mb-2 flex items-center justify-between rounded-xl border border-blue-200/80 bg-blue-50/60 px-2.5 py-1.5 text-xs shrink-0">
                <label className="flex cursor-pointer items-center gap-1.5 font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={
                      filteredProjects.length > 0 &&
                      filteredProjects.every((p) => selectedProjectIds.includes(p.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedProjectIds(filteredProjects.map((p) => p.id));
                      } else {
                        setSelectedProjectIds([]);
                      }
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#1E3A8A]"
                  />
                  <span>Tất cả ({selectedProjectIds.length})</span>
                </label>
                <button
                  type="button"
                  disabled={selectedProjectIds.length === 0}
                  onClick={requestBulkDeleteProjects}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-red-700 disabled:opacity-40"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Xóa ({selectedProjectIds.length})</span>
                </button>
              </div>
            )}

            <div className="mb-2 shrink-0">
              <input
                type="text"
                placeholder="Tìm tên dự án, mã Lead..."
                value={searchProject}
                onChange={(e) => setSearchProject(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>

            {/* Scrollable Project List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1">
              {filteredProjects.map((proj) => {
                const isSelected = proj.id === currentProject?.id;
                const isCheckedForBulk = selectedProjectIds.includes(proj.id);
                const photoThumb = resolveAssetUrl(proj.photos[0]?.url || proj.sitePhotoDownloadUrl);

                return (
                  <div
                    key={proj.id}
                    data-testid={`project-item-${proj.id}`}
                    title={[
                      proj.projectName,
                      proj.leadCode ? `Lead ${proj.leadCode}` : null,
                      proj.isArchived ? 'Đã lưu trữ' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onClick={() => {
                      syncProjectSelection(proj);
                      setOpenMenuProjectId(null);
                      setMobilePane('canvas');
                    }}
                    className={`group relative flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-left transition cursor-pointer border ${
                      isSelected
                        ? 'border-[#2563EB]/40 bg-blue-50/80 shadow-2xs'
                        : 'border-transparent hover:border-slate-200/80 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {(bulkSelectMode || selectedProjectIds.length > 0) && (
                        <input
                          type="checkbox"
                          checked={isCheckedForBulk}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleSelectProjectId(proj.id)}
                          className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-[#1E3A8A]"
                          title="Chọn dự án này"
                        />
                      )}
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
                        <img
                          src={photoThumb}
                          alt=""
                          aria-hidden="true"
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-slate-900">
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
                        <div className="truncate text-[11px] text-slate-500">
                          {proj.leadCode
                            ? `Lead: ${proj.leadCode}`
                            : DESIGN_TYPE_LABELS[proj.designType]}
                        </div>
                      </div>
                    </div>

                    {/* Direct Inline Action Buttons (Sửa, Lưu trữ, Xóa) right on the row */}
                    <div
                      className={`flex items-center gap-0.5 shrink-0 ml-1 transition-opacity ${
                        isSelected ? 'opacity-100' : 'opacity-80 group-hover:opacity-100'
                      }`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-testid={`edit-project-btn-${proj.id}`}
                        aria-label={`Sửa dự án ${proj.projectName}`}
                        title="Sửa nhanh dự án"
                        onClick={() => openQuickEditProject(proj)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-[#1E3A8A] hover:shadow-2xs transition"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={proj.isArchived ? 'Bỏ lưu trữ' : 'Lưu trữ dự án'}
                        title={proj.isArchived ? 'Khôi phục dự án' : 'Lưu trữ dự án'}
                        onClick={() => handleToggleArchiveProject(proj)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-amber-700 hover:shadow-2xs transition"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        data-testid={`delete-project-btn-${proj.id}`}
                        aria-label={`Xóa dự án ${proj.projectName}`}
                        title="Xóa dự án"
                        onClick={() => requestDeleteProject(proj)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
                                onClick={() => {
                                  if (!currentProject) return;
                                  const targetPid = currentProject.id;
                                  setPromptModal({
                                    title: 'Đổi tên ảnh kỹ thuật',
                                    label: 'Tên hiển thị mới cho ảnh hiện trạng:',
                                    value: photo.name,
                                    placeholder: 'VD: Mặt tiền sảnh chính góc rộng',
                                    onConfirm: async (nextName) => {
                                      await apiRequest(`/api/v1/design/${targetPid}`, {
                                        method: 'PATCH',
                                        csrfToken: user?.csrfToken,
                                        body: {
                                          action: 'update_project',
                                          renamePhotoId: photo.id,
                                          renamePhotoName: nextName.trim(),
                                        },
                                      });
                                      setSuccessToast(`Đã đổi tên ảnh kỹ thuật thành "${nextName.trim()}".`);
                                      await loadData(targetPid);
                                    },
                                  });
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
                                onClick={() => {
                                  if (!currentProject) return;
                                  const targetPid = currentProject.id;
                                  setConfirmModal({
                                    title: 'Xóa ảnh kỹ thuật',
                                    subtitle: `Dự án: ${currentProject.projectName}`,
                                    message: `Bạn có chắc chắn muốn xóa ảnh hiện trạng "${photo.name}" khỏi kho ảnh dự án?`,
                                    confirmLabel: 'Xóa ảnh này',
                                    onConfirm: async () => {
                                      await apiRequest(
                                        `/api/v1/design/${targetPid}?photoId=${encodeURIComponent(photo.id)}`,
                                        {
                                          method: 'DELETE',
                                          csrfToken: user?.csrfToken,
                                        }
                                      );
                                      setSuccessToast(`Đã xóa ảnh kỹ thuật "${photo.name}".`);
                                      await loadData(targetPid);
                                    },
                                  });
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
                              {ver.sourceType === 'DESIGNER_FINAL_UPLOAD'
                                ? 'Bản Designer'
                                : ver.modelUsed || 'Bản AI'}
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
                                onClick={() => {
                                  if (!currentProject) return;
                                  const targetPid = currentProject.id;
                                  setPromptModal({
                                    title: `Đổi tên / ghi chú phiên bản v${ver.versionNumber}`,
                                    label: 'Tên hoặc ghi chú hiển thị của phiên bản thiết kế:',
                                    value: ver.promptUsed || `Bản thiết kế v${ver.versionNumber}`,
                                    placeholder: 'VD: Bản chốt phối cảnh sảnh chính P2.5',
                                    onConfirm: async (nextLabel) => {
                                      await apiRequest(`/api/v1/design/${targetPid}`, {
                                        method: 'PATCH',
                                        csrfToken: user?.csrfToken,
                                        body: {
                                          action: 'update_project',
                                          renameVersionId: ver.id,
                                          renameVersionLabel: nextLabel.trim(),
                                        },
                                      });
                                      setSuccessToast(`Đã cập nhật ghi chú phiên bản v${ver.versionNumber}.`);
                                      await loadData(targetPid);
                                    },
                                  });
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
                <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2">
                  <div
                    role="group"
                    aria-label="Chế độ xem ảnh"
                    className="flex items-center rounded-lg bg-white/95 p-0.5 text-[13px] font-semibold shadow-md ring-1 ring-slate-200"
                  >
                    {(
                      [
                        { id: 'original', label: 'Ảnh gốc' },
                        { id: 'result', label: 'Kết quả AI' },
                        { id: 'live_3d', label: 'Ghép 3D Thực tế' },
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
                  {currentVersion && viewMode === 'result' && (
                    <span className="rounded-lg bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-white">
                      v{currentVersion.versionNumber} · {currentVersion.modelUsed || 'AI Studio'} ·{' '}
                      {currentProject?.aspectRatio || '16:9'}
                    </span>
                  )}
                  {viewMode === 'live_3d' && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-white/95 px-2 py-1 text-xs shadow-md ring-1 ring-slate-200">
                      <span className="font-semibold text-slate-700">Màn hình:</span>
                      <select
                        value={live3dTheme}
                        onChange={(e) =>
                          setLive3dTheme(
                            e.target.value as
                              | 'ai_version'
                              | 'conference_navy'
                              | 'ocean_4k'
                              | 'gala_stage'
                              | 'factory_andon'
                          )
                        }
                        className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-semibold text-slate-800 focus:outline-none"
                      >
                        <option value="conference_navy">Hội nghị Toàn Trung (Xanh Navy)</option>
                        <option value="ocean_4k">Đại dương 4K Showroom</option>
                        <option value="gala_stage">Sân khấu Sự kiện Gala</option>
                        <option value="factory_andon">Bảng Năng suất Nhà máy (Andon)</option>
                        <option value="ai_version">Ghép ảnh Phiên bản AI đang chọn</option>
                      </select>
                      {canUseAiDesign && (
                        <button
                          type="button"
                          onClick={handleSaveLiveCompositeToVersion}
                          disabled={savingComposite}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50"
                          title="Xuất ảnh hiện trạng đã ghép màn hình LED 4 góc thành phiên bản thiết kế mới trong Kho ảnh"
                        >
                          <Wand2 className="h-3 w-3" />
                          <span>
                            {savingComposite
                              ? 'Đang kết xuất...'
                              : `Lưu bản ghép (v${(currentProject?.assetVersions.length || 0) + 1})`}
                          </span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
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

                  {/* 2. MODE: RESULT ("Kết quả AI") -> Renders Selected Output Version from Bản thiết kế */}
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

                  {/* 2B. MODE: LIVE 3D COMPOSITOR ("Ghép 3D Thực tế") -> Renders Real Site Photo + 4-Corner Clipped LED Wall */}
                  {viewMode === 'live_3d' && (
                    <div className="relative h-full w-full">
                      <img
                        src={sitePhotoUrl}
                        alt={selectedPhoto?.name || 'Ảnh công trình thực tế'}
                        className="h-full w-full object-cover"
                      />
                      <div
                        style={{
                          clipPath: `polygon(${quad.topLeft.x}% ${quad.topLeft.y}%, ${quad.topRight.x}% ${quad.topRight.y}%, ${quad.bottomRight.x}% ${quad.bottomRight.y}%, ${quad.bottomLeft.x}% ${quad.bottomLeft.y}%)`,
                        }}
                        className="absolute inset-0 flex items-center justify-center overflow-hidden shadow-2xl"
                      >
                        {live3dTheme === 'ai_version' ? (
                          <img
                            src={versionImageUrl}
                            alt="Nội dung màn hình LED"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            style={{
                              left: `${Math.min(quad.topLeft.x, quad.bottomLeft.x)}%`,
                              top: `${Math.min(quad.topLeft.y, quad.topRight.y)}%`,
                              width: `${Math.max(8, Math.max(quad.topRight.x, quad.bottomRight.x) - Math.min(quad.topLeft.x, quad.bottomLeft.x))}%`,
                              height: `${Math.max(8, Math.max(quad.bottomLeft.y, quad.bottomRight.y) - Math.min(quad.topLeft.y, quad.topRight.y))}%`,
                            }}
                            className={`absolute flex flex-col items-center justify-center p-3 text-center text-white ${
                              live3dTheme === 'conference_navy'
                                ? 'bg-gradient-to-br from-slate-950 via-[#1E3A8A] to-blue-600'
                                : live3dTheme === 'ocean_4k'
                                  ? 'bg-gradient-to-br from-cyan-950 via-sky-600 to-cyan-300'
                                  : live3dTheme === 'gala_stage'
                                    ? 'bg-gradient-to-br from-purple-950 via-amber-700 to-amber-400'
                                    : 'bg-gradient-to-br from-emerald-950 via-slate-900 to-emerald-700'
                            }`}
                          >
                            <div className="text-[11px] font-extrabold uppercase tracking-widest text-blue-200/90 drop-shadow">
                              {live3dTheme === 'conference_navy'
                                ? 'TOÀN TRUNG LED · HỘI NGHỊ & SỰ KIỆN'
                                : live3dTheme === 'ocean_4k'
                                  ? 'TOÀN TRUNG DISPLAY · ULTRA HD 4K'
                                  : live3dTheme === 'gala_stage'
                                    ? 'GALA STAGE LED · HIGH BRIGHTNESS'
                                    : 'BẢNG ĐIỆN TỬ NĂNG SUẤT · ANDON SYSTEM'}
                            </div>
                            <div className="mt-1 rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                              {paramForm.pixelPitch} · {paramForm.screenWidthM}m × {paramForm.screenHeightM}m (
                              {computedLiveSpecs.resW}×{computedLiveSpecs.resH}px)
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
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

                      {/* Floating Dimension Badge with 1-Click Unmeasured Mode Toggle */}
                      <div
                        style={{
                          left: `${(quad.topLeft.x + quad.topRight.x) / 2}%`,
                          top: `${Math.max(6, Math.min(quad.topLeft.y, quad.topRight.y) - 5)}%`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className="pointer-events-auto absolute flex items-center gap-2 rounded-full bg-slate-900/95 px-3 py-1 text-xs font-bold text-white shadow-lg border border-white/20 whitespace-nowrap"
                      >
                        {unmeasuredMode ? (
                          <span>
                            Chưa có số đo · Gợi ý ~
                            {quadEstimatedSpecs.estWidthM.toFixed(2).replace('.', ',')} ×{' '}
                            {quadEstimatedSpecs.estHeightM.toFixed(2).replace('.', ',')} m (
                            {quadEstimatedSpecs.cabinetCols}×{quadEstimatedSpecs.cabinetRows} Cabin) ·{' '}
                            {paramForm.pixelPitch}
                          </span>
                        ) : (
                          <span>
                            {paramForm.screenWidthM.toFixed(2).replace('.', ',')} ×{' '}
                            {paramForm.screenHeightM.toFixed(2).replace('.', ',')} m ·{' '}
                            {paramForm.pixelPitch}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = !unmeasuredMode;
                            setUnmeasuredMode(next);
                            if (next) {
                              setParamForm((prev) => ({
                                ...prev,
                                screenWidthM: quadEstimatedSpecs.estWidthM,
                                screenHeightM: quadEstimatedSpecs.estHeightM,
                              }));
                            }
                          }}
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                            unmeasuredMode
                              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                              : 'bg-white/20 text-blue-200 hover:bg-white/30'
                          }`}
                          title="Bật chế độ này khi khách hàng chưa đo kích thước tường: hệ thống sẽ tự động tính số lượng Cabin & kích thước gợi ý dựa theo 4 điểm chấm bạn kéo"
                        >
                          {unmeasuredMode ? 'Đang tự tính theo 4 điểm' : 'Chưa có số đo?'}
                        </button>
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

                  {/* Multi-AI Engine & Model Selector Card inside Right Dock */}
                  <div className="mb-3 rounded-xl border border-blue-200/80 bg-blue-50/40 p-2.5 text-xs space-y-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[#1E3A8A]">
                        <Cpu className="h-3.5 w-3.5 text-[#2563EB]" />
                        <span>Chọn Con AI & Model thực thi</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setConfigModalProviderId(selectedProviderId);
                          const cat = providerStatus?.availableProviders?.find(
                            (p) => p.providerId === selectedProviderId
                          );
                          if (cat) {
                            setConfigEndpointInput(cat.apiEndpoint || '');
                            setConfigCustomModelInput(cat.activeModel || selectedModelId || '');
                          }
                          setShowAiConfigModal(true);
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-[#2563EB] border border-blue-200 hover:bg-blue-50"
                      >
                        <KeyRound className="h-3 w-3" />
                        <span>Cấu hình Đa AI</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                          Nền tảng AI (Provider)
                        </label>
                        <select
                          data-testid="ai-provider-select"
                          value={selectedProviderId}
                          onChange={(e) => {
                            const nextPid = e.target.value as AiProviderId;
                            setSelectedProviderId(nextPid);
                            const cat = providerStatus?.availableProviders?.find(
                              (p) => p.providerId === nextPid
                            );
                            if (cat && cat.models.length > 0) {
                              setSelectedModelId(cat.activeModel || cat.models[0].id);
                            }
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#2563EB] focus:outline-none"
                        >
                          {(providerStatus?.availableProviders || []).map((prov) => (
                            <option key={prov.providerId} value={prov.providerId}>
                              {prov.shortName} {prov.isConfigured ? '✓' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">
                          Mô hình (Model)
                        </label>
                        <select
                          data-testid="ai-model-select"
                          value={selectedModelId}
                          onChange={(e) => setSelectedModelId(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-[#2563EB] focus:outline-none"
                        >
                          {(
                            providerStatus?.availableProviders?.find(
                              (p) => p.providerId === selectedProviderId
                            )?.models || [
                              {
                                id: 'imagen-3.0-generate-002',
                                name: 'Google Imagen 3 Pro',
                              },
                            ]
                          ).map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Conversation History */}
                  <div className="min-h-0 shrink space-y-3 overflow-y-auto pr-1 text-sm">
                    {currentProject?.chatMessages.map((msg) => {
                      const isUser = msg.role === 'user';
                      return (
                        <div key={msg.id} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>
                              {isUser
                                ? 'Yêu cầu'
                                : `Kết quả AI (${msg.modelUsed || selectedModelId})`}
                            </span>
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

                  {/* Quick Prompt Suggestions by LED Scenario */}
                  <div className="mt-3 space-y-1.5 shrink-0">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                      <span>Mẫu Prompt chuẩn kỹ thuật LED Toàn Trung:</span>
                      <button
                        type="button"
                        onClick={() => setViewMode('live_3d')}
                        className="text-[#2563EB] hover:underline font-bold"
                      >
                        Mở Ghép 3D Thực tế →
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        {
                          tag: 'Hội trường P2.5',
                          prompt:
                            'Giữ nguyên nội thất phòng họp/hội trường, lắp màn hình LED P2.5 không viền hiển thị slide hội nghị Toàn Trung nền xanh navy sắc nét',
                        },
                        {
                          tag: 'Showroom 4K',
                          prompt:
                            'Giữ nguyên kiến trúc showroom, hiển thị video đại dương 4K độ tương phản cao, ánh sáng phản chiếu nhẹ xuống sàn',
                        },
                        {
                          tag: 'Tòa nhà Outdoor',
                          prompt:
                            'Màn hình LED P4 Outdoor gắn mặt tiền tòa nhà thương mại, độ sáng cao 5500 nits hiển thị thương hiệu bất động sản',
                        },
                        {
                          tag: 'Nhà máy Andon',
                          prompt:
                            'Bảng điện tử LED hiển thị năng suất chuyền sản xuất & chỉ số an toàn lao động trong nhà xưởng công nghiệp',
                        },
                      ].map((item) => (
                        <button
                          key={item.tag}
                          type="button"
                          onClick={() => handlePromptChange(item.prompt)}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-[#1E3A8A] transition"
                          title={item.prompt}
                        >
                          + {item.tag}
                        </button>
                      ))}
                    </div>
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
                  Con AI thực thi ban đầu:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={selectedProviderId}
                    onChange={(e) => {
                      const nextPid = e.target.value as AiProviderId;
                      setSelectedProviderId(nextPid);
                      const cat = providerStatus?.availableProviders?.find(
                        (p) => p.providerId === nextPid
                      );
                      if (cat && cat.models.length > 0) {
                        setSelectedModelId(cat.activeModel || cat.models[0].id);
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
                  >
                    {(providerStatus?.availableProviders || []).map((prov) => (
                      <option key={prov.providerId} value={prov.providerId}>
                        {prov.shortName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium"
                  >
                    {(
                      providerStatus?.availableProviders?.find(
                        (p) => p.providerId === selectedProviderId
                      )?.models || [{ id: 'imagen-3.0-generate-002', name: 'Google Imagen 3 Pro' }]
                    ).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
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

      {/* MODAL: QUICK EDIT PROJECT (SỬA NHANH DỰ ÁN) */}
      {editingName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h4 className="text-base font-bold text-slate-900">Sửa nhanh thông tin dự án</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cập nhật nhanh tên dự án, loại thiết kế, hồ sơ Lead liên kết và kích thước màn hình LED
                </p>
              </div>
              <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#1E3A8A] border border-blue-200">
                DA-{String(renameTargetId || currentProject?.id || 1).padStart(4, '0')}
              </span>
            </div>

            <form onSubmit={handleRenameProject} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Tên dự án thiết kế <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  data-testid="quick-edit-project-name-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-900 focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Loại dự án
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickEditDesignType('perspective_3d')}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      quickEditDesignType === 'perspective_3d'
                        ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Phối cảnh 3D LED
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickEditDesignType('banner')}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      quickEditDesignType === 'banner'
                        ? 'border-[#1E3A8A] bg-blue-50 text-[#1E3A8A]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Banner khung LED
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hồ sơ Lead liên kết:
                  </label>
                  <select
                    value={quickEditLeadId}
                    onChange={(e) => setQuickEditLeadId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#2563EB] focus:outline-none"
                  >
                    <option value="">-- Không gắn Lead --</option>
                    {leadOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Người liên hệ:
                  </label>
                  <input
                    type="text"
                    value={quickEditContactName}
                    onChange={(e) => setQuickEditContactName(e.target.value)}
                    placeholder="Tên khách hàng / đại diện"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#2563EB] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dòng Pitch LED:
                  </label>
                  <select
                    value={quickEditPitch}
                    onChange={(e) => setQuickEditPitch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800"
                  >
                    {['P1.25', 'P1.53', 'P1.86', 'P2.0', 'P2.5', 'P3.0', 'P4.0', 'P5.0', 'P8.0', 'P10'].map(
                      (p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Ngang (m):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={quickEditWidthM}
                    onChange={(e) => setQuickEditWidthM(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cao (m):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={quickEditHeightM}
                    onChange={(e) => setQuickEditHeightM(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Vị trí lắp đặt / Ghi chú công trình:
                </label>
                <input
                  type="text"
                  value={quickEditInstallInfo}
                  onChange={(e) => setQuickEditInstallInfo(e.target.value)}
                  placeholder="VD: Sảnh chính tầng 1, cách sàn 1.2m..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-[#2563EB] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const targetProj = requests.find(
                      (r) => r.id === (renameTargetId || currentProject?.id)
                    );
                    setEditingName(false);
                    setRenameTargetId(null);
                    if (targetProj) {
                      requestDeleteProject(targetProj);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Xóa dự án này</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingName(false);
                      setRenameTargetId(null);
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    data-testid="quick-edit-save-btn"
                    disabled={savingQuickEdit || !renameValue.trim()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E3A8A] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2563EB] disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{savingQuickEdit ? 'Đang lưu...' : 'Lưu cập nhật'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CUSTOM AESTHETIC CONFIRM DIALOG (THAY THẾ HOÀN TOÀN NATIVE BROWSER CONFIRM) */}
      {confirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="custom-confirm-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 border border-red-200/80">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-base font-bold text-slate-900">{confirmModal.title}</h4>
                {confirmModal.subtitle && (
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                    {confirmModal.subtitle}
                  </p>
                )}
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                data-testid="custom-confirm-accept-btn"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Thao tác thất bại.');
                    setConfirmModal(null);
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{confirmBusy ? 'Đang xử lý...' : confirmModal.confirmLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CUSTOM AESTHETIC INPUT PROMPT (THAY THẾ HOÀN TOÀN NATIVE BROWSER PROMPT) */}
      {promptModal && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="custom-prompt-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs"
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!promptModal.value.trim()) return;
              setPromptBusy(true);
              try {
                await promptModal.onConfirm(promptModal.value);
                setPromptModal(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Không thể lưu thay đổi.');
                setPromptModal(null);
              } finally {
                setPromptBusy(false);
              }
            }}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A] border border-blue-200">
                <Edit2 className="h-4 w-4" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">{promptModal.title}</h4>
                <p className="text-xs text-slate-500">{promptModal.label}</p>
              </div>
            </div>

            <input
              type="text"
              autoFocus
              required
              value={promptModal.value}
              placeholder={promptModal.placeholder}
              onChange={(e) =>
                setPromptModal((prev) => (prev ? { ...prev, value: e.target.value } : null))
              }
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:border-[#2563EB] focus:outline-none"
            />

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                disabled={promptBusy}
                onClick={() => setPromptModal(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={promptBusy || !promptModal.value.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E3A8A] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2563EB] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{promptBusy ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: MULTI-AI HUB (CHUYỂN ĐỔI & CẤU HÌNH ĐA AI LINH HOẠT) */}
      {showAiConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-[#1E3A8A] border border-blue-200">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Trung tâm Chuyển đổi & Cấu hình Đa AI (Multi-AI Engine Hub)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chuyển đổi linh hoạt giữa nhiều con AI (Google Imagen 3, OpenAI GPT-Image-1, FLUX.1 Pro, Stability SD 3.5, Custom Endpoint & Studio Nội bộ) bất cứ lúc nào.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiConfigModal(false)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>

            {/* Body */}
            <form
              onSubmit={handleSaveAiProviderConfig}
              className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-12 overflow-y-auto"
            >
              {/* Left Column: 6 AI Provider Cards */}
              <div className="md:col-span-5 border-r border-slate-200 bg-slate-50/60 p-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Danh sách 6 Nền tảng AI Hỗ trợ
                </div>
                {(providerStatus?.availableProviders || []).map((prov) => {
                  const isCurrentTab = prov.providerId === configModalProviderId;
                  return (
                    <button
                      key={prov.providerId}
                      type="button"
                      data-testid={`multi-ai-card-${prov.providerId}`}
                      onClick={() => {
                        setConfigModalProviderId(prov.providerId);
                        setConfigEndpointInput(prov.apiEndpoint || '');
                        setConfigCustomModelInput(prov.activeModel || prov.models[0]?.id || '');
                        setConfigApiKeyInput('');
                      }}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        isCurrentTab
                          ? 'border-[#2563EB] bg-white shadow-xs ring-2 ring-blue-500/15'
                          : 'border-slate-200/90 bg-white/80 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">{prov.providerName}</span>
                        {prov.isDefault && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-[#1E3A8A] border border-blue-200">
                            Mặc định
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="font-mono text-[11px] text-slate-600">
                          {prov.activeModel}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            prov.isConfigured ? 'text-emerald-700' : 'text-blue-700'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              prov.isConfigured ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                          />
                          {prov.isConfigured ? 'Đã có Key' : 'Chế độ Studio'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Selected Provider Details, Model Picker & API Key / Endpoint Config */}
              <div className="md:col-span-7 p-5 space-y-4 text-sm">
                {(() => {
                  const activeProv =
                    providerStatus?.availableProviders?.find(
                      (p) => p.providerId === configModalProviderId
                    ) || providerStatus?.availableProviders?.[0];

                  if (!activeProv) return null;

                  return (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-bold text-slate-900">
                            {activeProv.providerName}
                          </h4>
                          <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-200">
                            {activeProv.statusLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                          {activeProv.notes}
                        </p>
                      </div>

                      {/* Select Model within this Provider */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                          1. Chọn Model AI sử dụng cho {activeProv.shortName}
                        </label>
                        <div className="grid grid-cols-1 gap-2">
                          {activeProv.models.map((m) => {
                            const isSelectedModel = configCustomModelInput === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => setConfigCustomModelInput(m.id)}
                                className={`cursor-pointer rounded-xl border p-3 transition ${
                                  isSelectedModel
                                    ? 'border-[#2563EB] bg-blue-50/40'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name="activeModelRadio"
                                      checked={isSelectedModel}
                                      onChange={() => setConfigCustomModelInput(m.id)}
                                      className="h-3.5 w-3.5 text-[#1E3A8A]"
                                    />
                                    <span className="font-bold text-slate-900">{m.name}</span>
                                    <span className="rounded bg-blue-100/80 px-2 py-0.5 text-[10px] font-bold text-[#1E3A8A]">
                                      {m.badge}
                                    </span>
                                  </div>
                                  <span className="font-mono text-xs font-semibold text-slate-600">
                                    ${m.costPerImageUsd.toFixed(3)} / ảnh
                                  </span>
                                </div>
                                <p className="mt-1 pl-5 text-xs text-slate-500">{m.description}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Custom Model ID Override & API Key / Endpoint */}
                      {activeProv.providerId !== 'local_sandbox' && (
                        <div className="space-y-3 rounded-xl border border-slate-200 p-3.5">
                          <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                            2. Cấu hình Kết nối API & Mở rộng Tương lai (Tùy chọn)
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              Mã Model (Model ID — Có thể nhập bất kỳ model mới nào khi hãng nâng cấp):
                            </label>
                            <input
                              type="text"
                              value={configCustomModelInput}
                              onChange={(e) => setConfigCustomModelInput(e.target.value)}
                              placeholder="VD: imagen-3.0-generate-002, gpt-image-1, flux-1.1-pro-ultra..."
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#2563EB] focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              API Key ({activeProv.maskedApiKey ? `Đang lưu: ${activeProv.maskedApiKey}` : 'Chưa nhập — Để trống nếu dùng chế độ Studio Sẵn sàng'}):
                            </label>
                            <input
                              type="password"
                              value={configApiKeyInput}
                              onChange={(e) => setConfigApiKeyInput(e.target.value)}
                              placeholder={
                                activeProv.maskedApiKey
                                  ? `Giữ nguyên (${activeProv.maskedApiKey}) hoặc nhập Key mới để thay đổi...`
                                  : 'Nhập API Key khi muốn gọi trực tiếp tới máy chủ AI đám mây...'
                              }
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-[#2563EB] focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">
                              API Endpoint URL (Hỗ trợ đổi qua OpenRouter / Proxy / Server riêng):
                            </label>
                            <input
                              type="text"
                              value={configEndpointInput}
                              onChange={(e) => setConfigEndpointInput(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-slate-700 focus:border-[#2563EB] focus:outline-none"
                            />
                          </div>
                        </div>
                      )}

                      {/* Auto-fallback safety switch */}
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-blue-200/80 bg-blue-50/50 p-3 text-xs">
                        <input
                          type="checkbox"
                          checked={autoFallbackToLocal}
                          onChange={(e) => setAutoFallbackToLocal(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E3A8A]"
                        />
                        <div>
                          <div className="font-bold text-slate-900">
                            Đảm bảo hoạt động liên tục 100% (Auto-Fallback sang Toàn Trung Studio Engine)
                          </div>
                          <div className="text-slate-600 mt-0.5">
                            Khi bật, nếu con AI đám mây đang chọn chưa nhập API Key hoặc hết hạn mức, hệ thống tự động kết xuất qua Engine Nội bộ Toàn Trung để quy trình làm việc của Sales & Designer không bao giờ bị gián đoạn.
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setShowAiConfigModal(false)}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          disabled={savingAiConfig}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E3A8A] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#2563EB] disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>
                            {savingAiConfig
                              ? 'Đang lưu & kích hoạt...'
                              : `Chọn "${activeProv.shortName}" làm AI đang dùng`}
                          </span>
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
