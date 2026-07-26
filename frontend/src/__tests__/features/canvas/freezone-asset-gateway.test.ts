// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

const uploadFreezoneImage = vi.hoisted(() => vi.fn());

vi.mock('@/api/ops', () => ({
  uploadFreezoneImage,
}));

import { freezoneAssetGateway } from '@/features/canvas/infrastructure/freezoneAssetGateway';

describe('freezone asset source gateway', () => {
  afterEach(() => {
    uploadFreezoneImage.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns complete upload metadata and maps the disabled timeout option', async () => {
    const uploaded = {
      url: '/static/upload.png',
      filename: 'sanitized-upload.png',
      size: 42,
    };
    const blob = new Blob(['asset'], { type: 'image/png' });
    uploadFreezoneImage.mockResolvedValue(uploaded);

    await expect(
      freezoneAssetGateway.upload('project-1', blob, '../upload.png', {
        disableTimeout: true,
      }),
    ).resolves.toEqual(uploaded);
    expect(uploadFreezoneImage).toHaveBeenCalledWith(
      'project-1',
      blob,
      '../upload.png',
      { timeoutMs: false },
    );
  });

  it('decodes data URLs without using fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const blob = await freezoneAssetGateway.read(
      'data:image/png;base64,eA==',
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(blob.type).toBe('image/png');
    await expect(blob.text()).resolves.toBe('x');
  });

  it('includes credentials when reading a cross-project source asset', async () => {
    const blob = new Blob(['asset']);
    const fetchMock = vi.fn().mockResolvedValue({
      blob: async () => blob,
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      freezoneAssetGateway.read('/static/source.png', {
        includeCredentials: true,
      }),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/static/source.png', {
      credentials: 'include',
    });
  });

  it('uses default fetch credentials for ordinary local output', async () => {
    const blob = new Blob(['asset']);
    const fetchMock = vi.fn().mockResolvedValue({
      blob: async () => blob,
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      freezoneAssetGateway.read('/local/output.png'),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/local/output.png', undefined);
  });
});
