// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasAltDragCopyController,
  type CanvasAltDragCopyControllerOptions,
} from './useCanvasAltDragCopyController';

interface TestNode {
  id: string;
  position: { x: number; y: number };
}

function node(id: string, position: { x: number; y: number }): TestNode {
  return { id, position };
}

function createOptions(
  overrides: Partial<CanvasAltDragCopyControllerOptions<TestNode>> = {},
): CanvasAltDragCopyControllerOptions<TestNode> {
  return {
    nodes: [
      node('source-a', { x: 10, y: 20 }),
      node('source-b', { x: 40, y: 50 }),
      node('source-c', { x: 70, y: 80 }),
    ],
    selectedNodeIds: ['source-a', 'source-b'],
    duplicateNodes: vi.fn(() => ({
      idMap: new Map([
        ['source-a', 'copy-a'],
        ['source-b', 'copy-b'],
        ['source-c', 'copy-c'],
      ]),
    })),
    elevateNodes: vi.fn(),
    commitNodePositions: vi.fn(),
    selectNode: vi.fn(),
    ...overrides,
  };
}

describe('useCanvasAltDragCopyController', () => {
  it('duplicates the active selection and owns its move and finish lifecycle', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasAltDragCopyController(options),
    );

    act(() => result.current.beginCopyDrag(true, 'source-a'));

    expect(options.duplicateNodes).toHaveBeenCalledWith(
      ['source-a', 'source-b'],
      {
        explicitOffset: { x: 0, y: 0 },
        disableOffsetIteration: true,
        suppressSelect: true,
      },
    );
    expect(options.elevateNodes).toHaveBeenCalledWith(
      ['copy-a', 'copy-b'],
      2000,
    );
    expect(result.current.isCopyDragActive()).toBe(true);

    act(() => result.current.updateCopyDrag('source-a', { x: 30, y: 50 }));

    expect(options.commitNodePositions).toHaveBeenNthCalledWith(1, [
      { nodeId: 'source-a', position: { x: 10, y: 20 }, dragging: true },
      { nodeId: 'source-b', position: { x: 40, y: 50 }, dragging: true },
      { nodeId: 'copy-a', position: { x: 30, y: 50 }, dragging: true },
      { nodeId: 'copy-b', position: { x: 60, y: 80 }, dragging: true },
    ]);

    act(() => result.current.finishCopyDrag('source-a', { x: 35, y: 60 }));

    expect(options.commitNodePositions).toHaveBeenNthCalledWith(2, [
      { nodeId: 'source-a', position: { x: 10, y: 20 }, dragging: false },
      { nodeId: 'source-b', position: { x: 40, y: 50 }, dragging: false },
      { nodeId: 'copy-a', position: { x: 35, y: 60 }, dragging: false },
      { nodeId: 'copy-b', position: { x: 65, y: 90 }, dragging: false },
    ]);
    expect(options.selectNode).toHaveBeenCalledWith('copy-a');
    expect(result.current.isCopyDragActive()).toBe(false);
  });

  it('duplicates only the dragged node outside the active selection', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasAltDragCopyController(options),
    );

    act(() => result.current.beginCopyDrag(true, 'source-c'));

    expect(options.duplicateNodes).toHaveBeenCalledWith(
      ['source-c'],
      expect.any(Object),
    );
    expect(options.elevateNodes).toHaveBeenCalledWith(['copy-c'], 2000);

    act(() => result.current.finishCopyDrag('source-c', { x: 100, y: 120 }));

    expect(options.commitNodePositions).toHaveBeenCalledWith([
      { nodeId: 'source-c', position: { x: 70, y: 80 }, dragging: false },
      { nodeId: 'copy-c', position: { x: 100, y: 120 }, dragging: false },
    ]);
    expect(options.selectNode).toHaveBeenCalledWith('copy-c');
  });

  it('clears pending copy state when the next drag does not hold Alt', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasAltDragCopyController(options),
    );

    act(() => {
      result.current.beginCopyDrag(true, 'source-a');
      result.current.beginCopyDrag(false, 'source-a');
      result.current.updateCopyDrag('source-a', { x: 20, y: 30 });
      result.current.finishCopyDrag('source-a', { x: 20, y: 30 });
    });

    expect(result.current.isCopyDragActive()).toBe(false);
    expect(options.duplicateNodes).toHaveBeenCalledOnce();
    expect(options.commitNodePositions).not.toHaveBeenCalled();
    expect(options.selectNode).not.toHaveBeenCalled();
  });

  it('stays inactive when duplication creates no mapped node', () => {
    const options = createOptions({
      duplicateNodes: vi.fn(() => ({ idMap: new Map() })),
    });
    const { result } = renderHook(() =>
      useCanvasAltDragCopyController(options),
    );

    act(() => result.current.beginCopyDrag(true, 'source-a'));

    expect(result.current.isCopyDragActive()).toBe(false);
    expect(options.elevateNodes).not.toHaveBeenCalled();
  });
});
