// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCanvasContextMenuController,
  type CanvasContextMenuControllerOptions,
} from './useCanvasContextMenuController';

describe('useCanvasContextMenuController', () => {
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

  function createOptions(
    capabilities = { canUndo: true, canRedo: true, canPaste: true },
  ): CanvasContextMenuControllerOptions {
    return {
      wrapperRef: { current: wrapperElement },
      disabled: false,
      getCapabilities: vi.fn(() => capabilities),
      screenToFlowPosition: vi.fn(({ x, y }) => ({ x: x / 2, y: y / 2 })),
      createUploadNode: vi.fn(),
      openNodeMenu: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      pasteAt: vi.fn(),
    };
  }

  function openContextMenu(): void {
    paneElement.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 140,
      clientY: 75,
    }));
  }

  it('projects all pane-menu commands from the captured client position', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasContextMenuController(options),
    );

    act(openContextMenu);
    const items = result.current.sections.flat();
    const item = (key: string) => items.find((entry) => entry.key === key);

    act(() => {
      item('upload')?.onSelect();
      item('add-node')?.onSelect();
      item('undo')?.onSelect();
      item('redo')?.onSelect();
      item('paste')?.onSelect();
    });

    expect(options.screenToFlowPosition).toHaveBeenNthCalledWith(
      1,
      { x: 140, y: 75 },
    );
    expect(options.createUploadNode).toHaveBeenCalledWith({ x: 70, y: 37.5 });
    expect(options.openNodeMenu).toHaveBeenCalledWith({ x: 140, y: 75 });
    expect(options.undo).toHaveBeenCalledOnce();
    expect(options.redo).toHaveBeenCalledOnce();
    expect(options.screenToFlowPosition).toHaveBeenNthCalledWith(
      2,
      { x: 140, y: 75 },
    );
    expect(options.pasteAt).toHaveBeenCalledWith({ x: 70, y: 37.5 });
  });

  it('projects current capability flags and preserves menu grouping', () => {
    const options = createOptions({
      canUndo: false,
      canRedo: true,
      canPaste: false,
    });
    const { result } = renderHook(() =>
      useCanvasContextMenuController(options),
    );

    expect(result.current.sections).toEqual([]);
    act(openContextMenu);

    expect(
      result.current.sections.map(
        (section) => section.map((item) => item.key),
      ),
    ).toEqual([
      ['upload', 'add-node'],
      ['undo', 'redo'],
      ['paste'],
    ]);
    expect(
      result.current.sections.flat().map(
        (item) => [item.key, item.disabled],
      ),
    ).toEqual([
      ['upload', undefined],
      ['add-node', undefined],
      ['undo', true],
      ['redo', false],
      ['paste', true],
    ]);
  });
});
