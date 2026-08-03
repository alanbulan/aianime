// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasExternalDialogs,
  type CanvasExternalDialogEventMap,
  type CanvasExternalDialogEventPort,
} from './useCanvasExternalDialogs';

interface ToolDialogRequest {
  nodeId: string;
  toolType: 'crop' | 'annotate';
}

class ExternalDialogEventPortMock
  implements CanvasExternalDialogEventPort<ToolDialogRequest> {
  private readonly listeners = new Map<
    keyof CanvasExternalDialogEventMap<ToolDialogRequest>,
    (payload: never) => void
  >();

  subscribe<TType extends keyof CanvasExternalDialogEventMap<ToolDialogRequest>>(
    type: TType,
    handler: (
      payload: CanvasExternalDialogEventMap<ToolDialogRequest>[TType]
    ) => void,
  ): () => void {
    this.listeners.set(type, handler as (payload: never) => void);
    return () => this.listeners.delete(type);
  }

  emit<TType extends keyof CanvasExternalDialogEventMap<ToolDialogRequest>>(
    type: TType,
    payload: CanvasExternalDialogEventMap<ToolDialogRequest>[TType],
  ): void {
    this.listeners.get(type)?.(payload as never);
  }

  get size(): number {
    return this.listeners.size;
  }
}

describe('useCanvasExternalDialogs', () => {
  it('bridges tool dialog events and owns video viewer state', () => {
    const eventPort = new ExternalDialogEventPortMock();
    const openToolDialog = vi.fn();
    const closeToolDialog = vi.fn();
    const { result, unmount } = renderHook(() =>
      useCanvasExternalDialogs({
        eventPort,
        openToolDialog,
        closeToolDialog,
      }),
    );

    expect(eventPort.size).toBe(3);
    expect(result.current.videoViewer).toEqual({
      isOpen: false,
      videoUrl: '',
      title: undefined,
    });

    act(() => {
      eventPort.emit('tool-dialog/open', {
        nodeId: 'node-1',
        toolType: 'crop',
      });
      eventPort.emit('tool-dialog/close', undefined);
      eventPort.emit('video-viewer/open', {
        videoUrl: 'https://example.com/video.mp4',
        title: 'Preview',
      });
    });

    expect(openToolDialog).toHaveBeenCalledWith({
      nodeId: 'node-1',
      toolType: 'crop',
    });
    expect(closeToolDialog).toHaveBeenCalledOnce();
    expect(result.current.videoViewer).toEqual({
      isOpen: true,
      videoUrl: 'https://example.com/video.mp4',
      title: 'Preview',
    });

    act(() => result.current.closeVideoViewer());
    expect(result.current.videoViewer).toEqual({
      isOpen: false,
      videoUrl: 'https://example.com/video.mp4',
      title: 'Preview',
    });

    unmount();
    expect(eventPort.size).toBe(0);
  });
});
