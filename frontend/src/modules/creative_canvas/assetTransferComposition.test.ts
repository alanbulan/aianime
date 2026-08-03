// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

const upload = vi.hoisted(() => vi.fn());

vi.mock('./infrastructure/httpFreezoneAssetUploadGateway', () => ({
  httpFreezoneAssetUploadGateway: { upload },
}));

import { platformCanvasAssetGateway } from './assetTransferComposition';

describe('platformCanvasAssetGateway', () => {
  afterEach(() => {
    upload.mockReset();
    vi.unstubAllGlobals();
  });

  it('uploads through the platform object-storage endpoint', async () => {
    const uploaded = {
      url: '/static/upload.png',
      filename: 'sanitized-upload.png',
      size: 42,
    };
    const blob = new Blob(['asset'], { type: 'image/png' });
    upload.mockResolvedValue(uploaded);

    await expect(
      platformCanvasAssetGateway.upload(
        'project-1',
        blob,
        '../upload.png',
        { disableTimeout: true },
      ),
    ).resolves.toEqual(uploaded);
    expect(upload).toHaveBeenCalledWith({
      projectId: 'project-1',
      file: blob,
      filename: '../upload.png',
      options: { disableTimeout: true },
    });
  });

  it('decodes data URLs without using fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const blob = await platformCanvasAssetGateway.read(
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
      platformCanvasAssetGateway.read('/static/source.png', {
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
      platformCanvasAssetGateway.read('/local/output.png'),
    ).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/local/output.png', undefined);
  });
});
