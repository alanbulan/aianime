// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasExternalDialogsOptions } from './useCanvasExternalDialogs';
import {
  useCanvasViewerSurfaceController,
  type CanvasViewerSurfaceControllerOptions,
} from './useCanvasViewerSurfaceController';

const controllerMocks = vi.hoisted(() => {
  const closeImageViewer = vi.fn();
  const navigateImageViewer = vi.fn();
  const openToolDialog = vi.fn();
  const closeToolDialog = vi.fn();
  const closeVideoViewer = vi.fn();
  const viewerStore = {
    imageViewer: {
      isOpen: true,
      currentImageUrl: 'https://example.com/image.png' as string | null,
      imageList: ['https://example.com/image.png'],
      currentIndex: 0,
    },
    closeImageViewer,
    navigateImageViewer,
    openToolDialog,
    closeToolDialog,
  };
  const externalDialogs = {
    videoViewer: {
      isOpen: true,
      videoUrl: 'https://example.com/video.mp4',
      title: 'Preview',
    },
    closeVideoViewer,
  };
  return {
    closeImageViewer,
    navigateImageViewer,
    openToolDialog,
    closeToolDialog,
    closeVideoViewer,
    viewerStore,
    externalDialogs,
    useStore: vi.fn(
      (selector: (state: typeof viewerStore) => unknown) =>
        selector(viewerStore),
    ),
    useExternalDialogs: vi.fn(
      (_options: CanvasExternalDialogsOptions) => externalDialogs,
    ),
  };
});

vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: controllerMocks.useStore,
}));
vi.mock('./useCanvasExternalDialogs', () => ({
  useCanvasExternalDialogs: controllerMocks.useExternalDialogs,
}));

function createOptions(): CanvasViewerSurfaceControllerOptions {
  return {
    eventPort: {
      subscribe: vi.fn(() => vi.fn()),
    },
  };
}

describe('useCanvasViewerSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    controllerMocks.viewerStore.imageViewer.isOpen = true;
    controllerMocks.viewerStore.imageViewer.currentImageUrl =
      'https://example.com/image.png';
  });

  it('maps image and video state to stage viewer props', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasViewerSurfaceController(options),
    );

    expect(controllerMocks.useExternalDialogs).toHaveBeenCalledWith({
      eventPort: options.eventPort,
      openToolDialog: controllerMocks.openToolDialog,
      closeToolDialog: controllerMocks.closeToolDialog,
    });
    expect(result.current).toEqual({
      closeImageViewer: controllerMocks.closeImageViewer,
      imageViewerProps: {
        open: true,
        imageUrl: 'https://example.com/image.png',
        imageList: controllerMocks.viewerStore.imageViewer.imageList,
        currentIndex: 0,
        onClose: controllerMocks.closeImageViewer,
        onNavigate: controllerMocks.navigateImageViewer,
      },
      videoViewerProps: {
        open: true,
        videoUrl: 'https://example.com/video.mp4',
        title: 'Preview',
        onClose: controllerMocks.closeVideoViewer,
      },
    });
  });

  it('normalizes an empty image selection for the modal contract', () => {
    controllerMocks.viewerStore.imageViewer.isOpen = false;
    controllerMocks.viewerStore.imageViewer.currentImageUrl = null;
    const { result } = renderHook(() =>
      useCanvasViewerSurfaceController(createOptions()),
    );

    expect(result.current.imageViewerProps.open).toBe(false);
    expect(result.current.imageViewerProps.imageUrl).toBe('');
    expect(result.current).not.toHaveProperty('imageViewer');
    expect(result.current).not.toHaveProperty('videoViewer');
  });
});
