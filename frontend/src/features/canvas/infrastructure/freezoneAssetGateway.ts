// Copyright (c) 2026 AI anime
import { uploadFreezoneAsset } from '@/features/freezone/public';

import { dataUrlToBlob } from '../application/imageData';
import type {
  CanvasAssetGateway,
  CanvasAssetSourceGateway,
} from '../application/ports';

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  return 'png';
}

export async function ensureBackendImageUrl(
  projectId: string,
  rawUrl: string,
): Promise<string> {
  if (rawUrl.startsWith('data:')) {
    const blob = dataUrlToBlob(rawUrl);
    const extension = extensionForMime(blob.type);
    const uploaded = await uploadFreezoneAsset(
      projectId,
      blob,
      `paste-${Date.now()}.${extension}`,
    );
    return uploaded.url.split('?')[0];
  }
  return rawUrl.split('?')[0];
}

export async function ensureBackendImageUrls(
  projectId: string,
  rawUrls: readonly string[] | null | undefined,
): Promise<string[]> {
  if (!rawUrls || rawUrls.length === 0) return [];
  const cleaned = rawUrls.filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0,
  );
  return await Promise.all(
    cleaned.map((url) => ensureBackendImageUrl(projectId, url)),
  );
}

export const freezoneAssetGateway: CanvasAssetGateway & CanvasAssetSourceGateway = {
  async read(source, options) {
    // Production CSP blocks network reads of data URLs, so decode them directly.
    if (source.startsWith('data:')) {
      return dataUrlToBlob(source);
    }
    const response = await fetch(
      source,
      options?.includeCredentials ? { credentials: 'include' } : undefined,
    );
    if (!response.ok) {
      throw new Error(`fetch asset source failed: ${response.status}`);
    }
    return await response.blob();
  },
  async upload(projectId, file, filename, options) {
    return await uploadFreezoneAsset(
      projectId,
      file,
      filename,
      options,
    );
  },
};
