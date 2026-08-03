// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CanvasNodeData } from "@/features/canvas/domain/canvasNodes";

import { useImageEditToolbarController } from "./useImageEditToolbarController";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  matte: vi.fn(),
  useImageMatteController: vi.fn(),
  t: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: mocks.t,
    i18n: { language: "zh-CN" },
  }),
}));

vi.mock("@/modules/creative_canvas/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/creative_canvas/public")>()),
  canvasEventBus: { publish: mocks.publish },
}));

vi.mock("@/features/canvas/hooks/useImageMatteController", () => ({
  useImageMatteController: (...args: unknown[]) =>
    mocks.useImageMatteController(...args),
}));

describe("useImageEditToolbarController", () => {
  beforeEach(() => {
    mocks.publish.mockReset();
    mocks.matte.mockReset();
    mocks.useImageMatteController
      .mockReset()
      .mockReturnValue({ matte: mocks.matte });
    mocks.t
      .mockReset()
      .mockImplementation((key: string) => `translated:${key}`);
  });

  it("projects labels and routes every edit action through its existing owner", () => {
    const onOpenRedraw = vi.fn();
    const onOpenErase = vi.fn();
    const onOpenUpscale = vi.fn();
    const onOpenOutpaint = vi.fn();
    const { result } = renderHook(() =>
      useImageEditToolbarController({
        projectId: "project-a",
        nodeId: "image-a",
        nodeData: {} as CanvasNodeData,
        imageSource: "/source.png",
        isPresetLocked: false,
        onOpenRedraw,
        onOpenErase,
        onOpenUpscale,
        onOpenOutpaint,
      }),
    );

    expect(result.current.activeAction).toEqual({
      key: "matting",
      label: "translated:nodeToolbar.matting",
    });
    expect(mocks.useImageMatteController).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "project-a" }),
    );

    for (const action of result.current.actions) {
      act(() => result.current.selectAction(action.key));
    }

    expect(onOpenRedraw).toHaveBeenCalledWith("image-a");
    expect(onOpenErase).toHaveBeenCalledWith("image-a");
    expect(mocks.matte).toHaveBeenCalledOnce();
    expect(onOpenUpscale).toHaveBeenCalledWith("image-a");
    expect(onOpenOutpaint).toHaveBeenCalledWith("image-a");
    expect(mocks.publish).toHaveBeenCalledWith("tool-dialog/open", {
      nodeId: "image-a",
      toolType: "crop",
    });
    expect(result.current.activeAction.key).toBe("outpaint");
  });

  it("removes HD and projects matting when a selected node becomes locked", () => {
    const options = {
      projectId: "project-a",
      nodeId: "image-a",
      nodeData: {} as CanvasNodeData,
      imageSource: "/source.png",
      isPresetLocked: false,
      onOpenRedraw: vi.fn(),
      onOpenErase: vi.fn(),
      onOpenUpscale: vi.fn(),
      onOpenOutpaint: vi.fn(),
    };
    const { result, rerender } = renderHook(
      ({ locked }) =>
        useImageEditToolbarController({
          ...options,
          isPresetLocked: locked,
        }),
      { initialProps: { locked: false } },
    );

    act(() => result.current.selectAction("hd"));
    expect(result.current.activeAction.key).toBe("hd");

    rerender({ locked: true });

    expect(result.current.actions.map((action) => action.key)).not.toContain(
      "hd",
    );
    expect(result.current.activeAction.key).toBe("matting");
  });
});
