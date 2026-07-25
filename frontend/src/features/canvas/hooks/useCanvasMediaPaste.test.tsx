// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useViewerImmersiveBody } from '@/features/viewer-kit/useViewerImmersiveBody';

import {
  useCanvasMediaPaste,
  type CanvasMediaPasteOptions,
} from './useCanvasMediaPaste';

function pasteEvent(files: File[]): ClipboardEvent {
  const event = new Event('paste', {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  const items = files.map((file) => ({
    kind: 'file',
    type: file.type,
    getAsFile: () => file,
  }));
  Object.defineProperty(event, 'clipboardData', {
    value: { files, items },
  });
  return event;
}

function createOptions(
  overrides: Partial<CanvasMediaPasteOptions> = {},
): CanvasMediaPasteOptions {
  return {
    selectedUploadNodeId: null,
    getPreferredClientPosition: vi.fn(() => ({ x: 100, y: 80 })),
    screenToCanvasPosition: vi.fn(() => ({ x: 40, y: 20 })),
    createUploadNode: vi.fn(() => 'upload-1'),
    selectNode: vi.fn(),
    eventPort: {
      pasteImageIntoNode: vi.fn(),
      attachExternalFile: vi.fn(),
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useCanvasMediaPaste', () => {
  it('pastes an image into the selected upload node and suppresses snapshot fallback', () => {
    vi.useFakeTimers();
    const options = createOptions({ selectedUploadNodeId: 'upload-target' });
    const pasteSnapshot = vi.fn();
    const { result } = renderHook(() => useCanvasMediaPaste(options));
    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const event = pasteEvent([image]);

    act(() => {
      result.current.queueSnapshotPaste(pasteSnapshot);
      document.dispatchEvent(event);
      vi.runAllTimers();
    });

    expect(event.defaultPrevented).toBe(true);
    expect(options.eventPort.pasteImageIntoNode).toHaveBeenCalledWith(
      'upload-target',
      image,
    );
    expect(options.createUploadNode).not.toHaveBeenCalled();
    expect(pasteSnapshot).not.toHaveBeenCalled();
  });

  it('creates staggered upload nodes for pasted media and selects the last node', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const createUploadNode = vi.fn()
      .mockReturnValueOnce('upload-1')
      .mockReturnValueOnce('upload-2');
    const options = createOptions({ createUploadNode });
    renderHook(() => useCanvasMediaPaste(options));
    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const audio = new File(['audio'], 'voice.wav', { type: 'audio/wav' });

    act(() => document.dispatchEvent(pasteEvent([image, audio])));

    expect(createUploadNode).toHaveBeenNthCalledWith(1, { x: 40, y: 20 });
    expect(createUploadNode).toHaveBeenNthCalledWith(2, { x: 76, y: 56 });
    expect(options.eventPort.attachExternalFile).toHaveBeenNthCalledWith(
      1,
      'upload-1',
      image,
    );
    expect(options.eventPort.attachExternalFile).toHaveBeenNthCalledWith(
      2,
      'upload-2',
      audio,
    );
    expect(options.selectNode).toHaveBeenCalledWith('upload-2');
  });

  it('falls back to the copied node snapshot when no media paste claims the event', () => {
    vi.useFakeTimers();
    const options = createOptions();
    const pasteSnapshot = vi.fn();
    const { result } = renderHook(() => useCanvasMediaPaste(options));

    act(() => {
      result.current.queueSnapshotPaste(pasteSnapshot);
      document.dispatchEvent(pasteEvent([]));
      vi.runAllTimers();
    });

    expect(pasteSnapshot).toHaveBeenCalledOnce();
  });

  it('leaves typing targets and immersive viewers in control', () => {
    const options = createOptions();
    renderHook(() => useCanvasMediaPaste(options));
    const image = new File(['image'], 'frame.png', { type: 'image/png' });
    const input = document.createElement('input');
    document.body.append(input);

    act(() => input.dispatchEvent(pasteEvent([image])));
    const immersiveViewer = renderHook(() => useViewerImmersiveBody(true));
    act(() => document.dispatchEvent(pasteEvent([image])));
    immersiveViewer.unmount();
    input.remove();

    expect(options.createUploadNode).not.toHaveBeenCalled();
    expect(options.eventPort.pasteImageIntoNode).not.toHaveBeenCalled();
  });
});
