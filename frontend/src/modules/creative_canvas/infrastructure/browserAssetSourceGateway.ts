// Copyright (c) 2026 AI anime
import { dataUrlToBlob } from '@/shared/media/data-url';

export interface BrowserAssetSourceReadOptions {
  includeCredentials?: boolean;
}

export const browserAssetSourceGateway = {
  async read(
    source: string,
    options?: BrowserAssetSourceReadOptions,
  ): Promise<Blob> {
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
};
