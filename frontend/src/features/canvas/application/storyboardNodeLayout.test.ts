// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES, type CanvasNode } from '../domain/canvasNodes';
import {
  resolveDerivedAspectRatio,
  resolveStoryboardSplitNodeDimensions,
} from './storyboardNodeLayout';

function node(type: CanvasNode['type'], data: Record<string, unknown>): CanvasNode {
  return { id: 'node', type, position: { x: 0, y: 0 }, data } as CanvasNode;
}

describe('Storyboard node layout', () => {
  it('sizes a regular grid and clamps a tall grid to the node bounds', () => {
    expect(resolveStoryboardSplitNodeDimensions(2, 3, '16:9')).toEqual({
      width: 468,
      height: 320,
    });
    expect(resolveStoryboardSplitNodeDimensions(4, 2, '9:16')).toEqual({
      width: 440,
      height: 1600,
    });
  });

  it('uses the request ratio for generated storyboard and image-edit sources', () => {
    expect(
      resolveDerivedAspectRatio(
        node(CANVAS_NODE_TYPES.storyboardGen, {
          requestAspectRatio: '4:3',
          aspectRatio: '1:1',
        }),
        '16:9',
      ),
    ).toBe('4:3');
    expect(
      resolveDerivedAspectRatio(
        node(CANVAS_NODE_TYPES.imageEdit, {
          requestAspectRatio: 'auto',
          aspectRatio: '3:2',
        }),
        '16:9',
      ),
    ).toBe('3:2');
  });

  it('uses the cell ratio for storyboard splits and falls back for missing sources', () => {
    expect(
      resolveDerivedAspectRatio(
        node(CANVAS_NODE_TYPES.storyboardSplit, {
          frameAspectRatio: '9:16',
          aspectRatio: '1:1',
        }),
        '16:9',
      ),
    ).toBe('9:16');
    expect(resolveDerivedAspectRatio(undefined, '16:9')).toBe('16:9');
  });
});
