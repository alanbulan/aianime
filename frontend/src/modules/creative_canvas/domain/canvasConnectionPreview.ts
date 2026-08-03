// Copyright (c) 2026 AI anime
export type CanvasHandleType = 'source' | 'target';

export interface CanvasPendingConnectionStart {
  nodeId: string;
  handleType: CanvasHandleType;
  handleId?: string | null;
  start?: { x: number; y: number };
}

export interface PreviewConnectionLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
  handleType: CanvasHandleType;
}

export interface CanvasConnectionPreviewRequest {
  line: PreviewConnectionLine;
  containerSize: { width: number; height: number };
}

export interface CanvasConnectionMenuRequest<
  TNodeType extends string = string,
> {
  pending: CanvasPendingConnectionStart;
  clientPosition: { x: number; y: number };
  menuPosition: { x: number; y: number };
  allowedTypes: TNodeType[];
  preview: CanvasConnectionPreviewRequest | null;
}

export function createPreviewPath(line: PreviewConnectionLine): string {
  const { start, end, handleType } = line;
  const deltaX = end.x - start.x;
  const curveStrength = Math.max(36, Math.min(120, Math.abs(deltaX) * 0.4));
  const handleDirection = handleType === 'source' ? 1 : -1;
  const isReverseDrag = deltaX * handleDirection < 0;
  const effectiveDirection = isReverseDrag ? -handleDirection : handleDirection;
  const startControlX = start.x + effectiveDirection * curveStrength;
  const endControlX = end.x - effectiveDirection * curveStrength;
  return `M ${start.x} ${start.y} C ${startControlX} ${start.y}, ${endControlX} ${end.y}, ${end.x} ${end.y}`;
}
