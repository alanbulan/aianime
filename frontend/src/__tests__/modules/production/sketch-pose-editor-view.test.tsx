// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SketchPoseEditorDialogController } from "@/modules/production/application/use-sketch-pose-editor-dialog-controller";
import { SketchPoseEditorDialogView } from "@/modules/production/presentation/SketchPoseEditorDialogView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

class ResizeObserverMock {
  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

function createController(
  overrides: Partial<SketchPoseEditorDialogController> = {},
): SketchPoseEditorDialogController {
  return {
    activeIdentity: "hero",
    activeSkeleton: {
      identityId: "hero",
      colorHex: "#22d3ee",
      visible: true,
      active: true,
      joints: {
        nose: { x: 50, y: 20 },
        neck: { x: 50, y: 50 },
      },
    },
    beatNum: 2,
    canvasStrokes: [],
    data: {
      beat_num: 2,
      sketch_url: "/static/sketch.png",
      width: 100,
      height: 120,
      candidates: [],
      skeleton_edges: [["nose", "neck"]],
      pose_presets: {
        wave: {
          label: "Wave",
          joints: {
            nose: { x: 0.5, y: 0.25 },
            neck: { x: 0.5, y: 0.5 },
          },
        },
      },
      skeletons: [],
    },
    mode: "pose",
    open: true,
    penWidth: 4,
    presetKey: "wave",
    savePending: false,
    skeletons: [
      {
        identityId: "hero",
        colorHex: "#22d3ee",
        visible: true,
        active: true,
        joints: {
          nose: { x: 50, y: 20 },
          neck: { x: 50, y: 50 },
        },
      },
    ],
    sketchUrl: "/static/sketch.png",
    onApplyPreset: vi.fn(),
    onClearStrokes: vi.fn(),
    onFinishCanvasInteraction: vi.fn(),
    onModeChange: vi.fn(),
    onMoveCanvasInteraction: vi.fn(),
    onOpenChange: vi.fn(),
    onPenWidthChange: vi.fn(),
    onPresetChange: vi.fn(),
    onResetSkeletons: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onSelectSkeleton: vi.fn(),
    onSetSkeletonVisible: vi.fn(),
    onStartCanvasInteraction: vi.fn().mockReturnValue(true),
    onToggleSkeletonFrame: vi.fn(),
    onUndo: vi.fn(),
    ...overrides,
  };
}

describe("Production sketch pose editor dialog view", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders editor controls and delegates presentation actions", async () => {
    const user = userEvent.setup();
    const controller = createController();
    render(<SketchPoseEditorDialogView controller={controller} />);

    await user.click(
      screen.getByRole("button", {
        name: "episode.workbench.sketch.poseColorPen",
      }),
    );
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "8" },
    });
    await user.click(
      screen.getByRole("button", {
        name: "episode.workbench.sketch.poseApplyPreset",
      }),
    );
    await user.click(screen.getByRole("button", { name: "common.save" }));

    expect(controller.onModeChange).toHaveBeenCalledWith("pencil");
    expect(controller.onPenWidthChange).toHaveBeenCalledWith(8);
    expect(controller.onApplyPreset).toHaveBeenCalledOnce();
    expect(controller.onSave).toHaveBeenCalledOnce();
  });

  it("maps browser pointer coordinates into canvas coordinates", () => {
    const controller = createController();
    render(<SketchPoseEditorDialogView controller={controller} />);
    const canvas = document.querySelector("canvas");
    expect(canvas).not.toBeNull();
    if (!canvas) return;

    Object.defineProperty(canvas, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        x: 10,
        y: 20,
        left: 10,
        top: 20,
        right: 210,
        bottom: 260,
        width: 200,
        height: 240,
        toJSON: () => {},
      }),
    });
    const setPointerCapture = vi.fn();
    Object.defineProperty(canvas, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });

    fireEvent.pointerDown(canvas, {
      clientX: 110,
      clientY: 140,
      pointerId: 7,
    });
    fireEvent.pointerMove(canvas, {
      clientX: 210,
      clientY: 260,
      pointerId: 7,
    });
    fireEvent.pointerUp(canvas, { pointerId: 7 });

    expect(controller.onStartCanvasInteraction).toHaveBeenCalledWith(
      { x: 50, y: 60 },
      "#22d3ee",
    );
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(controller.onMoveCanvasInteraction).toHaveBeenCalledWith({
      x: 100,
      y: 120,
    });
    expect(controller.onFinishCanvasInteraction).toHaveBeenCalledOnce();
  });
});
