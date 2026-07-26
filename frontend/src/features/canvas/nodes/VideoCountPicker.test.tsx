// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VideoCountPicker } from "./VideoCountPicker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { count?: number }) =>
      `${options?.count ?? 0} 个`,
  }),
}));

describe("VideoCountPicker", () => {
  it("renders caller-owned options and routes selection", () => {
    const onChange = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <VideoCountPicker
          value={2}
          options={[1, 2, 4]}
          onChange={onChange}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "2 个" }));
    expect(onParentClick).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "2 个" })[1]).toHaveClass(
      "bg-primary/12",
    );

    fireEvent.click(screen.getByRole("button", { name: "4 个" }));
    expect(onChange).toHaveBeenCalledWith(4);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("closes the option list on an outside pointer", () => {
    render(
      <VideoCountPicker
        value={1}
        options={[1, 4]}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1 个" }));
    expect(screen.getByRole("button", { name: "4 个" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(
      screen.queryByRole("button", { name: "4 个" }),
    ).not.toBeInTheDocument();
  });
});
