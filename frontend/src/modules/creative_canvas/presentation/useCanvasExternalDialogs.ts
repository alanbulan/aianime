// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from 'react';

import type { CanvasEventBus } from '../application/canvasEventBus';
import type { CanvasToolDialogRequest } from '../domain/canvasNodeTool';

export type CanvasExternalDialogEventPort = Pick<CanvasEventBus, 'subscribe'>;

export interface CanvasVideoViewerState {
  isOpen: boolean;
  videoUrl: string;
  title?: string;
}

export interface CanvasExternalDialogsOptions {
  eventPort: CanvasExternalDialogEventPort;
  openToolDialog: (dialog: CanvasToolDialogRequest) => void;
  closeToolDialog: () => void;
}

export interface CanvasExternalDialogsController {
  videoViewer: CanvasVideoViewerState;
  closeVideoViewer: () => void;
}

export function useCanvasExternalDialogs({
  eventPort,
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
    const unsubscribeVideoOpen = eventPort.subscribe(
      'video-viewer/open',
      ({ videoUrl, title }) => {
        setVideoViewer({ isOpen: true, videoUrl, title });
      },
    );

    return () => {
      unsubscribeOpen();
      unsubscribeClose();
      unsubscribeVideoOpen();
    };
  }, [closeToolDialog, eventPort, openToolDialog]);

  return {
    videoViewer,
    closeVideoViewer,
  };
}
