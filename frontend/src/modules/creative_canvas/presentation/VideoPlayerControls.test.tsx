// Copyright (c) 2026 AI anime
import { getByUiTooltip } from "@/__tests__/helpers/ui-tooltip-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VideoPlayerControls } from "./VideoPlayerControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

interface VideoHarness {
  element: HTMLVideoElement;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  setPaused: (value: boolean) => void;
  setCurrentTime: (value: number) => void;
  setDuration: (value: number) => void;
  setMuted: (value: boolean) => void;
}

function createVideoHarness(): VideoHarness {
  const element = document.createElement("video");
  let paused = true;
  let currentTime = 5;
  let duration = 65;
  let muted = false;
  const play = vi.fn(async () => {
    paused = false;
    element.dispatchEvent(new Event("play"));
  });
  const pause = vi.fn(() => {
    paused = true;
    element.dispatchEvent(new Event("pause"));
  });
  Object.defineProperties(element, {
    paused: { configurable: true, get: () => paused },
    currentTime: {
      configurable: true,
      get: () => currentTime,
      set: (value: number) => {
        currentTime = value;
      },
    },
    duration: { configurable: true, get: () => duration },
    muted: {
      configurable: true,
      get: () => muted,
      set: (value: boolean) => {
        muted = value;
      },
    },
    play: { configurable: true, value: play },
    pause: { configurable: true, value: pause },
  });
  return {
    element,
    play,
    pause,
    setPaused: (value) => {
      paused = value;
    },
    setCurrentTime: (value) => {
      currentTime = value;
    },
    setDuration: (value) => {
      duration = value;
    },
    setMuted: (value) => {
      muted = value;
    },
  };
}

describe("VideoPlayerControls", () => {
  it("synchronizes playback, time, duration and volume from media events", () => {
    const video = createVideoHarness();
    render(
      <VideoPlayerControls
        videoEl={video.element}
        isCapturingFrame={false}
        onCapture={vi.fn()}
      />,
    );

    expect(screen.getByText("0:05")).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
    expect(getByUiTooltip("播放")).toBeInTheDocument();
    expect(getByUiTooltip("静音")).toBeInTheDocument();

    act(() => {
      video.setPaused(false);
      video.setCurrentTime(12);
      video.setDuration(90);
      video.setMuted(true);
      video.element.dispatchEvent(new Event("play"));
      video.element.dispatchEvent(new Event("timeupdate"));
      video.element.dispatchEvent(new Event("durationchange"));
      video.element.dispatchEvent(new Event("volumechange"));
    });

    expect(getByUiTooltip("暂停")).toBeInTheDocument();
    expect(screen.getByText("0:12")).toBeInTheDocument();
    expect(screen.getByText("1:30")).toBeInTheDocument();
    expect(getByUiTooltip("取消静音")).toBeInTheDocument();
  });

  it("routes playback, seek, mute and frame capture interactions", () => {
    const video = createVideoHarness();
    const onCapture = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <VideoPlayerControls
          videoEl={video.element}
          isCapturingFrame={false}
          onCapture={onCapture}
        />
      </div>,
    );

    fireEvent.click(getByUiTooltip("播放"));
    expect(video.play).toHaveBeenCalledOnce();
    expect(onParentClick).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("slider"), { key: "End" });
    expect(video.element.currentTime).toBe(65);
    expect(screen.getAllByText("1:05")).toHaveLength(2);

    fireEvent.click(getByUiTooltip("静音"));
    expect(video.element.muted).toBe(true);

    const captureButton = getByUiTooltip(
      "node.videoNode.frame.captureCurrent",
    );
    fireEvent.click(captureButton);
    fireEvent.mouseEnter(captureButton.parentElement!);
    fireEvent.click(screen.getByText("node.videoNode.frame.captureFirst"));
    fireEvent.click(screen.getByText("node.videoNode.frame.captureLast"));
    expect(onCapture.mock.calls.map(([mode]) => mode)).toEqual([
      "current",
      "first",
      "last",
    ]);
  });

  it("rebinds and cleans media listeners when the element changes", () => {
    const first = createVideoHarness();
    const second = createVideoHarness();
    const firstRemove = vi.spyOn(first.element, "removeEventListener");
    const secondRemove = vi.spyOn(second.element, "removeEventListener");
    const { rerender, unmount } = render(
      <VideoPlayerControls
        videoEl={first.element}
        isCapturingFrame={false}
        onCapture={vi.fn()}
      />,
    );

    rerender(
      <VideoPlayerControls
        videoEl={second.element}
        isCapturingFrame={false}
        onCapture={vi.fn()}
      />,
    );
    expect(firstRemove).toHaveBeenCalledTimes(6);

    unmount();
    expect(secondRemove).toHaveBeenCalledTimes(6);
  });
});
