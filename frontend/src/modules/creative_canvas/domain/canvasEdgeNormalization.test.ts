// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  normalizeEdgesWithNodes,
  normalizeHandleId,
  type CanvasEdgeNormalizationEdgeLike,
  type CanvasEdgeNormalizationNodeLike,
} from './canvasEdgeNormalization';

const CANVAS_NODE_TYPES = {
  upload: 'uploadNode',
  imageEdit: 'imageNode',
  skill: 'skillNode',
  threeDWorld: 'threeDWorldNode',
} as const;

type CanvasEdge = CanvasEdgeNormalizationEdgeLike;
type CanvasNode = CanvasEdgeNormalizationNodeLike;

function node(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown> = {},
): CanvasNode {
  return { id, type, data };
}

describe('Canvas edge normalization', () => {
  it('normalizes optional handle identifiers', () => {
    expect(normalizeHandleId(' source ')).toBe('source');
    expect(normalizeHandleId('null')).toBeUndefined();
    expect(normalizeHandleId(undefined)).toBeUndefined();
  });

  it('filters missing and no-reference endpoints', () => {
    const nodes = [
      node('source', CANVAS_NODE_TYPES.upload),
      node('target', CANVAS_NODE_TYPES.skill),
    ];
    const edges = [
      { id: 'missing', source: 'missing', target: 'target' },
      {
        id: 'no-reference',
        source: 'source',
        target: 'target',
        targetHandle: 'identity:__NO_CHARACTER__',
      },
      { id: 'valid', source: 'source', target: 'target' },
    ] as CanvasEdge[];

    expect(normalizeEdgesWithNodes(edges, nodes).map((edge) => edge.id)).toEqual([
      'valid',
    ]);
  });

  it('prefers an identity source over a portrait for the same reference input', () => {
    const nodes = [
      node('identity', CANVAS_NODE_TYPES.upload, {
        __freezone_source: { role: 'character_identity' },
      }),
      node('portrait', CANVAS_NODE_TYPES.upload, {
        __freezone_source: { role: 'character_portrait' },
      }),
      node('target', CANVAS_NODE_TYPES.skill),
    ];
    const referenceData = { role: 'identity' };
    const edges = [
      {
        id: 'portrait-edge',
        source: 'portrait',
        target: 'target',
        targetHandle: 'identity:character',
        data: referenceData,
      },
      {
        id: 'identity-edge',
        source: 'identity',
        target: 'target',
        targetHandle: 'identity:character',
        data: referenceData,
      },
    ] as CanvasEdge[];

    expect(normalizeEdgesWithNodes(edges, nodes)).toEqual([
      expect.objectContaining({ id: 'identity-edge', source: 'identity' }),
    ]);
  });

  it('normalizes handles and keeps the last payload for a duplicate edge id', () => {
    const nodes = [
      node('source', CANVAS_NODE_TYPES.imageEdit),
      node('target', CANVAS_NODE_TYPES.skill),
    ];
    const edges = [
      {
        id: 'edge',
        source: 'source',
        target: 'target',
        sourceHandle: 'null',
        data: { version: 'old' },
      },
      {
        id: 'edge',
        source: 'source',
        target: 'target',
        data: { version: 'new' },
      },
    ] as CanvasEdge[];

    expect(normalizeEdgesWithNodes(edges, nodes)).toEqual([
      expect.objectContaining({
        id: 'edge',
        type: 'disconnectableEdge',
        sourceHandle: 'source',
        targetHandle: 'target',
        data: { version: 'new' },
      }),
    ]);
  });

  it('restores the canonical 360 skill source handle', () => {
    const nodes = [
      node('source', CANVAS_NODE_TYPES.skill, { skill_id: 'freezone.scene_360' }),
      node('target', CANVAS_NODE_TYPES.threeDWorld),
    ];
    const edges = [
      {
        id: 'edge',
        source: 'source',
        target: 'target',
        data: { role: 'scene_360_canonical' },
      },
    ] as CanvasEdge[];

    expect(normalizeEdgesWithNodes(edges, nodes)[0]?.sourceHandle).toBe(
      'scene_360_candidate',
    );
  });
});
