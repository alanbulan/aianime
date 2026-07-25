// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';
import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import {
  useCanvasNodeClipboard,
  type CanvasNodeClipboardOptions,
} from './useCanvasNodeClipboard';

function snapshot(id: string): CanvasClipboardSnapshot {
  return {
    nodes: [{
      id,
      type: CANVAS_NODE_TYPES.textAnnotation,
      position: { x: 0, y: 0 },
      data: { content: '' },
    } as CanvasNode],
    edges: [],
    sourceProject: 'project-1',
  };
}

function createOptions(
  currentSnapshot: CanvasClipboardSnapshot,
  overrides: Partial<CanvasNodeClipboardOptions> = {},
): CanvasNodeClipboardOptions {
  return {
    createSnapshot: vi.fn(() => currentSnapshot),
    pasteSnapshot: vi.fn(),
    queueSnapshotPaste: vi.fn((paste) => paste()),
    resetPasteIteration: vi.fn(),
    clearSystemClipboard: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('useCanvasNodeClipboard', () => {
  it('copies one snapshot into the shared session clipboard', () => {
    const currentSnapshot = snapshot('node-1');
    const options = createOptions(currentSnapshot);
    const { result } = renderHook(() => useCanvasNodeClipboard(options));

    act(() => result.current.copySelection());

    expect(result.current.hasCopiedNodes()).toBe(true);
    expect(options.resetPasteIteration).toHaveBeenCalledOnce();
    expect(options.clearSystemClipboard).toHaveBeenCalledOnce();
  });

  it('queues keyboard paste and supports an explicit context-menu position', () => {
    const currentSnapshot = snapshot('node-2');
    const options = createOptions(currentSnapshot);
    const { result } = renderHook(() => useCanvasNodeClipboard(options));
    act(() => result.current.copySelection());

    act(() => {
      result.current.pasteSelection();
      result.current.pasteAt({ x: 120, y: 80 });
    });

    expect(options.queueSnapshotPaste).toHaveBeenCalledOnce();
    expect(options.pasteSnapshot).toHaveBeenNthCalledWith(1, currentSnapshot);
    expect(options.pasteSnapshot).toHaveBeenNthCalledWith(
      2,
      currentSnapshot,
      { x: 120, y: 80 },
    );
  });

  it('restores the shared snapshot when a new canvas mounts', () => {
    const currentSnapshot = snapshot('node-3');
    const firstOptions = createOptions(currentSnapshot);
    const first = renderHook(() => useCanvasNodeClipboard(firstOptions));
    act(() => first.result.current.copySelection());
    first.unmount();

    const secondOptions = createOptions(snapshot('unused'));
    const second = renderHook(() => useCanvasNodeClipboard(secondOptions));

    expect(second.result.current.hasCopiedNodes()).toBe(true);
    act(() => second.result.current.pasteAt({ x: 1, y: 2 }));
    expect(secondOptions.pasteSnapshot).toHaveBeenCalledWith(
      currentSnapshot,
      { x: 1, y: 2 },
    );
  });
});
