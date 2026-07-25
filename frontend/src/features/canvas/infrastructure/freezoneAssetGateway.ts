// Copyright (c) 2026 AI anime
import { uploadFreezoneImage } from '@/api/ops';

import type { CanvasAssetGateway } from '../application/ports';

export const freezoneAssetGateway: CanvasAssetGateway = {
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
