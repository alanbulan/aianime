// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GROUP_COLOR_PRESETS } from "@/features/canvas/domain/groupColors";

import { useGroupNodeToolbarController } from "./useGroupNodeToolbarController";

const mocks = vi.hoisted(() => ({
  arrangeGroupChildren: vi.fn(),
  ungroupNode: vi.fn(),
  updateNodeData: vi.fn(),
  t: vi.fn((key: string) => key),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock("@/features/canvas/canvasStore", () => ({
  useCanvasStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) =>
    selector({
      arrangeGroupChildren: mocks.arrangeGroupChildren,
      ungroupNode: mocks.ungroupNode,
      updateNodeData: mocks.updateNodeData,
    }),
}));

describe("useGroupNodeToolbarController", () => {
  beforeEach(() => {
    mocks.arrangeGroupChildren.mockReset();
    mocks.ungroupNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.t.mockReset().mockImplementation((key: string) => key);
  });

  it("projects the domain color presets and current background", () => {
    const { result } = renderHook(() =>
      useGroupNodeToolbarController({
        nodeId: "group-a",
        backgroundColor: "#ef4444",
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
      }),
    );

    act(() => result.current.setBackgroundColor("#3b82f6"));
    act(() => result.current.setBackgroundColor(null));
    act(() => result.current.arrange("grid"));
    act(() => result.current.arrange("horizontal"));
    act(() => result.current.arrange("vertical"));
    act(() => result.current.ungroup());

    expect(mocks.updateNodeData.mock.calls).toEqual([
      ["group-a", { backgroundColor: "#3b82f6" }],
      ["group-a", { backgroundColor: null }],
    ]);
    expect(mocks.arrangeGroupChildren.mock.calls).toEqual([
      ["group-a", "grid"],
      ["group-a", "horizontal"],
      ["group-a", "vertical"],
    ]);
    expect(mocks.ungroupNode).toHaveBeenCalledWith("group-a");
  });
});
