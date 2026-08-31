// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PointerEvent as ReactPointerEvent } from 'react';

import { useMaskPainting } from './useMaskPainting';

function createCanvas(alpha = 255) {
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    getImageData: vi.fn(() => {
      const data = new Uint8ClampedArray(64);
      data[3] = alpha;
      return { data };
    }),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    lineCap: 'butt',
    lineJoin: 'miter',
    lineWidth: 1,
    strokeStyle: '',
  };
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 50;
  Object.defineProperties(canvas, {
    getBoundingClientRect: {
      value: () => ({ left: 0, top: 0, width: 100, height: 50 }),
    },
    getContext: { value: vi.fn(() => context) },
    releasePointerCapture: { value: vi.fn() },
    setPointerCapture: { value: vi.fn() },
  });
  return { canvas, context };
}

function pointerEvent(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): ReactPointerEvent<HTMLCanvasElement> {
  return {
    clientX,
    clientY,
    currentTarget: canvas,
    pointerId: 7,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as ReactPointerEvent<HTMLCanvasElement>;
}

describe('useMaskPainting', () => {
  it('paints a brush stroke and reports the resulting mask', () => {
    const mask = createCanvas();
    const preview = createCanvas();
    const beforeStroke = vi.fn();
    const onMaskChange = vi.fn();
    const { result } = renderHook(() =>
      useMaskPainting({
        maskCanvasRef: { current: mask.canvas },
        previewCanvasRef: { current: preview.canvas },
        tool: 'brush',
        brushSize: 20,
        enabled: true,
        beforeStroke,
        onMaskChange,
        stopPointerPropagation: true,
      }),
    );
    const down = pointerEvent(preview.canvas, 10, 10);

    act(() => {
      result.current.onPointerDown(down);
      result.current.onPointerMove(pointerEvent(preview.canvas, 30, 20));
      result.current.onPointerUp(pointerEvent(preview.canvas, 30, 20));
    });

    expect(beforeStroke).toHaveBeenCalledOnce();
    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(down.stopPropagation).toHaveBeenCalledOnce();
    expect(preview.canvas.setPointerCapture).toHaveBeenCalledWith(7);
    expect(mask.context.arc).toHaveBeenCalledWith(10, 10, 10, 0, Math.PI * 2);
    expect(mask.context.moveTo).toHaveBeenCalledWith(10, 10);
    expect(mask.context.lineTo).toHaveBeenCalledWith(30, 20);
    expect(onMaskChange).toHaveBeenCalledWith(true);
  });

  it('previews and commits a rectangle through the shared drawing path', () => {
    const mask = createCanvas();
    const preview = createCanvas();
    const { result } = renderHook(() =>
      useMaskPainting({
        maskCanvasRef: { current: mask.canvas },
        previewCanvasRef: { current: preview.canvas },
        tool: 'rect',
        brushSize: 16,
        enabled: true,
        beforeStroke: vi.fn(),
        onMaskChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.onPointerDown(pointerEvent(preview.canvas, 12, 8));
      result.current.onPointerMove(pointerEvent(preview.canvas, 42, 28));
      result.current.onPointerUp(pointerEvent(preview.canvas, 42, 28));
    });

    expect(preview.context.fillRect).toHaveBeenCalledWith(12, 8, 30, 20);
    expect(preview.context.strokeRect).toHaveBeenCalledWith(12, 8, 30, 20);
    expect(mask.context.fillRect).toHaveBeenCalledWith(12, 8, 30, 20);
    expect(preview.context.clearRect).toHaveBeenLastCalledWith(0, 0, 100, 50);
  });
});
