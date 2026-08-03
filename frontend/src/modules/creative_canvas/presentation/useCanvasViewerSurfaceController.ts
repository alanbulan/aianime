// Copyright (c) 2026 AI anime
import type {
  CanvasImageViewerDirection,
  CanvasImageViewerState,
} from '../domain/canvasImageViewer';

import type { ImageViewerModalProps } from './ImageViewerModal';
import type { VideoViewerModalProps } from './VideoViewerModal';
import {
  useCanvasExternalDialogs,
  type CanvasExternalDialogEventPort,
} from './useCanvasExternalDialogs';

export interface CanvasViewerSurfaceStore<TToolDialog> {
  imageViewer: CanvasImageViewerState;
  closeImageViewer: ImageViewerModalProps['onClose'];
  navigateImageViewer: (direction: CanvasImageViewerDirection) => void;
  openToolDialog: (dialog: TToolDialog) => void;
  closeToolDialog: () => void;
}

export type CanvasViewerSurfaceStoreHook<TToolDialog> = <TSelected>(
  selector: (state: CanvasViewerSurfaceStore<TToolDialog>) => TSelected,
) => TSelected;

export interface CanvasViewerSurfaceControllerDependencies<TToolDialog> {
  eventPort: CanvasExternalDialogEventPort<TToolDialog>;
  useStore: CanvasViewerSurfaceStoreHook<TToolDialog>;
}

export interface CanvasViewerSurfaceController {
  closeImageViewer: ImageViewerModalProps['onClose'];
  imageViewerProps: ImageViewerModalProps;
  videoViewerProps: VideoViewerModalProps;
}

export function createUseCanvasViewerSurfaceController<TToolDialog>({
  eventPort,
  useStore,
}: CanvasViewerSurfaceControllerDependencies<TToolDialog>) {
  return function useCanvasViewerSurfaceController(): CanvasViewerSurfaceController {
    const imageViewer = useStore((state) => state.imageViewer);
    const closeImageViewer = useStore((state) => state.closeImageViewer);
    const navigateImageViewer = useStore((state) => state.navigateImageViewer);
    const openToolDialog = useStore((state) => state.openToolDialog);
    const closeToolDialog = useStore((state) => state.closeToolDialog);
    const { videoViewer, closeVideoViewer } = useCanvasExternalDialogs({
      eventPort,
      openToolDialog,
      closeToolDialog,
    });

    return {
      closeImageViewer,
      imageViewerProps: {
        open: imageViewer.isOpen,
        imageUrl: imageViewer.currentImageUrl || '',
        imageList: imageViewer.imageList,
        currentIndex: imageViewer.currentIndex,
        onClose: closeImageViewer,
        onNavigate: navigateImageViewer,
      },
      videoViewerProps: {
        open: videoViewer.isOpen,
        videoUrl: videoViewer.videoUrl,
        title: videoViewer.title,
        onClose: closeVideoViewer,
      },
    };
  };
}
