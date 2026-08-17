// Copyright (c) 2026 AI anime
import { getByUiTooltip, queryByUiTooltip } from "@/__tests__/helpers/ui-tooltip-query";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SubtitleEraseBoxOverlay,
  SubtitleEraseOpsPanel,
} from "./VideoSubtitleEraseControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/credit-visual", () => ({
  CreditCostPill: ({ disabled }: { disabled?: boolean }) => (
    <span data-testid="credit-cost" data-disabled={String(disabled)} />
  ),
}));

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

describe("VideoSubtitleEraseControls", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes pointer coordinates and projects the active erase box", () => {
    const onDragStart = vi.fn();
    const onDragMove = vi.fn();
    const onDragEnd = vi.fn();
    const getDisplayedRect = vi.fn(() => ({
      left: 20,
      top: 10,
      width: 160,
      height: 80,
    }));
    const { container, rerender } = render(
      <SubtitleEraseBoxOverlay
        box={null}
        drag={null}
        disabled={false}
        getDisplayedRect={getDisplayedRect}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />,
    );
    const overlay = container.firstElementChild as HTMLDivElement;
    overlay.setPointerCapture = vi.fn();
    overlay.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(overlay, {
      pointerId: 1,
      clientX: 100,
      clientY: 50,
    });
    expect(onDragStart).toHaveBeenCalledWith({
      x0: 0.5,
      y0: 0.5,
      x1: 0.5,
      y1: 0.5,
    });

    const drag = { x0: 0.5, y0: 0.5, x1: 0.75, y1: 0.8 };
    rerender(
      <SubtitleEraseBoxOverlay
        box={null}
        drag={drag}
        disabled={false}
        getDisplayedRect={getDisplayedRect}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />,
    );
    fireEvent.pointerMove(overlay, { clientX: 180, clientY: 82 });
    expect(onDragMove).toHaveBeenCalledWith({ x1: 1, y1: 0.9 });
    fireEvent.pointerUp(overlay, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledWith({
      x: 0.5,
      y: 0.5,
      width: 0.25,
      height: 0.30000000000000004,
    });

    const selection = overlay.querySelector(
      ".pointer-events-none",
    ) as HTMLDivElement;
    expect(selection.style.left).toBe("100px");
    expect(selection.style.top).toBe("50px");
    expect(selection.style.width).toBe("40px");
    expect(Number.parseFloat(selection.style.height)).toBeCloseTo(24);
  });

  it("ignores disabled or negligible box gestures", () => {
    const onDragStart = vi.fn();
    const onDragEnd = vi.fn();
    const props = {
      box: null,
      disabled: true,
      getDisplayedRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      onDragStart,
      onDragMove: vi.fn(),
      onDragEnd,
    };
    const { container, rerender } = render(
      <SubtitleEraseBoxOverlay {...props} drag={null} />,
    );
    const overlay = container.firstElementChild as HTMLDivElement;
    fireEvent.pointerDown(overlay, { pointerId: 1, clientX: 20, clientY: 20 });
    expect(onDragStart).not.toHaveBeenCalled();
    expect(overlay.style.cursor).toBe("not-allowed");

    overlay.releasePointerCapture = vi.fn();
    rerender(
      <SubtitleEraseBoxOverlay
        {...props}
        disabled={false}
        drag={{ x0: 0.1, y0: 0.1, x1: 0.105, y1: 0.2 }}
      />,
    );
    fireEvent.pointerUp(overlay, { pointerId: 1 });
    expect(onDragEnd).toHaveBeenCalledWith(null);
  });

  it("projects mode state and routes panel commands", () => {
    const onExit = vi.fn();
    const onResetBox = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <SubtitleEraseOpsPanel
        mode="box"
        isErasing={false}
        hasBox={false}
        onExit={onExit}
        onResetBox={onResetBox}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(getByUiTooltip("node.videoNode.subtitleErase.exit"));
    fireEvent.click(
      getByUiTooltip("node.videoNode.subtitleErase.tools.reset"),
    );
    expect(onExit).toHaveBeenCalledOnce();
    expect(onResetBox).toHaveBeenCalledOnce();
    expect(
      getByUiTooltip("node.videoNode.subtitleErase.submit"),
    ).toBeDisabled();

    rerender(
      <SubtitleEraseOpsPanel
        mode="smart"
        isErasing={false}
        hasBox={false}
        onExit={onExit}
        onResetBox={onResetBox}
        onSubmit={onSubmit}
      />,
    );
    expect(
      queryByUiTooltip("node.videoNode.subtitleErase.tools.reset"),
    ).not.toBeInTheDocument();
    fireEvent.click(getByUiTooltip("node.videoNode.subtitleErase.submit"));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
