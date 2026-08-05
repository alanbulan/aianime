// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  uploadLocalImageToBackend,
  type CanvasToolAssetGateway,
  type CanvasToolAssetSourceGateway,
} from './uploadToolOutput';

const uploadAsset = vi.fn();
const readAsset = vi.fn();
const assetGateway: CanvasToolAssetGateway = {
  upload: (projectId, file, filename, options) =>
    uploadAsset(projectId, file, filename, options),
};
const assetSourceGateway: CanvasToolAssetSourceGateway = {
  read: (source, options) => readAsset(source, options),
};

describe('uploadLocalImageToBackend', () => {
  beforeEach(() => {
    readAsset.mockReset().mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    uploadAsset.mockReset();
    uploadAsset.mockResolvedValue({
      url: '/static/projects/proj/uploads/output.png',
      filename: 'output.png',
      size: 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps remote URLs without uploading them again', async () => {
    const url = 'https://cdn.example.com/output.png';

    await expect(
      uploadLocalImageToBackend(
        assetGateway,
        assetSourceGateway,
        'proj',
        url,
        'output.png',
      ),
    ).resolves.toBe(url);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it('reads data URLs and uploads them through the asset gateway', async () => {
    const result = await uploadLocalImageToBackend(
      assetGateway,
      assetSourceGateway,
      'proj',
      'data:image/png;base64,eA==',
      'output.png',
    );

    expect(result).toBe('/static/projects/proj/uploads/output.png');
    expect(readAsset).toHaveBeenCalledWith(
      'data:image/png;base64,eA==',
      undefined,
    );
    expect(uploadAsset).toHaveBeenCalledWith(
      'proj',
      expect.any(Blob),
      'output.png',
      undefined,
    );
  });

  it('keeps the local URL when no project is selected', async () => {
    await expect(
      uploadLocalImageToBackend(
        assetGateway,
        assetSourceGateway,
        null,
        '/local/output.png',
        'output.png',
      ),
    ).resolves.toBe('/local/output.png');
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it('keeps the local URL when uploading fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    uploadAsset.mockRejectedValue(new Error('upload failed'));

    await expect(
      uploadLocalImageToBackend(
        assetGateway,
        assetSourceGateway,
        'proj',
        'data:image/png;base64,eA==',
        'output.png',
      ),
    ).resolves.toBe('data:image/png;base64,eA==');
    expect(warning).toHaveBeenCalledWith(
      '[upload-tool-output] upload failed, keeping local URL',
      expect.objectContaining({ filename: 'output.png' }),
    );
  });
});
