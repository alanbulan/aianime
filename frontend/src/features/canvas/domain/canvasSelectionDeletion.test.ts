// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from './canvasNodes';
import { resolveCanvasSelectionDeletion } from './canvasSelectionDeletion';

function node(id: string, presetManaged = false): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: { preset_managed: presetManaged },
  } as CanvasNode;
}

function edge(
  id: string,
  selected: boolean,
  presetManaged = false,
): CanvasEdge {
  return {
    id,
    source: 'source',
    target: 'target',
    selected,
    data: { preset_managed: presetManaged },
  };
}

describe('resolveCanvasSelectionDeletion', () => {
  it('filters preset-managed nodes and edges from a mixed selection', () => {
    expect(resolveCanvasSelectionDeletion({
      nodes: [node('node-open'), node('node-locked', true)],
      edges: [
        edge('edge-open', true),
        edge('edge-locked', true, true),
        edge('edge-unselected', false),
      ],
      selectedNodeIds: ['node-open', 'node-locked'],
      selectedNodeId: null,
    })).toEqual({
      nodeIds: ['node-open'],
      edgeIds: ['edge-open'],
      hasSelectedTargets: true,
    });
  });

  it('falls back to the singular selected node id', () => {
    expect(resolveCanvasSelectionDeletion({
      nodes: [node('node-1')],
      edges: [],
      selectedNodeIds: [],
      selectedNodeId: 'node-1',
    })).toEqual({
      nodeIds: ['node-1'],
      edgeIds: [],
      hasSelectedTargets: true,
    });
  });

  it('reports locked selections so the keyboard handler can consume Backspace', () => {
    expect(resolveCanvasSelectionDeletion({
      nodes: [node('node-locked', true)],
      edges: [edge('edge-locked', true, true)],
      selectedNodeIds: ['node-locked'],
      selectedNodeId: null,
    })).toEqual({
      nodeIds: [],
      edgeIds: [],
      hasSelectedTargets: true,
    });
  });

  it('reports an empty decision when nothing is selected', () => {
    expect(resolveCanvasSelectionDeletion({
      nodes: [node('node-1')],
      edges: [edge('edge-1', false)],
      selectedNodeIds: [],
      selectedNodeId: null,
    })).toEqual({
      nodeIds: [],
      edgeIds: [],
      hasSelectedTargets: false,
    });
  });
});
