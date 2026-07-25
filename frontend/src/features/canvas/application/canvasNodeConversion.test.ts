// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import { convertCanvasNodeType } from './canvasNodeConversion';

function uploadNode(): CanvasNode {
  return {
    id: 'upload',
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 10, y: 20 },
    measured: { width: 320, height: 350 },
    width: 320,
    height: 350,
    style: { width: 320, height: 350, opacity: 0.5 },
    data: { imageUrl: '/old.png', legacyOnly: true },
  } as CanvasNode;
}

describe('Canvas node type conversion', () => {
  it('rebuilds data from the target definition and overrides while resetting measurements', () => {
    const source = uploadNode();
    const result = convertCanvasNodeType(
      [source],
      source.id,
      CANVAS_NODE_TYPES.video,
      {
        videoUrl: '/video.mp4',
        displayName: 'Video',
      },
    );

    expect(result.changed).toBe(true);
    expect(result.nodes[0]).toMatchObject({
      id: source.id,
      type: CANVAS_NODE_TYPES.video,
      position: source.position,
      measured: undefined,
      width: undefined,
      height: undefined,
      style: source.style,
      data: {
        videoUrl: '/video.mp4',
        displayName: 'Video',
      },
    });
    expect(result.nodes[0]?.data).not.toHaveProperty('legacyOnly');
  });

  it('returns the original graph for a missing node or identical type', () => {
    const source = uploadNode();
    const nodes = [source];

    expect(
      convertCanvasNodeType(nodes, 'missing', CANVAS_NODE_TYPES.video),
    ).toEqual({ nodes, changed: false });
    expect(
      convertCanvasNodeType(nodes, source.id, CANVAS_NODE_TYPES.upload),
    ).toEqual({ nodes, changed: false });
  });
});
