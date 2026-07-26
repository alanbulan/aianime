// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CANVAS_NODE_TYPES } from '../domain/canvasNodes';
import {
  useCanvasCommandSurfaceController,
  type CanvasCommandSurfaceControllerOptions,
} from './useCanvasCommandSurfaceController';

function keyboardEvent(key: string, ctrlKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    ctrlKey,
    bubbles: true,
    cancelable: true,
  });
}

describe('useCanvasCommandSurfaceController', () => {
  let wrapperElement: HTMLDivElement;
  let paneElement: HTMLDivElement;

  beforeEach(() => {
    wrapperElement = document.createElement('div');
    paneElement = document.createElement('div');
    paneElement.className = 'react-flow__pane';
    wrapperElement.append(paneElement);
    document.body.append(wrapperElement);
    vi.spyOn(wrapperElement, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      top: 25,
      right: 440,
      bottom: 325,
      width: 400,
      height: 300,
      x: 40,
      y: 25,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    wrapperElement.remove();
  });

  function createOptions(): CanvasCommandSurfaceControllerOptions {
    return {
      wrapperRef: { current: wrapperElement },
      placementActive: false,
      nodeMenuOpen: false,
      selectedNodeCount: 2,
      hasCopiedNodes: vi.fn(() => true),
      screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
      createNode: vi.fn(() => 'upload-node'),
      openNodeMenu: vi.fn(),
      cancelPlacement: vi.fn(),
      closeNodeMenu: vi.fn(),
      organizeCanvas: vi.fn(),
      copySelection: vi.fn(),
      pasteSelection: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      groupSelection: vi.fn(),
      deleteSelection: vi.fn(() => true),
      pasteAt: vi.fn(),
    };
  }

  it('shares editing commands across the pane menu and keyboard shortcuts', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasCommandSurfaceController(options),
    );

    act(() => paneElement.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 75,
    })));
    const uploadItem = result.current.sections
      .flat()
      .find((item) => item.key === 'upload');
    act(() => uploadItem?.onSelect());
    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.upload,
      { x: 70, y: 37.5 },
    );

    act(() => document.dispatchEvent(keyboardEvent('c', true)));
    expect(options.copySelection).toHaveBeenCalledOnce();
  });
});
