// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateStoryboardGridImageDataUrl,
  resolveStoryboardPickerAnchor,
  resolveStoryboardPointerAnchor,
  STORYBOARD_PICKER_FALLBACK_ANCHOR,
} from './browserStoryboardGenRuntime';

function rect(left: number, top: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + 100,
    bottom: top + 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  };
}

describe('browserStoryboardGenRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('maps pointer coordinates through the current canvas zoom', () => {
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(100, 50));
    expect(resolveStoryboardPointerAnchor(container, 180, 110, 2)).toEqual({
      left: 40,
      top: 30,
    });
    expect(resolveStoryboardPointerAnchor(null, 180, 110, 2)).toBe(
      STORYBOARD_PICKER_FALLBACK_ANCHOR,
    );
  });

  it('anchors the caret relative to the node and falls back for invalid zoom', () => {
    const container = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = '描述';
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(20, 30));
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(70, 90));
    expect(resolveStoryboardPickerAnchor(container, textarea, 1, 0)).toEqual({
      left: 50,
      top: 60,
    });
  });

  it('draws a resolution-sized white grid with internal black lines', () => {
    const context = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 0,
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toDataURL: vi.fn(() => 'data:image/png;base64,grid'),
    } as unknown as HTMLCanvasElement;
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) =>
      tagName === 'canvas'
        ? canvas
        : createElement(tagName),
    );

    expect(
      generateStoryboardGridImageDataUrl('16:9', 2, 3, '0.5K'),
    ).toBe('data:image/png;base64,grid');
    expect(canvas).toMatchObject({ width: 512, height: 288 });
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 512, 288);
    expect(context.fillStyle).toBe('#ffffff');
    expect(context.strokeStyle).toBe('#000000');
    expect(context.stroke).toHaveBeenCalledTimes(3);
  });
});
