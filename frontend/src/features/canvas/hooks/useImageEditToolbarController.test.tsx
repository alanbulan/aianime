// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useImageEditToolbarController } from "./useImageEditToolbarController";

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

vi.mock("@/features/canvas/application/canvasServices", () => ({
  canvasEventBus: { publish: mocks.publish },
}));

describe("useImageEditToolbarController", () => {
  beforeEach(() => {
    mocks.publish.mockReset();
    mocks.t
      .mockReset()
      .mockImplementation((key: string) => `translated:${key}`);
  });

  it("projects labels and routes every edit action through its existing owner", () => {
    const onOpenRedraw = vi.fn();
    const onOpenErase = vi.fn();
    const onMatteImage = vi.fn();
    const onOpenUpscale = vi.fn();
    const onOpenOutpaint = vi.fn();
    const { result } = renderHook(() =>
      useImageEditToolbarController({
        nodeId: "image-a",
        isPresetLocked: false,
        onOpenRedraw,
        onOpenErase,
        onMatteImage,
        onOpenUpscale,
        onOpenOutpaint,
      }),
    );

    expect(result.current.activeAction).toEqual({
      key: "matting",
      label: "translated:nodeToolbar.matting",
    });

    for (const action of result.current.actions) {
      act(() => result.current.selectAction(action.key));
    }

    expect(onOpenRedraw).toHaveBeenCalledWith("image-a");
    expect(onOpenErase).toHaveBeenCalledWith("image-a");
    expect(onMatteImage).toHaveBeenCalledOnce();
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
      nodeId: "image-a",
      isPresetLocked: false,
      onOpenRedraw: vi.fn(),
      onOpenErase: vi.fn(),
      onMatteImage: vi.fn(),
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
