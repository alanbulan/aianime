// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ComposeClip,
  ComposeTimelineState,
} from '@/features/canvas/domain/videoComposeTimeline';

import { useVideoComposeExportController } from './useVideoComposeExportController';

const mocks = vi.hoisted(() => ({
  compose: vi.fn(),
  upload: vi.fn(),
  fetchBlob: vi.fn(),
  downloadBlob: vi.fn(),
  fileName: vi.fn(),
}));

vi.mock('@/features/canvas/composition', () => ({
  uploadCanvasAsset: (...args: unknown[]) => mocks.upload(...args),
}));

vi.mock('@/modules/creative_canvas/public', () => ({
  composeCanvasVideo: (input: unknown) => mocks.compose(input),
}));

vi.mock('@/features/canvas/application/imageData', () => ({
  resolveImageDisplayUrl: (url: string) => `display:${url}`,
}));

vi.mock(
  '@/features/canvas/infrastructure/browserVideoComposeExportRuntime',
  () => ({
    fetchVideoComposeResultBlob: (...args: unknown[]) =>
      mocks.fetchBlob(...args),
    downloadVideoComposeBlob: (...args: unknown[]) =>
      mocks.downloadBlob(...args),
    resolveVideoComposeResultFileName: (url: string) => mocks.fileName(url),
  }),
);

function clip(
  id: string,
  timelineStartMs = 0,
  trackKind: ComposeClip['kind'] = 'video',
): ComposeClip {
  return {
    id,
    nodeId: id,
    kind: trackKind,
    sourceUrl: `/${id}.mp4`,
    displayName: id,
    thumbUrl: null,
    durationMs: 2_000,
    timelineStartMs,
    trimStartMs: 0,
    trimEndMs: 2_000,
    volume: 1,
    muted: false,
    speed: 1,
  };
}

function timeline(
  patch: Partial<ComposeTimelineState> = {},
): ComposeTimelineState {
  return {
    resolution: '1080p',
    tracks: [
      { id: 'track-video', kind: 'video', clips: [clip('clip-a')] },
    ],
    cover: { source: 'upload', frameMs: null, url: '/cover-a.jpg' },
    ...patch,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function options(
  value: ComposeTimelineState,
  onComposed = vi.fn(),
) {
  return {
    project: 'project-a',
    canvasId: 'canvas-a',
    timeline: value,
    onComposed,
    overlapErrorMessage: '视频片段重叠',
    missingUrlErrorMessage: '缺少结果地址',
  };
}

describe('useVideoComposeExportController', () => {
  beforeEach(() => {
    mocks.compose.mockReset().mockResolvedValue({ url: '/result.mp4' });
    mocks.upload.mockReset().mockResolvedValue({ url: '/stable.mp4' });
    mocks.fetchBlob.mockReset().mockResolvedValue(new Blob(['video']));
    mocks.downloadBlob.mockReset();
    mocks.fileName.mockReset().mockReturnValue('result.mp4');
  });

  it('does nothing for an empty timeline and rejects overlapping videos', async () => {
    const empty = renderHook(() =>
      useVideoComposeExportController(
        options({ tracks: [], resolution: '1080p' }),
      ),
    );
    await act(async () => empty.result.current.runExport('local', '1080p'));
    expect(mocks.compose).not.toHaveBeenCalled();
    empty.unmount();

    const overlapping = timeline({
      tracks: [
        { id: 'video-a', kind: 'video', clips: [clip('clip-a')] },
        {
          id: 'video-b',
          kind: 'video',
          clips: [clip('clip-b', 1_000)],
        },
      ],
    });
    const blocked = renderHook(() =>
      useVideoComposeExportController(options(overlapping)),
    );
    await act(async () => blocked.result.current.runExport('local', '1080p'));
    expect(blocked.result.current.exportError).toBe('视频片段重叠');
    expect(mocks.compose).not.toHaveBeenCalled();
  });

  it('renders and downloads a local export with the selected resolution', async () => {
    const current = timeline();
    const { result } = renderHook(() =>
      useVideoComposeExportController(options(current)),
    );

    await act(async () => result.current.runExport('local', '720p'));

    expect(mocks.compose).toHaveBeenCalledWith({
      projectId: 'project-a',
      request: expect.objectContaining({
        canvasId: 'canvas-a',
        fps: 30,
        resolution: '720p',
        coverUrl: '/cover-a.jpg',
      }),
    });
    expect(mocks.fetchBlob).toHaveBeenCalledWith(
      '/result.mp4',
      expect.any(Function),
    );
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'result.mp4',
    );
    expect(result.current.exportError).toBeNull();
    expect(result.current.isExporting).toBe(false);
  });

  it('uploads a canvas export and uses the latest cover at completion', async () => {
    const pending = deferred<{ url: string }>();
    mocks.compose.mockReturnValue(pending.promise);
    const onComposed = vi.fn();
    const first = timeline();
    const second = timeline({
      cover: { source: 'upload', frameMs: null, url: '/cover-b.jpg' },
    });
    const { result, rerender } = renderHook(
      ({ value }) =>
        useVideoComposeExportController(options(value, onComposed)),
      { initialProps: { value: first } },
    );

    let exportPromise!: Promise<void>;
    act(() => {
      exportPromise = result.current.runExport('canvas', '1080p');
    });
    expect(result.current.isExporting).toBe(true);
    rerender({ value: second });
    await act(async () => {
      pending.resolve({ url: '/result.mp4' });
      await exportPromise;
    });

    expect(mocks.upload).toHaveBeenCalledWith(
      'project-a',
      expect.any(Blob),
      'result.mp4',
      { disableTimeout: true },
    );
    expect(onComposed).toHaveBeenCalledWith(
      '/stable.mp4',
      '/cover-b.jpg',
    );
    expect(result.current.isExporting).toBe(false);
  });

  it('shows the configured error when composition returns no URL', async () => {
    mocks.compose.mockResolvedValue({ url: '' });
    const { result } = renderHook(() =>
      useVideoComposeExportController(options(timeline())),
    );

    await act(async () => result.current.runExport('local', '1080p'));

    expect(result.current.exportError).toBe('缺少结果地址');
    expect(mocks.fetchBlob).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('projects thrown non-Error failures and restores idle state', async () => {
    mocks.compose.mockRejectedValue('backend unavailable');
    const { result } = renderHook(() =>
      useVideoComposeExportController(options(timeline())),
    );

    await act(async () => result.current.runExport('local', '1080p'));

    expect(result.current.exportError).toBe('backend unavailable');
    expect(result.current.isExporting).toBe(false);
  });
});
