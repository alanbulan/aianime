// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from './canvasNodes';
import { elevateCanvasNodes } from './canvasNodeLayering';

function node(id: string, style?: CanvasNode['style']): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: {},
    style,
  } as CanvasNode;
}

describe('elevateCanvasNodes', () => {
  it('clones only selected nodes and keeps their existing style fields', () => {
    const first = node('node-1');
    const selected = node('node-2', { opacity: 0.8 });
    const nodes = [first, selected];

    const elevated = elevateCanvasNodes(nodes, ['node-2'], 2000);

    expect(elevated).not.toBe(nodes);
    expect(elevated[0]).toBe(first);
    expect(elevated[1]).toEqual({
      ...selected,
      zIndex: 2000,
      style: { opacity: 0.8, zIndex: 2000 },
    });
    expect(elevated[1]).not.toBe(selected);
    expect(selected.zIndex).toBeUndefined();
    expect(selected.style).toEqual({ opacity: 0.8 });
  });

  it('leaves unmatched nodes unchanged', () => {
    const first = node('node-1');

    const elevated = elevateCanvasNodes([first], ['missing'], 2000);

    expect(elevated[0]).toBe(first);
  });
});
