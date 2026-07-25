// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { NODE_TOOL_TYPES, type CanvasNode } from './canvasNodes';
import {
  collectCanvasNodeIdsInRect,
  resolveActiveToolDialog,
  resolveSelectedNodeId,
} from './canvasSelection';

const nodes = [{ id: 'existing' } as CanvasNode];

describe('Canvas selection', () => {
  it('collects nodes intersecting a selection rectangle', () => {
    const selectableNodes = [
      {
        id: 'inside',
        position: { x: 100, y: 100 },
        measured: { width: 80, height: 60 },
      },
      {
        id: 'outside',
        position: { x: 300, y: 300 },
        measured: { width: 80, height: 60 },
      },
    ] as CanvasNode[];

    expect(
      [...collectCanvasNodeIdsInRect(selectableNodes, {
        x: 90,
        y: 90,
        width: 120,
        height: 100,
      })],
    ).toEqual(['inside']);
  });

  it('uses absolute child positions and drops hit ancestor containers', () => {
    const nestedNodes = [
      {
        id: 'group',
        position: { x: 100, y: 100 },
        measured: { width: 240, height: 180 },
      },
      {
        id: 'child',
        parentId: 'group',
        position: { x: 30, y: 40 },
        measured: { width: 80, height: 60 },
      },
    ] as CanvasNode[];

    expect(
      [...collectCanvasNodeIdsInRect(nestedNodes, {
        x: 120,
        y: 130,
        width: 100,
        height: 90,
      })],
    ).toEqual(['child']);
  });

  it('keeps a hit container when none of its children are hit', () => {
    const nestedNodes = [
      {
        id: 'group',
        position: { x: 100, y: 100 },
        measured: { width: 240, height: 180 },
      },
      {
        id: 'child',
        parentId: 'group',
        position: { x: 180, y: 120 },
        measured: { width: 40, height: 40 },
      },
    ] as CanvasNode[];

    expect(
      [...collectCanvasNodeIdsInRect(nestedNodes, {
        x: 105,
        y: 105,
        width: 30,
        height: 30,
      })],
    ).toEqual(['group']);
  });

  it('keeps only a selected node that still exists', () => {
    expect(resolveSelectedNodeId('existing', nodes)).toBe('existing');
    expect(resolveSelectedNodeId('missing', nodes)).toBeNull();
    expect(resolveSelectedNodeId(null, nodes)).toBeNull();
  });

  it('keeps only a tool dialog whose target still exists', () => {
    const dialog = {
      nodeId: 'existing',
      toolType: NODE_TOOL_TYPES.crop,
    };

    expect(resolveActiveToolDialog(dialog, nodes)).toBe(dialog);
    expect(
      resolveActiveToolDialog({ ...dialog, nodeId: 'missing' }, nodes),
    ).toBeNull();
    expect(resolveActiveToolDialog(null, nodes)).toBeNull();
  });
});
