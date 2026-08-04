// Copyright (c) 2026 AI anime
import type {
  CanvasImageViewerDirection,
  CanvasImageViewerState,
} from '../domain/canvasImageViewer';
import type { CanvasToolDialogRequest } from '../domain/canvasNodeTool';

import type { ImageViewerModalProps } from './ImageViewerModal';
import type { VideoViewerModalProps } from './VideoViewerModal';
import {
  useCanvasExternalDialogs,
  type CanvasExternalDialogEventPort,
} from './useCanvasExternalDialogs';

export interface CanvasViewerSurfaceStore {
  imageViewer: CanvasImageViewerState;
  openImageViewer: (
    imageUrl: string,
    imageList?: CanvasImageViewerState['imageList'],
  ) => void;
  closeImageViewer: ImageViewerModalProps['onClose'];
  navigateImageViewer: (direction: CanvasImageViewerDirection) => void;
  openToolDialog: (dialog: CanvasToolDialogRequest) => void;
  closeToolDialog: () => void;
}

export type CanvasViewerSurfaceStoreHook = <TSelected>(
  selector: (state: CanvasViewerSurfaceStore) => TSelected,
) => TSelected;

export interface CanvasViewerSurfaceControllerDependencies {
  eventPort: CanvasExternalDialogEventPort;
  useStore: CanvasViewerSurfaceStoreHook;
}

export interface CanvasViewerSurfaceController {
  closeImageViewer: ImageViewerModalProps['onClose'];
  imageViewerProps: ImageViewerModalProps;
  videoViewerProps: VideoViewerModalProps;
}

export function createUseCanvasViewerSurfaceController({
  eventPort,
  useStore,
}: CanvasViewerSurfaceControllerDependencies) {
  return function useCanvasViewerSurfaceController(): CanvasViewerSurfaceController {
    const imageViewer = useStore((state) => state.imageViewer);
    const openImageViewer = useStore((state) => state.openImageViewer);
    const closeImageViewer = useStore((state) => state.closeImageViewer);
    const navigateImageViewer = useStore((state) => state.navigateImageViewer);
    const openToolDialog = useStore((state) => state.openToolDialog);
    const closeToolDialog = useStore((state) => state.closeToolDialog);
    const { videoViewer, closeVideoViewer } = useCanvasExternalDialogs({
      eventPort,
      openImageViewer,
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
