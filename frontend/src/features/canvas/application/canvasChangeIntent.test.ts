// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  classifyCanvasNodeChanges,
  hasMeaningfulCanvasEdgeChange,
} from './canvasChangeIntent';

describe('Canvas change intent', () => {
  it('treats automatic dimensions and selection as view-only changes', () => {
    const intent = classifyCanvasNodeChanges([
      { id: 'node', type: 'dimensions' },
      { id: 'node', type: 'select' },
    ]);

    expect(intent).toEqual({
      resizedNodeIds: new Set(),
      hasMeaningfulChange: false,
      hasInteractionMove: false,
      hasInteractionEnd: false,
    });
  });

  it('classifies drag and resize lifecycle changes', () => {
    expect(
      classifyCanvasNodeChanges([
        { id: 'drag', type: 'position', dragging: true },
        { id: 'resize', type: 'dimensions', resizing: true },
      ]),
    ).toMatchObject({
      hasMeaningfulChange: true,
      hasInteractionMove: true,
      hasInteractionEnd: false,
    });

    const ended = classifyCanvasNodeChanges([
      { id: 'drag', type: 'position', dragging: false },
      { id: 'resize', type: 'dimensions', resizing: false },
    ]);
    expect(ended).toMatchObject({
      hasMeaningfulChange: true,
      hasInteractionMove: false,
      hasInteractionEnd: true,
    });
    expect(ended.resizedNodeIds).toEqual(new Set(['resize']));
  });

  it('distinguishes edge selection from graph edits', () => {
    expect(hasMeaningfulCanvasEdgeChange([{ type: 'select' }])).toBe(false);
    expect(hasMeaningfulCanvasEdgeChange([{ type: 'remove' }])).toBe(true);
  });
});
