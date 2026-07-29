// Copyright (c) 2026 AI anime

export interface StoryboardPickerAnchor {
  left: number;
  top: number;
}

export const STORYBOARD_PICKER_FALLBACK_ANCHOR: StoryboardPickerAnchor = {
  left: 8,
  top: 8,
};

const GRID_LINE_THICKNESS_PERCENT = 0.4;

function getTextareaCaretOffset(
  textarea: HTMLTextAreaElement,
  caretIndex: number,
): StoryboardPickerAnchor {
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
  const anchor = {
    left: marker.offsetLeft - textarea.scrollLeft,
    top: marker.offsetTop - textarea.scrollTop,
  };
  document.body.removeChild(mirror);
  return anchor;
}

export function resolveStoryboardPickerAnchor(
  container: HTMLDivElement | null,
  textarea: HTMLTextAreaElement,
  caretIndex: number,
  zoom: number,
): StoryboardPickerAnchor {
  if (!container) return STORYBOARD_PICKER_FALLBACK_ANCHOR;
  const containerRect = container.getBoundingClientRect();
  const textareaRect = textarea.getBoundingClientRect();
  const caretOffset = getTextareaCaretOffset(textarea, caretIndex);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    left: Math.max(
      0,
      (textareaRect.left - containerRect.left) / safeZoom +
        caretOffset.left,
    ),
    top: Math.max(
      0,
      (textareaRect.top - containerRect.top) / safeZoom + caretOffset.top,
    ),
  };
}

export function resolveStoryboardPointerAnchor(
  container: HTMLDivElement | null,
  clientX: number,
  clientY: number,
  zoom: number,
): StoryboardPickerAnchor {
  if (!container) return STORYBOARD_PICKER_FALLBACK_ANCHOR;
  const containerRect = container.getBoundingClientRect();
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return {
    left: Math.max(0, (clientX - containerRect.left) / safeZoom),
    top: Math.max(0, (clientY - containerRect.top) / safeZoom),
  };
}

function resolveSizeToPixels(size: string): number {
  return { '0.5K': 512, '1K': 1024, '2K': 2048, '4K': 4096 }[size] ?? 1024;
}

export function generateStoryboardGridImageDataUrl(
  aspectRatio: string,
  rows: number,
  cols: number,
  resolution: string,
  lineThicknessPercent = GRID_LINE_THICKNESS_PERCENT,
): string {
  const [ratioWidth = '16', ratioHeight = '9'] = aspectRatio.split(':');
  const totalPixels = resolveSizeToPixels(resolution);
  const canvasWidth = totalPixels;
  const canvasHeight = Math.round(
    totalPixels * (parseFloat(ratioHeight) / parseFloat(ratioWidth)),
  );
  const thickness = Math.max(
    1,
    Math.round(
      (Math.min(canvasWidth, canvasHeight) * lineThicknessPercent) / 100,
    ),
  );
  const cellWidth = canvasWidth / cols;
  const cellHeight = canvasHeight / rows;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to create canvas context');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.strokeStyle = '#000000';
  context.lineWidth = thickness;
  for (let index = 1; index < cols; index += 1) {
    const x = index * cellWidth;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, canvasHeight);
    context.stroke();
  }
  for (let index = 1; index < rows; index += 1) {
    const y = index * cellHeight;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(canvasWidth, y);
    context.stroke();
  }
  return canvas.toDataURL('image/png');
}
