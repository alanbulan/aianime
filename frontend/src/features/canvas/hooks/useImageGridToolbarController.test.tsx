// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useImageGridToolbarController } from "./useImageGridToolbarController";

const mocks = vi.hoisted(() => ({
  t: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mocks.t,
    i18n: { language: "zh-CN" },
  }),
}));

describe("useImageGridToolbarController", () => {
  beforeEach(() => {
    mocks.t
      .mockReset()
      .mockImplementation((key: string) => `translated:${key}`);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects one projected action and forwards its complete request", () => {
    const onOpenGridAction = vi.fn();
    const { result } = renderHook(() =>
      useImageGridToolbarController({
        nodeId: "image-a",
        onOpenGridAction,
      }),
    );

    expect(result.current.activeActionKey).toBeNull();
    expect(result.current.actions).toHaveLength(9);

    const plotFourGrid = result.current.actions[1];
    act(() => result.current.selectAction(plotFourGrid));

    expect(result.current.activeActionKey).toBe("plotFourGrid");
    expect(onOpenGridAction).toHaveBeenCalledWith({
      nodeId: "image-a",
      key: "plotFourGrid",
      label: "translated:nodeToolbar.gridMenu.plotFourGrid",
      prompt: "translated:nodeToolbar.gridMenu.plotFourGridPrompt",
      cost: 8,
    });
  });

  it("preserves hover-open and delayed-close menu behavior", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useImageGridToolbarController({
        nodeId: "image-a",
        onOpenGridAction: vi.fn(),
      }),
    );

    act(() => result.current.menuHoverProps.onMouseEnter());
    expect(result.current.menuRootProps.open).toBe(true);

    act(() => result.current.menuHoverProps.onMouseLeave());
    act(() => vi.advanceTimersByTime(159));
    expect(result.current.menuRootProps.open).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.menuRootProps.open).toBe(false);
  });
});
