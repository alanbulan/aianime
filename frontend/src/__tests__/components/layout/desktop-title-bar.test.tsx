import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DesktopTitleBar } from "@/components/layout/desktop-title-bar";
import { useAppStore } from "@/modules/project_workspace/public";

afterEach(() => {
  delete window.aiAnimeDesktop;
});

describe("DesktopTitleBar", () => {
  it("renders only when the desktop bridge is available", () => {
    const { container } = render(<DesktopTitleBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("routes window controls through the exposed IPC whitelist", async () => {
    const minimize = vi.fn();
    const toggleMaximize = vi.fn();
    const close = vi.fn();
    const unsubscribe = vi.fn();
    window.aiAnimeDesktop = {
      platform: "win32",
      versions: { electron: "43", chrome: "1", node: "24" },
      windowControls: {
        minimize,
        toggleMaximize,
        close,
        isMaximized: vi.fn().mockResolvedValue(false),
        onMaximizedChange: vi.fn().mockReturnValue(unsubscribe),
      },
    };

    useAppStore.setState({ theme: "system" });
    const { unmount } = render(<DesktopTitleBar />);
    const buttons = await screen.findAllByRole("button");
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);

    expect(minimize).toHaveBeenCalledOnce();
    expect(toggleMaximize).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();

    fireEvent.doubleClick(buttons[1]);
    expect(toggleMaximize).toHaveBeenCalledOnce();

    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
