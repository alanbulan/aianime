// Copyright (c) 2026 AI anime
import { measureTextareaCaretOffset } from '@/modules/creative_canvas/public';

export interface ImageEditPickerAnchor {
  left: number;
  top: number;
}

export const IMAGE_EDIT_PICKER_FALLBACK_ANCHOR: ImageEditPickerAnchor = {
  left: 8,
  top: 8,
};

const IMAGE_EDIT_PICKER_Y_OFFSET_PX = 20;

export function resolveImageEditPickerAnchor(
  container: HTMLDivElement | null,
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): ImageEditPickerAnchor {
  if (!container) return IMAGE_EDIT_PICKER_FALLBACK_ANCHOR;

  const containerRect = container.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const caretOffset = measureTextareaCaretOffset(textarea, caretIndex);
  return {
    left: Math.max(
      0,
      textareaRect.left - containerRect.left + caretOffset.left,
    ),
    top: Math.max(
      0,
      textareaRect.top -
        containerRect.top +
        caretOffset.top +
        IMAGE_EDIT_PICKER_Y_OFFSET_PX,
    ),
  };
}
