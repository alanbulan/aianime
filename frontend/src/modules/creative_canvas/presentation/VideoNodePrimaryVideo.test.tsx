// Copyright (c) 2026 AI anime
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VideoNodePrimaryVideo } from "./VideoNodePrimaryVideo";

function renderPrimaryVideo() {
  const onElementChange = vi.fn();
  const onSelect = vi.fn();
  const onMetadata = vi.fn();
  const onError = vi.fn();
  const rendered = render(
    <VideoNodePrimaryVideo
      source="video.mp4"
      onElementChange={onElementChange}
      onSelect={onSelect}
      onMetadata={onMetadata}
      onError={onError}
    />,
  );
  const video = rendered.container.querySelector("video")!;
  return {
    ...rendered,
    onElementChange,
    onError,
    onMetadata,
    onSelect,
    video,
  };
}

describe("VideoNodePrimaryVideo", () => {
  it("renders the primary media attributes and exposes its element", () => {
    const { onElementChange, unmount, video } = renderPrimaryVideo();

    expect(video).toHaveAttribute("src", "video.mp4");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("playsinline");
    expect(onElementChange).toHaveBeenCalledWith(video);

    unmount();
    const lastCall =
      onElementChange.mock.calls[onElementChange.mock.calls.length - 1];
    expect(lastCall?.[0]).toBeNull();
  });

  it("routes selection and media errors", () => {
    const { onError, onSelect, video } = renderPrimaryVideo();

    fireEvent.click(video);
    fireEvent.error(video);

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("projects loaded DOM metadata into pixels and milliseconds", () => {
    const { onMetadata, video } = renderPrimaryVideo();
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1920 },
      videoHeight: { configurable: true, value: 1080 },
      duration: { configurable: true, value: 12.3456 },
    });

    fireEvent.loadedMetadata(video);

    expect(onMetadata).toHaveBeenCalledWith({
      widthPx: 1920,
      heightPx: 1080,
      durationMs: 12_346,
    });
  });
});
