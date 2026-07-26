// Copyright (c) 2026 AI anime
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoClipPanel } from "./VideoClipPanel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VideoClipPanel frame strip", () => {
  it("loads eight 160px thumbnails through the injected port", async () => {
    const captureFrameStrip = vi.fn().mockResolvedValue([
      { timeMs: 500, url: "data:image/jpeg;base64,frame" },
    ]);
    const { container } = render(
      <VideoClipPanel
        videoUrl="/static/clip.mp4"
        durationMs={2_000}
        clipStartMs={0}
        clipEndMs={2_000}
        captureFrameStrip={captureFrameStrip}
        onChange={vi.fn()}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByText("提取画面帧中…")).toBeInTheDocument();
    await waitFor(() =>
      expect(captureFrameStrip).toHaveBeenCalledWith("/static/clip.mp4", {
        count: 8,
        targetWidth: 160,
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("提取画面帧中…")).not.toBeInTheDocument(),
    );
    expect(
      Array.from(container.querySelectorAll<HTMLDivElement>("div")).some(
        (element) => element.style.backgroundImage.includes("frame"),
      ),
    ).toBe(true);
  });

  it("shows the existing failure state when the port rejects", async () => {
    const error = new Error("capture failed");
    const captureFrameStrip = vi.fn().mockRejectedValue(error);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <VideoClipPanel
        videoUrl="/static/clip.mp4"
        durationMs={2_000}
        clipStartMs={0}
        clipEndMs={2_000}
        captureFrameStrip={captureFrameStrip}
        onChange={vi.fn()}
        onExit={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    expect(await screen.findByText("画面帧加载失败")).toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith(
      "[video-clip] thumbnail extraction failed",
      error,
    );
  });
});
