// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
} from '../domain/canvasNodes';
import {
  useCanvasClipboardController,
  type CanvasClipboardControllerOptions,
} from './useCanvasClipboardController';

const compositionMocks = vi.hoisted(() => ({
  clearBrowserClipboard: vi.fn(),
  migratePastedNodeAssets: vi.fn(),
}));

vi.mock('@/features/canvas/composition', () => compositionMocks);

function sourceNode(): CanvasNode {
  return {
    id: 'source-node',
    type: CANVAS_NODE_TYPES.textAnnotation,
    position: { x: 10, y: 20 },
    measured: { width: 120, height: 80 },
    selected: true,
    data: { content: 'source' },
  } as CanvasNode;
}

function createOptions() {
  const graph = {
    nodes: [sourceNode()],
    edges: [] as CanvasEdge[],
  };
  let nextNode = 0;
  const createNode = vi.fn<CanvasClipboardControllerOptions['createNode']>(
    (type, position, data = {}) => {
      nextNode += 1;
      const id = `copy-${nextNode}`;
      graph.nodes.push({
        id,
        type,
        position,
        selected: false,
        data: data as CanvasNodeData,
      } as CanvasNode);
      return id;
    },
  );
  const applyNodeChanges = vi.fn<CanvasClipboardControllerOptions['applyNodeChanges']>();

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    selectedNodeIds: ['source-node'],
    currentProject: 'project-1',
    getGraph: vi.fn(() => graph),
    createNode,
    applyNodeChanges,
    connectNodes: vi.fn(),
    selectNode: vi.fn(),
    updateNodeData: vi.fn(),
    queueSnapshotPaste: vi.fn((pasteSnapshot: () => void) => pasteSnapshot()),
    graph,
  };
}

describe('useCanvasClipboardController', () => {
  beforeEach(() => {
    compositionMocks.clearBrowserClipboard.mockReset().mockResolvedValue(undefined);
    compositionMocks.migratePastedNodeAssets.mockReset().mockResolvedValue({
      migrated: 0,
      failed: 0,
    });
  });

  it('adapts duplicated node dimensions to the graph change command', () => {
    const options = createOptions();
    const { result } = renderHook(() => useCanvasClipboardController(options));

    act(() => {
      result.current.duplicateNodes(['source-node'], {
        explicitOffset: { x: 0, y: 0 },
        disableOffsetIteration: true,
        suppressSelect: true,
      });
    });

    expect(options.applyNodeChanges).toHaveBeenCalledWith([{
      id: 'copy-1',
      type: 'dimensions',
      dimensions: { width: 120, height: 80 },
      resizing: false,
      setAttributes: true,
    }]);
  });

  it('builds one snapshot for copy and routes queued and positioned paste', () => {
    const options = createOptions();
    const { result } = renderHook(() => useCanvasClipboardController(options));

    act(() => result.current.copySelection());
    expect(result.current.hasCopiedNodes()).toBe(true);
    expect(compositionMocks.clearBrowserClipboard).toHaveBeenCalledOnce();

    act(() => {
      result.current.pasteSelection();
      result.current.pasteAt({ x: 200, y: 100 });
    });

    expect(options.queueSnapshotPaste).toHaveBeenCalledOnce();
    expect(options.createNode).toHaveBeenCalledTimes(2);
    expect(options.createNode).toHaveBeenLastCalledWith(
      CANVAS_NODE_TYPES.textAnnotation,
      { x: 200, y: 100 },
      { content: 'source' },
    );
  });
});
