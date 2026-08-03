// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { SkillDefinition } from '../domain/skillContract';
import {
  createCanvasDataEdge,
  createCanvasProgrammaticEdge,
  planCanvasGraphConnection,
  planCanvasSpawnConnections,
  planSingleBeatContextBinding,
  prepareCanvasReactFlowConnection,
  type CanvasEdgeCreationEdge,
  type CanvasEdgeCreationNode,
} from './canvasEdgeCreation';

const CANVAS_NODE_TYPES = {
  upload: 'uploadNode',
  imageGen: 'imageGenNode',
  beatContext: 'beatContextNode',
  threeDWorld: 'threeDWorldNode',
  skill: 'skillNode',
} as const;

type CanvasEdge = CanvasEdgeCreationEdge;
type CanvasNode = CanvasEdgeCreationNode;

function node(id: string, type: CanvasNode['type']): CanvasNode {
  return { id, type, data: {} };
}

function skill(id = 'skill-1', includeBeatContext = true): SkillDefinition {
  return {
    id,
    provider: 'tool',
    display_name: 'Test skill',
    description: '',
    inputs: includeBeatContext
      ? [{
          role: 'beat_context',
          label: 'Beat context',
          accepts: {},
          required: true,
          cardinality: 'single',
        }]
      : [],
    outputs: [],
  };
}

describe('Canvas edge creation', () => {
  it('plans regular and skill role connections through one application entry', () => {
    const source = node('beat', CANVAS_NODE_TYPES.beatContext);
    const target = node('skill', CANVAS_NODE_TYPES.skill);
    target.data = { skill_id: 'skill-1' };
    const skillSpec = skill();
    const connection = {
      source: source.id,
      target: target.id,
      sourceHandle: 'source',
      targetHandle: 'beat_context',
    };

    expect(planCanvasGraphConnection({
      nodes: [source, node('image', CANVAS_NODE_TYPES.imageGen)],
      edges: [],
      connection: {
        source: source.id,
        target: 'image',
        sourceHandle: null,
        targetHandle: null,
      },
      skillById: new Map(),
    })).toEqual({ kind: 'regular' });

    const plan = planCanvasGraphConnection({
      nodes: [source, target],
      edges: [],
      connection,
      skillById: new Map([[skillSpec.id, skillSpec]]),
    });
    expect(plan).toMatchObject({
      kind: 'skill_binding',
      edges: [{
        source: source.id,
        target: target.id,
        targetHandle: 'beat_context',
        data: { edgeKind: 'role_binding', role: 'beat_context' },
      }],
    });
  });

  it('reports unavailable skill metadata and keeps invalid reverse handles regular', () => {
    const target = node('target', CANVAS_NODE_TYPES.upload);
    const skillNode = node('skill', CANVAS_NODE_TYPES.skill);
    skillNode.data = { skill_id: 'skill-1' };

    expect(planCanvasGraphConnection({
      nodes: [target, skillNode],
      edges: [],
      connection: {
        source: target.id,
        target: skillNode.id,
        sourceHandle: null,
        targetHandle: null,
      },
      skillById: new Map(),
    })).toEqual({
      kind: 'skill_registry_unavailable',
      skillId: 'skill-1',
      skillNodeId: skillNode.id,
    });
    expect(planCanvasGraphConnection({
      nodes: [target, skillNode],
      edges: [],
      connection: {
        source: skillNode.id,
        target: target.id,
        sourceHandle: 'not_an_input',
        targetHandle: null,
      },
      skillById: new Map([['skill-1', skill()]]),
    })).toEqual({ kind: 'regular' });
  });

  it('plans automatic Beat Context binding only for one eligible source', () => {
    const beat = node('beat', CANVAS_NODE_TYPES.beatContext);
    const secondBeat = node('beat-2', CANVAS_NODE_TYPES.beatContext);

    expect(planSingleBeatContextBinding([beat], 'skill', skill())).toEqual({
      source: beat.id,
      target: 'skill',
      sourceHandle: 'source',
      targetHandle: 'beat_context',
    });
    expect(planSingleBeatContextBinding([beat, secondBeat], 'skill', skill())).toBeNull();
    expect(planSingleBeatContextBinding([beat], 'skill', skill('skill-2', false))).toBeNull();
  });

  it('plans spawned-node connections with batch priority and stable direction', () => {
    expect(planCanvasSpawnConnections({
      spawnedNodeId: 'spawned',
      pendingConnection: { nodeId: 'pending', handleType: 'target' },
      batchSourceIds: ['first', 'second'],
    })).toEqual([
      {
        source: 'first',
        target: 'spawned',
        sourceHandle: 'source',
        targetHandle: 'target',
      },
      {
        source: 'second',
        target: 'spawned',
        sourceHandle: 'source',
        targetHandle: 'target',
      },
    ]);
    expect(planCanvasSpawnConnections({
      spawnedNodeId: 'spawned',
      pendingConnection: { nodeId: 'origin', handleType: 'source' },
      batchSourceIds: [],
    })).toEqual([{
      source: 'origin',
      target: 'spawned',
      sourceHandle: 'source',
      targetHandle: 'target',
    }]);
    expect(planCanvasSpawnConnections({
      spawnedNodeId: 'spawned',
      pendingConnection: { nodeId: 'origin', handleType: 'target' },
      batchSourceIds: null,
    })).toEqual([{
      source: 'spawned',
      target: 'origin',
      sourceHandle: 'source',
      targetHandle: 'target',
    }]);
    expect(planCanvasSpawnConnections({
      spawnedNodeId: 'spawned',
      pendingConnection: null,
      batchSourceIds: null,
    })).toEqual([]);
  });

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
