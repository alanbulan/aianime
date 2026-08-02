// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { mediaNeedsCrossOrigin } from './cross-origin';

describe('mediaNeedsCrossOrigin', () => {
  it('keeps renderer-local media out of CORS mode', () => {
    expect(mediaNeedsCrossOrigin('data:image/png;base64,AA==')).toBe(false);
    expect(mediaNeedsCrossOrigin('blob:http://localhost/media-id')).toBe(false);
  });

  it('enables CORS for remote and redirectable media', () => {
    expect(
      mediaNeedsCrossOrigin('https://cdn.example.test/video.mp4'),
    ).toBe(true);
    expect(mediaNeedsCrossOrigin('/projects/demo/media/video.mp4')).toBe(true);
  });
});
