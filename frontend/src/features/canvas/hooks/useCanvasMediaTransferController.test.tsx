// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { DragEvent as ReactDragEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CanvasEventBus } from '../application/ports';
import { CANVAS_NODE_TYPES } from '../domain/canvasNodes';
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
  const publish = vi.fn();
  const eventBus: Pick<CanvasEventBus, 'publish'> = {
    publish: (type, payload) => publish(type, payload),
  };
  const createNode = vi.fn<CanvasMediaTransferControllerOptions['createNode']>(
    () => 'upload-node',
  );

  return {
    selectedUploadNodeId: null,
    getPreferredClientPosition: vi.fn(() => ({ x: 100, y: 80 })),
    screenToFlowPosition: vi.fn(() => ({ x: 40, y: 20 })),
    createNode,
    selectNode: vi.fn(),
    eventBus,
    publish,
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

    expect(options.createNode).toHaveBeenNthCalledWith(
      1,
      CANVAS_NODE_TYPES.upload,
      { x: 40, y: 20 },
      { user_spawned: true },
    );
    expect(options.createNode).toHaveBeenNthCalledWith(
      2,
      CANVAS_NODE_TYPES.upload,
      { x: 40, y: 20 },
      { user_spawned: true },
    );
    expect(options.publish).toHaveBeenNthCalledWith(
      1,
      'upload-node/external-file',
      { nodeId: 'upload-node', file: pastedImage },
    );
    expect(options.publish).toHaveBeenNthCalledWith(
      2,
      'upload-node/external-file',
      { nodeId: 'upload-node', file: droppedAudio },
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

    expect(options.publish).toHaveBeenCalledWith(
      'upload-node/paste-image',
      { nodeId: 'selected-upload', file: image },
    );
    expect(options.createNode).not.toHaveBeenCalled();
  });
});
