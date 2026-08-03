// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  navigateCanvasHistory,
  type CanvasHistoryNavigationState,
} from './canvasHistoryNavigation';

interface TestNode {
  id: string;
}

interface TestEdge {
  id: string;
}

interface TestDialog {
  nodeId: string;
  toolType: 'crop';
}

type TestNavigationState = CanvasHistoryNavigationState<
  TestNode,
  TestEdge,
  TestDialog
>;

function node(id: string): TestNode {
  return { id };
}

function state(nodes: TestNode[]): TestNavigationState {
  return {
    nodes,
    edges: [],
    selectedNodeId: nodes[0]?.id ?? null,
    activeToolDialog: nodes[0]
      ? { nodeId: nodes[0].id, toolType: 'crop' }
      : null,
    history: { past: [], future: [] },
    dragHistorySnapshot: null,
    userEditsSinceHydrate: 0,
    lastMutationSource: null,
    pendingClearIntent: false,
  };
}

describe('Canvas history navigation', () => {
  it('returns null when the requested history direction has no target', () => {
    const current = state([node('current')]);

    expect(navigateCanvasHistory(current, 'undo')).toBeNull();
    expect(navigateCanvasHistory(current, 'redo')).toBeNull();
  });

  it('undoes to an empty graph and clears node-bound UI', () => {
    const currentNode = node('current');
    const current = state([currentNode]);
    current.history.past = [{ nodes: [], edges: [] }];

    const result = navigateCanvasHistory(current, 'undo');

    expect(result).toMatchObject({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      activeToolDialog: null,
      lastMutationSource: 'delete_to_empty',
      userEditsSinceHydrate: 1,
    });
    expect(result?.history.future).toEqual([
      { nodes: [currentNode], edges: [] },
    ]);
  });

  it('redoes a graph snapshot as a user edit', () => {
    const restored = node('restored');
    const current = state([]);
    current.history.future = [{ nodes: [restored], edges: [] }];

    const result = navigateCanvasHistory(current, 'redo');

    expect(result).toMatchObject({
      nodes: [restored],
      lastMutationSource: 'user_edit',
      userEditsSinceHydrate: 1,
      dragHistorySnapshot: null,
    });
    expect(result?.history.past).toEqual([{ nodes: [], edges: [] }]);
  });
});
