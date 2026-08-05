// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { projectionScopedId } from '../domain/projectionGraphIds';
import {
  normalizeCanvasData,
  type HydrationGraphEdge,
} from './canvasDataNormalization';
import type { HydrationGraphNode } from './canvasNodeHydration';
import type { CanvasNodeDefaultDataCatalog } from './canvasNodeDefaultData';

function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  overrides: Partial<HydrationGraphNode> = {},
): HydrationGraphNode {
  return { id, type, data, ...overrides };
}

const catalog: CanvasNodeDefaultDataCatalog = {
  getDefinition: () => ({ createDefaultData: () => ({}) }),
};

describe('Canvas data normalization', () => {
  it('scopes projection ids before hydrating nodes and edges', () => {
    const projectionKey = 'beat:1:4';
    const group = node('group', 'groupNode', {
      projection_key: projectionKey,
    });
    const source = node('source', 'uploadNode', {}, {
      parentId: group.id,
      extent: 'parent',
    });
    const target = node('target', 'skillNode', {
      skill_id: 'freezone.test',
    }, {
      parentId: group.id,
      extent: 'parent',
    });
    const edge: HydrationGraphEdge = {
      id: 'edge',
      source: source.id,
      target: target.id,
    };

    const result = normalizeCanvasData(
      [source, target, group],
      [edge],
      undefined,
      catalog,
    );
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
    const placeholder = node('placeholder', 'uploadNode', {
      label: '__NO_PROP__',
    });
    const target = node('target', 'skillNode', {
      skill_id: 'freezone.test',
    });
    const edge: HydrationGraphEdge = {
      id: 'placeholder-edge',
      source: placeholder.id,
      target: target.id,
    };

    const result = normalizeCanvasData(
      [placeholder, target],
      [edge],
      undefined,
      catalog,
    );

    expect(result.nodes.map((item) => item.id)).toEqual([target.id]);
    expect(result.edges).toEqual([]);
  });
});
