// Copyright (c) 2026 AI anime
import { useCanvasStore } from '@/stores/canvasStore';

import type { CanvasStageViewProps } from '../ui/CanvasStageView';
import {
  useCanvasExternalDialogs,
  type CanvasExternalDialogsOptions,
} from './useCanvasExternalDialogs';

export interface CanvasViewerSurfaceControllerOptions {
  eventPort: CanvasExternalDialogsOptions['eventPort'];
}

export interface CanvasViewerSurfaceController {
  closeImageViewer: CanvasStageViewProps['imageViewerProps']['onClose'];
  imageViewerProps: CanvasStageViewProps['imageViewerProps'];
  videoViewerProps: CanvasStageViewProps['videoViewerProps'];
}

export function useCanvasViewerSurfaceController({
  eventPort,
}: CanvasViewerSurfaceControllerOptions): CanvasViewerSurfaceController {
  const imageViewer = useCanvasStore((state) => state.imageViewer);
  const closeImageViewer = useCanvasStore((state) => state.closeImageViewer);
  const navigateImageViewer = useCanvasStore(
    (state) => state.navigateImageViewer,
  );
  const openToolDialog = useCanvasStore((state) => state.openToolDialog);
  const closeToolDialog = useCanvasStore((state) => state.closeToolDialog);
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
}
