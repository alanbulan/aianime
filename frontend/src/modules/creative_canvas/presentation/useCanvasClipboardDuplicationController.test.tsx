// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';
import type { CanvasClipboardDuplicationPorts } from '../application/canvasClipboardDuplication';
import {
  useCanvasClipboardDuplicationController,
  type CanvasClipboardDuplicationControllerOptions,
} from './useCanvasClipboardDuplicationController';

type TestNodeData = Record<string, unknown>;

interface TestNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  measured: { width: number; height: number };
  selected?: boolean;
  data: TestNodeData;
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

type TestControllerOptions = CanvasClipboardDuplicationControllerOptions<
  TestNode,
  TestEdge,
  string,
  TestNodeData
>;

const duplicationPorts: CanvasClipboardDuplicationPorts<
  TestNode,
  string,
  TestNodeData
> = {
  resolveNodeType: (node) => node.type,
  cloneNodeData: (data) => structuredClone(data),
  getNodeSize: (node) => node.measured,
  hasRectCollision: (candidate, nodes) => nodes.some((node) => {
    const margin = 18;
    return (
      candidate.x < node.position.x + node.measured.width + margin
      && candidate.x + candidate.width + margin > node.position.x
      && candidate.y < node.position.y + node.measured.height + margin
      && candidate.y + candidate.height + margin > node.position.y
    );
  }),
};

function node(
  id: string,
  position = { x: 0, y: 0 },
  selected = false,
): TestNode {
  return {
    id,
    type: 'textAnnotation',
    position,
    measured: { width: 10, height: 20 },
    selected,
    data: { content: id },
  };
}

function snapshot(
  nodes: TestNode[],
  edges: TestEdge[] = [],
  sourceProject: string | null = 'project-1',
): CanvasClipboardSnapshot<TestNode, TestEdge> {
  return { nodes, edges, sourceProject };
}

function createHarness(params: {
  initialNodes?: TestNode[];
  currentProject?: string | null;
  migrationSummary?: { migrated: number; failed: number };
  persistCreatedNodes?: boolean;
} = {}) {
  const graph = {
    nodes: [...(params.initialNodes ?? [])],
    edges: [] as TestEdge[],
  };
  let nextNode = 0;
  const options: TestControllerOptions = {
    getGraph: vi.fn(() => graph),
    duplicationPorts,
    createNode: vi.fn((type, position, data = {}) => {
      nextNode += 1;
      const id = `copy-${nextNode}`;
      if (params.persistCreatedNodes !== false) {
        graph.nodes.push({
          id,
          type,
          position,
          measured: { width: 10, height: 20 },
          selected: false,
          data,
        });
      }
      return id;
    }),
    commitNodeDimensions: vi.fn(),
    connectNodes: vi.fn(),
    commitNodeSelection: vi.fn(),
    selectNode: vi.fn(),
    currentProject:
      params.currentProject === undefined ? 'project-1' : params.currentProject,
    migrateAssets: vi.fn(async () => params.migrationSummary ?? {
      migrated: 0,
      failed: 0,
    }),
    updateNodeData: vi.fn(),
    notifyMigrationSuccess: vi.fn(),
    notifyMigrationPartialFailure: vi.fn(),
    reportMigrationError: vi.fn(),
  };
  return { graph, options };
}

