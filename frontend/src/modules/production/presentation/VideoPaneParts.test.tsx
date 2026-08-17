// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

    fireEvent.change(volume, { target: { value: "0.4" } });

    expect(video.volume).toBe(0.4);
    expect(video.muted).toBe(false);
  });
});
