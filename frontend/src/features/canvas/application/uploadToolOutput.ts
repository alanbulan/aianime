// Copyright (c) 2026 AI anime
import type { CanvasAssetGateway } from './ports';
import { dataUrlToBlob } from './imageData';

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
  assetGateway: CanvasAssetGateway,
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
    // CSP `connect-src 'self'` blocks `fetch('data:...')` in production, so
    // decode data URLs directly instead of fetching them. Other (same-origin)
    // local paths still go through fetch.
    let blob: Blob;
    if (trimmed.startsWith('data:')) {
      blob = dataUrlToBlob(trimmed);
    } else {
      const resp = await fetch(trimmed);
      if (!resp.ok) {
        throw new Error(`fetch local image failed: ${resp.status}`);
      }
      blob = await resp.blob();
    }
    return await assetGateway.upload(projectId, blob, filename);
  } catch (error) {
    console.warn('[upload-tool-output] upload failed, keeping local URL', { filename, error });
    return localImageUrl;
  }
}
