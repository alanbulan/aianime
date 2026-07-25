// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { projectionScopedId } from '@/features/freezone/projectionGraphIds';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import { normalizeCanvasData } from './canvasDataNormalization';

function node(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown> = {},
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data, ...overrides } as CanvasNode;
}

describe('Canvas data normalization', () => {
  it('scopes projection ids before hydrating nodes and edges', () => {
    const projectionKey = 'beat:1:4';
    const group = node('group', CANVAS_NODE_TYPES.group, {
      projection_key: projectionKey,
    });
    const source = node('source', CANVAS_NODE_TYPES.upload, {}, {
      parentId: group.id,
      extent: 'parent',
    });
    const target = node('target', CANVAS_NODE_TYPES.skill, {
      skill_id: 'freezone.test',
    }, {
      parentId: group.id,
      extent: 'parent',
    });
    const edge: CanvasEdge = {
      id: 'edge',
      source: source.id,
      target: target.id,
    };

    const result = normalizeCanvasData([source, target, group], [edge]);
    const scoped = (id: string) => projectionScopedId(projectionKey, id);

    expect(result.nodes.map((item) => item.id)).toEqual([
      scoped(group.id),
      scoped(source.id),
      scoped(target.id),
    ]);
    expect(result.nodes.slice(1).map((item) => item.parentId)).toEqual([
      scoped(group.id),
      scoped(group.id),
    ]);
    expect(result.edges).toEqual([
      expect.objectContaining({
        id: scoped(edge.id),
        source: scoped(source.id),
        target: scoped(target.id),
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'disconnectableEdge',
      }),
    ]);
  });

  it('normalizes edges against the hydrated node set', () => {
    const placeholder = node('placeholder', CANVAS_NODE_TYPES.upload, {
      label: '__NO_PROP__',
    });
    const target = node('target', CANVAS_NODE_TYPES.skill, {
      skill_id: 'freezone.test',
    });
    const edge: CanvasEdge = {
      id: 'placeholder-edge',
      source: placeholder.id,
      target: target.id,
    };

    const result = normalizeCanvasData([placeholder, target], [edge]);

    expect(result.nodes.map((item) => item.id)).toEqual([target.id]);
    expect(result.edges).toEqual([]);
  });
});
