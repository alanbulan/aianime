// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GROUP_COLOR_PRESETS } from "@/modules/creative_canvas/domain/groupColors";

import { useGroupNodeToolbarController } from "./useGroupNodeToolbarController";

const mocks = {
  arrangeGroupChildren: vi.fn(),
  ungroupNode: vi.fn(),
  updateNodeBackgroundColor: vi.fn(),
  t: vi.fn((key: string) => key),
};

const commandPorts = {
  arrangeGroupChildren: mocks.arrangeGroupChildren,
  ungroupNode: mocks.ungroupNode,
  updateNodeBackgroundColor: mocks.updateNodeBackgroundColor,
};

describe("useGroupNodeToolbarController", () => {
  beforeEach(() => {
    mocks.arrangeGroupChildren.mockReset();
    mocks.ungroupNode.mockReset();
    mocks.updateNodeBackgroundColor.mockReset();
    mocks.t.mockReset().mockImplementation((key: string) => key);
  });

  it("projects the domain color presets and current background", () => {
    const { result } = renderHook(() =>
      useGroupNodeToolbarController({
        nodeId: "group-a",
        backgroundColor: "#ef4444",
        translate: mocks.t,
        ...commandPorts,
      }),
    );

    expect(result.current.backgroundColor).toBe("#ef4444");
    expect(result.current.colorPresets).toBe(GROUP_COLOR_PRESETS);
    expect(result.current.t("nodeToolbar.ungroup")).toBe(
      "nodeToolbar.ungroup",
    );
  });

  it("routes color, arrangement, and ungroup commands to the Canvas store", () => {
    const { result } = renderHook(() =>
      useGroupNodeToolbarController({
        nodeId: "group-a",
        backgroundColor: null,
        translate: mocks.t,
        ...commandPorts,
      }),
    );

    act(() => result.current.setBackgroundColor("#3b82f6"));
    act(() => result.current.setBackgroundColor(null));
    act(() => result.current.arrange("grid"));
    act(() => result.current.arrange("horizontal"));
    act(() => result.current.arrange("vertical"));
    act(() => result.current.ungroup());

    expect(mocks.updateNodeBackgroundColor.mock.calls).toEqual([
      ["group-a", "#3b82f6"],
      ["group-a", null],
    ]);
    expect(mocks.arrangeGroupChildren.mock.calls).toEqual([
      ["group-a", "grid"],
      ["group-a", "horizontal"],
      ["group-a", "vertical"],
    ]);
    expect(mocks.ungroupNode).toHaveBeenCalledWith("group-a");
  });
});
