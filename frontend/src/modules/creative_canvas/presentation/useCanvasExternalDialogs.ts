// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from 'react';

import type { CanvasEventBus } from '../application/canvasEventBus';
import type { CanvasImageViewerState } from '../domain/canvasImageViewer';
import type { CanvasToolDialogRequest } from '../domain/canvasNodeTool';

export type CanvasExternalDialogEventPort = Pick<CanvasEventBus, 'subscribe'>;

export interface CanvasVideoViewerState {
  isOpen: boolean;
  videoUrl: string;
  title?: string;
}

export interface CanvasExternalDialogsOptions {
  eventPort: CanvasExternalDialogEventPort;
  openImageViewer: (
    imageUrl: string,
    imageList?: CanvasImageViewerState['imageList'],
  ) => void;
  openToolDialog: (dialog: CanvasToolDialogRequest) => void;
  closeToolDialog: () => void;
}

export interface CanvasExternalDialogsController {
  videoViewer: CanvasVideoViewerState;
  closeVideoViewer: () => void;
}

export function useCanvasExternalDialogs({
  eventPort,
  openImageViewer,
  openToolDialog,
  closeToolDialog,
}: CanvasExternalDialogsOptions): CanvasExternalDialogsController {
  const [videoViewer, setVideoViewer] = useState<CanvasVideoViewerState>({
    isOpen: false,
    videoUrl: '',
    title: undefined,
  });
  const closeVideoViewer = useCallback(() => {
    setVideoViewer((current) => ({ ...current, isOpen: false }));
  }, []);

  useEffect(() => {
    const unsubscribeOpen = eventPort.subscribe('tool-dialog/open', openToolDialog);
    const unsubscribeClose = eventPort.subscribe('tool-dialog/close', closeToolDialog);
    const unsubscribeImageOpen = eventPort.subscribe(
      'image-viewer/open',
      ({ imageUrl, imageList }) => openImageViewer(imageUrl, imageList),
    );
    const unsubscribeVideoOpen = eventPort.subscribe(
      'video-viewer/open',
      ({ videoUrl, title }) => {
        setVideoViewer({ isOpen: true, videoUrl, title });
      },
    );

    return () => {
      unsubscribeOpen();
      unsubscribeClose();
      unsubscribeImageOpen();
      unsubscribeVideoOpen();
    };
  }, [closeToolDialog, eventPort, openImageViewer, openToolDialog]);

  return {
    videoViewer,
    closeVideoViewer,
  };
}
