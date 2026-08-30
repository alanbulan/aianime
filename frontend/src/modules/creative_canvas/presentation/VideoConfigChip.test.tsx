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
    outputValue: "720p",
    outputOptions: ["720p", "1080p"],
    extraParamDefinitions: [],
    extraParams: {},
    durationSec: 8,
    durationBounds: { min: 5, max: 15 },
    durationOptions: [],
    normalizeDuration: (value) => Math.min(Math.max(Math.round(value), 5), 15),
    sceneOptimize: "anime",
    sceneOptimizeOptions: ["anime", "realistic"],
    generateAudio: false,
    supportsGenerateAudio: true,
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
    fireEvent.click(screen.getByRole("button", { name: "1080p" }));
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
      { generationResolution: "1080p" },
      { sceneOptimize: "realistic" },
      { generateAudio: true },
    ]);
  });

  it("renders H3 output and schema parameters while hiding unsupported audio", () => {
    const onChange = vi.fn();
    render(
      <VideoConfigChip
        {...configProps({
          onChange,
          outputValue: "1344x768",
          outputOptions: ["1344x768", "768x1344", "1024x1024"],
          durationSec: 3,
          durationBounds: { min: 1, max: 15 },
          sceneOptimize: undefined,
          sceneOptimizeOptions: [],
          generateAudio: false,
          supportsGenerateAudio: false,
          extraParamDefinitions: [
            { key: "steps", label: "steps", type: "number", min: 1, max: 50, step: 1, defaultValue: 20 },
            { key: "seed", label: "seed", type: "number", min: 0, max: 2147483647, step: 1, defaultValue: 42 },
            { key: "turbo", label: "turbo", type: "boolean", defaultValue: false },
          ],
          extraParams: { steps: 20, seed: 42, turbo: false },
        })}
      />,
    );

    fireEvent.click(screen.getByText("1344x768").closest("button")!);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "768x1344" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "steps" }), {
      target: { value: "24" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "turbo" }));

    expect(onChange).toHaveBeenCalledWith({
      generationResolution: "768x1344",
    });
    expect(onChange).toHaveBeenCalledWith({
      extraParams: { steps: 24, seed: 42, turbo: false },
    });
    expect(onChange).toHaveBeenCalledWith({
      extraParams: { steps: 20, seed: 42, turbo: true },
    });
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
