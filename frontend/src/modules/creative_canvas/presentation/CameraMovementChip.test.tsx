import { clickAndLayout } from "@/__tests__/helpers/click-and-layout";
// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CameraMovementPreset } from "../domain/cameraMovementPresets";
import { CameraMovementChip } from "./CameraMovementChip";

vi.mock("./CameraMovementPickerPopover", () => ({
  CameraMovementPickerPopover: ({
    selectedId,
    onConfirm,
    onClose,
  }: {
    selectedId: string | null;
    onConfirm: (id: string | null) => void;
    onClose: () => void;
  }) => (
    <div data-testid="camera-picker">
      <span>{selectedId ?? "none"}</span>
      <button type="button" onClick={() => onConfirm("camera-2")}>
        确认镜头
      </button>
      <button type="button" onClick={onClose}>
        关闭镜头
      </button>
    </div>
  ),
}));

const templates: ReadonlyArray<CameraMovementPreset> = [
  {
    id: "camera-1",
    label: "固定镜头",
    promptFragment: "固定镜头",
    videoUrl: null,
  },
  {
    id: "camera-2",
    label: "镜头前推",
    promptFragment: "镜头前推",
    videoUrl: null,
  },
];

describe("CameraMovementChip", () => {
  it("shows the selected preset and routes picker confirmation", async () => {
    const onChange = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <CameraMovementChip
          templates={templates}
          isLoading={false}
          selectedId="camera-1"
          onChange={onChange}
        />
      </div>,
    );

    await clickAndLayout(screen.getByRole("button", { name: "固定镜头" }));
    expect(onParentClick).not.toHaveBeenCalled();
    expect(screen.getByTestId("camera-picker")).toHaveTextContent("camera-1");

    await clickAndLayout(screen.getByRole("button", { name: "确认镜头" }));
    expect(onChange).toHaveBeenCalledWith("camera-2");
    expect(screen.queryByTestId("camera-picker")).not.toBeInTheDocument();
  });

  it("renders the portal and closes it on an outside pointer", async () => {
    render(
      <CameraMovementChip
        templates={templates}
        isLoading
        selectedId={null}
        onChange={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "运镜" });

    await clickAndLayout(trigger);
    const portal = screen.getByTestId("camera-picker").parentElement!;
    expect(portal).toHaveClass("fixed");
    expect(portal.closest("[data-ui-overlay]")).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("camera-picker")).not.toBeInTheDocument();
  });
});
