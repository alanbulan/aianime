// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { DragEvent as ReactDragEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CANVAS_ASSET_DRAG_MIME } from '@/modules/creative_canvas/public';
import { useCanvasDropIndicator } from './useCanvasDropIndicator';

function dragEvent(types: string[]) {
  const preventDefault = vi.fn();
  const dataTransfer = {
    types,
    dropEffect: 'none',
  } as unknown as DataTransfer;
  return {
    event: {
      preventDefault,
      dataTransfer,
    } as unknown as ReactDragEvent<HTMLDivElement>,
    preventDefault,
    dataTransfer,
  };
}

describe('useCanvasDropIndicator', () => {
  it('tracks nested drag boundaries for files and canvas assets', () => {
    const { result } = renderHook(() => useCanvasDropIndicator());
    const fileDrag = dragEvent(['Files']);
    const assetDrag = dragEvent([CANVAS_ASSET_DRAG_MIME]);

    act(() => result.current.handleCanvasDragEnter(fileDrag.event));
    act(() => result.current.handleCanvasDragEnter(assetDrag.event));
    expect(result.current.isCanvasDropActive).toBe(true);
    expect(fileDrag.preventDefault).toHaveBeenCalledOnce();
    expect(assetDrag.preventDefault).toHaveBeenCalledOnce();

    act(() => result.current.handleCanvasDragLeave(assetDrag.event));
    expect(result.current.isCanvasDropActive).toBe(true);
    act(() => result.current.handleCanvasDragLeave(fileDrag.event));
    expect(result.current.isCanvasDropActive).toBe(false);
  });

  it('accepts only supported payloads and configures accepted drops as copies', () => {
    const { result } = renderHook(() => useCanvasDropIndicator());
    const unsupportedDrag = dragEvent(['text/plain']);
    const fileDrag = dragEvent(['Files']);

    expect(result.current.acceptsCanvasDrop(unsupportedDrag.event)).toBe(false);
    act(() => result.current.handleCanvasDragEnter(unsupportedDrag.event));
    act(() => result.current.handleCanvasDragOver(unsupportedDrag.event));
    expect(result.current.isCanvasDropActive).toBe(false);
    expect(unsupportedDrag.preventDefault).not.toHaveBeenCalled();

    expect(result.current.acceptsCanvasDrop(fileDrag.event)).toBe(true);
    act(() => result.current.handleCanvasDragOver(fileDrag.event));
    expect(fileDrag.preventDefault).toHaveBeenCalledOnce();
    expect(fileDrag.dataTransfer.dropEffect).toBe('copy');
  });

  it('resets the indicator when a drop or drag end is captured by window', () => {
    const { result } = renderHook(() => useCanvasDropIndicator());
    const fileDrag = dragEvent(['Files']);

    act(() => result.current.handleCanvasDragEnter(fileDrag.event));
    expect(result.current.isCanvasDropActive).toBe(true);
    act(() => window.dispatchEvent(new Event('drop')));
    expect(result.current.isCanvasDropActive).toBe(false);

    act(() => result.current.handleCanvasDragEnter(fileDrag.event));
    act(() => window.dispatchEvent(new Event('dragend')));
    expect(result.current.isCanvasDropActive).toBe(false);
  });
});
