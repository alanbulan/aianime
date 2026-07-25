// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  filterPresetManagedEdgeChanges,
  filterPresetManagedNodeChanges,
} from './canvasManagedChangeGuard';

function node(id: string, presetManaged = false): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: { preset_managed: presetManaged },
  } as CanvasNode;
}

function edge(id: string, presetManaged = false): CanvasEdge {
  return {
    id,
    source: 'source',
    target: 'target',
    data: { preset_managed: presetManaged },
  };
}

describe('canvasManagedChangeGuard', () => {
  it('blocks removal but keeps other changes for preset-managed nodes', () => {
    const removeLocked = { id: 'locked', type: 'remove', marker: 1 };
    const moveLocked = { id: 'locked', type: 'position', marker: 2 };
    const removeOpen = { id: 'open', type: 'remove', marker: 3 };
    const globalChange = { type: 'reset', marker: 4 };

    expect(filterPresetManagedNodeChanges(
      [node('locked', true), node('open')],
      [removeLocked, moveLocked, removeOpen, globalChange],
    )).toEqual([moveLocked, removeOpen, globalChange]);
  });

  it('keeps only selection changes for preset-managed edges', () => {
    const removeLocked = { id: 'locked', type: 'remove', marker: 1 };
    const selectLocked = { id: 'locked', type: 'select', marker: 2 };
    const removeOpen = { id: 'open', type: 'remove', marker: 3 };
    const globalChange = { type: 'reset', marker: 4 };

    expect(filterPresetManagedEdgeChanges(
      [edge('locked', true), edge('open')],
      [removeLocked, selectLocked, removeOpen, globalChange],
    )).toEqual([selectLocked, removeOpen, globalChange]);
  });
});
