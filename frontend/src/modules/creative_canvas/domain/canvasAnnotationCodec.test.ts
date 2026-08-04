// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  normalizeAnnotationRect,
  parseAnnotationItems,
  stringifyAnnotationItems,
} from './canvasAnnotationCodec';

describe('canvasAnnotationCodec', () => {
  it('normalizes a rectangle drawn in any direction', () => {
    expect(normalizeAnnotationRect(12, 20, 4, 5)).toEqual({
      x: 4,
      y: 5,
      width: 8,
      height: 15,
    });
  });

  it('parses supported annotations and drops invalid entries', () => {
    expect(parseAnnotationItems(JSON.stringify([
      {
        id: 'rect-1',
        type: 'rect',
        x: 1,
        y: 2,
        width: -3,
        height: 4,
        lineWidth: 0,
      },
      { id: 'invalid', type: 'arrow', points: [1, 2, 3] },
    ]))).toEqual([
      {
        id: 'rect-1',
        type: 'rect',
        x: 1,
        y: 2,
        width: 0,
        height: 4,
        stroke: '#ff4d4f',
        lineWidth: 1,
      },
    ]);
  });

  it('round-trips valid values and handles malformed input', () => {
    const annotations = [{
      id: 'text-1',
      type: 'text' as const,
      x: 10,
      y: 20,
      text: '说明',
      color: '#ffffff',
      fontSize: 28,
    }];

    expect(parseAnnotationItems(stringifyAnnotationItems(annotations))).toEqual(annotations);
    expect(parseAnnotationItems('{')).toEqual([]);
    expect(parseAnnotationItems({})).toEqual([]);
  });
});
