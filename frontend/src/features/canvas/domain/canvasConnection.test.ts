// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
} from './canvasNodes';
import { validateCanvasConnection } from './canvasConnection';

function node(id: string, type: CanvasNodeType): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  } as CanvasNode;
}

describe('Canvas connection rules', () => {
  it('lets React Flow own missing endpoint and handle validation', () => {
    expect(
      validateCanvasConnection(
        [],
        [],
        { source: 'missing-source', target: 'missing-target' },
        'react_flow',
      ),
    ).toEqual({ ok: true });
  });

  it('requires existing handle-capable endpoints for programmatic edges', () => {
    const target = node('target', CANVAS_NODE_TYPES.textAnnotation);
    expect(
      validateCanvasConnection(
        [target],
        [],
        { source: 'missing', target: target.id },
        'programmatic',
      ),
    ).toEqual({ ok: false, reason: 'missing_endpoint' });

    const group = node('group', CANVAS_NODE_TYPES.group);
    expect(
      validateCanvasConnection(
        [group, target],
        [],
        { source: group.id, target: target.id },
        'programmatic',
      ),
    ).toEqual({ ok: false, reason: 'missing_handle_capability' });
  });

  it('rejects disallowed upstream types in both modes', () => {
    const image = node('image', CANVAS_NODE_TYPES.exportImage);
    const audio = node('audio', CANVAS_NODE_TYPES.audio);
    const candidate = { source: image.id, target: audio.id };

    expect(validateCanvasConnection([image, audio], [], candidate, 'react_flow')).toEqual({
      ok: false,
      reason: 'disallowed_upstream_type',
    });
    expect(validateCanvasConnection([image, audio], [], candidate, 'programmatic')).toEqual({
      ok: false,
      reason: 'disallowed_upstream_type',
    });
  });

  it('keeps the React Flow-only single-input rule for 3D world nodes', () => {
    const first = node('first', CANVAS_NODE_TYPES.exportImage);
    const second = node('second', CANVAS_NODE_TYPES.exportImage);
    const world = node('world', CANVAS_NODE_TYPES.threeDWorld);
    const edges: CanvasEdge[] = [
      { id: 'existing', source: first.id, target: world.id },
    ];

    expect(
      validateCanvasConnection(
        [first, second, world],
        edges,
        { source: second.id, target: world.id },
        'react_flow',
      ),
    ).toEqual({ ok: false, reason: 'three_d_world_input_exists' });
    expect(
      validateCanvasConnection(
        [first, world],
        edges,
        { source: first.id, target: world.id },
        'react_flow',
      ),
    ).toEqual({ ok: true });
  });
});
