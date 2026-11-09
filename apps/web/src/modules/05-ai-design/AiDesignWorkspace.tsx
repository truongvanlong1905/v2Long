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
  MessageSquare,
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

  // Canvas View Mode: 'original' (Ảnh gốc) | 'result' (Kết quả AI) | 'live_3d' (Chấm điểm & Ghép 3D $0) | 'bom' (Thông số BOM)
  const [viewMode, setViewMode] = useState<'original' | 'result' | 'live_3d' | 'compare' | 'bom'>('result');
  const [live3dTheme, setLive3dTheme] = useState<
    'ai_version' | 'conference_navy' | 'ocean_4k' | 'gala_stage' | 'factory_andon'
  >('conference_navy');
  const [savingComposite, setSavingComposite] = useState(false);

  // Dual-AI Chat Consultant Model State
  const [consultantModelName, setConsultantModelName] = useState<string>('Gemini 2.5 Flash (Free $0)');
  const uploadFinalInputRef = useRef<HTMLInputElement>(null);
  const uploadPhotoInputRef = useRef<HTMLInputElement>(null);

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

  // Zoom & Multi-Point Geometric Touch Tools (Hidden by default so points never appear out of nowhere!)
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showHandles, setShowHandles] = useState(false);
  const [compareSplit, setCompareSplit] = useState<number>(50);
  const [touchPoints, setTouchPoints] = useState<
    Array<{ id: string; label: string; x: number; y: number; edgeLengthM?: number }>
  >([]);
  const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);

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
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectType, setNewProjectType] = useState<'perspective_3d' | 'banner'>('perspective_3d');
  const [newLeadId, setNewLeadId] = useState<string>('');
  const [newContactName, setNewContactName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newProjectFiles, setNewProjectFiles] = useState<File[]>([]);

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

  // Collapse Card 1 ("1. DỰ ÁN & LIÊN KẾT LEAD") so Card 2 ("2. CHỌN / THÊM / BỚT ẢNH DỰ ÁN") expands upward
  const [collapseProjectList, setCollapseProjectList] = useState(false);

  // Prompt Library ("Thư viện lưu trữ các lệnh Prompt") persisted in localStorage
  const [showPromptLibraryModal, setShowPromptLibraryModal] = useState(false);
  const [promptLibCategoryFilter, setPromptLibCategoryFilter] = useState<
    'all' | 'tao_anh' | 'tao_poster' | 'tu_van'
  >('all');
  const [newSavedPromptTitle, setNewSavedPromptTitle] = useState('');
  const [newSavedPromptText, setNewSavedPromptText] = useState('');
  const [newSavedPromptCat, setNewSavedPromptCat] = useState<'tao_anh' | 'tao_poster' | 'tu_van'>(
    'tao_anh'
  );
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [promptLibrary, setPromptLibrary] = useState<
    Array<{
      id: string;
      title: string;
      prompt: string;
      category: 'tao_anh' | 'tao_poster' | 'tu_van';
      createdAt: string;
    }>
  >(() => {
    const defaultPrompts = [
      {
        id: 'tpl-1',
        title: 'Phối cảnh Màn hình LED Mặt tiền Tòa nhà (Vách cong / Đa giác)',
        prompt:
          '@TaoAnh: Ghép màn hình LED Outdoor P4 bo cong ôm sát mặt dựng tòa nhà theo các điểm chạm đã chấm, hiển thị nội dung sắc nét, kèm đường gióng kích thước kỹ thuật (mm) màu xanh',
        category: 'tao_anh' as const,
        createdAt: 'Mẫu chuẩn Toàn Trung',
      },
      {
        id: 'tpl-2',
        title: 'Phối cảnh Màn hình LED Hội trường / Phòng họp Cao cấp',
        prompt:
          '@TaoAnh: Ghép màn hình LED Indoor P2.0 siêu mịn vào khung 4 điểm trên vách chính hội trường, viền hợp kim titan mỏng, ánh sáng hắt trần sang trọng, kèm thông số kích thước mm',
        category: 'tao_anh' as const,
        createdAt: 'Mẫu chuẩn Toàn Trung',
      },
      {
        id: 'tpl-3',
        title: 'Bản vẽ Cận cảnh Đường gióng Kỹ thuật (Đơn vị mm)',
        prompt:
          '@TaoAnh: Cận cảnh chi tiết màn hình LED tại vị trí chấm điểm kèm đầy đủ đường gióng kích thước chiều ngang, chiều cao, độ cao đáy cách sàn và khoảng cách trụ theo đơn vị mm',
        category: 'tao_anh' as const,
        createdAt: 'Mẫu chuẩn Toàn Trung',
      },
      {
        id: 'tpl-4',
        title: 'Thiết kế Banner / Poster Tuyển sinh & Sự kiện (Tông Đỏ Vàng)',
        prompt:
          '@TaoAnhPoster: Thiết kế Banner LED quảng cáo tông đỏ vàng rực rỡ, bố cục hiện đại, tiêu đề lớn nổi bật ở trung tâm, kèm thông tin ưu đãi và hotline bên dưới',
        category: 'tao_poster' as const,
        createdAt: 'Mẫu chuẩn Toàn Trung',
      },
      {
        id: 'tpl-5',
        title: 'Thiết kế Poster Doanh nghiệp / Showroom Công nghệ (Xanh Navy)',
        prompt:
          '@TaoAnhPoster: Thiết kế Poster màn hình LED 16:9 phong cách công nghệ cao cấp tông xanh dương đậm & trắng, hiệu ứng ánh sáng LED hiện đại, tôn vinh thương hiệu Toàn Trung',
        category: 'tao_poster' as const,
        createdAt: 'Mẫu chuẩn Toàn Trung',
      },
      {
        id: 'tpl-6',
        title: 'Phân tích Ảnh khảo sát & Đề xuất Cấu hình Cabinet ($0)',
        prompt:
          'Phân tích ảnh công trình hiện tại và các điểm chạm đã chấm, tư vấn khoảng cách nhìn, độ phân giải, số lượng cabinet tối ưu và viết sẵn câu lệnh @TaoAnh',
        category: 'tu_van' as const,
        createdAt: 'Mẫu chuẩn Toàn Trung',
      },
    ];
    if (typeof window === 'undefined') return defaultPrompts;
    try {
      const saved = window.localStorage.getItem('tt_studio_prompt_library_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage error
    }
    return defaultPrompts;
  });

  const savePromptLibraryToStorage = (
    nextList: Array<{
      id: string;
      title: string;
      prompt: string;
      category: 'tao_anh' | 'tao_poster' | 'tu_van';
      createdAt: string;
    }>
  ) => {
    setPromptLibrary(nextList);
    try {
      window.localStorage.setItem('tt_studio_prompt_library_v1', JSON.stringify(nextList));
    } catch {
      // ignore storage error
    }
  };

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
      setViewMode('result');
    } else {
      setSelectedVersionId(null);
      setViewMode('original');
    }
    setSelectedAssetIds([]);
    setShowHandles(false);
    setTouchPoints([]);
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

  // Helper: Sync bounding 4-corner quad from arbitrary multi-point polygon (A, B, C, D, E, F...)
  const syncQuadFromTouchPoints = useCallback(
    (pts: Array<{ id: string; label: string; x: number; y: number; edgeLengthM?: number }>) => {
      if (pts.length < 3) return;
      if (pts.length === 4) {
        setQuad({
          topLeft: { x: pts[0].x, y: pts[0].y },
          topRight: { x: pts[1].x, y: pts[1].y },
          bottomRight: { x: pts[2].x, y: pts[2].y },
          bottomLeft: { x: pts[3].x, y: pts[3].y },
        });
        return;
      }
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      setQuad({
        topLeft: { x: minX, y: minY },
        topRight: { x: maxX, y: minY },
        bottomRight: { x: maxX, y: maxY },
        bottomLeft: { x: minX, y: maxY },
      });
    },
    []
  );

  // Preset multi-point templates when user clicks a preset button
  const applyPresetTouchPoints = useCallback(
    (preset: '4_rect' | '6_lshape' | '8_polygon') => {
      let nextPts: Array<{ id: string; label: string; x: number; y: number; edgeLengthM?: number }> = [];
      if (preset === '4_rect') {
        nextPts = [
          { id: 'pt-A', label: 'A', x: 56, y: 26, edgeLengthM: paramForm.screenWidthM },
          { id: 'pt-B', label: 'B', x: 88, y: 18, edgeLengthM: paramForm.screenHeightM },
          { id: 'pt-C', label: 'C', x: 88, y: 66, edgeLengthM: paramForm.screenWidthM },
          { id: 'pt-D', label: 'D', x: 56, y: 62, edgeLengthM: paramForm.screenHeightM },
        ];
      } else if (preset === '6_lshape') {
        nextPts = [
          { id: 'pt-A', label: 'A', x: 46, y: 24, edgeLengthM: 2.4 },
          { id: 'pt-B', label: 'B', x: 68, y: 20, edgeLengthM: 2.4 },
          { id: 'pt-C', label: 'C', x: 90, y: 28, edgeLengthM: 2.7 },
          { id: 'pt-D', label: 'D', x: 90, y: 68, edgeLengthM: 2.4 },
          { id: 'pt-E', label: 'E', x: 68, y: 60, edgeLengthM: 2.4 },
          { id: 'pt-F', label: 'F', x: 46, y: 64, edgeLengthM: 2.7 },
        ];
      } else {
        nextPts = [
          { id: 'pt-A', label: 'A', x: 44, y: 28, edgeLengthM: 1.6 },
          { id: 'pt-B', label: 'B', x: 58, y: 23, edgeLengthM: 1.6 },
          { id: 'pt-C', label: 'C', x: 74, y: 22, edgeLengthM: 1.6 },
          { id: 'pt-D', label: 'D', x: 89, y: 27, edgeLengthM: 2.7 },
          { id: 'pt-E', label: 'E', x: 89, y: 66, edgeLengthM: 1.6 },
          { id: 'pt-F', label: 'F', x: 74, y: 62, edgeLengthM: 1.6 },
          { id: 'pt-G', label: 'G', x: 58, y: 62, edgeLengthM: 1.6 },
          { id: 'pt-H', label: 'H', x: 44, y: 66, edgeLengthM: 2.7 },
        ];
      }
      setTouchPoints(nextPts);
      setShowHandles(true);
      syncQuadFromTouchPoints(nextPts);
      setViewMode('original');
    },
    [paramForm.screenWidthM, paramForm.screenHeightM, syncQuadFromTouchPoints]
  );

  // Click anywhere on canvas when showHandles is active to place a new point (A, B, C, D, E, F...)
  const handleCanvasClickToAddPoint = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!showHandles || draggingPointIdx !== null || draggingHandle) return;
      if (!canvasContainerRef.current) return;
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const x = Number(Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100)).toFixed(1));
      const y = Number(Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100)).toFixed(1));

      setTouchPoints((prev) => {
        const nextIndex = prev.length;
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const label =
          nextIndex < alphabet.length
            ? alphabet[nextIndex]
            : `P${nextIndex + 1}`;
        const nextPts = [
          ...prev,
          {
            id: `pt-${Date.now()}-${nextIndex}`,
            label,
            x,
            y,
          },
        ];
        if (nextPts.length >= 3) {
          syncQuadFromTouchPoints(nextPts);
        }
        return nextPts;
      });
    },
    [showHandles, draggingPointIdx, draggingHandle, syncQuadFromTouchPoints]
  );

  const handleMouseDownTouchPoint = (idx: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingPointIdx(idx);
  };

  // Dragging logic for multi-point touch handles & 4-corner fallback
  const handleMouseDownHandle = (corner: keyof QuadCoordinatesDto) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewMode === 'result' || viewMode === 'original') {
      setViewMode('live_3d');
    }
    setDraggingHandle(corner);
  };

  const handleMouseMoveCanvas = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canvasContainerRef.current) return;
      const rect = canvasContainerRef.current.getBoundingClientRect();
      const x = Math.max(1, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(1, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));

      if (draggingPointIdx !== null) {
        setTouchPoints((prev) => {
          const updated = prev.map((pt, idx) =>
            idx === draggingPointIdx
              ? { ...pt, x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) }
              : pt
          );
          if (updated.length >= 3) {
            syncQuadFromTouchPoints(updated);
          }
          return updated;
        });
        return;
      }

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
    [draggingPointIdx, draggingHandle, draggingCompare, unmeasuredMode, syncQuadFromTouchPoints]
  );

  const handleMouseUpCanvas = useCallback(() => {
    setDraggingPointIdx(null);
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

  // Helper: Render realistic Toàn Trung 3D LED Composite or Poster directly on the user's real photo
  const renderRealPhotoAiCompositeBase64 = async (
    mode: '3d_led' | 'poster',
    promptText: string
  ): Promise<string | null> => {
    try {
      const canvas = document.createElement('canvas');
      const W = 1280;
      const H = 720;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const cleanCaption =
        promptText
          .replace(
            /^\s*@(?:taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner|taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\s*:?\s*/i,
            ''
          )
          .trim() || 'TUYỂN SINH & SỰ KIỆN TOÀN TRUNG LED';

      if (mode === 'poster') {
        // Draw high-impact Poster / Banner (like the Nutifood / BDU Toàn Trung poster)
        try {
          const posterBg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('No poster bg'));
            img.src = '/brand/toantrung-nutifood-poster.jpg';
          });
          ctx.drawImage(posterBg, 0, 0, W, H);
        } catch {
          const bgGrad = ctx.createLinearGradient(0, 0, W, H);
          bgGrad.addColorStop(0, '#0284c7');
          bgGrad.addColorStop(0.55, '#38bdf8');
          bgGrad.addColorStop(1, '#15803d');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, W, H);
        }

        // Custom overlay badge if user typed specific poster content
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
        ctx.beginPath();
        ctx.roundRect(W - 490, H - 118, 460, 64, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(cleanCaption.slice(0, 44).toUpperCase(), W - 472, H - 88);
        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(
          `${paramForm.pixelPitch} INDOOR/OUTDOOR · ${paramForm.bannerWidthPx}×${paramForm.bannerHeightPx}px (${paramForm.aspectRatio})`,
          W - 472,
          H - 66
        );
        ctx.restore();

        return canvas.toDataURL('image/jpeg', 0.92).split(',')[1] || null;
      }

      // MODE: 3D LED PERSPECTIVE COMPOSITE DIRECTLY ON USER'S SELECTED PHOTO (like BDU Toàn Trung mockup)
      const baseImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Fallback photo'));
        img.src = sitePhotoUrl;
      });
      ctx.drawImage(baseImg, 0, 0, W, H);

      // Determine polygon points from touchPoints (if >= 3) or quad
      const pts =
        touchPoints.length >= 3
          ? touchPoints.map((p) => ({ x: (p.x / 100) * W, y: (p.y / 100) * H, label: p.label, edgeLengthM: p.edgeLengthM }))
          : [
              { x: (quad.topLeft.x / 100) * W, y: (quad.topLeft.y / 100) * H, label: 'A', edgeLengthM: paramForm.screenWidthM },
              { x: (quad.topRight.x / 100) * W, y: (quad.topRight.y / 100) * H, label: 'B', edgeLengthM: paramForm.screenHeightM },
              { x: (quad.bottomRight.x / 100) * W, y: (quad.bottomRight.y / 100) * H, label: 'C', edgeLengthM: paramForm.screenWidthM },
              { x: (quad.bottomLeft.x / 100) * W, y: (quad.bottomLeft.y / 100) * H, label: 'D', edgeLengthM: paramForm.screenHeightM },
            ];

      const minX = Math.min(...pts.map((p) => p.x));
      const maxX = Math.max(...pts.map((p) => p.x));
      const minY = Math.min(...pts.map((p) => p.y));
      const maxY = Math.max(...pts.map((p) => p.y));
      const boxW = Math.max(80, maxX - minX);
      const boxH = Math.max(50, maxY - minY);

      // 1. Outer cabinet shadow & casing
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.restore();

      // 2. Clip inside polygon & draw vivid LED screen content (BDU red-gold style or mapped Poster/Banner graphic)
      const wantsMappedPoster = /áp\s*(?:mẫu\s*)?(?:banner|poster)|ghép\s*(?:banner|poster)|nutifood/i.test(
        promptText
      );
      const latestPosterVer = (currentProject?.assetVersions || [])
        .slice()
        .reverse()
        .find((v) => /poster|banner|nutifood/i.test(v.promptUsed || ''));

      let mappedPosterImg: HTMLImageElement | null = null;
      if (wantsMappedPoster) {
        const posterSrc = latestPosterVer
          ? `/api/v1/design/asset/${latestPosterVer.id}`
          : '/brand/toantrung-nutifood-poster.jpg';
        mappedPosterImg = await new Promise<HTMLImageElement | null>((resolve) => {
          const img = new window.Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = posterSrc;
        });
      }

      ctx.save();
      ctx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.clip();

      if (mappedPosterImg) {
        ctx.drawImage(mappedPosterImg, minX, minY, boxW, boxH);
      } else {
        const ledGrad = ctx.createLinearGradient(minX, minY, maxX, maxY);
        ledGrad.addColorStop(0, '#b91c1c');
        ledGrad.addColorStop(0.5, '#dc2626');
        ledGrad.addColorStop(1, '#991b1b');
        ctx.fillStyle = ledGrad;
        ctx.fillRect(minX, minY, boxW, boxH);

        // Content layout inside the LED screen
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        const titleFontPx = Math.max(15, Math.min(34, Math.round(boxH * 0.17)));
        ctx.font = `900 ${titleFontPx}px sans-serif`;
        ctx.fillText('MÀN HÌNH LED TOÀN TRUNG', minX + boxW * 0.06, minY + boxH * 0.36);

        const subFontPx = Math.max(11, Math.min(20, Math.round(boxH * 0.1)));
        ctx.fillStyle = '#fef08a';
        ctx.font = `bold ${subFontPx}px sans-serif`;
        ctx.fillText(cleanCaption.slice(0, 48).toUpperCase(), minX + boxW * 0.06, minY + boxH * 0.56);

        // White info cards inside the LED banner (mimicking real event/university LED display)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.beginPath();
        ctx.roundRect(minX + boxW * 0.06, minY + boxH * 0.66, boxW * 0.42, boxH * 0.22, 6);
        ctx.fill();

        ctx.fillStyle = '#b91c1c';
        ctx.font = `bold ${Math.max(10, Math.round(boxH * 0.085))}px sans-serif`;
        ctx.fillText(
          `LED ${paramForm.pixelPitch} · ${Math.round(paramForm.screenWidthM * 1000)}×${Math.round(paramForm.screenHeightM * 1000)}mm · 4K UHD`,
          minX + boxW * 0.08,
          minY + boxH * 0.8
        );
      }

      // Subtle 3D curved highlight sheen across the LED cabinet surface
      const sheen = ctx.createLinearGradient(minX, minY, maxX, minY);
      sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
      sheen.addColorStop(0.28, 'rgba(255,255,255,0.22)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0.03)');
      sheen.addColorStop(0.75, 'rgba(255,255,255,0.18)');
      sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = sheen;
      ctx.fillRect(minX, minY, boxW, boxH);
      ctx.restore();

      // 3. Thin black aluminum cabinet frame around polygon
      ctx.save();
      ctx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#111827';
      ctx.stroke();
      ctx.restore();

      // 4. Blue CAD Technical Dimension Callouts (mm) along top & right edges (like BDU Toàn Trung photo)
      const widthMm = Math.round(paramForm.screenWidthM * 1000);
      const heightMm = Math.round(paramForm.screenHeightM * 1000);
      const customEdgeLengthsMm = pts
        .map((p) => (p.edgeLengthM && p.edgeLengthM > 0 ? Math.round(p.edgeLengthM * 1000) : null))
        .filter((v): v is number => v !== null);
      const widthFormulaText =
        customEdgeLengthsMm.length >= 2
          ? `(${customEdgeLengthsMm.join(' + ')})`
          : widthMm >= 15000
          ? '(4800 + 720 + 8000 + 720 + 4800)'
          : `${widthMm}`;

      const drawCadBadge = (cx: number, cy: number, text: string) => {
        ctx.save();
        ctx.font = 'bold 13px sans-serif';
        const tw = ctx.measureText(text).width + 14;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(cx - tw / 2, cy - 11, tw, 22, 5);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#0284c7';
        ctx.stroke();
        ctx.fillStyle = '#0369a1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy);
        ctx.restore();
      };

      // Top dimension line (multi-segment like 4800 | 720 | 8000 | 720 | 4800)
      ctx.save();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      const topY = Math.max(24, minY - 22);
      ctx.beginPath();
      ctx.moveTo(minX, minY - 4);
      ctx.lineTo(minX, topY - 6);
      ctx.moveTo(maxX, minY - 4);
      ctx.lineTo(maxX, topY - 6);
      ctx.moveTo(minX, topY);
      ctx.lineTo(maxX, topY);
      ctx.stroke();

      if (widthFormulaText.startsWith('(')) {
        const segLabels =
          customEdgeLengthsMm.length >= 2
            ? customEdgeLengthsMm.map(String)
            : ['4800', '720', '8000', '720', '4800'];
        segLabels.forEach((lbl, idx) => {
          const sx = minX + ((idx + 0.5) / segLabels.length) * boxW;
          drawCadBadge(sx, topY, lbl);
        });
      } else {
        drawCadBadge((minX + maxX) / 2, topY, `${widthMm}`);
      }

      // Right height dimension lines (screen height + ground clearance + total height)
      const rightX = Math.min(W - 60, maxX + 26);
      const rightTotalX = Math.min(W - 24, maxX + 62);
      const groundY = Math.min(H - 36, maxY + 140);
      ctx.beginPath();
      ctx.moveTo(maxX + 4, minY);
      ctx.lineTo(rightTotalX + 6, minY);
      ctx.moveTo(maxX + 4, maxY);
      ctx.lineTo(rightX + 6, maxY);
      ctx.moveTo(maxX + 4, groundY);
      ctx.lineTo(rightTotalX + 6, groundY);
      ctx.moveTo(rightX, minY);
      ctx.lineTo(rightX, maxY);
      ctx.moveTo(rightX, maxY);
      ctx.lineTo(rightX, groundY);
      ctx.moveTo(rightTotalX, minY);
      ctx.lineTo(rightTotalX, groundY);
      ctx.stroke();
      drawCadBadge(rightX, (minY + maxY) / 2, `${heightMm}`);
      drawCadBadge(rightX, (maxY + groundY) / 2, '3232');
      drawCadBadge(rightTotalX, (minY + groundY) / 2, `${heightMm + 3337}`);
      ctx.restore();

      // 5. If user requested Zoomed-in Technical View ("cận cảnh" / "chi tiết" like Ảnh 3), crop into the LED + CAD callout zone
      const isCloseUpTechnical = /cận\s*cảnh|chi\s*tiết|zoom/i.test(promptText);
      if (isCloseUpTechnical) {
        const cropX = Math.max(0, minX - 75);
        const cropY = Math.max(0, topY - 36);
        const cropW = Math.min(W - cropX, boxW + 175);
        const cropH = Math.min(H - cropY, groundY - cropY + 28);
        const zoomCanvas = document.createElement('canvas');
        zoomCanvas.width = W;
        zoomCanvas.height = H;
        const zCtx = zoomCanvas.getContext('2d');
        if (zCtx && cropW > 120 && cropH > 80) {
          zCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, W, H);
          return zoomCanvas.toDataURL('image/jpeg', 0.92).split(',')[1] || null;
        }
      }

      // 6. Bottom-Left Toàn Trung Specification Box (exact match to BDU Ảnh 2)
      ctx.save();
      const specBoxX = 36;
      const specBoxY = H - 98;
      const specBoxW = 630;
      const specBoxH = 76;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
      ctx.beginPath();
      ctx.roundRect(specBoxX, specBoxY, specBoxW, specBoxH, 10);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#94a3b8';
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('MÀN HÌNH LED OUTDOOR VỊ TRÍ 1', specBoxX + 16, specBoxY + 24);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#1e293b';
      ctx.fillText(
        `KÍCH THƯỚC HIỂN THỊ: ${widthFormulaText} x ${heightMm}mm (W x H)`,
        specBoxX + 16,
        specBoxY + 46
      );
      ctx.fillText(
        `KÍCH THƯỚC TỔNG THỂ: ${widthFormulaText} x ${heightMm}mm (W x H - CABINET)`,
        specBoxX + 16,
        specBoxY + 65
      );
      ctx.restore();

      return canvas.toDataURL('image/jpeg', 0.92).split(',')[1] || null;
    } catch {
      return null;
    }
  };

  // Chat Submit: Normal chat -> Free AI Consultant ($0) | @TaoAnh / @TaoAnhPoster -> Calls Image AI Provider
  const executeChatSubmit = async (rawText: string, forceImageMode?: boolean) => {
    if (!currentProject || !rawText.trim() || submitting || piiAlert) return;

    const trimmed = rawText.trim();
    const hasTaoAnhTag =
      /^\s*@(?:taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner|taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\s*:?\s*/i.test(
        trimmed
      );
    const isPosterTag =
      /^\s*@(?:taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner)\s*:?\s*/i.test(
        trimmed
      );
    const effectiveMode = forceImageMode || hasTaoAnhTag ? 'image_generator' : 'consultant_free';

    setSubmitting(true);
    setError(null);
    try {
      const finalPrompt = forceImageMode && !hasTaoAnhTag ? `@TaoAnh: ${trimmed}` : trimmed;

      // Check if Admin has configured a real external Cloud AI API Key for the selected provider
      const activeProvCat = providerStatus?.availableProviders?.find(
        (p) => p.providerId === selectedProviderId
      );
      const hasExternalCloudApiKey = Boolean(
        selectedProviderId !== 'local_sandbox' && activeProvCat?.hasApiKey
      );

      // When @TaoAnh or @TaoAnhPoster is triggered in local/test mode (before external paid API key is added),
      // composite directly onto the user's real photo with Toàn Trung CAD dimensions & spec box!
      // Once an external Cloud API Key is entered in Admin, it proceeds to `action: 'chat_edit'` below to call the live Cloud AI!
      if (effectiveMode === 'image_generator' && !hasExternalCloudApiKey) {
        const compositedB64 = await renderRealPhotoAiCompositeBase64(
          isPosterTag ? 'poster' : '3d_led',
          finalPrompt
        );
        if (compositedB64) {
          const saved = await apiRequest<{ versionId: number; versionNumber: number }>(
            `/api/v1/design/${currentProject.id}`,
            {
              method: 'POST',
              csrfToken: user?.csrfToken,
              body: {
                action: 'save_composited_version',
                fileName: isPosterTag
                  ? `poster-led-req-${currentProject.id}.jpg`
                  : `phoi-canh-3d-led-req-${currentProject.id}.jpg`,
                mimeType: 'image/jpeg',
                base64Data: compositedB64,
                note: finalPrompt,
                placementQuad: quad,
              },
            }
          );

          setChatPrompt('');
          setViewMode('result');
          setShowHandles(false);
          setSuccessToast(
            isPosterTag
              ? `Đã tạo Poster quảng cáo LED mới (Phiên bản AI v${saved.versionNumber}) và hiển thị lên màn hình!`
              : `Đã sửa ảnh & ghép màn hình LED vào các điểm chạm (Phiên bản AI v${saved.versionNumber})!`
          );
          await loadData(currentProject.id);
          if (saved.versionId) {
            setSelectedVersionId(saved.versionId);
          }
          return;
        }
      }

      const payload = {
        action: 'chat_edit',
        expectedVersion: currentProject.version,
        prompt: finalPrompt,
        chatMode: effectiveMode,
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

      const data = await apiRequest<{
        mode?: 'consultant_free' | 'image_generator';
        versionNumber: number;
        versionId?: number;
        suggestedTaoAnhPrompt?: string;
      }>(`/api/v1/design/${currentProject.id}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: payload,
      });

      setChatPrompt('');
      if (effectiveMode === 'image_generator') {
        setViewMode('result');
        setShowHandles(false);
        setSuccessToast(
          isPosterTag
            ? `Đã gọi @TaoAnhPoster thiết kế Poster/Banner mới (V${data.versionNumber}) và hiển thị lên màn hình chính!`
            : `Đã gọi @TaoAnh kết xuất phối cảnh 3D mới (V${data.versionNumber}) và hiển thị lên màn hình chính!`
        );
      } else {
        setSuccessToast(
          'AI Tư vấn ($0) đã phân tích ảnh & điểm chạm và soạn sẵn câu lệnh @TaoAnh / @TaoAnhPoster cho bạn!'
        );
      }
      await loadData(currentProject.id);
      if (data.versionId && effectiveMode === 'image_generator') {
        setSelectedVersionId(data.versionId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi gửi yêu cầu dựng thiết kế AI.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendChatEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeChatSubmit(chatPrompt);
  };

  // Delete selected photos from Kho ảnh dự án (or currently active photo if no checkboxes ticked)
  const handleBulkDeleteSelectedPhotos = () => {
    if (!currentProject) return;
    const checkedIds = selectedAssetIds.filter((id) => !id.startsWith('ver-'));
    const photoIdsToDelete =
      checkedIds.length > 0
        ? checkedIds
        : selectedPhoto
          ? [selectedPhoto.id]
          : [];
    if (photoIdsToDelete.length === 0) {
      setError('Dự án hiện chưa có ảnh nào để xoá.');
      return;
    }
    const targetPid = currentProject.id;
    setConfirmModal({
      title: `Xoá ${photoIdsToDelete.length} ảnh khỏi dự án`,
      subtitle: `Dự án: ${currentProject.projectName}`,
      message: `Bạn có chắc chắn muốn xoá ${photoIdsToDelete.length} ảnh đã chọn khỏi Kho ảnh dự án?`,
      confirmLabel: `Xoá (${photoIdsToDelete.length}) ảnh`,
      onConfirm: async () => {
        for (const pid of photoIdsToDelete) {
          await apiRequest(`/api/v1/design/${targetPid}?photoId=${encodeURIComponent(pid)}`, {
            method: 'DELETE',
            csrfToken: user?.csrfToken,
          });
        }
        setSelectedAssetIds([]);
        setSuccessToast(`Đã xoá ${photoIdsToDelete.length} ảnh khỏi Kho ảnh dự án.`);
        await loadData(targetPid);
      },
    });
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
      setSuccessToast(`Đã tải ${files.length} ảnh công trình vào dự án và hiển thị lên màn hình.`);
      await loadData(currentProject.id);
      setViewMode('original');
      setShowHandles(false);
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
      setViewMode('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi tải bản thiết kế hoàn thiện.');
    } finally {
      setUploadingFinalFile(false);
      e.target.value = '';
    }
  };

  // Import attachments from linked Lead into "Ảnh kỹ thuật"
  const handleImportLeadPhotos = async () => {
    if (!currentProject) return;
    if (!currentProject.leadId) {
      openQuickEditProject(currentProject);
      setSuccessToast('Dự án chưa gắn Lead — hãy chọn Hồ sơ Lead liên kết trong cửa sổ này để đồng bộ ảnh!');
      return;
    }
    try {
      await apiRequest(`/api/v1/design/${currentProject.id}`, {
        method: 'PATCH',
        csrfToken: user?.csrfToken,
        body: {
          action: 'update_project',
          importLeadAttachments: true,
        },
      });
      setSuccessToast('Đã đồng bộ ảnh hiện trạng từ hồ sơ Lead vào dự án.');
      await loadData(currentProject.id);
      setViewMode('original');
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

  // Create New Project Submit (Clean project initialization without preloading fake BDU/Showroom photos)
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setError('Vui lòng nhập Tên dự án thiết kế.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const initPrompt = `[INIT_PROJECT] ${newPrompt.trim() || 'Khởi tạo hồ sơ dự án mới'}`;
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
              aiPrompt: initPrompt,
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
              aiPrompt: initPrompt,
              quality: 'draft',
              providerId: selectedProviderId,
              modelId: selectedModelId,
            };

      const data = await apiRequest<{ id: number }>('/api/v1/design', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: payload,
      });

      // If user attached survey photo files while creating the project, upload them immediately
      if (newProjectFiles.length > 0) {
        for (const file of newProjectFiles) {
          const b64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
            reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
            reader.readAsDataURL(file);
          });
          await apiRequest(`/api/v1/design/${data.id}`, {
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
      }

      setShowCreateModal(false);
      setNewProjectFiles([]);
      setCollapseProjectList(true);
      setSuccessToast(`Đã tạo dự án "${newProjectName.trim()}" (#${data.id}) thành công. Đã thu gọn mục 1 để mở rộng khung ảnh dự án.`);
      await loadData(data.id);
      setViewMode('original');
      setShowHandles(false);
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
    <div className="flex h-full w-full flex-col bg-[#F5F7FC] font-sans text-[#17253F] antialiased overflow-hidden select-none">
      {/* Hidden global file inputs */}
      <input
        ref={uploadFinalInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleUploadDesignerFinal}
      />
      <input
        ref={uploadPhotoInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleUploadTechnicalPhotos}
      />

      {/* 1. TOP MODULE HEADER BAR (MATCHING REFERENCE SCREENSHOT) */}
      <div className="flex h-13 w-full shrink-0 items-center justify-between gap-3 border-b border-[#D8E2F0] bg-white px-4 shadow-2xs">
        {/* Left: Brand Logo + Module 05 Title */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1553A2] text-white font-extrabold text-sm shadow-2xs">
            T
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-extrabold text-[#17253F] text-sm whitespace-nowrap">
              Toàn Trung
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-sm font-bold text-[#17253F] truncate">
              Thiết kế 3D
            </span>
          </div>
        </div>

        {/* Center: Workflow Switcher Pills (Phối cảnh 3D LED vs Thiết kế Banner LED) */}
        <div
          role="tablist"
          aria-label="Khu vực làm việc Studio"
          className="flex shrink-0 items-center gap-1.5"
        >
          <button
            type="button"
            role="tab"
            data-testid="workspace-tab-perspective"
            aria-selected={activeWorkspaceArea !== 'specs'}
            onClick={() => {
              setActiveWorkspaceArea('perspective');
              setMobilePane('canvas');
            }}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-bold transition shadow-2xs ${
              activeWorkspaceArea !== 'specs'
                ? 'bg-[#1553A2] text-white'
                : 'border border-[#D8E2F0] bg-white text-[#17253F] hover:bg-slate-50'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>Màn hình Studio AI</span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="workspace-tab-specs"
            aria-selected={activeWorkspaceArea === 'specs'}
            onClick={() => {
              setActiveWorkspaceArea((prev) => (prev === 'specs' ? 'perspective' : 'specs'));
            }}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeWorkspaceArea === 'specs'
                ? 'bg-[#17253F] text-white'
                : 'border border-[#D8E2F0] bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title="Mở bảng cài đặt chi tiết thông số dự án & LED"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Cài đặt thông số</span>
          </button>
        </div>

        {/* Right: Admin 2-AI Manager, Upload Final, Export ZIP, Approve & Handoff Sales */}
        <div className="flex items-center gap-2 shrink-0">
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-[#17253F] shadow-2xs transition hover:bg-slate-50"
            title="Cấu hình 2 con AI: Con AI Tư vấn Free ($0) và Con AI Tạo Ảnh khi gọi @TaoAnh"
          >
            <Settings2 className="h-3.5 w-3.5 text-[#17253F]" />
            <span>Quản trị 2 Con AI (Admin)</span>
          </button>

          {canUseAiDesign && (
            <button
              type="button"
              onClick={() => uploadFinalInputRef.current?.click()}
              disabled={!currentProject || uploadingFinalFile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1553A2] px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-[#1E3A8A] disabled:opacity-50"
              title="Designer tải bản thiết kế hoàn thiện (Final Render) lên hệ thống"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{uploadingFinalFile ? 'Đang tải...' : 'Tải bản Final'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleDownloadProjectZip('all')}
            disabled={!currentProject}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D8E2F0] bg-white px-3 py-1.5 text-xs font-bold text-[#17253F] shadow-2xs transition hover:bg-slate-50 disabled:opacity-50"
            title="Tải gói ZIP trọn bộ hồ sơ dự án (Ảnh hiện trạng + Các phiên bản AI)"
          >
            <FileArchive className="h-3.5 w-3.5 text-amber-600" />
            <span>Xuất .ZIP</span>
          </button>

          {canUseAiDesign && (
            <button
              type="button"
              onClick={handleSaveFinished}
              disabled={!currentProject || !currentVersion || savingFinal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0BAF7C] px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700 disabled:opacity-50"
              title="Phê duyệt phiên bản đang chọn và tự động bàn giao sang hồ sơ Lead cho Sales"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{savingFinal ? 'Đang duyệt...' : 'Phê duyệt & Bàn giao Sales'}</span>
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

      {/* 2. MAIN 3-COLUMN STUDIO BODY (MATCHING REFERENCE SCREENSHOT) */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden gap-3 p-3">
        {/* ================= LEFT COLUMN: 1. DỰ ÁN & LIÊN KẾT LEAD + 2. CHỌN / THÊM / BỚT ẢNH DỰ ÁN ================= */}
        <aside
          className={`${
            mobilePane === 'projects' ? 'flex w-full' : 'hidden'
          } ${focusCanvas ? 'md:hidden' : 'md:flex'} md:w-[278px] xl:w-[295px] shrink-0 flex-col h-full min-h-0 gap-3 overflow-hidden`}
        >
          {/* CARD 1: "1. DỰ ÁN & LIÊN KẾT LEAD" (Supports Collapse / Expand so Card 2 stretches upward) */}
          <div
            className={`flex flex-col min-h-0 ${
              collapseProjectList ? 'shrink-0' : 'basis-[46%]'
            } rounded-2xl border border-[#D8E2F0] bg-white p-3.5 shadow-2xs transition-all duration-200`}
          >
            <div className="flex items-center justify-between gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setCollapseProjectList((prev) => !prev)}
                className="flex items-center gap-1 text-left text-xs font-extrabold uppercase tracking-wide text-[#17253F] hover:text-[#1553A2] truncate"
                title={
                  collapseProjectList
                    ? 'Bấm để mở rộng danh sách dự án'
                    : 'Bấm để thu gọn mục 1, nhường không gian cho mục 2 (Ảnh dự án)'
                }
              >
                <span className="truncate">1. DỰ ÁN &amp; LEAD</span>
                <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-[#1553A2] hover:bg-blue-50">
                  {collapseProjectList ? 'Mở rộng ▾' : 'Thu gọn ▴'}
                </span>
              </button>
              <button
                type="button"
                data-testid="create-new-project-btn"
                onClick={() => {
                  setNewProjectName('');
                  setNewContactName('');
                  setNewLeadId('');
                  setNewPrompt('');
                  setNewProjectFiles([]);
                  setShowCreateModal(true);
                }}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[#1553A2] px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-[#1E3A8A]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tạo dự án</span>
              </button>
            </div>

            {collapseProjectList ? (
              /* Compact Active Project Bar when Card 1 is collapsed */
              <div
                onClick={() => setCollapseProjectList(false)}
                className="mt-2 flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-[#1553A2]/40 bg-[#EFF6FF] px-3 py-2 text-xs transition hover:bg-blue-100/70"
                title="Đang thu gọn danh sách dự án. Bấm vào đây để mở rộng lại danh sách dự án."
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-[#1553A2] px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      Đang chọn
                    </span>
                    <span className="truncate font-extrabold text-[#17253F]">
                      {currentProject?.projectName || 'Chưa chọn dự án'}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] font-medium text-slate-600">
                    {currentProject?.leadCode ? `Lead: ${currentProject.leadCode}` : 'Độc lập'} · Tổng{' '}
                    {filteredProjects.length} dự án
                  </div>
                </div>
                <span className="shrink-0 rounded-lg border border-blue-200 bg-white px-2 py-1 text-[10px] font-bold text-[#1553A2]">
                  Đổi dự án ▾
                </span>
              </div>
            ) : (
              <>
                <div className="my-2.5 shrink-0">
                  <input
                    type="text"
                    placeholder="🔍 Tìm kiếm dự án..."
                    value={searchProject}
                    onChange={(e) => setSearchProject(e.target.value)}
                    className="w-full rounded-xl border border-[#D8E2F0] bg-[#F5F7FC] px-3 py-1.5 text-xs font-medium text-[#17253F] placeholder-slate-400 focus:border-[#1553A2] focus:bg-white focus:outline-none"
                  />
                </div>

                {/* Scrollable Project Cards */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
                  {filteredProjects.map((proj) => {
                    const isSelected = proj.id === currentProject?.id;
                    const dimText =
                      proj.designType === 'banner'
                        ? `${proj.bannerWidthPx || 1920}×${proj.bannerHeightPx || 1080}px`
                        : `${proj.screenWidthM || 4.8}m × ${proj.screenHeightM || 2.7}m`;
                    const statusShort =
                      proj.status === 'completed' ? 'Đã chốt' : 'Đang thiết kế';

                    return (
                      <div
                        key={proj.id}
                        data-testid={`project-item-${proj.id}`}
                        onClick={() => {
                          syncProjectSelection(proj);
                          setOpenMenuProjectId(null);
                          setMobilePane('canvas');
                        }}
                        className={`group relative flex flex-col rounded-xl p-2.5 text-left transition cursor-pointer border ${
                          isSelected
                            ? 'border-2 border-[#1553A2] bg-[#EFF6FF] shadow-2xs'
                            : 'border-[#D8E2F0] bg-white hover:border-slate-300 hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider ${
                              isSelected ? 'text-[#1553A2]' : 'text-slate-400'
                            }`}
                          >
                            {isSelected
                              ? 'Đang chọn'
                              : proj.designType === 'banner'
                                ? 'Banner LED'
                                : 'Phối cảnh 3D'}
                          </span>
                          <div
                            className={`flex items-center gap-1 transition-opacity ${
                              isSelected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              data-testid={`edit-project-btn-${proj.id}`}
                              aria-label={`Sửa dự án ${proj.projectName}`}
                              title="Sửa nhanh dự án"
                              onClick={() => openQuickEditProject(proj)}
                              className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200 hover:border-[#1553A2] hover:text-[#1553A2]"
                            >
                              Sửa
                            </button>
                            <button
                              type="button"
                              data-testid={`delete-project-btn-${proj.id}`}
                              aria-label={`Xóa dự án ${proj.projectName}`}
                              title="Xóa dự án"
                              onClick={() => requestDeleteProject(proj)}
                              className="rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-red-600 border border-red-200 hover:bg-red-50"
                            >
                              Xoá
                            </button>
                          </div>
                        </div>

                        <div className="mt-0.5 truncate text-xs font-extrabold text-[#17253F]">
                          {proj.projectName}
                        </div>
                        <div className="mt-1 truncate text-[11px] font-medium text-slate-500">
                          {proj.leadCode ? `Lead: ${proj.leadCode}` : 'Độc lập'} · {dimText} · {statusShort}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* CARD 2: "2. CHỌN / THÊM / BỚT ẢNH DỰ ÁN" */}
          <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-[#D8E2F0] bg-white p-3.5 shadow-2xs">
            <div className="mb-2 flex items-center justify-between gap-1 shrink-0">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#17253F] truncate">
                2. CHỌN / THÊM / BỚT ẢNH DỰ ÁN
              </h3>
              <span className="shrink-0 text-[11px] font-bold text-slate-400">
                {currentProject?.photos.length || 0} ảnh
              </span>
            </div>

            {/* Action Buttons Row: [+ Thêm ảnh] [📥 Ảnh từ Lead] [🗑 Xoá] - Single line no wrap */}
            <div className="mb-2.5 flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => uploadPhotoInputRef.current?.click()}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[#1553A2] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-[#1E3A8A] transition"
              >
                <Plus className="h-3 w-3 shrink-0" />
                <span>{uploadingPhoto ? 'Đang tải...' : 'Thêm ảnh'}</span>
              </button>

              <button
                type="button"
                onClick={handleImportLeadPhotos}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-[#D8E2F0] bg-white px-2 py-1.5 text-[11px] font-bold text-[#17253F] hover:bg-slate-50 transition"
                title="Đồng bộ ảnh khảo sát từ hồ sơ Lead liên kết (hoặc chọn Lead nếu chưa gắn)"
              >
                <Download className="h-3 w-3 shrink-0 text-[#1553A2]" />
                <span>Ảnh từ Lead</span>
              </button>

              <button
                type="button"
                onClick={handleBulkDeleteSelectedPhotos}
                disabled={(currentProject?.photos.length || 0) === 0}
                className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100 disabled:opacity-40 transition"
                title="Xoá các ảnh đã tích chọn (hoặc xoá ảnh đang chọn)"
              >
                <Trash2 className="h-3 w-3 shrink-0" />
                <span>
                  Xoá
                  {selectedAssetIds.filter((id) => !id.startsWith('ver-')).length > 0
                    ? ` (${selectedAssetIds.filter((id) => !id.startsWith('ver-')).length})`
                    : ''}
                </span>
              </button>
            </div>

            {/* 2x2 Photo Grid with top-left blue checkbox [✓] and top-right delete [×] */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
              {(currentProject?.photos.length || 0) === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3 text-center">
                  <ImageIcon className="h-6 w-6 text-slate-400 mb-1" />
                  <p className="text-[11px] font-semibold text-slate-600">
                    Dự án chưa có ảnh khảo sát
                  </p>
                  <button
                    type="button"
                    onClick={() => uploadPhotoInputRef.current?.click()}
                    className="mt-1.5 rounded-lg bg-[#1553A2] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#1E3A8A]"
                  >
                    + Tải ảnh công trình lên
                  </button>
                </div>
              ) : (
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
                          setShowHandles(false);
                          await apiRequest(`/api/v1/design/${currentProject.id}`, {
                            method: 'PATCH',
                            csrfToken: user?.csrfToken,
                            body: {
                              action: 'update_project',
                              selectedPhotoId: photo.id,
                            },
                          });
                          await loadData(currentProject.id);
                          setViewMode('original');
                        }}
                        className={`group relative cursor-pointer overflow-hidden rounded-xl border-2 bg-slate-900 transition ${
                          photo.selected
                            ? 'border-[#1553A2] ring-2 ring-blue-500/20'
                            : 'border-[#D8E2F0] hover:border-slate-400'
                        }`}
                        title={`Bấm để xem ảnh: ${photo.name}`}
                      >
                        <div className="relative aspect-4/3 w-full">
                          <img
                            src={resolvedSrc}
                            alt={photo.name}
                            className="h-full w-full object-cover"
                          />
                          {/* Top-left selection checkbox for multi-delete */}
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleAssetSelection(photo.id)}
                            className="absolute left-1.5 top-1.5 h-4 w-4 rounded border-white accent-[#1553A2] shadow"
                            title="Tích chọn ảnh này để xoá nhiều ảnh"
                          />
                          {photo.selected && (
                            <span className="absolute bottom-1 left-1 rounded bg-[#1553A2]/90 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              Đang chọn
                            </span>
                          )}
                          {/* Top-right quick delete × button */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!currentProject) return;
                              const targetPid = currentProject.id;
                              setConfirmModal({
                                title: 'Xoá ảnh khỏi dự án',
                                subtitle: `Dự án: ${currentProject.projectName}`,
                                message: `Bạn có chắc chắn muốn xoá ảnh "${photo.name}" khỏi dự án?`,
                                confirmLabel: 'Xoá ảnh này',
                                onConfirm: async () => {
                                  await apiRequest(
                                    `/api/v1/design/${targetPid}?photoId=${encodeURIComponent(photo.id)}`,
                                    {
                                      method: 'DELETE',
                                      csrfToken: user?.csrfToken,
                                    }
                                  );
                                  setSuccessToast(`Đã xoá ảnh "${photo.name}".`);
                                  await loadData(targetPid);
                                },
                              });
                            }}
                            className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/75 text-white text-xs font-bold hover:bg-red-600 transition"
                            title="Xoá ảnh này"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Drag & Drop Upload Box */}
            <label className="mt-2.5 flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#D8E2F0] bg-[#F5F7FC] py-2.5 text-xs font-semibold text-slate-600 transition hover:border-[#1553A2] hover:bg-blue-50/40 hover:text-[#1553A2]">
              <Upload className="h-3.5 w-3.5" />
              <span>{uploadingPhoto ? 'Đang tải ảnh...' : 'Drag and drop upload'}</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleUploadTechnicalPhotos}
              />
            </label>
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
          /* "MÀN HÌNH AI STUDIO" (CENTER) + "Ô CHAT TRỰC TIẾP VỚI AI (@TAOANH & @TAOANHPOSTER)" (RIGHT) */
          <>
            <div
              className={`${
                mobilePane === 'canvas' ? 'flex' : 'hidden md:flex'
              } flex-1 flex-col overflow-hidden bg-[#F5F7FC] p-2.5 pl-0`}
            >
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
                {/* CLEAN SINGLE-LINE HEADER: SWITCH ORIGINAL/AI + POINT MARKING + DOWNLOAD */}
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#17253F] truncate">
                      MÀN HÌNH KẾT QUẢ AI ĐÃ SỬA (@TAOANH &amp; @TAOANHPOSTER)
                    </h2>
                    {selectedPhoto && currentVersion && (
                      <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 text-[11px] font-bold">
                        <button
                          type="button"
                          data-testid="view-mode-original"
                          onClick={() => {
                            setViewMode('original');
                          }}
                          className={`rounded-lg px-2.5 py-1 transition ${
                            viewMode === 'original' || showHandles
                              ? 'bg-white text-[#1553A2] shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          📷 Ảnh gốc khảo sát
                        </button>
                        <button
                          type="button"
                          data-testid="view-mode-result"
                          onClick={() => {
                            setShowHandles(false);
                            setViewMode('result');
                          }}
                          className={`rounded-lg px-2.5 py-1 transition ${
                            viewMode !== 'original' && !showHandles
                              ? 'bg-[#7846FF] text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          ✨ Kết quả AI (v{currentVersion.versionNumber})
                        </button>
                      </div>
                    )}
                    {(!selectedPhoto || !currentVersion) && (
                      <div className="sr-only">
                        <button
                          type="button"
                          data-testid="view-mode-original"
                          onClick={() => setViewMode('original')}
                        >
                          Ảnh gốc
                        </button>
                        <button
                          type="button"
                          data-testid="view-mode-result"
                          onClick={() => setViewMode('result')}
                        >
                          Kết quả AI
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {showHandles && (
                      <>
                        <button
                          type="button"
                          onClick={() => applyPresetTouchPoints('4_rect')}
                          className="rounded-lg border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-900 hover:bg-cyan-100"
                          title="Tạo nhanh 4 điểm góc A, B, C, D để kéo chỉnh trên ảnh"
                        >
                          + Khung 4 điểm
                        </button>
                        <button
                          type="button"
                          onClick={() => applyPresetTouchPoints('6_lshape')}
                          className="rounded-lg border border-cyan-300 bg-cyan-50 px-2 py-1 text-[11px] font-bold text-cyan-900 hover:bg-cyan-100"
                          title="Tạo nhanh 6 điểm đa giác / vách cong A, B, C, D, E, F"
                        >
                          + Đa giác 6 điểm
                        </button>
                      </>
                    )}

                    {showHandles && touchPoints.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setTouchPoints((prev) => prev.slice(0, -1))}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          Lùi 1 điểm
                        </button>
                        <button
                          type="button"
                          onClick={() => setTouchPoints([])}
                          className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-100"
                        >
                          Xoá điểm ({touchPoints.length})
                        </button>
                      </>
                    )}

                    {(selectedPhoto || currentVersion) && (
                      <a
                        href={
                          showHandles || viewMode === 'original' || !currentVersion
                            ? sitePhotoUrl
                            : versionImageUrl
                        }
                        download={`ToanTrung-AI-v${currentVersion?.versionNumber || 1}-${paramForm.pixelPitch}.jpg`}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50"
                        title="Tải nhanh ảnh đang xem về máy để gửi Zalo cho khách hàng"
                      >
                        <Download className="h-3.5 w-3.5 text-slate-600" />
                        <span>Tải ảnh HD</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedPhoto) {
                          setSuccessToast(
                            'Hãy chọn ảnh công trình để tải lên trước khi chấm điểm lắp đặt!'
                          );
                          uploadPhotoInputRef.current?.click();
                          return;
                        }
                        const next = !showHandles;
                        setShowHandles(next);
                        if (next) {
                          setViewMode('original');
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold transition shadow-2xs ${
                        showHandles
                          ? 'bg-[#06B6D4] text-white ring-2 ring-cyan-300'
                          : 'border border-cyan-300 bg-cyan-50 text-cyan-900 hover:bg-cyan-100'
                      }`}
                      title="Bấm trực tiếp lên ảnh để chấm các điểm chạm A, B, C, D... tại vị trí cần lắp LED"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      <span>
                        {showHandles
                          ? `Đang chấm điểm (${touchPoints.length} điểm) · Xong`
                          : `🎯 Chấm điểm trên ảnh${touchPoints.length > 0 ? ` (${touchPoints.length} điểm)` : ''}`}
                      </span>
                    </button>
                  </div>
                </div>

                {/* MAIN VIEWPORT: SHOWS AI-EDITED IMAGE, SITE PHOTO, OR CLEAN UPLOAD DROPZONE WHEN NEW PROJECT HAS NO PHOTOS */}
                <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl bg-slate-900 flex items-center justify-center [container-type:size]">
                  {!selectedPhoto && !currentVersion ? (
                    <div className="flex max-w-lg flex-col items-center justify-center p-8 text-center text-white">
                      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/20 border border-blue-400/30 text-cyan-300">
                        <Upload className="h-7 w-7" />
                      </div>
                      <h3 className="text-base font-extrabold text-white">
                        Dự án &ldquo;{currentProject?.projectName}&rdquo; chưa có ảnh khảo sát
                      </h3>
                      <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                        Mỗi dự án sử dụng ảnh công trình riêng của khách hàng. Hãy tải ảnh trước khảo sát của dự án này lên để chấm điểm lắp đặt &amp; ghép phối cảnh 3D LED, hoặc bấm tạo Poster quảng cáo độc lập bên dưới.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => uploadPhotoInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#1553A2] px-4 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-[#1E3A8A] transition"
                        >
                          <Upload className="h-4 w-4" />
                          <span>Tải ảnh công trình khảo sát lên</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handlePromptChange(
                              `@TaoAnhPoster: Thiết kế Poster quảng cáo LED cho dự án ${currentProject?.projectName || 'Toàn Trung'} (${computedLiveSpecs.resW}×${computedLiveSpecs.resH}px)`
                            );
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-pink-700 transition"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span>Tạo Banner / Poster (@TaoAnhPoster)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      ref={canvasContainerRef}
                      onClick={handleCanvasClickToAddPoint}
                      onMouseMove={handleMouseMoveCanvas}
                      onMouseUp={handleMouseUpCanvas}
                      onMouseLeave={handleMouseUpCanvas}
                      style={{
                        aspectRatio: String(canvasRatio),
                        width: `min(100cqw, calc(100cqh * ${canvasRatio}))`,
                        transform: `scale(${zoomLevel / 100})`,
                        transformOrigin: 'center center',
                        transition:
                          draggingPointIdx !== null || draggingHandle
                            ? 'none'
                            : 'transform 0.15s ease-out',
                      }}
                      className={`relative select-none overflow-hidden rounded-xl bg-slate-900 shadow-lg ${
                        showHandles ? 'cursor-crosshair' : ''
                      }`}
                    >
                      {viewMode === 'original' || showHandles || !currentVersion ? (
                        <img
                          data-testid="canvas-original-image"
                          src={sitePhotoUrl}
                          alt={selectedPhoto?.name || 'Ảnh dự án'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <img
                          data-testid="canvas-result-image"
                          src={versionImageUrl}
                          alt={
                            currentVersion
                              ? `Phiên bản AI v${currentVersion.versionNumber}`
                              : 'Ảnh sau khi AI sửa'
                          }
                          className="h-full w-full object-cover"
                        />
                      )}

                    {/* Subtle helper badge when user is actively clicking points on the photo */}
                    {showHandles && (
                      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-slate-900/85 px-3 py-1.5 text-xs font-bold text-cyan-300 shadow border border-cyan-400/40">
                        {touchPoints.length === 0
                          ? '👆 Bấm trực tiếp lên vị trí lắp đặt trên ảnh để chấm điểm A, B, C, D...'
                          : `Đã chấm ${touchPoints.length} điểm (${touchPoints.map((p) => p.label).join(' → ')}) · Bấm lên cạnh để nhập số đo (m) hoặc gửi sang Ô Chat bên phải`}
                      </div>
                    )}

                    {/* MULTI-POINT GEOMETRIC TOUCH OVERLAY (Only visible when user turns on 🎯 Chấm điểm trên ảnh) */}
                    {showHandles && touchPoints.length > 0 && (
                      <div className="absolute inset-0 pointer-events-none">
                        <svg className="absolute inset-0 h-full w-full pointer-events-none">
                          {touchPoints.length >= 3 ? (
                            <polygon
                              points={touchPoints.map((pt) => `${pt.x}%,${pt.y}%`).join(' ')}
                              fill="rgba(6, 182, 212, 0.16)"
                              stroke="#22D3EE"
                              strokeWidth="2.5"
                              strokeDasharray="6 3"
                            />
                          ) : (
                            <polyline
                              points={touchPoints.map((pt) => `${pt.x}%,${pt.y}%`).join(' ')}
                              fill="none"
                              stroke="#22D3EE"
                              strokeWidth="2.5"
                              strokeDasharray="6 3"
                            />
                          )}
                        </svg>

                        {/* Clickable Edge Labels (AB, BC, CD...) */}
                        {touchPoints.length >= 2 &&
                          touchPoints.map((pt, idx) => {
                            const nextPt = touchPoints[(idx + 1) % touchPoints.length];
                            if (touchPoints.length === 2 && idx === 1) return null;
                            const midX = (pt.x + nextPt.x) / 2;
                            const midY = (pt.y + nextPt.y) / 2;
                            return (
                              <button
                                key={`edge-${pt.id}`}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPromptModal({
                                    title: `Nhập số đo kỹ thuật cạnh ${pt.label} → ${nextPt.label}`,
                                    label: `Chiều dài thực tế từ điểm ${pt.label} đến điểm ${nextPt.label} (đơn vị: mét)`,
                                    value: String(pt.edgeLengthM ?? paramForm.screenWidthM),
                                    placeholder: 'VD: 4.8',
                                    onConfirm: (val) => {
                                      const num = Number(val.replace(',', '.'));
                                      if (Number.isFinite(num) && num > 0) {
                                        setTouchPoints((prev) =>
                                          prev.map((item, i) =>
                                            i === idx ? { ...item, edgeLengthM: num } : item
                                          )
                                        );
                                        if (idx % 2 === 0) {
                                          setParamForm((pf) => ({ ...pf, screenWidthM: num }));
                                        } else {
                                          setParamForm((pf) => ({ ...pf, screenHeightM: num }));
                                        }
                                      }
                                    },
                                  });
                                }}
                                style={{
                                  left: `${midX}%`,
                                  top: `${midY}%`,
                                  transform: 'translate(-50%, -50%)',
                                }}
                                className="pointer-events-auto absolute rounded-full bg-slate-900/90 px-2.5 py-0.5 text-[11px] font-bold text-cyan-200 shadow border border-cyan-400/50 hover:bg-cyan-950 hover:text-white whitespace-nowrap"
                                title={`Bấm để nhập số mét cho cạnh ${pt.label}${nextPt.label}`}
                              >
                                {pt.label}
                                {nextPt.label}
                                {pt.edgeLengthM ? `: ${pt.edgeLengthM}m` : ''}
                              </button>
                            );
                          })}

                        {/* Draggable Point Nodes (A, B, C, D, E, F...) */}
                        {touchPoints.map((pt, idx) => (
                          <div
                            key={pt.id}
                            onMouseDown={handleMouseDownTouchPoint(idx)}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setTouchPoints((prev) => prev.filter((_, i) => i !== idx));
                            }}
                            style={{
                              left: `${pt.x}%`,
                              top: `${pt.y}%`,
                              transform: 'translate(-50%, -50%)',
                            }}
                            className={`pointer-events-auto absolute flex h-6 w-6 cursor-move items-center justify-center rounded-full border-2 border-white bg-[#06B6D4] text-[10px] font-extrabold text-white shadow-md ring-2 ring-cyan-400/40 transition-transform hover:scale-110 ${
                              draggingPointIdx === idx ? 'scale-125 ring-4 ring-cyan-300' : ''
                            }`}
                            title={`Điểm chạm ${pt.label} (Kéo để di chuyển · Nhấp đúp để xoá điểm này)`}
                          >
                            {pt.label}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Bottom-Right Fullscreen Icon */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!document.fullscreenElement) {
                          canvasContainerRef.current?.requestFullscreen?.();
                        } else {
                          document.exitFullscreen?.();
                        }
                      }}
                      className="absolute bottom-3 right-3 rounded-lg bg-slate-900/75 p-2 text-white backdrop-blur-xs hover:bg-slate-900"
                      title="Toàn màn hình"
                    >
                      <Expand className="h-4 w-4" />
                    </button>
                  </div>
                  )}
                </div>

                {/* BOTTOM STRIP: ONLY AI-EDITED VERSIONS (NO ORIGINAL PHOTO OR FAKE 3D CARDS) */}
                <div className="mt-3 shrink-0">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-slate-600">
                    <span>
                      CÁC PHIÊN BẢN ẢNH SAU KHI AI SỬA ({currentProject?.assetVersions.length || 0}{' '}
                      phiên bản)
                    </span>
                    <span className="text-slate-400">
                      Bấm vào phiên bản bất kỳ để xem lại hoặc phê duyệt chốt
                    </span>
                  </div>
                  <div className="flex gap-2.5 overflow-x-auto pb-1">
                    {(currentProject?.assetVersions || []).map((ver) => {
                      const isSelectedVer =
                        !showHandles &&
                        (selectedVersionId === ver.id || currentVersion?.id === ver.id);
                      const isPosterVer =
                        /poster|banner/i.test(ver.promptUsed || '') ||
                        currentProject?.designType === 'banner';
                      return (
                        <button
                          key={ver.id}
                          type="button"
                          data-testid={`version-card-v${ver.versionNumber}`}
                          onClick={() => {
                            setSelectedVersionId(ver.id);
                            setShowHandles(false);
                            setViewMode('result');
                          }}
                          className="group flex w-44 shrink-0 flex-col text-left focus:outline-none"
                        >
                          <div
                            className={`relative h-20 w-full overflow-hidden rounded-xl border-2 bg-slate-900 transition ${
                              isSelectedVer
                                ? 'border-[#7846FF] ring-2 ring-purple-500/25'
                                : 'border-slate-200 hover:border-purple-300'
                            }`}
                          >
                            <img
                              src={`/api/v1/design/asset/${ver.id}`}
                              alt={`Phiên bản AI v${ver.versionNumber}`}
                              className="h-full w-full object-cover"
                            />
                            {ver.isApprovedFinal && (
                              <span className="absolute right-1.5 top-1.5 rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow">
                                Đã chốt
                              </span>
                            )}
                          </div>
                          <span
                            className={`mt-1 truncate rounded-md px-1.5 py-0.5 text-center text-[11px] font-extrabold ${
                              isSelectedVer
                                ? 'bg-purple-100 text-[#6D28D9]'
                                : 'text-slate-700 group-hover:text-[#6D28D9]'
                            }`}
                          >
                            Phiên bản AI v{ver.versionNumber}:{' '}
                            {isPosterVer ? '@TaoAnhPoster' : `@TaoAnh ${paramForm.pixelPitch}`}
                            {isSelectedVer ? ' [Đang xem]' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ================= RIGHT COLUMN: WIDER "Ô CHAT TRỰC TIẾP VỚI AI" (md:w-[430px] xl:w-[490px]) ================= */}
            <aside
              className={`${
                mobilePane === 'assistant' ? 'flex w-full' : 'hidden md:flex md:w-[420px] xl:w-[485px]'
              } my-2.5 mr-2.5 shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs`}
            >
              {/* Header & Dual-AI Badges */}
              <div className="shrink-0 border-b border-slate-100 p-3.5 pb-2.5">
                <div className="flex items-center justify-between gap-1">
                  <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#17253F]">
                    Ô CHAT PHÂN TÍCH ẢNH &amp; ĐIỂM CHẠM VỚI AI
                  </h2>
                  {/* Hidden test-compatible selects */}
                  <div className="sr-only">
                    <select
                      data-testid="ai-provider-select"
                      value={selectedProviderId}
                      onChange={(e) => setSelectedProviderId(e.target.value as AiProviderId)}
                    >
                      {(providerStatus?.availableProviders || []).map((prov) => (
                        <option key={prov.providerId} value={prov.providerId}>
                          {prov.shortName}
                        </option>
                      ))}
                    </select>
                    <select
                      data-testid="ai-model-select"
                      value={selectedModelId}
                      onChange={(e) => setSelectedModelId(e.target.value)}
                    >
                      {(
                        providerStatus?.availableProviders?.find(
                          (p) => p.providerId === selectedProviderId
                        )?.models || [
                          { id: 'imagen-3.0-generate-002', name: 'Google Imagen 3 Pro' },
                        ]
                      ).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-1.5">
                  {/* Badge 1: Free Consultant AI ($0) */}
                  <div className="flex items-center gap-1.5 rounded-xl bg-[#0BAF7C] px-3 py-1.5 text-xs font-bold text-white shadow-2xs">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Chat thường &amp; Phân tích ảnh: AI Tư vấn Toàn Trung (MIỄN PHÍ $0)
                    </span>
                  </div>

                  {/* Badge 2: @TaoAnh (3D Perspective) & @TaoAnhPoster (Poster/Banner Quảng cáo) */}
                  <button
                    type="button"
                    onClick={() => setShowAiConfigModal(true)}
                    className="flex w-full items-center justify-between gap-1.5 rounded-xl bg-[#7846FF] px-3 py-1.5 text-left text-xs font-bold text-white shadow-2xs hover:bg-[#6D28D9] transition"
                    title="Bấm để cấu hình con AI Tạo Ảnh (@TaoAnh & @TaoAnhPoster)"
                  >
                    <span className="truncate">
                      🎨 Gõ @TaoAnh (Ghép LED vào ảnh) · @TaoAnhPoster (Làm Poster)
                    </span>
                    <Settings2 className="h-3.5 w-3.5 shrink-0 opacity-85" />
                  </button>
                </div>
              </div>

              {/* Chat Thread (Larger text-[13px] for comfortable reading) */}
              <div className="flex-1 min-h-0 space-y-3.5 overflow-y-auto p-4 text-[13px]">
                {currentProject?.chatMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const isTaoAnhPosterCmd =
                    /^\s*@(?:taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner)\b/i.test(
                      msg.text
                    );
                  const isTaoAnhCmd =
                    !isTaoAnhPosterCmd && /^\s*@tao[j]?anh\b/i.test(msg.text);
                  const isImageReply =
                    !isUser &&
                    (msg.chatMode === 'image_generator' || Boolean(msg.versionNumber));

                  if (isUser) {
                    return (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[92%] rounded-2xl rounded-tr-xs border border-indigo-100 bg-[#EEF2FF] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#17253F] shadow-2xs">
                          {isTaoAnhPosterCmd ? (
                            <>
                              <span className="font-extrabold text-pink-600">
                                @TaoAnhPoster:{' '}
                              </span>
                              <span>
                                {msg.text.replace(
                                  /^\s*@(?:taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner)\s*:?\s*/i,
                                  ''
                                )}
                              </span>
                            </>
                          ) : isTaoAnhCmd ? (
                            <>
                              <span className="font-extrabold text-[#7846FF]">@TaoAnh: </span>
                              <span>
                                {msg.text.replace(/^\s*@tao[j]?anh\s*:?\s*/i, '')}
                              </span>
                            </>
                          ) : (
                            <span>{msg.text}</span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (isImageReply) {
                    const matchedVer =
                      currentProject?.assetVersions.find(
                        (v) =>
                          v.id === msg.versionId || v.versionNumber === msg.versionNumber
                      ) || currentVersion;
                    const thumbUrl = matchedVer
                      ? `/api/v1/design/asset/${matchedVer.id}`
                      : versionImageUrl;

                    return (
                      <div key={msg.id} className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#7846FF] text-white shadow-2xs">
                            <Sparkles className="h-3.5 w-3.5" />
                          </span>
                          <span className="rounded-md bg-purple-50 px-2.5 py-0.5 text-xs font-bold text-[#6D28D9] border border-purple-200">
                            AI Đã Sửa Ảnh · Phiên bản v{matchedVer?.versionNumber || msg.versionNumber || 1}
                          </span>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-purple-200 bg-white p-2.5 shadow-2xs space-y-2">
                          <div className="relative h-44 w-full overflow-hidden rounded-xl bg-slate-900">
                            <img
                              src={thumbUrl}
                              alt="Kết quả AI sửa ảnh"
                              className="h-full w-full object-cover"
                            />
                            <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (matchedVer) setSelectedVersionId(matchedVer.id);
                                  setShowHandles(false);
                                  setViewMode('result');
                                }}
                                className="flex-1 rounded-lg bg-white/95 px-3 py-1.5 text-center text-xs font-extrabold text-slate-900 shadow-md hover:bg-white"
                              >
                                Xem trên màn hình lớn
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (matchedVer) setSelectedVersionId(matchedVer.id);
                                  handleSaveFinished();
                                }}
                                className="flex-1 rounded-lg bg-[#0BAF7C] px-3 py-1.5 text-center text-xs font-extrabold text-white shadow-md hover:bg-emerald-700"
                              >
                                Duyệt làm bản chốt
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Free Consultant AI Reply ($0) - Formats multi-line structured Image & Point Analysis clearly
                  const fallbackSuggestedPrompt =
                    msg.suggestedTaoAnhPrompt ||
                    `@TaoAnh: Ghép màn hình LED ${paramForm.pixelPitch} kích thước ${Math.round(paramForm.screenWidthM * 1000)}×${Math.round(paramForm.screenHeightM * 1000)}mm vào đúng các điểm chạm đã chấm trên ảnh hiện trạng, kèm đường gióng kích thước kỹ thuật`;
                  const isSuggestedPoster =
                    /^\s*@taoanhposter/i.test(fallbackSuggestedPrompt);

                  return (
                    <div key={msg.id} className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#0BAF7C] text-white shadow-2xs">
                          <Cpu className="h-3.5 w-3.5" />
                        </span>
                        <span className="rounded-md bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                          AI Tư vấn &amp; Phân tích ảnh · Miễn phí $0
                        </span>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5 text-[13px] leading-relaxed text-[#17253F] space-y-2.5">
                        <div className="space-y-1.5 whitespace-pre-line">
                          {msg.text}
                        </div>

                        <div className="rounded-xl border border-purple-200 bg-purple-50/80 p-3 text-xs text-slate-800">
                          <div className="mb-1 text-[11px] font-bold uppercase text-purple-900">
                            Câu lệnh tạo ảnh AI đã soạn sẵn cho bạn:
                          </div>
                          <span className="font-extrabold text-[#7846FF]">
                            {isSuggestedPoster ? '@TaoAnhPoster: ' : '@TaoAnh: '}
                          </span>
                          <span>
                            {fallbackSuggestedPrompt.replace(
                              /^\s*@(?:taoanhposter|tao[j]?anh)\s*:?\s*/i,
                              ''
                            )}
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => executeChatSubmit(fallbackSuggestedPrompt, true)}
                          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#7846FF] px-3.5 py-2.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#6D28D9] disabled:opacity-50"
                        >
                          <Sparkles className="h-4 w-4" />
                          <span>
                            Chốt phương án này -&gt; Bấm gọi{' '}
                            {isSuggestedPoster ? '@TaoAnhPoster' : '@TaoAnh'} sửa ảnh ngay
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* PII Security Alert */}
              {piiAlert && (
                <div className="mx-3.5 mb-2 flex items-start gap-2 rounded-xl bg-red-50 p-2 text-xs text-red-700 border border-red-200">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                  <span>{piiAlert}</span>
                </div>
              )}

              {/* Bottom Composer with Attached Photo + Touchpoints Preview & Clean 2x2 Action Grid */}
              <div className="shrink-0 border-t border-slate-100 p-3.5 pt-2.5 space-y-2">
                {/* ATTACHED PHOTO & TOUCHPOINT CONTEXT BAR */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {selectedPhoto ? (
                      <img
                        src={sitePhotoUrl}
                        alt="Ảnh đang chọn"
                        className="h-9 w-12 shrink-0 rounded-lg object-cover border border-emerald-300"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => uploadPhotoInputRef.current?.click()}
                        className="flex h-9 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-emerald-400 bg-white text-emerald-700 hover:bg-emerald-100"
                        title="Tải ảnh công trình khảo sát lên"
                      >
                        <Upload className="h-4 w-4" />
                      </button>
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-bold text-slate-800">
                        {selectedPhoto ? selectedPhoto.name : 'Chưa tải ảnh công trình'}
                      </div>
                      <div className="truncate text-[11px] font-semibold text-emerald-800">
                        {touchPoints.length > 0
                          ? `📍 Đã chấm ${touchPoints.length} điểm (${touchPoints.map((p) => p.label).join('→')}) · ${Math.round(paramForm.screenWidthM * 1000)}×${Math.round(paramForm.screenHeightM * 1000)}mm`
                          : `Kích thước: ${Math.round(paramForm.screenWidthM * 1000)}×${Math.round(paramForm.screenHeightM * 1000)}mm (${paramForm.pixelPitch})`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const modCols = Math.max(1, Math.round((paramForm.screenWidthM * 1000) / 320));
                        const modRows = Math.max(1, Math.round((paramForm.screenHeightM * 1000) / 160));
                        const snappedW = Number(((modCols * 320) / 1000).toFixed(2));
                        const snappedH = Number(((modRows * 160) / 1000).toFixed(2));
                        setParamForm((pf) => ({
                          ...pf,
                          screenWidthM: snappedW,
                          screenHeightM: snappedH,
                        }));
                        setSuccessToast(
                          `Đã chuẩn hóa theo bội số Module LED 320×160mm: ${modCols * 320}×${modRows * 160}mm (${modCols} cột × ${modRows} hàng = ${modCols * modRows} Module).`
                        );
                      }}
                      className="rounded-lg border border-emerald-300 bg-white px-2 py-1.5 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 transition"
                      title="Chuẩn hóa kích thước theo bội số Module LED tiêu chuẩn Toàn Trung (320×160mm)"
                    >
                      📐 Chuẩn 320×160
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() =>
                        executeChatSubmit(
                          `Phân tích ảnh công trình hiện tại${
                            touchPoints.length > 0
                              ? ` và ${touchPoints.length} điểm chạm (${touchPoints.map((p) => p.label).join(' → ')}) đã chấm trên ảnh`
                              : ''
                          }, tư vấn kích thước LED ${paramForm.pixelPitch} (${paramForm.screenWidthM}m × ${paramForm.screenHeightM}m) và tạo sẵn lệnh @TaoAnh giúp mình`
                        )
                      }
                      className="rounded-lg bg-[#0BAF7C] px-2.5 py-1.5 text-[11px] font-extrabold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50 transition"
                      title="Gửi ảnh đang chọn và các điểm chạm để AI phân tích miễn phí ($0) và đề xuất câu lệnh @TaoAnh"
                    >
                      🔍 Phân tích ($0)
                    </button>
                  </div>
                </div>

                {/* Clean 2x2 Action Buttons Grid (Never clips or overflows) */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const clean = chatPrompt
                        .replace(
                          /^\s*@(?:taoanhposter|taoposter|tao[j]?anh)\s*:?\s*/i,
                          ''
                        )
                        .trim();
                      handlePromptChange(
                        `@TaoAnh: ${
                          clean ||
                          `Ghép màn hình LED ${paramForm.pixelPitch} kích thước ${Math.round(paramForm.screenWidthM * 1000)}×${Math.round(paramForm.screenHeightM * 1000)}mm vào các điểm chạm đã chấm trên ảnh, kèm đường gióng kích thước kỹ thuật`
                        }`
                      );
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl bg-[#7846FF] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-[#6D28D9] transition truncate"
                    title="Gọi lệnh @TaoAnh để AI sửa ảnh và ghép màn hình LED vào vị trí đã chấm điểm"
                  >
                    <span>🏢 @TaoAnh (Phối cảnh 3D)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePromptChange(
                        `@TaoAnh: Cận cảnh chi tiết đường gióng kỹ thuật màn hình LED ${paramForm.pixelPitch} kích thước ${Math.round(paramForm.screenWidthM * 1000)}×${Math.round(paramForm.screenHeightM * 1000)}mm theo đơn vị mm`
                      );
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl bg-sky-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-sky-700 transition truncate"
                    title="Tạo ảnh cận cảnh zoom chi tiết các đường gióng kích thước mm"
                  >
                    <span>📏 Cận cảnh đường gióng (mm)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const clean = chatPrompt
                        .replace(
                          /^\s*@(?:taoanhposter|taoposter|tao[j]?anh)\s*:?\s*/i,
                          ''
                        )
                        .trim();
                      handlePromptChange(
                        `@TaoAnhPoster: ${
                          clean ||
                          `Thiết kế Poster quảng cáo LED tỷ lệ ${paramForm.aspectRatio} (${computedLiveSpecs.resW}×${computedLiveSpecs.resH}px) nổi bật thương hiệu Toàn Trung`
                        }`
                      );
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl bg-pink-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-pink-700 transition truncate"
                    title="Gọi lệnh @TaoAnhPoster để thiết kế Poster / Banner quảng cáo"
                  >
                    <span>🖼️ @TaoAnhPoster (Tạo Banner)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handlePromptChange(
                        `@TaoAnh: Áp mẫu Banner Poster vừa thiết kế lên màn hình LED ${paramForm.pixelPitch} (${Math.round(paramForm.screenWidthM * 1000)}×${Math.round(paramForm.screenHeightM * 1000)}mm) tại các điểm chạm đã chấm trên công trình`
                      );
                    }}
                    className="flex items-center justify-center gap-1 rounded-xl bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xs hover:bg-amber-700 transition truncate"
                    title="Lấy mẫu Banner/Poster vừa tạo (@TaoAnhPoster) ghép trực tiếp vào trong màn hình LED trên mặt dựng công trình"
                  >
                    <span>📺 Áp Poster lên mặt dựng</span>
                  </button>
                </div>

                {/* Prompt Library + Quick Save Prompt Bar */}
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    data-testid="open-prompt-library-btn"
                    onClick={() => {
                      setEditingPromptId(null);
                      setNewSavedPromptTitle('');
                      setNewSavedPromptText(chatPrompt.trim());
                      setShowPromptLibraryModal(true);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/90 px-3 py-1.5 text-[11px] font-extrabold text-indigo-800 shadow-2xs hover:bg-indigo-100 transition"
                    title="Mở Thư viện Lưu trữ các câu lệnh Prompt mẫu & cá nhân"
                  >
                    <span>📚 Thư viện Lệnh Prompt ({promptLibrary.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = chatPrompt.trim();
                      if (!trimmed) {
                        setEditingPromptId(null);
                        setNewSavedPromptTitle('');
                        setNewSavedPromptText('');
                        setShowPromptLibraryModal(true);
                        return;
                      }
                      const autoCat: 'tao_anh' | 'tao_poster' | 'tu_van' =
                        /^\s*@taoanhposter\b/i.test(trimmed)
                          ? 'tao_poster'
                          : /^\s*@tao[j]?anh\b/i.test(trimmed)
                            ? 'tao_anh'
                            : 'tu_van';
                      const newItem = {
                        id: `custom-${Date.now()}`,
                        title:
                          trimmed
                            .replace(/^\s*@(?:taoanhposter|taoposter|tao[j]?anh)\s*:?\s*/i, '')
                            .slice(0, 48) || 'Câu lệnh Prompt đã lưu',
                        prompt: trimmed,
                        category: autoCat,
                        createdAt: new Date().toLocaleDateString('vi-VN'),
                      };
                      savePromptLibraryToStorage([newItem, ...promptLibrary]);
                      setSuccessToast('Đã lưu câu lệnh hiện tại vào Thư viện Prompt!');
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-700 hover:bg-emerald-100 transition"
                    title="Lưu nhanh câu lệnh đang gõ ở ô chat vào Thư viện Prompt"
                  >
                    <span>💾 Lưu lệnh</span>
                  </button>
                </div>

                <form onSubmit={handleSendChatEdit} className="relative">
                  <textarea
                    rows={3}
                    data-testid="ai-chat-prompt-input"
                    value={chatPrompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    placeholder="Nhập yêu cầu phân tích ảnh (miễn phí $0), hoặc gõ @TaoAnh / @TaoAnhPoster để AI sửa ảnh ngay..."
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50/70 p-3 pr-24 text-[13px] text-slate-900 placeholder-slate-400 focus:border-[#7846FF] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    data-testid="ai-chat-submit-btn"
                    disabled={
                      !chatPrompt.trim() || submitting || Boolean(piiAlert) || !canUseAiDesign
                    }
                    className={`absolute bottom-3 right-2.5 inline-flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition disabled:opacity-50 ${
                      /^\s*@taoanhposter\b/i.test(chatPrompt)
                        ? 'bg-pink-600 hover:bg-pink-700'
                        : /^\s*@tao[j]?anh\b/i.test(chatPrompt)
                          ? 'bg-[#7846FF] hover:bg-[#6D28D9]'
                          : 'bg-[#1553A2] hover:bg-[#1E40AF]'
                    }`}
                  >
                    {submitting ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <span>Gửi</span>
                        <Send className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>
                </form>
              </div>
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
                  Ảnh công trình khảo sát (Tùy chọn — có thể tải thêm sau):
                </label>
                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:bg-blue-50/40">
                  <span className="truncate">
                    {newProjectFiles.length > 0
                      ? `Đã chọn ${newProjectFiles.length} ảnh (${newProjectFiles.map((f) => f.name).join(', ')})`
                      : '📤 Bấm để chọn ảnh công trình của dự án này...'}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setNewProjectFiles(files);
                    }}
                  />
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ghi chú vị trí lắp đặt (Tùy chọn):
                </label>
                <textarea
                  rows={2}
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="VD: Mặt tiền sảnh chính, vách hội trường tầng 2..."
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

      {/* MODAL: QUẢN TRỊ 2 CON AI (DUAL-AI ENGINE HUB CHO ADMIN) */}
      {showAiConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-[#7846FF] border border-purple-200">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Quản trị 2 Con AI (Admin): AI Tư vấn Miễn phí ($0) &amp; AI Tạo Ảnh (@TaoAnh)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cấu hình Con AI 1 (Trò chuyện tư vấn &amp; viết hộ câu lệnh miễn phí $0) và Con AI 2 (Chỉ chạy khi gọi lệnh @TaoAnh: để tối ưu chi phí).
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

            {/* Top Banner: Con AI 1 (Free Consultant AI Config) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200/80 bg-emerald-50/70 px-6 py-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-[#0BAF7C] px-2.5 py-0.5 text-[11px] font-extrabold text-white">
                  CON AI 1 · CHAT THƯỜNG ($0)
                </span>
                <span className="font-bold text-emerald-950">
                  Trợ lý Tư vấn Kỹ thuật LED Toàn Trung &amp; Soạn hộ lệnh @TaoAnh:
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-emerald-800">Model Tư vấn Free:</span>
                <select
                  value={consultantModelName}
                  onChange={(e) => setConsultantModelName(e.target.value)}
                  className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-xs font-bold text-emerald-950 focus:outline-none"
                >
                  <option value="Gemini 2.5 Flash (Free $0)">Google Gemini 2.5 Flash (Free Tier $0)</option>
                  <option value="Gemini 2.0 Flash-Lite (Free $0)">Google Gemini 2.0 Flash-Lite (Free Tier $0)</option>
                  <option value="Toàn Trung LED Consultant Rules ($0)">Toàn Trung LED Consultant Engine (Offline $0)</option>
                </select>
              </div>
            </div>

            {/* Body: Con AI 2 (@TaoAnh Image Generator AI Config) */}
            <form
              onSubmit={handleSaveAiProviderConfig}
              className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-12 overflow-y-auto"
            >
              {/* Left Column: 6 AI Provider Cards */}
              <div className="md:col-span-5 border-r border-slate-200 bg-slate-50/60 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#6D28D9] mb-2">
                  <span>CON AI 2 · KHI GỌI LỆNH @TAOANH:</span>
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
      {/* MODAL: PROMPT LIBRARY ("THƯ VIỆN LƯU TRỮ CÁC LỆNH PROMPT") */}
      {showPromptLibraryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setShowPromptLibraryModal(false)}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#17253F] to-[#1E3A8A] px-5 py-3.5 text-white">
              <div>
                <h3 className="text-base font-extrabold flex items-center gap-2">
                  <span>📚 Thư viện Lưu trữ Lệnh Prompt (Toàn Trung AI Studio)</span>
                </h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  Lưu trữ, phân loại và tái sử dụng nhanh các câu lệnh @TaoAnh, @TaoAnhPoster và Phân tích kỹ thuật ($0)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPromptLibraryModal(false)}
                className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold text-white hover:bg-white/20"
              >
                ✕ Đóng
              </button>
            </div>

            {/* Add / Edit Prompt Form */}
            <div className="border-b border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
                  {editingPromptId ? '✏️ Chỉnh sửa lệnh Prompt đã lưu' : '➕ Thêm / Lưu lệnh Prompt mới vào thư viện'}
                </span>
                {editingPromptId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPromptId(null);
                      setNewSavedPromptTitle('');
                      setNewSavedPromptText('');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800"
                  >
                    Huỷ sửa
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <input
                  type="text"
                  value={newSavedPromptTitle}
                  onChange={(e) => setNewSavedPromptTitle(e.target.value)}
                  placeholder="Tên gợi nhớ (VD: Phối cảnh LED P2.5 Hội trường)..."
                  className="sm:col-span-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#1553A2] focus:outline-none"
                />
                <select
                  value={newSavedPromptCat}
                  onChange={(e) =>
                    setNewSavedPromptCat(e.target.value as 'tao_anh' | 'tao_poster' | 'tu_van')
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:border-[#1553A2] focus:outline-none"
                >
                  <option value="tao_anh">🏢 @TaoAnh (Phối cảnh 3D)</option>
                  <option value="tao_poster">🖼️ @TaoAnhPoster (Banner/Poster)</option>
                  <option value="tu_van">🔍 Phân tích &amp; Tư vấn ($0)</option>
                </select>
              </div>
              <div className="mt-2 flex gap-2">
                <textarea
                  rows={2}
                  value={newSavedPromptText}
                  onChange={(e) => setNewSavedPromptText(e.target.value)}
                  placeholder="Nhập nội dung câu lệnh Prompt (VD: @TaoAnh: Ghép màn hình LED P2.5 4800x2700mm vào 4 điểm chạm...)"
                  className="flex-1 resize-none rounded-xl border border-slate-300 bg-white p-2.5 text-xs text-slate-800 focus:border-[#1553A2] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const text = newSavedPromptText.trim();
                    if (!text) return;
                    const title =
                      newSavedPromptTitle.trim() ||
                      text
                        .replace(/^\s*@(?:taoanhposter|taoposter|tao[j]?anh)\s*:?\s*/i, '')
                        .slice(0, 48) ||
                      'Lệnh Prompt mới';
                    if (editingPromptId) {
                      const updated = promptLibrary.map((item) =>
                        item.id === editingPromptId
                          ? { ...item, title, prompt: text, category: newSavedPromptCat }
                          : item
                      );
                      savePromptLibraryToStorage(updated);
                      setEditingPromptId(null);
                      setSuccessToast('Đã cập nhật câu lệnh trong Thư viện Prompt!');
                    } else {
                      const newItem = {
                        id: `custom-${Date.now()}`,
                        title,
                        prompt: text,
                        category: newSavedPromptCat,
                        createdAt: new Date().toLocaleDateString('vi-VN'),
                      };
                      savePromptLibraryToStorage([newItem, ...promptLibrary]);
                      setSuccessToast('Đã thêm lệnh mới vào Thư viện Prompt!');
                    }
                    setNewSavedPromptTitle('');
                    setNewSavedPromptText('');
                  }}
                  disabled={!newSavedPromptText.trim()}
                  className="shrink-0 rounded-xl bg-[#1553A2] px-4 py-2 text-xs font-extrabold text-white shadow-xs hover:bg-[#1E3A8A] disabled:opacity-40"
                >
                  {editingPromptId ? '💾 Cập nhật' : '+ Lưu vào thư viện'}
                </button>
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-2.5">
              {[
                { id: 'all', label: `Tất cả (${promptLibrary.length})` },
                {
                  id: 'tao_anh',
                  label: `🏢 Phối cảnh @TaoAnh (${promptLibrary.filter((p) => p.category === 'tao_anh').length})`,
                },
                {
                  id: 'tao_poster',
                  label: `🖼️ Banner @TaoAnhPoster (${promptLibrary.filter((p) => p.category === 'tao_poster').length})`,
                },
                {
                  id: 'tu_van',
                  label: `🔍 Tư vấn $0 (${promptLibrary.filter((p) => p.category === 'tu_van').length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setPromptLibCategoryFilter(
                      tab.id as 'all' | 'tao_anh' | 'tao_poster' | 'tu_van'
                    )
                  }
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    promptLibCategoryFilter === tab.id
                      ? 'bg-[#1553A2] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Saved Prompts List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {promptLibrary
                .filter(
                  (item) =>
                    promptLibCategoryFilter === 'all' || item.category === promptLibCategoryFilter
                )
                .map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-blue-300 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold ${
                              item.category === 'tao_poster'
                                ? 'bg-pink-100 text-pink-700'
                                : item.category === 'tao_anh'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {item.category === 'tao_poster'
                              ? '@TaoAnhPoster'
                              : item.category === 'tao_anh'
                                ? '@TaoAnh 3D'
                                : 'Tư vấn $0'}
                          </span>
                          <h4 className="truncate text-xs font-extrabold text-slate-900">
                            {item.title}
                          </h4>
                          <span className="text-[10px] font-medium text-slate-400">
                            · {item.createdAt}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100 font-medium">
                          {item.prompt}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPromptId(item.id);
                          setNewSavedPromptTitle(item.title);
                          setNewSavedPromptText(item.prompt);
                          setNewSavedPromptCat(item.category);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                      >
                        ✏️ Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const filtered = promptLibrary.filter((p) => p.id !== item.id);
                          savePromptLibraryToStorage(filtered);
                          setSuccessToast(`Đã xoá lệnh "${item.title}" khỏi thư viện.`);
                        }}
                        className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-100"
                      >
                        🗑 Xoá
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handlePromptChange(item.prompt);
                          setShowPromptLibraryModal(false);
                          setSuccessToast(`Đã chèn lệnh "${item.title}" vào ô chat.`);
                        }}
                        className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-extrabold text-[#1553A2] hover:bg-blue-100"
                      >
                        📥 Chèn vào ô chat
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handlePromptChange(item.prompt);
                          setShowPromptLibraryModal(false);
                          executeChatSubmit(item.prompt);
                        }}
                        className="rounded-lg bg-[#7846FF] px-3 py-1 text-[11px] font-extrabold text-white shadow-2xs hover:bg-[#6D28D9]"
                      >
                        ⚡ Chạy lệnh ngay
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
