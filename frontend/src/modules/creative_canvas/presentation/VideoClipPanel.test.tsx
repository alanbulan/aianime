// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoClipPanel } from "./VideoClipPanel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VideoClipPanel frame strip", () => {
  it("submits mute/repeat options and opens the existing subtitle removal flow", () => {
    const onSubmit = vi.fn();
    const onRemoveSubtitles = vi.fn();
    const props = {
      videoUrl: "/static/clip.mp4", durationMs: 2_000, clipStartMs: 0, clipEndMs: 2_000,
      captureFrameStrip: vi.fn(() => new Promise<never>(() => {})),
      onChange: vi.fn(), onExit: vi.fn(), onSubmit, onRemoveSubtitles,
    };
    const { rerender } = render(<VideoClipPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "输出静音视频" }));
    fireEvent.click(screen.getByRole("button", { name: "循环 2 次" }));
    fireEvent.click(screen.getByRole("button", { name: "提交剪辑" }));
    expect(onSubmit).toHaveBeenCalledWith(0, 2_000, { muted: true, repeatCount: 2 });
    fireEvent.click(screen.getByRole("button", { name: "去字幕" }));
    expect(onRemoveSubtitles).toHaveBeenCalledOnce();
    rerender(<VideoClipPanel {...props} isSubmitting />);
    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });

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
