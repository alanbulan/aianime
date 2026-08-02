// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

const uploadFreezoneAsset = vi.hoisted(() => vi.fn());

vi.mock('@/modules/creative_canvas/public', () => ({
  uploadFreezoneAsset,
}));

import {
  ensureBackendImageUrl,
  ensureBackendImageUrls,
  freezoneAssetGateway,
} from '@/features/canvas/infrastructure/freezoneAssetGateway';

describe('freezone asset source gateway', () => {
  afterEach(() => {
    uploadFreezoneAsset.mockReset();
    vi.unstubAllGlobals();
  });

  it('returns complete upload metadata and maps the disabled timeout option', async () => {
    const uploaded = {
      url: '/static/upload.png',
      filename: 'sanitized-upload.png',
      size: 42,
    };
    const blob = new Blob(['asset'], { type: 'image/png' });
    uploadFreezoneAsset.mockResolvedValue(uploaded);

    await expect(
      freezoneAssetGateway.upload('project-1', blob, '../upload.png', {
        disableTimeout: true,
      }),
    ).resolves.toEqual(uploaded);
    expect(uploadFreezoneAsset).toHaveBeenCalledWith(
      'project-1',
      blob,
      '../upload.png',
      { disableTimeout: true },
    );
  });

  it('uploads data URLs and strips the response cache buster', async () => {
    uploadFreezoneAsset.mockResolvedValue({
      url: '/static/upload.png?v=123',
      filename: 'upload.png',
      size: 1,
    });

    await expect(
      ensureBackendImageUrl('project-1', 'data:image/png;base64,eA=='),
    ).resolves.toBe('/static/upload.png');
    expect(uploadFreezoneAsset).toHaveBeenCalledWith(
      'project-1',
      expect.any(Blob),
      expect.stringMatching(/^paste-\d+\.png$/),
    );
  });

  it('normalizes static URL batches without uploading blank entries', async () => {
    await expect(
      ensureBackendImageUrls('project-1', [
        '',
        '   ',
        '/static/source-a.png?v=1',
        '/static/source-b.png',
      ]),
    ).resolves.toEqual([
      '/static/source-a.png',
      '/static/source-b.png',
    ]);
    expect(uploadFreezoneAsset).not.toHaveBeenCalled();
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
