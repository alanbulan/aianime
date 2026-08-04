// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createUseImageMatteController,
  type ImageMatteControllerDependencies,
} from './useImageMatteController';

const dependencies: ImageMatteControllerDependencies = {
  addExportImageNode: vi.fn(() => 'matte-node'),
  addEdge: vi.fn(),
  findNodePosition: vi.fn(() => ({ x: 480, y: 20 })),
  selectNode: vi.fn(),
  updateNodeData: vi.fn(),
  uploadAsset: vi.fn(),
  fetchBlob: vi.fn(),
  matteImage: vi.fn(),
  preloadWorker: vi.fn(),
  schedulePreload: vi.fn((callback) => {
    callback();
    return vi.fn();
  }),
  now: vi.fn(() => 1234),
  exportNodeWidth: 480,
  exportNodeHeight: 360,
  reportError: vi.fn(),
};

const useImageMatteController = createUseImageMatteController(dependencies);

function options() {
  return {
    projectId: 'project-a',
    nodeId: 'image-a',
    nodeData: {
      imageUrl: '/source.png',
      aspectRatio: '4:3',
      projection_key: 'projection-a',
    },
    imageSource: '/source.png',
    displayName: '抠图',
  };
}

describe('createUseImageMatteController', () => {
  beforeEach(() => {
    vi.mocked(dependencies.addExportImageNode).mockReset();
    vi.mocked(dependencies.addEdge).mockReset();
    vi.mocked(dependencies.findNodePosition).mockReset();
    vi.mocked(dependencies.selectNode).mockReset();
    vi.mocked(dependencies.updateNodeData).mockReset();
    vi.mocked(dependencies.uploadAsset).mockReset();
    vi.mocked(dependencies.fetchBlob).mockReset();
    vi.mocked(dependencies.matteImage).mockReset();
    vi.mocked(dependencies.preloadWorker).mockReset();
    vi.mocked(dependencies.schedulePreload).mockReset();
    vi.mocked(dependencies.now).mockReset();
    vi.mocked(dependencies.reportError).mockReset();
    vi.mocked(dependencies.addExportImageNode).mockReturnValue('matte-node');
    vi.mocked(dependencies.findNodePosition).mockReturnValue({ x: 480, y: 20 });
    vi.mocked(dependencies.schedulePreload).mockImplementation((callback) => {
      callback();
      return vi.fn();
    });
    vi.mocked(dependencies.now).mockReturnValue(1234);
  });

  it('preloads the worker and releases the scheduled preload', () => {
    const cancel = vi.fn();
    vi.mocked(dependencies.schedulePreload).mockImplementation((callback) => {
      callback();
      return cancel;
    });

    const { unmount } = renderHook(() => useImageMatteController(options()));

    expect(dependencies.preloadWorker).toHaveBeenCalledOnce();
    unmount();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('creates a loading child and writes back the uploaded matte result', async () => {
    const sourceBlob = new Blob(['source']);
    const matteBlob = new Blob(['matte']);
    vi.mocked(dependencies.fetchBlob).mockResolvedValue(sourceBlob);
    vi.mocked(dependencies.matteImage).mockResolvedValue(matteBlob);
    vi.mocked(dependencies.uploadAsset).mockResolvedValue({ url: '/matte.png' });
    const { result } = renderHook(() => useImageMatteController(options()));

    act(() => result.current.matte());

    expect(dependencies.findNodePosition).toHaveBeenCalledWith(
      'image-a',
      480,
      360,
    );
    expect(dependencies.addExportImageNode).toHaveBeenCalledWith(
      { x: 480, y: 20 },
      expect.objectContaining({
        displayName: '抠图',
        resultKind: 'matte',
        isGenerating: true,
      }),
    );
    expect(dependencies.addEdge).toHaveBeenCalledWith('image-a', 'matte-node');
    expect(dependencies.selectNode).toHaveBeenCalledWith('matte-node');
    await waitFor(() =>
      expect(dependencies.updateNodeData).toHaveBeenCalledWith('matte-node', {
        imageUrl: '/matte.png',
        previewImageUrl: '/matte.png',
        isGenerating: false,
        generationStartedAt: null,
        generationError: null,
        generationErrorDetails: null,
      }),
    );
    expect(dependencies.fetchBlob).toHaveBeenCalledWith('/source.png');
    expect(dependencies.matteImage).toHaveBeenCalledWith(sourceBlob);
    expect(dependencies.uploadAsset).toHaveBeenCalledWith(
      'project-a',
      matteBlob,
      'matte-image-a-1234.png',
    );
  });

  it('writes a source failure to the loading child', async () => {
    vi.mocked(dependencies.fetchBlob).mockRejectedValue(
      new Error('fetch source failed: 503'),
    );
    const { result } = renderHook(() => useImageMatteController(options()));

    act(() => result.current.matte());

    await waitFor(() =>
      expect(dependencies.updateNodeData).toHaveBeenCalledWith('matte-node', {
        isGenerating: false,
        generationStartedAt: null,
        generationError: 'fetch source failed: 503',
        generationErrorDetails: 'fetch source failed: 503',
      }),
    );
    expect(dependencies.uploadAsset).not.toHaveBeenCalled();
    expect(dependencies.reportError).toHaveBeenCalledWith(
      '[matte] failed',
      expect.any(Error),
    );
  });

  it('does not create a node when the source image is unavailable', () => {
    const { result } = renderHook(() =>
      useImageMatteController({ ...options(), imageSource: null }),
    );

    act(() => result.current.matte());

    expect(dependencies.addExportImageNode).not.toHaveBeenCalled();
  });
});
