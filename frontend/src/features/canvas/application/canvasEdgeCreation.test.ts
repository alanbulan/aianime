// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  createCanvasDataEdge,
  createCanvasProgrammaticEdge,
  prepareCanvasReactFlowConnection,
} from './canvasEdgeCreation';

function node(id: string, type: CanvasNode['type']): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as CanvasNode;
}

describe('Canvas edge creation', () => {
  it('prepares normalized React Flow connections and enforces graph limits', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    const other = node('other', CANVAS_NODE_TYPES.upload);
    const world = node('world', CANVAS_NODE_TYPES.threeDWorld);
    const existing: CanvasEdge = {
      id: 'existing',
      source: other.id,
      target: world.id,
    };

    expect(
      prepareCanvasReactFlowConnection([source, world], [], {
        source: source.id,
        target: world.id,
        sourceHandle: ' source ',
        targetHandle: null,
      }),
    ).toEqual({
      source: source.id,
      target: world.id,
      sourceHandle: 'source',
      targetHandle: 'target',
      type: 'disconnectableEdge',
    });
    expect(
      prepareCanvasReactFlowConnection(
        [source, other, world],
        [existing],
        { source: source.id, target: world.id },
      ),
    ).toBeNull();
  });

  it('rejects invalid endpoints and creates a normalized programmatic edge', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    const target = node('target', CANVAS_NODE_TYPES.imageGen);

    expect(
      createCanvasProgrammaticEdge([source], [], source.id, target.id),
    ).toBeNull();
    expect(
      createCanvasProgrammaticEdge([source, target], [], source.id, target.id),
    ).toEqual({
      edgeId: 'e-source-target',
      created: true,
      edges: [
        {
          id: 'e-source-target',
          source: source.id,
          target: target.id,
          sourceHandle: 'source',
          targetHandle: 'target',
          type: 'disconnectableEdge',
        },
      ],
    });
  });

  it('returns an existing programmatic edge without adding a duplicate', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    const target = node('target', CANVAS_NODE_TYPES.imageGen);
    const edge: CanvasEdge = {
      id: 'e-source-target',
      source: source.id,
      target: target.id,
    };

    expect(
      createCanvasProgrammaticEdge(
        [source, target],
        [edge],
        source.id,
        target.id,
      ),
    ).toEqual({ edgeId: edge.id, edges: [edge], created: false });
  });

  it('creates a data edge with normalized handles and a custom id', () => {
    const source = node('source', CANVAS_NODE_TYPES.upload);
    const target = node('target', CANVAS_NODE_TYPES.imageGen);
    const data = { edgeKind: 'annotation' };

    expect(
      createCanvasDataEdge(
        [source, target],
        [],
        source.id,
        target.id,
        data,
        {
          id: 'custom',
          sourceHandle: ' source ',
          targetHandle: 'null',
        },
      ),
    ).toEqual({
      ok: true,
      result: {
        edgeId: 'custom',
        created: true,
        edges: [
          {
            id: 'custom',
            source: source.id,
            target: target.id,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'disconnectableEdge',
            data,
          },
        ],
      },
    });
  });

  it('reports candidate role conflicts without changing the graph', () => {
    const first = node('first', CANVAS_NODE_TYPES.upload);
    const second = node('second', CANVAS_NODE_TYPES.upload);
    const target = node('target', CANVAS_NODE_TYPES.imageGen);
    const existing: CanvasEdge = {
      id: 'existing',
      source: first.id,
      target: target.id,
      data: {
        edgeKind: 'candidate_binding',
        role: 'selected_background',
        sourceNodeId: first.id,
        beatContextNodeId: 'beat-scope',
      },
    };

    const outcome = createCanvasDataEdge(
      [first, second, target],
      [existing],
      second.id,
      target.id,
      {
        edgeKind: 'candidate_binding',
        role: 'selected_background',
        sourceNodeId: second.id,
        beatContextNodeId: 'beat-scope',
      },
    );

    expect(outcome).toMatchObject({
      ok: false,
      stage: 'role',
      edge: { source: second.id, target: target.id },
    });
  });
});