describe('useCanvasClipboardDuplicationController', () => {
  it('creates nodes, dimensions, internal connections, and whole-group selection', () => {
    const { options } = createHarness({
      initialNodes: [node('selected-old', { x: -1000, y: -1000 }, true)],
    });
    const clipboard = snapshot(
      [node('source-a'), node('source-b', { x: 30, y: 40 })],
      [{
        id: 'edge',
        source: 'source-a',
        target: 'source-b',
        sourceHandle: null,
        targetHandle: null,
      }],
    );
    const { result } = renderHook(() =>
      useCanvasClipboardDuplicationController(options),
    );

    let firstNodeId: string | null = null;
    act(() => {
      firstNodeId = result.current.pasteFromClipboard(clipboard);
    });

    expect(firstNodeId).toBe('copy-1');
    expect(options.createNode).toHaveBeenNthCalledWith(
      1,
      'textAnnotation',
      { x: 44, y: 30 },
      { content: 'source-a' },
    );
    expect(options.createNode).toHaveBeenNthCalledWith(
      2,
      'textAnnotation',
      { x: 74, y: 70 },
      { content: 'source-b' },
    );
    expect(options.commitNodeDimensions).toHaveBeenCalledWith([
      { nodeId: 'copy-1', width: 10, height: 20 },
      { nodeId: 'copy-2', width: 10, height: 20 },
    ]);
    expect(options.connectNodes).toHaveBeenCalledWith({
      source: 'copy-1',
      target: 'copy-2',
      sourceHandle: 'source',
      targetHandle: 'target',
    });
    expect(options.commitNodeSelection).toHaveBeenCalledWith([
      { nodeId: 'selected-old', selected: false },
      { nodeId: 'copy-1', selected: true },
      { nodeId: 'copy-2', selected: true },
    ]);
    expect(options.selectNode).toHaveBeenCalledWith(null);
    expect(options.migrateAssets).not.toHaveBeenCalled();
  });

  it('owns paste iteration and resets it without affecting Alt-drag duplication', () => {
    const { options } = createHarness({
      currentProject: null,
      persistCreatedNodes: false,
    });
    const clipboard = snapshot([node('source')], [], null);
    const { result } = renderHook(() =>
      useCanvasClipboardDuplicationController(options),
    );

    act(() => {
      result.current.duplicateNodes([], {
        sourceSnapshot: clipboard,
        suppressSelect: true,
      });
      result.current.duplicateNodes([], {
        sourceSnapshot: clipboard,
        suppressSelect: true,
      });
      result.current.resetPasteIteration();
      result.current.duplicateNodes([], {
        sourceSnapshot: clipboard,
        suppressSelect: true,
      });
      result.current.duplicateNodes([], {
        sourceSnapshot: clipboard,
        explicitOffset: { x: 0, y: 0 },
        disableOffsetIteration: true,
        suppressSelect: true,
      });
    });

    expect(options.createNode).toHaveBeenNthCalledWith(
      1,
      'textAnnotation',
      { x: 44, y: 30 },
      { content: 'source' },
    );
    expect(options.createNode).toHaveBeenNthCalledWith(
      2,
      'textAnnotation',
      { x: 52, y: 36 },
      { content: 'source' },
    );
    expect(options.createNode).toHaveBeenNthCalledWith(
      3,
      'textAnnotation',
      { x: 44, y: 30 },
      { content: 'source' },
    );
    expect(options.createNode).toHaveBeenNthCalledWith(
      4,
      'textAnnotation',
      { x: 0, y: 0 },
      { content: 'source' },
    );
    expect(options.commitNodeSelection).not.toHaveBeenCalled();
    expect(options.selectNode).not.toHaveBeenCalled();
  });

  it.each([
    {
      summary: { migrated: 2, failed: 0 },
      successCount: 2,
      partialFailureCount: null,
    },
    {
      summary: { migrated: 1, failed: 3 },
      successCount: null,
      partialFailureCount: 3,
    },
  ])('migrates cross-project assets and reports $summary', async ({
    summary,
    successCount,
    partialFailureCount,
  }) => {
    const { options } = createHarness({
      currentProject: 'target-project',
      migrationSummary: summary,
    });
    const clipboard = snapshot([node('source')], [], 'source-project');
    const { result } = renderHook(() =>
      useCanvasClipboardDuplicationController(options),
    );

    await act(async () => {
      result.current.pasteFromClipboard(clipboard);
      await Promise.resolve();
    });

    expect(options.migrateAssets).toHaveBeenCalledWith(expect.objectContaining({
      nodes: [{ id: 'copy-1', data: { content: 'source' } }],
      targetProject: 'target-project',
      updateNodeData: options.updateNodeData,
    }));
    if (successCount === null) {
      expect(options.notifyMigrationSuccess).not.toHaveBeenCalled();
    } else {
      expect(options.notifyMigrationSuccess).toHaveBeenCalledWith(successCount);
    }
    if (partialFailureCount === null) {
      expect(options.notifyMigrationPartialFailure).not.toHaveBeenCalled();
    } else {
      expect(options.notifyMigrationPartialFailure).toHaveBeenCalledWith(
        partialFailureCount,
      );
    }
  });

  it('reports an unexpected migration rejection through the injected port', async () => {
    const { options } = createHarness({ currentProject: 'target-project' });
    const error = new Error('migration failed');
    vi.mocked(options.migrateAssets).mockRejectedValueOnce(error);
    const { result } = renderHook(() =>
      useCanvasClipboardDuplicationController(options),
    );

    await act(async () => {
      result.current.pasteFromClipboard(
        snapshot([node('source')], [], 'source-project'),
      );
      await Promise.resolve();
    });

    expect(options.reportMigrationError).toHaveBeenCalledWith(error);
  });
});
