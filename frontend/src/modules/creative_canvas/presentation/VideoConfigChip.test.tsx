// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VideoConfigChip, type VideoConfigChipProps } from "./VideoConfigChip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "node.videoNode.aspect.auto" ? "自动" : key,
  }),
}));

function configProps(
  overrides: Partial<VideoConfigChipProps> = {},
): VideoConfigChipProps {
  return {
    aspectRatio: "16:9",
    aspectRatioOptions: ["auto", "16:9", "9:16"],
    quality: "720P",
    qualityOptions: ["720P", "1080P"],
    durationSec: 8,
    durationBounds: { min: 5, max: 15 },
    normalizeDuration: (value) => Math.min(Math.max(Math.round(value), 5), 15),
    sceneOptimize: "anime",
    sceneOptimizeOptions: ["anime", "realistic"],
    generateAudio: false,
    onChange: vi.fn(),
    ...overrides,
  };
}

describe("VideoConfigChip", () => {
  it("projects options and routes each configuration command", () => {
    const onChange = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <VideoConfigChip {...configProps({ onChange })} />
      </div>,
    );

    fireEvent.click(screen.getByText("16:9").closest("button")!);
    expect(onParentClick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "9:16" }));
    fireEvent.click(screen.getByRole("button", { name: "1080P" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "node.videoNode.sceneOptimize.options.realistic",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "node.videoNode.audio.title" }),
    );

    expect(onChange.mock.calls.map(([patch]) => patch)).toEqual([
      { aspectRatio: "9:16" },
      { quality: "1080P" },
      { sceneOptimize: "realistic" },
      { generateAudio: true },
    ]);
  });

  it("keeps partial duration input local and normalizes committed values", () => {
    const onChange = vi.fn();
    const normalizeDuration = vi.fn((value: number) =>
      Math.min(Math.max(Math.round(value), 5), 15),
    );
    render(
      <VideoConfigChip
        {...configProps({ onChange, normalizeDuration })}
      />,
    );
    fireEvent.click(screen.getByText("16:9").closest("button")!);
    const durationInput = screen.getByRole("spinbutton", {
      name: "node.videoNode.duration.title",
    });

    fireEvent.change(durationInput, { target: { value: "1" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(durationInput).toHaveValue(1);

    fireEvent.change(durationInput, { target: { value: "12" } });
    expect(onChange).toHaveBeenLastCalledWith({ durationSec: 12 });

    onChange.mockClear();
    fireEvent.change(durationInput, { target: { value: "99" } });
    fireEvent.blur(durationInput);
    expect(normalizeDuration).toHaveBeenCalledWith(99);
    expect(onChange).toHaveBeenCalledWith({ durationSec: 15 });
    expect(durationInput).toHaveValue(15);

    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
    expect(normalizeDuration).toHaveBeenCalledWith(7);
    expect(onChange).toHaveBeenLastCalledWith({ durationSec: 7 });
  });

  it("syncs duration props and closes on an outside pointer", () => {
    const { rerender } = render(<VideoConfigChip {...configProps()} />);
    fireEvent.click(screen.getByText("16:9").closest("button")!);
    expect(
      screen.getByRole("spinbutton", {
        name: "node.videoNode.duration.title",
      }),
    ).toHaveValue(8);

    rerender(<VideoConfigChip {...configProps({ durationSec: 10 })} />);
    expect(
      screen.getByRole("spinbutton", {
        name: "node.videoNode.duration.title",
      }),
    ).toHaveValue(10);

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });
});
