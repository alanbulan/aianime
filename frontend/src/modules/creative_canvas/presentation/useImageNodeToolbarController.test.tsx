// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CANVAS_NODE_TYPES } from "../domain/canvasConnection";
import { NODE_TOOL_TYPES } from "../domain/canvasNodeTool";
import type { CanvasNode } from "../domain/canvasNodeData";
import {
  createUseImageNodeToolbarController,
} from "./useImageNodeToolbarController";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  t: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mocks.t,
    i18n: { language: "zh-CN" },
  }),
}));

const useImageNodeToolbarController = createUseImageNodeToolbarController({
  eventPort: { publish: mocks.publish },
});

function imageNode(): CanvasNode {
  return {
    id: "image-a",
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y: 0 },
    data: { imageUrl: "/source.png", aspectRatio: "1:1" },
  } as CanvasNode;
}

describe("useImageNodeToolbarController", () => {
  beforeEach(() => {
    mocks.publish.mockReset();
    mocks.t
      .mockReset()
      .mockImplementation((key: string) => `translated:${key}`);
  });

  it("projects edit availability and translated non-crop plugin actions", () => {
    const { result } = renderHook(() =>
      useImageNodeToolbarController({
        projectId: "project-a",
        node: imageNode(),
        isPresetLocked: false,
        onOpenMultiAngleEditor: vi.fn(),
        onOpenLightEditor: vi.fn(),
        onOpenScene360: vi.fn(),
        onOpenUpscale: vi.fn(),
        onOpenOutpaint: vi.fn(),
        onOpenGridAction: vi.fn(),
        onOpenRedraw: vi.fn(),
        onOpenErase: vi.fn(),
        onOpenRotate: vi.fn(),
      }),
    );

    expect(result.current).toMatchObject({
      projectId: "project-a",
      visible: true,
      imageSource: "/source.png",
      canRotate: true,
      canEdit: true,
    });
    expect(result.current.toolActions).toEqual([
      {
        type: NODE_TOOL_TYPES.splitStoryboard,
        icon: "split",
        label: "translated:tool.split",
        iconOnly: false,
      },
      {
        type: NODE_TOOL_TYPES.annotate,
        icon: "annotate",
        label: "translated:tool.annotate",
        iconOnly: true,
      },
    ]);
  });

  it("routes overlay and plugin commands with the selected node id", () => {
    const onOpenMultiAngleEditor = vi.fn();
    const onOpenLightEditor = vi.fn();
    const onOpenScene360 = vi.fn();
    const onOpenRotate = vi.fn();
    const { result } = renderHook(() =>
      useImageNodeToolbarController({
        projectId: "project-a",
        node: imageNode(),
        isPresetLocked: false,
        onOpenMultiAngleEditor,
        onOpenLightEditor,
        onOpenScene360,
        onOpenUpscale: vi.fn(),
        onOpenOutpaint: vi.fn(),
        onOpenGridAction: vi.fn(),
        onOpenRedraw: vi.fn(),
        onOpenErase: vi.fn(),
        onOpenRotate,
      }),
    );

    act(() => result.current.openPanorama());
    act(() => result.current.openMultiDimension());
    act(() => result.current.openRelight());
    act(() => result.current.openRotate());
    act(() => result.current.openTool(NODE_TOOL_TYPES.annotate));

    expect(onOpenScene360).toHaveBeenCalledWith("image-a");
    expect(onOpenMultiAngleEditor).toHaveBeenCalledWith("image-a");
    expect(onOpenLightEditor).toHaveBeenCalledWith("image-a");
    expect(onOpenRotate).toHaveBeenCalledWith("image-a");
    expect(mocks.publish).toHaveBeenCalledWith("tool-dialog/open", {
      nodeId: "image-a",
      toolType: NODE_TOOL_TYPES.annotate,
    });
  });
});
