// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { createPreviewPath } from './canvasConnectionPreview';

describe('Canvas connection preview', () => {
  it('builds stable forward and reverse curves', () => {
    expect(createPreviewPath({
      start: { x: 0, y: 0 },
      end: { x: 100, y: 50 },
      handleType: 'source',
    })).toBe('M 0 0 C 40 0, 60 50, 100 50');
    expect(createPreviewPath({
      start: { x: 0, y: 0 },
      end: { x: -100, y: 50 },
      handleType: 'source',
    })).toBe('M 0 0 C -40 0, -60 50, -100 50');
  });
});
