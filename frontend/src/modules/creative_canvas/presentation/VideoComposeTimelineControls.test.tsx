// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  VideoComposeSpeedPopover,
  VideoComposeToolButton,
  VideoComposeVolumePopover,
} from "./VideoComposeTimelineControls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("VideoComposeTimelineControls", () => {
  it("forwards tool button commands and disabled state", () => {
    const onClick = vi.fn();
    const Icon = ({ className }: { className?: string }) => (
      <span className={className}>icon</span>
    );
    const { rerender } = render(
      <VideoComposeToolButton
        icon={Icon}
        label="split"
        onClick={onClick}
        active
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "split" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "split" })).toHaveClass(
      "bg-primary/20",
    );

    rerender(
      <VideoComposeToolButton
        icon={Icon}
        label="split"
        onClick={onClick}
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: "split" })).toBeDisabled();
  });

  it("keeps speed and duration controls linked and forwards close", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <VideoComposeSpeedPopover
        speed={1}
        sourceSpanMs={4000}
        onChange={onChange}
        onClose={onClose}
      />,
    );

    const sliders = screen.getAllByRole("slider");
    fireEvent.keyDown(sliders[0], { key: "End" });
    fireEvent.keyDown(sliders[1], { key: "Home" });
    fireEvent.click(screen.getAllByRole("button", { name: "+" })[0]);
    fireEvent.click(
      screen.getByRole("button", { name: "common.close" }),
    );

    expect(onChange).toHaveBeenNthCalledWith(1, 4);
    expect(onChange).toHaveBeenNthCalledWith(2, 4);
    expect(onChange).toHaveBeenNthCalledWith(3, 1.05);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("starts one volume history gesture and forwards volume, mute, and close", () => {
    const onChange = vi.fn();
    const onGestureStart = vi.fn();
    const onToggleMute = vi.fn();
    const onClose = vi.fn();
    render(
      <VideoComposeVolumePopover
        volume={0.5}
        muted={false}
        onChange={onChange}
        onGestureStart={onGestureStart}
        onToggleMute={onToggleMute}
        onClose={onClose}
      />,
    );

    const slider = screen.getByRole("slider");
    fireEvent.pointerDown(slider);
    fireEvent.keyDown(slider, { key: "ArrowRight", repeat: false });
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.mute" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "common.close" }),
    );

    expect(onGestureStart).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledWith(0.51);
    expect(onToggleMute).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});
