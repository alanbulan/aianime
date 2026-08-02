// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import {
  downloadVideoComposeBlob,
  fetchVideoComposeResultBlob,
  resolveVideoComposeResultFileName,
  type VideoComposeDownloadRuntime,
} from './browserVideoComposeExportRuntime';

describe('browserVideoComposeExportRuntime', () => {
  it('fetches the resolved result URL with session credentials', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(blob),
    });

    await expect(
      fetchVideoComposeResultBlob(
        '/jobs/result.mp4',
        (url) => `display:${url}`,
        fetcher,
      ),
    ).resolves.toBe(blob);
    expect(fetcher).toHaveBeenCalledWith('display:/jobs/result.mp4', {
      credentials: 'include',
    });
  });

  it('reports the HTTP status when result download fails', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      blob: vi.fn(),
    });

    await expect(
      fetchVideoComposeResultBlob('/denied.mp4', () => null, fetcher),
    ).rejects.toThrow('HTTP 403');
    expect(fetcher).toHaveBeenCalledWith('/denied.mp4', {
      credentials: 'include',
    });
  });

  it('uses the URL basename and falls back to a timestamped MP4 name', () => {
    expect(
      resolveVideoComposeResultFileName('/jobs/final-cut.mp4?token=temporary'),
    ).toBe('final-cut.mp4');
    expect(resolveVideoComposeResultFileName('/jobs/', () => 1234)).toBe(
      'compose-1234.mp4',
    );
  });

  it('downloads through one injected object-URL and anchor lifecycle', () => {
    const blob = new Blob(['video']);
    const anchor = {
      href: '',
      download: '',
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const runtime: VideoComposeDownloadRuntime = {
      createObjectUrl: vi.fn().mockReturnValue('blob:compose'),
      revokeObjectUrl: vi.fn(),
      createAnchor: vi.fn().mockReturnValue(anchor),
      appendAnchor: vi.fn(),
    };

    downloadVideoComposeBlob(blob, 'compose.mp4', runtime);

    expect(runtime.createObjectUrl).toHaveBeenCalledWith(blob);
    expect(anchor.href).toBe('blob:compose');
    expect(anchor.download).toBe('compose.mp4');
    expect(runtime.appendAnchor).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
    expect(runtime.revokeObjectUrl).toHaveBeenCalledWith('blob:compose');
  });
});
