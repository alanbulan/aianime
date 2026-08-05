// Copyright (c) 2026 AI anime
export interface CanvasToolAssetUploadOptions {
  disableTimeout?: boolean;
}

export interface CanvasToolAssetUploadResult {
  readonly url: string;
  readonly filename: string;
  readonly size: number;
}

export interface CanvasToolAssetGateway {
  upload: (
    projectId: string,
    file: File | Blob,
    filename: string,
    options?: CanvasToolAssetUploadOptions,
  ) => Promise<CanvasToolAssetUploadResult>;
}

export interface CanvasToolAssetSourceGateway {
  read: (
    source: string,
    options?: { includeCredentials?: boolean },
  ) => Promise<Blob>;
}

/**
 * Locally-produced images (crop / annotate / split frames / 360 captures /
 * storyboard exports) start life as data URLs or local file paths. Persist them
 * to the freezone backend so the node's `imageUrl` is a real http(s) URL —
 * otherwise downstream generation requests carry the full base64 payload.
 *
 * Best-effort by design: if there's no active project, or the upload fails,
 * we return the original local URL so the feature still works (just without the
 * upload optimization) and log a warning.
 */
export async function uploadLocalImageToBackend(
  assetGateway: CanvasToolAssetGateway,
  assetSourceGateway: CanvasToolAssetSourceGateway,
  projectId: string | null | undefined,
  localImageUrl: string,
  filename: string
): Promise<string> {
  const trimmed = localImageUrl?.trim();
  if (!trimmed) {
    return localImageUrl;
  }
  // Already a remote URL — nothing to upload.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (!projectId) {
    console.warn('[upload-tool-output] no project selected - keeping local URL', filename);
    return localImageUrl;
  }

  try {
    const blob = await assetSourceGateway.read(trimmed);
    const uploaded = await assetGateway.upload(projectId, blob, filename);
    return uploaded.url;
  } catch (error) {
    console.warn('[upload-tool-output] upload failed, keeping local URL', { filename, error });
    return localImageUrl;
  }
}
