// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasToolPlugin } from '../domain/canvasTool';
import { NODE_TOOL_TYPES } from '../domain/canvasNodeTool';
import { SplitStoryboardToolEditor } from './SplitStoryboardToolEditor';

const plugin: CanvasToolPlugin = {
  type: NODE_TOOL_TYPES.splitStoryboard,
  labelKey: 'tool.splitStoryboard',
  icon: 'split',
  editor: 'split',
  supportsNode: () => true,
  createInitialOptions: () => ({}),
  fields: [],
  execute: async () => ({}),
};

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

describe('SplitStoryboardToolEditor', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps dimensions tied to the image that emitted the load event', () => {
    const props = {
      plugin,
      options: { rows: 3, cols: 3, lineThicknessPercent: 0.5 },
      onOptionsChange: vi.fn(),
    };
    const { rerender } = render(
      <SplitStoryboardToolEditor
        {...props}
        sourceImageUrl="/static/portrait.png"
      />,
    );
    const image = screen.getByAltText('split-preview');
    Object.defineProperty(image, 'naturalWidth', {
      configurable: true,
      value: 928,
    });
    Object.defineProperty(image, 'naturalHeight', {
      configurable: true,
      value: 1664,
    });

    fireEvent.load(image);

    expect(screen.getByText('单格宽度(px)')).toBeInTheDocument();
    expect(screen.getByText('单格高度(px)')).toBeInTheDocument();

    rerender(
      <SplitStoryboardToolEditor
        {...props}
        sourceImageUrl="/static/next.png"
      />,
    );

    expect(screen.queryByText('单格宽度(px)')).not.toBeInTheDocument();
    expect(screen.queryByText('单格高度(px)')).not.toBeInTheDocument();
  });
});
