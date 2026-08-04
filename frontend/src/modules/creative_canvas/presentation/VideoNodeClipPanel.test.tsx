// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VideoNodeClipPanel,
  type VideoNodeClipPanelProps,
} from "./VideoNodeClipPanel";

vi.mock("./VideoClipPanel", () => ({
  VideoClipPanel: ({
    videoUrl,
    onChange,
    onExit,
    onSubmit,
  }: VideoNodeClipPanelProps) => (
    <div data-testid="clip-panel">
      <span>{videoUrl}</span>
      <button type="button" onClick={() => onChange({ clipStartMs: 250 })}>
        change
      </button>
      <button type="button" onClick={onExit}>
        exit
      </button>
      <button type="button" onClick={() => onSubmit(250, 1_000)}>
        submit
      </button>
    </div>
  ),
}));

const baseProps: VideoNodeClipPanelProps = {
  visible: true,
  videoUrl: "clip.mp4",
  error: null,
  topOffsetPx: 12,
  durationMs: 1_000,
  clipStartMs: 0,
  clipEndMs: 1_000,
  isSubmitting: false,
  captureFrameStrip: vi.fn(),
  onChange: vi.fn(),
  onExit: vi.fn(),
  onSubmit: vi.fn(),
};

describe("VideoNodeClipPanel", () => {
  it("hides outside clip mode or without a video source", () => {
    const { container, rerender } = render(
      <VideoNodeClipPanel {...baseProps} visible={false} />,
    );

    expect(container).toBeEmptyDOMElement();

    rerender(<VideoNodeClipPanel {...baseProps} videoUrl={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("positions the clip editor and renders its error", () => {
    const { container } = render(
      <VideoNodeClipPanel {...baseProps} error="compose rejected" />,
    );

    expect(screen.getByTestId("clip-panel")).toHaveTextContent("clip.mp4");
    expect(screen.getByText("剪辑失败：compose rejected")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveStyle({
      top: "calc(100% + 12px)",
    });
  });

  it("passes change, exit and submit commands to the clip editor", () => {
    const onChange = vi.fn();
    const onExit = vi.fn();
    const onSubmit = vi.fn();
    render(
      <VideoNodeClipPanel
        {...baseProps}
        onChange={onChange}
        onExit={onExit}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "change" }));
    fireEvent.click(screen.getByRole("button", { name: "exit" }));
    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    expect(onChange).toHaveBeenCalledWith({ clipStartMs: 250 });
    expect(onExit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith(250, 1_000);
  });
});
