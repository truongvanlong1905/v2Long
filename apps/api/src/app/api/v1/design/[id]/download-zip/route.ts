import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@toantrung/database';
import { hasBaPermission } from '@toantrung/contracts';
import { jsonError } from '../../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../../core/permissions';
import { ZipArchive } from '../../../../../../core/export/xlsx-builder';
import { readPrivateBusinessFile } from '../../../../../../core/storage/private-files.service';
import { renderSyntheticLedPngBuffer } from '../../../../../../modules/05-ai-design/providers';

export async function GET(
  req: Request,
  context: { params: { id: string } }
) {
  const auth = await requireAuthenticatedSession(req);
  if (!auth.ok) return auth.response;

  const canDownload =
    hasBaPermission(auth.user.roleCode, 'AI_DESIGN') ||
    hasBaPermission(auth.user.roleCode, 'ATTACHMENT_UPLOAD_VIEW') ||
    hasBaPermission(auth.user.roleCode, 'EXPORT_DATA');

  if (!canDownload) {
    return jsonError(
      'FORBIDDEN_PERMISSION',
      'Tài khoản không có quyền tải xuống gói Kho ảnh dự án (ZIP).',
      403
    );
  }

  const requestId = Number(context.params.id);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    return jsonError('INVALID_ID', 'Mã dự án thiết kế không hợp lệ.', 400);
  }

  const row = await prisma.designRequest.findUnique({
    where: { id: requestId },
    include: {
      lead: true,
      assetVersions: {
        orderBy: { versionNumber: 'asc' },
      },
    },
  });

  if (!row) {
    return jsonError('NOT_FOUND', 'Không tìm thấy dự án thiết kế yêu cầu.', 404);
  }

  const url = new URL(req.url);
  const folderFilter = url.searchParams.get('folder') || 'all'; // 'all' | 'technical' | 'designs'
  const idsParam = url.searchParams.get('ids') || '';
  const selectedIds = idsParam
    ? new Set(idsParam.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  const zip = new ZipArchive();
  let meta: {
    projectName?: string;
    photos?: Array<{ id: string; name: string; url: string; storageObjectKey?: string }>;
    productSpec?: unknown;
  } = {};
  try {
    if (row.installPositionJson) {
      meta = JSON.parse(row.installPositionJson);
    }
  } catch {
    meta = {};
  }

  const safeProjectSlug = (meta.projectName || `DuAn_${row.id}`)
    .replace(/[^\w.-]/g, '_')
    .slice(0, 40);

  // 1. Add project technical summary JSON
  zip.addFile(
    'Thong_So_Du_An.json',
    JSON.stringify(
      {
        projectId: row.id,
        projectName: meta.projectName || `Dự án #${row.id}`,
        leadCode: row.lead?.leadCode || null,
        requestType: row.requestType,
        ledCategory: row.ledCategory,
        screenDimensions: row.screenDimensions,
        aspectRatio: row.aspectRatio,
        status: row.designStatus,
        productSpec: meta.productSpec || null,
        exportedBy: auth.user.fullName,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );

  // 2. Include Ảnh kỹ thuật (input photos)
  if (folderFilter === 'all' || folderFilter === 'technical') {
    const photos = meta.photos && meta.photos.length > 0
      ? meta.photos
      : [
          {
            id: 'photo-default-1',
            name: 'Anh_chinh_dien_showroom.webp',
            url: '/brand/showroom-toan-trung.webp',
          },
        ];

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (selectedIds && !selectedIds.has(p.id)) continue;

      let fileBuf: Buffer | null = null;
      let ext = '.png';

      if (p.storageObjectKey) {
        const priv = readPrivateBusinessFile(p.storageObjectKey);
        if (priv) {
          fileBuf = priv.buffer;
          ext = path.extname(priv.fileName) || '.png';
        }
      }

      if (!fileBuf && p.url.startsWith('/brand/')) {
        const publicCandidates = [
          path.resolve(process.cwd(), '../web/public', p.url.replace(/^\//, '')),
          path.resolve(process.cwd(), 'apps/web/public', p.url.replace(/^\//, '')),
        ];
        for (const cand of publicCandidates) {
          if (fs.existsSync(cand)) {
            fileBuf = fs.readFileSync(cand);
            ext = path.extname(cand) || '.webp';
            break;
          }
        }
      }

      if (!fileBuf) {
        fileBuf = renderSyntheticLedPngBuffer({
          mode: 'perspective_3d',
          prompt: `Ảnh kỹ thuật: ${p.name}`,
          seedKey: `tech-${row.id}-${p.id}`,
        });
        ext = '.png';
      }

      const cleanName = p.name.replace(/[^\w.-]/g, '_').replace(/\.(png|jpe?g|webp)$/i, '');
      zip.addFile(`Anh_Ky_Thuat/${String(i + 1).padStart(2, '0')}_${cleanName}${ext}`, fileBuf);
    }
  }

  // 3. Include Bản thiết kế (AI drafts & approved final renders)
  if (folderFilter === 'all' || folderFilter === 'designs') {
    for (const ver of row.assetVersions) {
      if (selectedIds && !selectedIds.has(`ver-${ver.id}`) && !selectedIds.has(String(ver.id))) {
        continue;
      }

      const priv = readPrivateBusinessFile(ver.storageObjectKey);
      let fileBuf: Buffer;
      if (priv && priv.buffer.length > 200) {
        fileBuf = priv.buffer;
      } else {
        fileBuf = renderSyntheticLedPngBuffer({
          mode: row.requestType === 'banner' ? 'banner' : 'perspective_3d',
          prompt: ver.promptUsed || `Bản thiết kế v${ver.versionNumber}`,
          seedKey: `ver-${ver.id}-v${ver.versionNumber}`,
        });
      }

      const tag = ver.isApprovedFinal
        ? 'BAN_CHOT_DUYET'
        : ver.versionType === 'final_render'
          ? 'DESIGNER_FINAL'
          : 'AI_DRAFT';
      zip.addFile(`Ban_Thiet_Ke/v${ver.versionNumber}_${tag}_req${row.id}.png`, fileBuf);
    }
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: auth.user.id,
      action: 'DESIGN_PROJECT_ZIP_DOWNLOADED',
      targetType: 'DesignRequest',
      targetId: String(row.id),
      detailsJson: JSON.stringify({
        folderFilter,
        versionCount: row.assetVersions.length,
      }),
    },
  });

  const zipBuffer = zip.toBuffer();
  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="KhoAnhDuAn_${safeProjectSlug}_#${row.id}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

