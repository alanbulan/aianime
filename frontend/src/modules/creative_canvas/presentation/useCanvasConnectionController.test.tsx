// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CANVAS_CONNECTION_NODE_TYPES as CANVAS_NODE_TYPES,
} from '../domain/canvasConnection';
import type {
  CanvasEdgeCreationEdge as CanvasEdge,
  CanvasEdgeCreationNode as CanvasNode,
} from '../application/canvasEdgeCreation';
import type { SkillDefinition } from '../domain/skillContract';
import {
  useCanvasConnectionController,
  type CanvasConnectionControllerOptions,
  type CanvasGraphSnapshot,
} from './useCanvasConnectionController';

function node(
  id: string,
  type: CanvasNode['type'],
  data: Record<string, unknown> = {},
): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

function skill(id = 'skill-1'): SkillDefinition {
  return {
    id,
    provider: 'tool',
    display_name: 'Test skill',
    description: '',
    inputs: [{
      role: 'beat_context',
      label: 'Beat context',
      accepts: {},
      required: true,
      cardinality: 'single',
    }],
    outputs: [],
  };
}

function createOptions(
  graph: CanvasGraphSnapshot,
  skillById: ReadonlyMap<string, SkillDefinition> = new Map(),
): CanvasConnectionControllerOptions {
  return {
    getGraph: vi.fn(() => graph),
    connectRegular: vi.fn(),
    replaceEdges: vi.fn(),
    skillById,
    reportMissingSkill: vi.fn(),
  };
}

describe('useCanvasConnectionController', () => {
  it('submits only manually eligible regular connections', () => {
    const text = node('text', CANVAS_NODE_TYPES.textAnnotation);
    const upload = node('upload', CANVAS_NODE_TYPES.upload);
    const audio = node('audio', CANVAS_NODE_TYPES.audio);
    const options = createOptions({ nodes: [text, upload, audio], edges: [] });
    const { result } = renderHook(() => useCanvasConnectionController(options));

    act(() => result.current.connectManualGraphNodes({
      source: upload.id,
      target: audio.id,
      sourceHandle: 'source',
      targetHandle: 'target',
    }));
    expect(options.connectRegular).not.toHaveBeenCalled();

    act(() => result.current.connectManualGraphNodes({
      source: text.id,
      target: audio.id,
      sourceHandle: 'source',
      targetHandle: 'target',
    }));
    expect(options.connectRegular).toHaveBeenCalledOnce();
  });

  it('replaces Skill role edges and consumes missing registry connections', () => {
    const beat = node('beat', CANVAS_NODE_TYPES.beatContext);
    const skillNode = node('skill', CANVAS_NODE_TYPES.skill, { skill_id: 'skill-1' });
    const skillSpec = skill();
    const options = createOptions(
      { nodes: [beat, skillNode], edges: [] },
      new Map([[skillSpec.id, skillSpec]]),
    );
    const connected = renderHook(() => useCanvasConnectionController(options));

    act(() => connected.result.current.connectGraphNodes({
      source: beat.id,
      target: skillNode.id,
      sourceHandle: 'source',
      targetHandle: 'beat_context',
    }));
    expect(options.replaceEdges).toHaveBeenCalledWith([
      expect.objectContaining({
        source: beat.id,
        target: skillNode.id,
        targetHandle: 'beat_context',
      }),
    ]);
    expect(options.connectRegular).not.toHaveBeenCalled();

    const missingOptions = createOptions({ nodes: [beat, skillNode], edges: [] });
    const missing = renderHook(() => useCanvasConnectionController(missingOptions));
    act(() => missing.result.current.connectGraphNodes({
      source: beat.id,
      target: skillNode.id,
      sourceHandle: 'source',
      targetHandle: 'beat_context',
    }));
    expect(missingOptions.reportMissingSkill).toHaveBeenCalledWith('skill-1', skillNode.id);
    expect(missingOptions.connectRegular).not.toHaveBeenCalled();
    expect(missingOptions.replaceEdges).not.toHaveBeenCalled();
  });

  it('binds one Beat Context automatically and validates against the live graph', () => {
    const beat = node('beat', CANVAS_NODE_TYPES.beatContext);
    const skillNode = node('skill', CANVAS_NODE_TYPES.skill, { skill_id: 'skill-1' });
    const image = node('image', CANVAS_NODE_TYPES.exportImage);
    const audio = node('audio', CANVAS_NODE_TYPES.audio);
    const graph = { nodes: [beat, skillNode, image, audio], edges: [] as CanvasEdge[] };
    const skillSpec = skill();
    const options = createOptions(graph, new Map([[skillSpec.id, skillSpec]]));
    const { result } = renderHook(() => useCanvasConnectionController(options));

    act(() => result.current.bindSingleBeatContextInput(skillNode.id, skillSpec));
    expect(options.replaceEdges).toHaveBeenCalledWith([
      expect.objectContaining({
        source: beat.id,
        target: skillNode.id,
        targetHandle: 'beat_context',
      }),
    ]);
    expect(result.current.isValidGraphConnection({
      source: image.id,
      target: audio.id,
      sourceHandle: 'source',
      targetHandle: 'target',
    })).toBe(false);
  });

  it('connects a spawned node through the shared graph connection entry', () => {
    const first = node('first', CANVAS_NODE_TYPES.upload);
    const second = node('second', CANVAS_NODE_TYPES.video);
    const spawned = node('spawned', CANVAS_NODE_TYPES.textAnnotation);
    const options = createOptions({ nodes: [first, second, spawned], edges: [] });
    const { result } = renderHook(() => useCanvasConnectionController(options));

    act(() => result.current.connectSpawnedNode({
      spawnedNodeId: spawned.id,
      pendingConnection: { nodeId: 'ignored', handleType: 'target' },
      batchSourceIds: [first.id, second.id],
    }));

    expect(options.connectRegular).toHaveBeenNthCalledWith(1, {
      source: first.id,
      target: spawned.id,
      sourceHandle: 'source',
      targetHandle: 'target',
    });
    expect(options.connectRegular).toHaveBeenNthCalledWith(2, {
      source: second.id,
      target: spawned.id,
      sourceHandle: 'source',
      targetHandle: 'target',
    });
  });
});
