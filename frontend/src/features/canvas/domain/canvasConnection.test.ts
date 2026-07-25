// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeType,
} from './canvasNodes';
import {
  canNodeBeManualConnectionSource,
  canNodeTypeBeManualConnectionSource,
  resolveAllowedNodeTypes,
  validateCanvasConnection,
} from './canvasConnection';

function node(id: string, type: CanvasNodeType): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
  } as CanvasNode;
}

describe('Canvas connection rules', () => {
  it('resolves the creation menu from the dragged handle and origin type', () => {
    expect(resolveAllowedNodeTypes('source', CANVAS_NODE_TYPES.video)).toEqual([
      CANVAS_NODE_TYPES.textAnnotation,
      CANVAS_NODE_TYPES.video,
      CANVAS_NODE_TYPES.videoCompose,
      CANVAS_NODE_TYPES.script,
    ]);
    expect(resolveAllowedNodeTypes('target', CANVAS_NODE_TYPES.threeDWorld)).toEqual([]);
    expect(resolveAllowedNodeTypes('target', CANVAS_NODE_TYPES.imageGen)).toEqual([
      CANVAS_NODE_TYPES.textAnnotation,
      CANVAS_NODE_TYPES.script,
      CANVAS_NODE_TYPES.upload,
    ]);
    expect(resolveAllowedNodeTypes('target', CANVAS_NODE_TYPES.video)).toEqual([
      CANVAS_NODE_TYPES.textAnnotation,
      CANVAS_NODE_TYPES.imageGen,
      CANVAS_NODE_TYPES.audio,
    ]);
    expect(resolveAllowedNodeTypes('target', CANVAS_NODE_TYPES.audio)).toEqual([
      CANVAS_NODE_TYPES.textAnnotation,
    ]);
  });

  it('applies manual source restrictions for world, panorama and typed inputs', () => {
    expect(
      canNodeTypeBeManualConnectionSource(
        CANVAS_NODE_TYPES.exportImage,
        CANVAS_NODE_TYPES.threeDWorld,
      ),
    ).toBe(true);
    expect(
      canNodeTypeBeManualConnectionSource(
        CANVAS_NODE_TYPES.video,
        CANVAS_NODE_TYPES.threeDWorld,
      ),
    ).toBe(false);
    expect(
      canNodeTypeBeManualConnectionSource(
        CANVAS_NODE_TYPES.pano360Viewer,
        CANVAS_NODE_TYPES.upload,
      ),
    ).toBe(true);
    expect(
      canNodeTypeBeManualConnectionSource(
        CANVAS_NODE_TYPES.pano360Viewer,
        CANVAS_NODE_TYPES.video,
      ),
    ).toBe(false);
    expect(
      canNodeTypeBeManualConnectionSource(
        CANVAS_NODE_TYPES.textAnnotation,
        CANVAS_NODE_TYPES.audio,
      ),
    ).toBe(true);
    expect(
      canNodeTypeBeManualConnectionSource(
        CANVAS_NODE_TYPES.upload,
        CANVAS_NODE_TYPES.audio,
      ),
    ).toBe(false);
  });

  it('resolves manual source eligibility from graph node ids', () => {
    const source = node('source', CANVAS_NODE_TYPES.exportImage);
    const invalidSource = node('invalid-source', CANVAS_NODE_TYPES.video);
    const target = node('target', CANVAS_NODE_TYPES.threeDWorld);
    const nodes = [source, invalidSource, target];

    expect(canNodeBeManualConnectionSource(source.id, nodes, target.id)).toBe(true);
    expect(canNodeBeManualConnectionSource(invalidSource.id, nodes, target.id)).toBe(false);
    expect(canNodeBeManualConnectionSource('missing', nodes, target.id)).toBe(false);
    expect(canNodeBeManualConnectionSource(null, nodes)).toBe(false);
  });

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
