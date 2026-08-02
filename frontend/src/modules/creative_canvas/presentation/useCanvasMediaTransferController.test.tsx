// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { DragEvent as ReactDragEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  useCanvasMediaTransferController,
  type CanvasMediaTransferControllerOptions,
} from './useCanvasMediaTransferController';

function pasteEvent(file: File): ClipboardEvent {
  const event = new Event('paste', {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: {
      files: [file],
      items: [{
        kind: 'file',
        type: file.type,
        getAsFile: () => file,
      }],
    },
  });
  return event;
}

function dropEvent(file: File): ReactDragEvent<HTMLDivElement> {
  return {
    clientX: 100,
    clientY: 80,
    preventDefault: vi.fn(),
    dataTransfer: {
      types: ['Files'],
      files: [file],
      getData: vi.fn(() => ''),
    },
  } as unknown as ReactDragEvent<HTMLDivElement>;
}

function createOptions() {
  const createUploadNode = vi.fn<
    CanvasMediaTransferControllerOptions['createUploadNode']
  >(
    () => 'upload-node',
  );
  const eventPort = {
    pasteImageIntoNode: vi.fn(),
    attachExternalFile: vi.fn(),
  };

  return {
    selectedUploadNodeId: null,
    getPreferredClientPosition: vi.fn(() => ({ x: 100, y: 80 })),
    screenToFlowPosition: vi.fn(() => ({ x: 40, y: 20 })),
    createUploadNode,
    selectNode: vi.fn(),
    eventPort,
    hydrateAsset: vi.fn(async (payload) => payload),
    spawnAsset: vi.fn(() => 'asset-node'),
    isImmersiveViewerActive: vi.fn(() => false),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCanvasMediaTransferController', () => {
  it('shares one event adapter and Upload-node factory across paste and drop', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasMediaTransferController(options),
    );
    const pastedImage = new File(['image'], 'pasted.png', { type: 'image/png' });
    const droppedAudio = new File(['audio'], 'voice.wav', { type: 'audio/wav' });

    act(() => document.dispatchEvent(pasteEvent(pastedImage)));
    act(() => result.current.handleCanvasDrop(dropEvent(droppedAudio)));

    expect(options.createUploadNode).toHaveBeenNthCalledWith(1, { x: 40, y: 20 });
    expect(options.createUploadNode).toHaveBeenNthCalledWith(2, { x: 40, y: 20 });
    expect(options.eventPort.attachExternalFile).toHaveBeenNthCalledWith(
      1,
      'upload-node',
      pastedImage,
    );
    expect(options.eventPort.attachExternalFile).toHaveBeenNthCalledWith(
      2,
      'upload-node',
      droppedAudio,
    );
    expect(options.selectNode).toHaveBeenCalledTimes(2);
  });

  it('routes a selected Upload image paste through the same event adapter', () => {
    const options = {
      ...createOptions(),
      selectedUploadNodeId: 'selected-upload',
    };
    renderHook(() => useCanvasMediaTransferController(options));
    const image = new File(['image'], 'replace.png', { type: 'image/png' });

    act(() => document.dispatchEvent(pasteEvent(image)));

    expect(options.eventPort.pasteImageIntoNode).toHaveBeenCalledWith(
      'selected-upload',
      image,
    );
    expect(options.createUploadNode).not.toHaveBeenCalled();
  });
});
