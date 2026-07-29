// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IMAGE_EDIT_PICKER_FALLBACK_ANCHOR,
  resolveImageEditPickerAnchor,
} from './browserImageEditRuntime';

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

describe('browserImageEditRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back when the node container is unavailable', () => {
    const textarea = document.createElement('textarea');
    expect(resolveImageEditPickerAnchor(null, textarea, 0)).toBe(
      IMAGE_EDIT_PICKER_FALLBACK_ANCHOR,
    );
  });

  it('anchors the picker below the caret relative to the node', () => {
    const container = document.createElement('div');
    const textarea = document.createElement('textarea');
    textarea.value = '提示词';
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(20, 30));
    vi.spyOn(textarea, 'getBoundingClientRect').mockReturnValue(rect(70, 90));
    expect(resolveImageEditPickerAnchor(container, textarea, 1)).toEqual({
      left: 50,
      top: 80,
    });
  });
});
