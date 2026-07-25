// Copyright (c) 2026 AI anime
import { uploadFreezoneImage } from '@/api/ops';

import { dataUrlToBlob } from '../application/imageData';
import type {
  CanvasAssetGateway,
  CanvasAssetSourceGateway,
} from '../application/ports';

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
    const uploaded = await uploadFreezoneImage(
      projectId,
      file,
      filename,
      options?.disableTimeout ? { timeoutMs: false } : undefined,
    );
    return uploaded.url;
  },
};
