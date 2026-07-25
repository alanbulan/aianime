// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeData,
} from '../domain/canvasNodes';
import { createCanvasNode } from './canvasNodeCreation';
import {
  BEAT_CONTEXT_NODE_DEFAULT_MEASURED,
  SKILL_NODE_DEFAULT_MEASURED,
} from './canvasNodeHydration';
import { resolveAutoImageNodeDimensions } from './imageNodeLayout';
import type { NodeFactory } from './ports';

function factory(overrides: Partial<CanvasNode> = {}): NodeFactory {
  return {
    createNode: (type, position, data: Partial<CanvasNodeData> = {}) => ({
      id: 'created',
      type,
      position,
      data: data as CanvasNodeData,
      ...overrides,
    } as CanvasNode),
  };
}

describe('Canvas node creation', () => {
  it('applies automatic media sizing to a newly created image node', () => {
    const data = {
      imageUrl: '/image.png',
      aspectRatio: '16:9',
    };
    const created = createCanvasNode(
      CANVAS_NODE_TYPES.upload,
      { x: 10, y: 20 },
      data,
      factory(),
    );
    const size = resolveAutoImageNodeDimensions('16:9');

    expect(created).toMatchObject({
      id: 'created',
      position: { x: 10, y: 20 },
      data,
      width: size.width,
      height: size.height,
      style: size,
    });
  });

  it('adds default measured sizes for skill and Beat context nodes', () => {
    const skill = createCanvasNode(
      CANVAS_NODE_TYPES.skill,
      { x: 0, y: 0 },
      {},
      factory(),
    );
    const beat = createCanvasNode(
      CANVAS_NODE_TYPES.beatContext,
      { x: 0, y: 0 },
      {},
      factory(),
    );

    expect(skill.measured).toEqual(SKILL_NODE_DEFAULT_MEASURED);
    expect(beat.measured).toEqual(BEAT_CONTEXT_NODE_DEFAULT_MEASURED);
  });

  it('preserves a measured size supplied by the factory', () => {
    const measured = { width: 640, height: 480 };
    const created = createCanvasNode(
      CANVAS_NODE_TYPES.skill,
      { x: 0, y: 0 },
      {},
      factory({ measured }),
    );

    expect(created.measured).toBe(measured);
  });
});
