// Copyright (c) 2026 AI anime
import type {
  StoryboardMergeLayout,
} from '@/features/canvas/application/storyboardExport';
import type {
  StoryboardExportOptions,
  StoryboardFrameItem,
} from '@/features/canvas/domain/canvasNodes';
import {
  canvasToDataUrl,
  loadImageElement,
} from '@/features/canvas/infrastructure/browserImageRuntime';

function trimTextToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  const safeText = text.trim();
  if (!safeText) return '';
  if (context.measureText(safeText).width <= maxWidth) return safeText;
  let content = safeText;
  while (content.length > 1) {
    content = content.slice(0, -1);
    const withEllipsis = `${content}...`;
    if (context.measureText(withEllipsis).width <= maxWidth) {
      return withEllipsis;
    }
  }
  return '...';
}

export async function getStoryboardReferenceFrameHeight(
  source: string,
): Promise<number> {
  const image = await loadImageElement(source);
  return image.naturalHeight || image.height || 1024;
}

export async function applyStoryboardTextOverlay(
  imageSource: string,
  frames: readonly StoryboardFrameItem[],
  options: StoryboardExportOptions,
  rows: number,
  cols: number,
  layout: StoryboardMergeLayout,
): Promise<string> {
  if (!options.showFrameIndex && !options.showFrameNote) return imageSource;
  const image = await loadImageElement(imageSource);
  const canvas = document.createElement('canvas');
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('导出画布初始化失败');

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.font = `${Math.max(500, Math.round(layout.fontSize * 1.2))} ${layout.fontSize}px sans-serif`;

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const row = Math.floor(index / Math.max(1, cols));
    const col = index % Math.max(1, cols);
    if (row >= rows) break;
    const x = layout.padding + col * (layout.cellWidth + layout.gap);
    const y =
      layout.padding +
      row * (layout.cellHeight + layout.noteHeight + layout.gap);

    if (options.showFrameIndex) {
      const label = `${options.frameIndexPrefix || 'S'}${index + 1}`;
      const badgePaddingX = Math.max(6, Math.round(layout.fontSize * 0.35));
      const badgeHeight = Math.max(18, Math.round(layout.fontSize * 1.15));
      const badgeWidth = Math.round(
        context.measureText(label).width + badgePaddingX * 2,
      );
      context.fillStyle = 'rgba(0,0,0,0.65)';
      context.fillRect(x + 6, y + 6, badgeWidth, badgeHeight);
      context.fillStyle = options.textColor;
      context.fillText(
        label,
        x + 6 + badgePaddingX,
        y + 6 + badgeHeight / 2,
      );
    }

    if (!options.showFrameNote) continue;
    const note = trimTextToWidth(
      context,
      frame.note || '',
      Math.max(20, layout.cellWidth - 14),
    );
    if (!note) continue;
    if (options.notePlacement === 'overlay') {
      const overlayHeight = Math.max(
        18,
        Math.round(layout.fontSize * 1.35),
      );
      const overlayY = y + layout.cellHeight - overlayHeight;
      context.fillStyle = 'rgba(0, 0, 0, 0.6)';
      context.fillRect(x, overlayY, layout.cellWidth, overlayHeight);
      context.fillStyle = options.textColor;
      context.fillText(note, x + 7, overlayY + overlayHeight / 2);
    } else if (layout.noteHeight > 0) {
      const noteY = y + layout.cellHeight + layout.noteHeight / 2;
      context.fillStyle = options.textColor;
      context.fillText(note, x + 4, noteY);
    }
  }
  return canvasToDataUrl(canvas);
}
