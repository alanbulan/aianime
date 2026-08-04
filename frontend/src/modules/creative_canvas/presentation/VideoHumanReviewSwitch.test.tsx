// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VideoHumanReviewSwitch } from "./VideoHumanReviewSwitch";

describe("VideoHumanReviewSwitch", () => {
  it("renders the disabled visual state", () => {
    const { container } = render(
      <VideoHumanReviewSwitch checked={false} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("switch", { name: "真人验证" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(container.querySelector(".bg-input")).toBeInTheDocument();
    expect(container.querySelector(".translate-x-0\\.5")).toBeInTheDocument();
  });

  it("renders the enabled visual state", () => {
    const { container } = render(
      <VideoHumanReviewSwitch checked onChange={vi.fn()} />,
    );

    expect(screen.getByRole("switch", { name: "真人验证" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(container.querySelector(".bg-primary")).toBeInTheDocument();
    expect(container.querySelector(".translate-x-3")).toBeInTheDocument();
  });

  it("routes the toggled value without bubbling to the node", () => {
    const onNodeClick = vi.fn();
    const onChange = vi.fn();
    render(
      <div onClick={onNodeClick}>
        <VideoHumanReviewSwitch checked={false} onChange={onChange} />
      </div>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "真人验证" }));

    expect(onChange).toHaveBeenCalledWith(true);
    expect(onNodeClick).not.toHaveBeenCalled();
  });
});
