// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createCanvasClipboardSession } from '../application/canvasClipboardSession';
import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';
import {
  useCanvasNodeClipboard,
  type CanvasNodeClipboardOptions,
} from './useCanvasNodeClipboard';

interface TestNode {
  id: string;
}

interface TestEdge {
  source: string;
  target: string;
}

type TestSnapshot = CanvasClipboardSnapshot<TestNode, TestEdge>;
type TestOptions = CanvasNodeClipboardOptions<TestNode, TestEdge>;

function snapshot(id: string): TestSnapshot {
  return {
    nodes: [{ id }],
    edges: [],
    sourceProject: 'project-1',
  };
}

function createOptions(
  currentSnapshot: TestSnapshot,
  overrides: Partial<TestOptions> = {},
): TestOptions {
  return {
    session: createCanvasClipboardSession(),
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
    expect(options.session.read()).toBe(currentSnapshot);
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
    const session = createCanvasClipboardSession<TestNode, TestEdge>();
    const firstOptions = createOptions(currentSnapshot, { session });
    const first = renderHook(() => useCanvasNodeClipboard(firstOptions));
    act(() => first.result.current.copySelection());
    first.unmount();

    const secondOptions = createOptions(snapshot('unused'), { session });
    const second = renderHook(() => useCanvasNodeClipboard(secondOptions));

    expect(second.result.current.hasCopiedNodes()).toBe(true);
    act(() => second.result.current.pasteAt({ x: 1, y: 2 }));
    expect(secondOptions.pasteSnapshot).toHaveBeenCalledWith(
      currentSnapshot,
      { x: 1, y: 2 },
    );
  });
});
