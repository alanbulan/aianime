// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FreezoneChatDock } from "./FreezoneChatDock";

const mocks = vi.hoisted(() => ({
  isDesktop: false,
}));

vi.mock("@/shared/hooks/use-media-query", () => ({
  useMediaQuery: () => mocks.isDesktop,
}));

vi.mock("@/modules/ai_assistant/public", () => ({
  SuperChatPanel: ({ onRequestClose }: { onRequestClose?: () => void }) => (
    <button type="button" onClick={onRequestClose}>
      close chat
    </button>
  ),
}));

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) => (
    <div data-testid="chat-sheet" data-open={String(open)}>
      {open ? children : null}
    </div>
  ),
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  SheetHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

describe("Freezone chat dock", () => {
  beforeEach(() => {
    mocks.isDesktop = false;
    window.localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the mobile sheet from the floating launcher", () => {
    const onOpenChange = vi.fn();
    render(
      <FreezoneChatDock
        open={false}
        onOpenChange={onOpenChange}
        title="AI chat"
        description="Chat description"
        toggleLabel="Open assistant"
      />,
    );

    expect(screen.getByTestId("chat-sheet")).toHaveAttribute("data-open", "false");
    fireEvent.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders the desktop panel and forwards its close request", () => {
    mocks.isDesktop = true;
    const onOpenChange = vi.fn();
    render(
      <FreezoneChatDock
        open
        onOpenChange={onOpenChange}
        title="AI chat"
        description="Chat description"
        toggleLabel="Open assistant"
      />,
    );

    expect(screen.getByRole("complementary", { name: "AI chat" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "close chat" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("restores the desktop launcher position from local storage", () => {
    mocks.isDesktop = true;
    window.localStorage.setItem(
      "st.freezone.chatLauncherPos",
      JSON.stringify({ right: 24, bottom: 96 }),
    );
    render(
      <FreezoneChatDock
        open={false}
        onOpenChange={vi.fn()}
        title="AI chat"
        description="Chat description"
        toggleLabel="Open assistant"
      />,
    );

    const launcher = screen.getByRole("button", { name: "Open assistant" });
    expect(launcher.style.right).toBe("24px");
    expect(launcher.style.bottom).toBe("96px");
  });
});
