import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeTextToClipboard } from "./text-clipboard";

describe("writeTextToClipboard", () => {
  const browserWriteText = vi.fn<(value: string) => Promise<void>>();

  beforeEach(() => {
    delete window.aiAnimeDesktop;
    browserWriteText.mockReset();
    browserWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: browserWriteText },
    });
  });

  it("uses the trusted Electron clipboard bridge in the desktop app", async () => {
    const desktopWriteText = vi.fn().mockResolvedValue(undefined);
    window.aiAnimeDesktop = {
      clipboard: { writeText: desktopWriteText },
    } as unknown as AIAnimeDesktopBridge;

    await writeTextToClipboard("桌面文本");

    expect(desktopWriteText).toHaveBeenCalledWith("桌面文本");
    expect(browserWriteText).not.toHaveBeenCalled();
  });

  it("uses the browser clipboard outside Electron", async () => {
    await writeTextToClipboard("browser text");

    expect(browserWriteText).toHaveBeenCalledWith("browser text");
  });
});
