// Copyright (c) 2026 AI anime
import {
  useCallback,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export type MaskPaintingTool = 'brush' | 'rect' | 'eraser';

interface CanvasPoint {
  x: number;
  y: number;
}

interface MaskPaintingOptions {
  maskCanvasRef: RefObject<HTMLCanvasElement | null>;
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  tool: MaskPaintingTool;
  brushSize: number;
  enabled: boolean;
  beforeStroke: () => void;
  onMaskChange: (hasMask: boolean) => void;
  stopPointerPropagation?: boolean;
}

const PAINT_FILL = 'rgba(239, 68, 68, 0.55)';
const PAINT_STROKE = 'rgba(239, 68, 68, 0.55)';
const RECT_PREVIEW_STROKE = 'rgba(239,68,68,0.85)';

export function useMaskPainting({
  maskCanvasRef,
  previewCanvasRef,
  tool,
  brushSize,
  enabled,
  beforeStroke,
  onMaskChange,
  stopPointerPropagation = false,
}: MaskPaintingOptions) {
  const drawingRef = useRef(false);
  const lastPointRef = useRef<CanvasPoint | null>(null);
  const rectStartRef = useRef<CanvasPoint | null>(null);

  const recomputeHasMask = useCallback(() => {
    onMaskChange(canvasHasMask(maskCanvasRef.current));
  }, [maskCanvasRef, onMaskChange]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!enabled) return;
      event.preventDefault();
      if (stopPointerPropagation) event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = canvasPointFromClient(
        previewCanvasRef.current,
        event.clientX,
        event.clientY,
      );
      if (!point) return;
      beforeStroke();
      drawingRef.current = true;
      lastPointRef.current = point;
      if (tool === 'rect') {
        rectStartRef.current = point;
      } else {
        drawDot(maskCanvasRef.current, point, tool, brushSize);
      }
    },
    [
      beforeStroke,
      brushSize,
      enabled,
      maskCanvasRef,
      previewCanvasRef,
      stopPointerPropagation,
      tool,
    ],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const point = canvasPointFromClient(
        previewCanvasRef.current,
        event.clientX,
        event.clientY,
      );
      if (!point) return;
      if (tool === 'rect') {
        if (rectStartRef.current) {
          drawRectPreview(
            previewCanvasRef.current,
            rectStartRef.current,
            point,
            brushSize,
          );
        }
      } else {
        if (lastPointRef.current) {
          drawLine(
            maskCanvasRef.current,
            lastPointRef.current,
            point,
            tool,
            brushSize,
          );
        }
        lastPointRef.current = point;
      }
    }, [brushSize, maskCanvasRef, previewCanvasRef, tool]);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // pointer may already be released
      }
      if (tool === 'rect' && rectStartRef.current) {
        const point =
          canvasPointFromClient(
            previewCanvasRef.current,
            event.clientX,
            event.clientY,
          ) ?? rectStartRef.current;
        commitRect(
          maskCanvasRef.current,
          previewCanvasRef.current,
          rectStartRef.current,
          point,
        );
        rectStartRef.current = null;
      }
      lastPointRef.current = null;
      recomputeHasMask();
    }, [maskCanvasRef, previewCanvasRef, recomputeHasMask, tool]);

  return { onPointerDown, onPointerMove, onPointerUp, recomputeHasMask };
}

function canvasPointFromClient(
  canvas: HTMLCanvasElement | null,
  clientX: number,
  clientY: number,
): CanvasPoint | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function canvasHasMask(canvas: HTMLCanvasElement | null): boolean {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return false;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < data.length; index += 16 * 4) {
    if (data[index] > 8) return true;
  }
  return false;
}

function drawDot(
  canvas: HTMLCanvasElement | null,
  point: CanvasPoint,
  tool: MaskPaintingTool,
  brushSize: number,
): void {
  const context = canvas?.getContext('2d');
  if (!context) return;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  if (tool === 'eraser') {
    context.globalCompositeOperation = 'destination-out';
  } else {
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = PAINT_FILL;
  }
  context.beginPath();
  context.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
  context.fill();
}

function drawLine(
  canvas: HTMLCanvasElement | null,
  from: CanvasPoint,
  to: CanvasPoint,
  tool: MaskPaintingTool,
  brushSize: number,
): void {
  const context = canvas?.getContext('2d');
  if (!context) return;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = brushSize;
  if (tool === 'eraser') {
    context.globalCompositeOperation = 'destination-out';
    context.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = PAINT_STROKE;
  }
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
}

function drawRectPreview(
  canvas: HTMLCanvasElement | null,
  start: CanvasPoint,
  end: CanvasPoint,
  brushSize: number,
): void {
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  const rect = canvasRect(start, end);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = PAINT_FILL;
  context.strokeStyle = RECT_PREVIEW_STROKE;
  context.lineWidth = Math.max(1, brushSize / 8);
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
}

function commitRect(
  maskCanvas: HTMLCanvasElement | null,
  previewCanvas: HTMLCanvasElement | null,
  start: CanvasPoint,
  end: CanvasPoint,
): void {
  const maskContext = maskCanvas?.getContext('2d');
  const previewContext = previewCanvas?.getContext('2d');
  if (!maskCanvas || !maskContext || !previewCanvas || !previewContext) return;
  const rect = canvasRect(start, end);
  if (rect.width >= 2 && rect.height >= 2) {
    maskContext.globalCompositeOperation = 'source-over';
    maskContext.fillStyle = PAINT_FILL;
    maskContext.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
  previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
}

function canvasRect(start: CanvasPoint, end: CanvasPoint) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}
