// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadLocalImageToBackend } from '@/features/canvas/application/uploadToolOutput';
import type { CanvasAssetGateway } from '@/features/canvas/application/ports';

const uploadAsset = vi.fn();
const assetGateway: CanvasAssetGateway = {
  upload: (projectId, file, filename, options) =>
    uploadAsset(projectId, file, filename, options),
};

describe('uploadLocalImageToBackend', () => {
  beforeEach(() => {
    uploadAsset.mockReset();
    uploadAsset.mockResolvedValue('/static/projects/proj/uploads/output.png');
    window.history.replaceState({}, '', '/projects/proj/freezone');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('keeps remote URLs without uploading them again', async () => {
    const url = 'https://cdn.example.com/output.png';

    await expect(
      uploadLocalImageToBackend(assetGateway, url, 'output.png'),
    ).resolves.toBe(url);
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it('decodes data URLs and uploads them through the asset gateway', async () => {
    const result = await uploadLocalImageToBackend(
      assetGateway,
      'data:image/png;base64,eA==',
      'output.png',
    );

    expect(result).toBe('/static/projects/proj/uploads/output.png');
    expect(uploadAsset).toHaveBeenCalledWith(
      'proj',
      expect.any(Blob),
      'output.png',
      undefined,
    );
  });

  it('keeps the local URL when no project is selected', async () => {
    window.history.replaceState({}, '', '/');

    await expect(
      uploadLocalImageToBackend(assetGateway, '/local/output.png', 'output.png'),
    ).resolves.toBe('/local/output.png');
    expect(uploadAsset).not.toHaveBeenCalled();
  });

  it('keeps the local URL when uploading fails', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    uploadAsset.mockRejectedValue(new Error('upload failed'));

    await expect(
      uploadLocalImageToBackend(
        assetGateway,
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
