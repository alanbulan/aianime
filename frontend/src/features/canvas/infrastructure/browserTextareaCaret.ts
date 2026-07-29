// Copyright (c) 2026 AI anime

export interface TextareaCaretOffset {
  left: number;
  top: number;
}

export function measureTextareaCaretOffset(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): TextareaCaretOffset {
  const mirror = document.createElement('div');
  const computed = window.getComputedStyle(textarea);
  const mirrorStyle = mirror.style;
  mirrorStyle.position = 'absolute';
  mirrorStyle.visibility = 'hidden';
  mirrorStyle.pointerEvents = 'none';
  mirrorStyle.whiteSpace = 'pre-wrap';
  mirrorStyle.overflowWrap = 'break-word';
  mirrorStyle.wordBreak = 'break-word';
  mirrorStyle.boxSizing = computed.boxSizing;
  mirrorStyle.width = `${textarea.clientWidth}px`;
  mirrorStyle.font = computed.font;
  mirrorStyle.lineHeight = computed.lineHeight;
  mirrorStyle.letterSpacing = computed.letterSpacing;
  mirrorStyle.padding = computed.padding;
  mirrorStyle.border = computed.border;
  mirrorStyle.textTransform = computed.textTransform;
  mirrorStyle.textIndent = computed.textIndent;
  mirror.textContent = textarea.value.slice(0, caretIndex);

  const marker = document.createElement('span');
  marker.textContent = textarea.value.slice(caretIndex, caretIndex + 1) || ' ';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const offset = {
    left: marker.offsetLeft - textarea.scrollLeft,
    top: marker.offsetTop - textarea.scrollTop,
  };
  document.body.removeChild(mirror);
  return offset;
}
