// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasExternalDialogs,
  type CanvasExternalDialogEventPort,
} from './useCanvasExternalDialogs';
import type { CanvasEventMap } from '../application/canvasEventBus';

class ExternalDialogEventPortMock
  implements CanvasExternalDialogEventPort {
  private readonly listeners = new Map<
    keyof CanvasEventMap,
    (payload: never) => void
  >();

  subscribe<TType extends keyof CanvasEventMap>(
    type: TType,
    handler: (payload: CanvasEventMap[TType]) => void,
  ): () => void {
    this.listeners.set(type, handler as (payload: never) => void);
    return () => this.listeners.delete(type);
  }

  emit<TType extends keyof CanvasEventMap>(
    type: TType,
    payload: CanvasEventMap[TType],
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
    const openImageViewer = vi.fn();
    const openToolDialog = vi.fn();
    const closeToolDialog = vi.fn();
    const { result, unmount } = renderHook(() =>
      useCanvasExternalDialogs({
        eventPort,
        openImageViewer,
        openToolDialog,
        closeToolDialog,
      }),
    );

    expect(eventPort.size).toBe(4);
    expect(result.current.videoViewer).toEqual({
      isOpen: false,
      videoUrl: '',
      title: undefined,
    });

    act(() => {
      eventPort.emit('image-viewer/open', {
        imageUrl: 'https://example.com/image.png',
        imageList: [
          'https://example.com/image.png',
          'https://example.com/second.png',
        ],
      });
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

    expect(openImageViewer).toHaveBeenCalledWith(
      'https://example.com/image.png',
      [
        'https://example.com/image.png',
        'https://example.com/second.png',
      ],
    );
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
