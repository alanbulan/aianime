// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from 'vitest';

import {
  captureCurrentViewport,
  jumpToBookmark,
  type CanvasViewportPort,
} from './bookmarkActions';

describe('bookmarkActions', () => {
  it('captures a detached viewport value', () => {
    const viewport = { x: 10, y: 20, zoom: 1.25 };
    const port = {
      getViewport: vi.fn(() => viewport),
      setViewport: vi.fn(),
    } satisfies CanvasViewportPort;

    const captured = captureCurrentViewport(port);

    expect(captured).toEqual(viewport);
    expect(captured).not.toBe(viewport);
  });

  it('jumps through the viewport port with the established animation contract', () => {
    const port = {
      getViewport: vi.fn(),
      setViewport: vi.fn(),
    } satisfies CanvasViewportPort;

    jumpToBookmark(port, { x: -30, y: 40, zoom: 0.75 });

    expect(port.setViewport).toHaveBeenCalledWith(
      { x: -30, y: 40, zoom: 0.75 },
      expect.objectContaining({ duration: 550, interpolate: 'smooth' }),
    );
    const options = port.setViewport.mock.calls[0][1];
    expect(options.ease?.(0)).toBe(0);
    expect(options.ease?.(0.5)).toBe(0.5);
    expect(options.ease?.(1)).toBe(1);
  });
});
