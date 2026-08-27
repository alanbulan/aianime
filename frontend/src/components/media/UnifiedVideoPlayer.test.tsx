// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UnifiedVideoPlayer } from "@/components/media/UnifiedVideoPlayer";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "common.videoPlayer.play": "播放视频",
        "common.videoPlayer.pause": "暂停视频",
        "common.videoPlayer.seek": "视频进度",
        "common.videoPlayer.volume": "音量",
        "common.videoPlayer.mute": "静音",
        "common.videoPlayer.unmute": "取消静音",
        "common.videoPlayer.fullscreen": "全屏",
        "common.videoPlayer.exitFullscreen": "退出全屏",
      })[key] ?? key,
  }),
}));

describe("UnifiedVideoPlayer", () => {
  it("使用应用控件层并显示精确时长", () => {
    const { container } = render(<UnifiedVideoPlayer src="/episode.mp4" />);
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperties(video, {
      duration: { configurable: true, value: 4.567 },
      volume: { configurable: true, value: 0.7 },
    });

    fireEvent.loadedMetadata(video);

    expect(video).not.toHaveAttribute("controls");
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(screen.getByText("0.00s / 4.57s")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "视频进度" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "音量" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "全屏" })).toBeInTheDocument();
  });
});
