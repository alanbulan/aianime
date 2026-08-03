// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { parseAspectRatio } from './aspectRatio';

describe('parseAspectRatio', () => {
  it('parses a positive width-to-height ratio', () => {
    expect(parseAspectRatio('16:9')).toBeCloseTo(16 / 9);
    expect(parseAspectRatio(' 3 : 2 ')).toBe(1.5);
  });

  it.each(['', 'auto', '0:1', '1:0', '-1:2', 'NaN:1'])(
    'falls back to one for invalid value %s',
    (value) => {
      expect(parseAspectRatio(value)).toBe(1);
    },
  );
});
