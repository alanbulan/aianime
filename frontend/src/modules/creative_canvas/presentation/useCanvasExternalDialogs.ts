// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from 'react';

export interface CanvasExternalDialogEventMap<TToolDialog> {
  'tool-dialog/open': TToolDialog;
  'tool-dialog/close': undefined;
  'video-viewer/open': {
    videoUrl: string;
    title?: string;
  };
}

export interface CanvasExternalDialogEventPort<TToolDialog> {
  subscribe<TType extends keyof CanvasExternalDialogEventMap<TToolDialog>>(
    type: TType,
    handler: (payload: CanvasExternalDialogEventMap<TToolDialog>[TType]) => void,
  ): () => void;
}

export interface CanvasVideoViewerState {
  isOpen: boolean;
  videoUrl: string;
  title?: string;
}

export interface CanvasExternalDialogsOptions<TToolDialog> {
  eventPort: CanvasExternalDialogEventPort<TToolDialog>;
  openToolDialog: (dialog: TToolDialog) => void;
  closeToolDialog: () => void;
}

export interface CanvasExternalDialogsController {
  videoViewer: CanvasVideoViewerState;
  closeVideoViewer: () => void;
}

export function useCanvasExternalDialogs<TToolDialog>({
  eventPort,
  openToolDialog,
  closeToolDialog,
}: CanvasExternalDialogsOptions<TToolDialog>): CanvasExternalDialogsController {
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
