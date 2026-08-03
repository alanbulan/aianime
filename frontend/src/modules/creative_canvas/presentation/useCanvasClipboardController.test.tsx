// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createCanvasClipboardSession } from '../application/canvasClipboardSession';
import {
  createUseCanvasClipboardController,
  type CanvasClipboardControllerOptions,
} from './useCanvasClipboardController';

type TestNodeData = Record<string, unknown>;

interface TestNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  measured?: { width: number; height: number };
  selected?: boolean;
  dragging?: boolean;
  data: TestNodeData;
}

interface TestEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

type TestOptions = CanvasClipboardControllerOptions<
  TestNode,
  TestEdge,
  string,
  TestNodeData
>;

function sourceNode(): TestNode {
  return {
    id: 'source-node',
    type: 'textAnnotationNode',
    position: { x: 10, y: 20 },
    measured: { width: 120, height: 80 },
    selected: true,
    data: { content: 'source' },
  };
}

function createHarness() {
  const graph = {
    nodes: [sourceNode()],
    edges: [] as TestEdge[],
  };
  let nextNode = 0;
  const dependencies = {
    session: createCanvasClipboardSession<TestNode, TestEdge>(),
    migrateAssets: vi.fn().mockResolvedValue({ migrated: 0, failed: 0 }),
    clearSystemClipboard: vi.fn().mockResolvedValue(undefined),
    reportMigrationError: vi.fn(),
  };
  const useController = createUseCanvasClipboardController(
    {
      duplication: {
        resolveNodeType: (node: TestNode) => node.type,
        cloneNodeData: (data: TestNodeData) => structuredClone(data),
        getNodeSize: (node: TestNode) => node.measured ?? {
          width: 320,
          height: 200,
        },
        hasRectCollision: () => false,
      },
      cloneSnapshotNode: (node: TestNode, state) => ({
        ...node,
        ...state,
        data: structuredClone(node.data),
      }),
      cloneSnapshotEdge: (edge: TestEdge) => ({ ...edge }),
    },
    dependencies,
  );
  const createNode = vi.fn<TestOptions['createNode']>(
    (type, position, data = {}) => {
      nextNode += 1;
      const id = `copy-${nextNode}`;
      graph.nodes.push({
        id,
        type,
        position,
        selected: false,
        data: data as TestNodeData,
      });
      return id;
    },
  );
  const options: TestOptions = {
    nodes: graph.nodes,
    edges: graph.edges,
    selectedNodeIds: ['source-node'],
    currentProject: 'project-1',
    getGraph: vi.fn(() => graph),
    createNode,
    applyNodeChanges: vi.fn(),
    connectNodes: vi.fn(),
    selectNode: vi.fn(),
    updateNodeData: vi.fn(),
    queueSnapshotPaste: vi.fn((pasteSnapshot: () => void) => pasteSnapshot()),
  };

  return { dependencies, options, useController };
}

describe('createUseCanvasClipboardController', () => {
  it('adapts duplicated node dimensions to graph node changes', () => {
    const { options, useController } = createHarness();
    const { result } = renderHook(() => useController(options));

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

  it('shares one snapshot across queued and positioned paste commands', () => {
    const { dependencies, options, useController } = createHarness();
    const { result } = renderHook(() => useController(options));

    act(() => result.current.copySelection());
    expect(result.current.hasCopiedNodes()).toBe(true);
    expect(dependencies.clearSystemClipboard).toHaveBeenCalledOnce();

    act(() => {
      result.current.pasteSelection();
      result.current.pasteAt({ x: 200, y: 100 });
    });

    expect(options.queueSnapshotPaste).toHaveBeenCalledOnce();
    expect(options.createNode).toHaveBeenCalledTimes(2);
    expect(options.createNode).toHaveBeenLastCalledWith(
      'textAnnotationNode',
      { x: 200, y: 100 },
      { content: 'source' },
    );
  });
});
