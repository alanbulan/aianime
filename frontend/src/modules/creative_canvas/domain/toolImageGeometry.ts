// Copyright (c) 2026 AI anime
export function resolveMaxAllowedLineThickness(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
): number {
  const maxLineByWidth =
    cols > 1
      ? Math.floor((imageWidth - cols) / (cols - 1))
      : Number.MAX_SAFE_INTEGER;
  const maxLineByHeight =
    rows > 1
      ? Math.floor((imageHeight - rows) / (rows - 1))
      : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(maxLineByWidth, maxLineByHeight));
}

export function splitIntoSegments(
  totalSize: number,
  segmentCount: number,
): number[] {
  const baseSize = Math.floor(totalSize / segmentCount);
  const remainder = totalSize % segmentCount;

  return Array.from(
    { length: segmentCount },
    (_item, index) => baseSize + (index < remainder ? 1 : 0),
  );
}

export function resolveImageSplitLineThicknessPx(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
  lineThicknessPercent: number,
): number {
  if (!Number.isFinite(lineThicknessPercent) || lineThicknessPercent <= 0) {
    return 0;
  }
  const basis = Math.max(1, Math.min(imageWidth, imageHeight));
  const rawPixelThickness = Math.max(
    1,
    Math.round((basis * lineThicknessPercent) / 100),
  );
  return clampImageSplitLineThicknessPx(
    imageWidth,
    imageHeight,
    rows,
    cols,
    rawPixelThickness,
  );
}

export function clampImageSplitLineThicknessPx(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
  lineThickness: number,
): number {
  const normalizedLineThickness = Math.max(
    0,
    Math.floor(Number.isFinite(lineThickness) ? lineThickness : 0),
  );
  return Math.min(
    normalizedLineThickness,
    resolveMaxAllowedLineThickness(imageWidth, imageHeight, rows, cols),
  );
}

export interface ImageSplitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSplitLayout {
  lineRects: ImageSplitRect[];
  cellRects: ImageSplitRect[];
  minCellWidth: number;
  maxCellWidth: number;
  minCellHeight: number;
  maxCellHeight: number;
  lineThickness: number;
}

/**
 * Resolve the exact pixel rectangles used by both the split preview and the
 * exported frames. Separator pixels are deliberately excluded from cells.
 */
export function resolveImageSplitLayout(
  imageWidth: number,
  imageHeight: number,
  rows: number,
  cols: number,
  lineThickness: number,
): ImageSplitLayout | null {
  const safeWidth = Math.floor(imageWidth);
  const safeHeight = Math.floor(imageHeight);
  const safeRows = Math.floor(rows);
  const safeCols = Math.floor(cols);
  if (
    !Number.isFinite(safeWidth)
    || !Number.isFinite(safeHeight)
    || !Number.isFinite(safeRows)
    || !Number.isFinite(safeCols)
    || safeWidth < 1
    || safeHeight < 1
    || safeRows < 1
    || safeCols < 1
  ) {
    return null;
  }

  const resolvedLineThickness = clampImageSplitLineThicknessPx(
    safeWidth,
    safeHeight,
    safeRows,
    safeCols,
    lineThickness,
  );
  const usableWidth = safeWidth - (safeCols - 1) * resolvedLineThickness;
  const usableHeight = safeHeight - (safeRows - 1) * resolvedLineThickness;
  if (usableWidth < safeCols || usableHeight < safeRows) {
    return null;
  }

  const columnWidths = splitIntoSegments(usableWidth, safeCols);
  const rowHeights = splitIntoSegments(usableHeight, safeRows);
  const lineRects: ImageSplitRect[] = [];
  const xOffsets: number[] = [];
  const yOffsets: number[] = [];

  let cursorX = 0;
  for (let col = 0; col < safeCols; col += 1) {
    xOffsets.push(cursorX);
    cursorX += columnWidths[col];
    if (col < safeCols - 1 && resolvedLineThickness > 0) {
      lineRects.push({
        x: cursorX,
        y: 0,
        width: resolvedLineThickness,
        height: safeHeight,
      });
      cursorX += resolvedLineThickness;
    }
  }

  let cursorY = 0;
  for (let row = 0; row < safeRows; row += 1) {
    yOffsets.push(cursorY);
    cursorY += rowHeights[row];
    if (row < safeRows - 1 && resolvedLineThickness > 0) {
      lineRects.push({
        x: 0,
        y: cursorY,
        width: safeWidth,
        height: resolvedLineThickness,
      });
      cursorY += resolvedLineThickness;
    }
  }

  const cellRects: ImageSplitRect[] = [];
  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      cellRects.push({
        x: xOffsets[col],
        y: yOffsets[row],
        width: columnWidths[col],
        height: rowHeights[row],
      });
    }
  }

  return {
    lineRects,
    cellRects,
    minCellWidth: Math.min(...columnWidths),
    maxCellWidth: Math.max(...columnWidths),
    minCellHeight: Math.min(...rowHeights),
    maxCellHeight: Math.max(...rowHeights),
    lineThickness: resolvedLineThickness,
  };
}
