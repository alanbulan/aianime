// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useFreezoneChatDockController } from "./useFreezoneChatDockController";

const mocks = vi.hoisted(() => ({
  isDesktop: true,
}));

vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => mocks.isDesktop,
}));

describe("freezone chat dock controller", () => {
  beforeEach(() => {
    mocks.isDesktop = true;
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the desktop panel mounted during its closing transition", () => {
    const onOpenChange = vi.fn();
    const { result, rerender } = renderHook(
      ({ open }) =>
        useFreezoneChatDockController({ open, onOpenChange }),
      { initialProps: { open: true } },
    );

    expect(result.current.shouldRenderPanel).toBe(true);
    expect(result.current.panelVisible).toBe(true);

    rerender({ open: false });

    expect(result.current.panelVisible).toBe(false);
    expect(result.current.shouldRenderPanel).toBe(true);
    act(() => vi.advanceTimersByTime(320));
    expect(result.current.shouldRenderPanel).toBe(false);
  });

  it("persists a dragged launcher and suppresses the following click", () => {
    window.localStorage.setItem(
      "st.freezone.chatLauncherPos",
      JSON.stringify({ right: 24, bottom: 96 }),
    );
    const onOpenChange = vi.fn();
    const { result } = renderHook(() =>
      useFreezoneChatDockController({ open: false, onOpenChange }),
    );
    const parent = document.createElement("div");
    const button = document.createElement("button");
    Object.defineProperty(button, "offsetParent", { value: parent });
    vi.spyOn(parent, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });
    result.current.launcher.buttonRef.current = button;

    act(() => {
      result.current.launcher.onPointerDown({
        button: 0,
        clientX: 100,
        clientY: 100,
      } as ReactPointerEvent<HTMLButtonElement>);
      window.dispatchEvent(
        new MouseEvent("pointermove", { clientX: 80, clientY: 70 }),
      );
      window.dispatchEvent(new MouseEvent("pointerup"));
    });

    expect(result.current.launcher.position).toEqual({
      right: 44,
      bottom: 126,
    });
    expect(window.localStorage.getItem("st.freezone.chatLauncherPos")).toBe(
      JSON.stringify({ right: 44, bottom: 126 }),
    );

    act(() => result.current.launcher.onClick());
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => result.current.launcher.onClick());
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
