// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from 'vitest';

import { measureTextareaCaretOffset } from './browserTextareaCaret';

describe('browserTextareaCaret', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('measures the mirrored caret relative to textarea scrolling and cleans up', () => {
    const textarea = document.createElement('textarea');
    textarea.value = '提示词';
    textarea.scrollLeft = 5;
    textarea.scrollTop = 7;
    const marker = document.createElement('span');
    Object.defineProperties(marker, {
      offsetLeft: { configurable: true, value: 40 },
      offsetTop: { configurable: true, value: 30 },
    });
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) =>
      tagName === 'span' ? marker : createElement(tagName),
    );
    const bodyChildCount = document.body.childElementCount;

    expect(measureTextareaCaretOffset(textarea, 2)).toEqual({
      left: 35,
      top: 23,
    });
    expect(marker.textContent).toBe('词');
    expect(document.body.childElementCount).toBe(bodyChildCount);
  });
});
