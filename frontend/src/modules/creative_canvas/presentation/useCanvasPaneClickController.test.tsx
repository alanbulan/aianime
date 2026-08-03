// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  useCanvasPaneClickController,
  type CanvasPaneClickControllerOptions,
} from './useCanvasPaneClickController';

function paneClick(
  detail = 1,
  clientX = 120,
  clientY = 80,
): ReactMouseEvent {
  return { detail, clientX, clientY } as ReactMouseEvent;
}

function createOptions(
  overrides: Partial<CanvasPaneClickControllerOptions> = {},
): CanvasPaneClickControllerOptions {
  return {
    placementActive: false,
    commitPlacement: vi.fn(() => true),
    openNodeMenu: vi.fn(),
    setSelectedNodeId: vi.fn(),
    dismissNodeMenu: vi.fn(),
    onBlankPaneClick: vi.fn(),
    ...overrides,
  };
}

describe('useCanvasPaneClickController', () => {
  it('clears selection and active menu state for a regular blank-pane click', () => {
    const options = createOptions();
    const { result } = renderHook(
      () => useCanvasPaneClickController(options),
    );

    act(() => result.current.handlePaneClick(paneClick()));

    expect(options.setSelectedNodeId).toHaveBeenCalledWith(null);
    expect(options.dismissNodeMenu).toHaveBeenCalledOnce();
    expect(options.onBlankPaneClick).toHaveBeenCalledOnce();
    expect(options.commitPlacement).not.toHaveBeenCalled();
    expect(options.openNodeMenu).not.toHaveBeenCalled();
  });

  it('commits active placement and consumes the following pane click', () => {
    const options = createOptions({ placementActive: true });
    const { result, rerender } = renderHook(
      ({ placementActive }) => useCanvasPaneClickController({
        ...options,
        placementActive,
      }),
      { initialProps: { placementActive: true } },
    );

    act(() => result.current.handlePaneClick(paneClick(1, 200, 140)));
    expect(options.commitPlacement).toHaveBeenCalledWith({ x: 200, y: 140 });

    rerender({ placementActive: false });
    act(() => result.current.handlePaneClick(paneClick()));
    expect(options.setSelectedNodeId).not.toHaveBeenCalled();

    act(() => result.current.handlePaneClick(paneClick()));
    expect(options.setSelectedNodeId).toHaveBeenCalledWith(null);
  });

  it('opens the node menu on double click and suppresses the next pane click', () => {
    const options = createOptions();
    const { result } = renderHook(
      () => useCanvasPaneClickController(options),
    );

    act(() => result.current.handlePaneClick(paneClick(2, 180, 110)));
    expect(options.openNodeMenu).toHaveBeenCalledWith({ x: 180, y: 110 });
    expect(options.setSelectedNodeId).not.toHaveBeenCalled();

    act(() => result.current.handlePaneClick(paneClick()));
    expect(options.setSelectedNodeId).not.toHaveBeenCalled();

    act(() => result.current.handlePaneClick(paneClick()));
    expect(options.setSelectedNodeId).toHaveBeenCalledWith(null);
  });

  it('allows callers to release an explicit pane-click suppression', () => {
    const options = createOptions();
    const { result } = renderHook(
      () => useCanvasPaneClickController(options),
    );

    act(() => {
      result.current.suppressNextPaneClick();
      result.current.releasePaneClickSuppression();
      result.current.handlePaneClick(paneClick());
    });

    expect(options.setSelectedNodeId).toHaveBeenCalledWith(null);
  });
});
