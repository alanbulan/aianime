// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeatVideoPlayer } from "@/modules/production/presentation/VideoPaneParts";

describe("BeatVideoPlayer", () => {
  it("uses one video element and the application control layer", () => {
    const { container } = render(
      <BeatVideoPlayer src="https://example.test/beat.mp4" beatNum={1} />,
    );

    const videos = container.querySelectorAll("video");
    expect(videos).toHaveLength(1);
    expect(videos[0]).not.toHaveAttribute("controls");
    expect(videos[0]).toHaveAttribute(
      "controlslist",
      "nodownload noremoteplayback",
    );
    expect(screen.getAllByRole("button", { name: "播放" })).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "静音" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "播放速度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画中画" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全屏" })).toBeInTheDocument();
  });

  it("updates volume through the custom volume control", () => {
    const { container } = render(
      <BeatVideoPlayer src="https://example.test/beat.mp4" beatNum={2} />,
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    const volume = screen.getByRole("slider", { name: "音量" });

    fireEvent.keyDown(volume, { key: "ArrowDown" });

    expect(video.volume).toBe(0.95);
    expect(video.muted).toBe(false);
  });

  it("enters and exits fullscreen through the application control", async () => {
    const originalFullscreenElement = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement",
    );
    const originalExitFullscreen = Object.getOwnPropertyDescriptor(
      document,
      "exitFullscreen",
    );
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      fireEvent(document, new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });

    try {
      render(
        <BeatVideoPlayer src="https://example.test/beat.mp4" beatNum={3} />,
      );
      const player = screen.getByTestId("beat-video-player");
      const requestFullscreen = vi.fn(async () => {
        fullscreenElement = player;
        fireEvent(document, new Event("fullscreenchange"));
      });
      Object.defineProperty(player, "requestFullscreen", {
        configurable: true,
        value: requestFullscreen,
      });

      fireEvent.click(screen.getByRole("button", { name: "全屏" }));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "退出全屏" }),
        ).toBeInTheDocument(),
      );
      expect(requestFullscreen).toHaveBeenCalledOnce();

      fireEvent.click(screen.getByRole("button", { name: "退出全屏" }));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "全屏" })).toBeInTheDocument(),
      );
      expect(exitFullscreen).toHaveBeenCalledOnce();
    } finally {
      if (originalFullscreenElement) {
        Object.defineProperty(
          document,
          "fullscreenElement",
          originalFullscreenElement,
        );
      } else {
        Reflect.deleteProperty(document, "fullscreenElement");
      }
      if (originalExitFullscreen) {
        Object.defineProperty(
          document,
          "exitFullscreen",
          originalExitFullscreen,
        );
      } else {
        Reflect.deleteProperty(document, "exitFullscreen");
      }
    }
  });
});
