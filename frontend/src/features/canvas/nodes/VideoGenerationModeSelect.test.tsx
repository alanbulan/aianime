// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { VideoGenerationModeOption } from "./videoGenerationModeOptions";
import { VideoGenerationModeSelect } from "./VideoGenerationModeSelect";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const options: ReadonlyArray<VideoGenerationModeOption> = [
  {
    key: "textToVideo",
    labelKey: "文生视频",
    disabledReason: "当前素材不支持文生视频",
  },
  {
    key: "allReference",
    labelKey: "全能参考",
    disabledReason: null,
  },
  {
    key: "imageToVideo",
    labelKey: "图生视频",
    disabledReason: "需要图片",
  },
];

describe("VideoGenerationModeSelect", () => {
  it("keeps the active mode available and routes another selection", () => {
    const onChange = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <VideoGenerationModeSelect
          value="textToVideo"
          options={options}
          onChange={onChange}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "文生视频" }));
    expect(onParentClick).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "文生视频" })[1]).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "全能参考" }));
    expect(onChange).toHaveBeenCalledWith("allReference");
    expect(
      screen.queryByRole("button", { name: "图生视频" }),
    ).not.toBeInTheDocument();
  });

  it("shows the supplied reason while hovering a disabled mode", () => {
    render(
      <VideoGenerationModeSelect
        value="allReference"
        options={options}
        onChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "全能参考" }));
    const disabledMode = screen.getByRole("button", { name: "图生视频" });
    expect(disabledMode).toBeDisabled();

    fireEvent.mouseEnter(disabledMode.parentElement!);
    expect(screen.getByText("需要图片")).toBeInTheDocument();
    fireEvent.mouseLeave(disabledMode.parentElement!);
    expect(screen.queryByText("需要图片")).not.toBeInTheDocument();
  });

  it("positions the portal and closes it on an outside pointer", () => {
    render(
      <VideoGenerationModeSelect
        value="allReference"
        options={options}
        onChange={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "全能参考" });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 900,
      y: 20,
      left: 900,
      top: 20,
      right: 980,
      bottom: 50,
      width: 80,
      height: 30,
      toJSON: () => ({}),
    });

    fireEvent.click(trigger);
    const optionButton = screen.getByRole("button", { name: "图生视频" });
    const popover = optionButton.parentElement!.parentElement!;
    expect(popover.style.left).toBe("884px");
    expect(popover.style.top).toBe("58px");

    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByRole("button", { name: "图生视频" }),
    ).not.toBeInTheDocument();
  });
});
