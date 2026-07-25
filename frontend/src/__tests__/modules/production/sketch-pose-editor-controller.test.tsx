// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseSketchPoseEditorDialogController,
  type SketchPoseEditorDialogControllerQueries,
} from "@/modules/production/application/use-sketch-pose-editor-dialog-controller";
import type { SketchPoseEditorData } from "@/modules/production/domain/sketch-pose-editor";

const savePose = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const poseData: SketchPoseEditorData = {
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
    {
      identityId: "support",
      colorHex: "#f97316",
      visible: false,
      active: false,
      joints: {
        nose: { x: 20, y: 20 },
        neck: { x: 20, y: 50 },
      },
    },
  ],
};

const queries: SketchPoseEditorDialogControllerQueries = {
  useSketchPoseEditor: () => ({
    data: { ok: true, data: poseData },
  }),
  useSaveSketchPoseEditor: () => ({
    isPending: false,
    mutateAsync: savePose,
  }),
};

const useController = createUseSketchPoseEditorDialogController(queries, {
  resolveMediaUrl: (value) => `/resolved${value}`,
});

function renderController(onOpenChange = vi.fn()) {
  return {
    onOpenChange,
    ...renderHook(() =>
      useController({
        beatNum: 2,
        episode: 1,
        open: true,
        project: "demo",
        onOpenChange,
      }),
    ),
  };
}

describe("Production sketch pose editor dialog controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePose.mockResolvedValue({
      ok: true,
      data: { beat_num: 2, sketch_url: "/static/sketch.png" },
    });
  });

  it("initializes editor state and applies the default scaled preset", async () => {
    const { result } = renderController();

    await waitFor(() => {
      expect(result.current.activeIdentity).toBe("hero");
    });
    expect(result.current.mode).toBe("pose");
    expect(result.current.presetKey).toBe("wave");
    expect(result.current.sketchUrl).toBe("/resolved/static/sketch.png");

    act(() => result.current.onApplyPreset());

    expect(result.current.skeletons[0].joints).toEqual({
      nose: { x: 50, y: 30 },
      neck: { x: 50, y: 60 },
    });
  });

  it("owns drawing state, pen width, and undo", async () => {
    const { result } = renderController();
    await waitFor(() => expect(result.current.skeletons).toHaveLength(2));

    act(() => {
      result.current.onModeChange("pencil");
      result.current.onPenWidthChange(8);
    });
    act(() => {
      expect(
        result.current.onStartCanvasInteraction(
          { x: 10, y: 15 },
          "#22d3ee",
        ),
      ).toBe(true);
    });
    act(() => result.current.onMoveCanvasInteraction({ x: 20, y: 25 }));
    act(() => result.current.onFinishCanvasInteraction());

    expect(result.current.strokes).toEqual([
      {
        colorHex: "#22d3ee",
        eraser: false,
        points: [
          { x: 10, y: 15 },
          { x: 20, y: 25 },
        ],
        width: 8,
      },
    ]);

    act(() => result.current.onUndo());
    expect(result.current.strokes).toEqual([]);
  });

  it("moves pose joints and controls frame membership", async () => {
    const { result } = renderController();
    await waitFor(() => expect(result.current.skeletons).toHaveLength(2));

    act(() => {
      expect(
        result.current.onStartCanvasInteraction(
          { x: 50, y: 50 },
          "#22d3ee",
        ),
      ).toBe(true);
    });
    act(() => result.current.onMoveCanvasInteraction({ x: 60, y: 60 }));
    act(() => result.current.onFinishCanvasInteraction());

    expect(result.current.skeletons[0].joints).toEqual({
      nose: { x: 60, y: 30 },
      neck: { x: 60, y: 60 },
    });

    act(() => result.current.onToggleSkeletonFrame("support"));
    expect(result.current.activeIdentity).toBe("support");
    expect(result.current.skeletons[1]).toMatchObject({
      active: true,
      visible: true,
    });

    act(() => result.current.onSetSkeletonVisible("support", false));
    expect(result.current.skeletons[1]).toMatchObject({
      active: false,
      visible: false,
    });
  });

  it("saves the current state, reports success, and closes the dialog", async () => {
    const { result, onOpenChange } = renderController();
    await waitFor(() => expect(result.current.skeletons).toHaveLength(2));

    await act(async () => result.current.onSave());

    expect(savePose).toHaveBeenCalledWith({
      beatNum: 2,
      state: {
        skeletons: poseData.skeletons,
        strokes: [],
      },
    });
    expect(toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.sketch.poseSaved",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports rejected save responses without closing", async () => {
    savePose.mockResolvedValueOnce({ ok: false, error: "保存失败" });
    const { result, onOpenChange } = renderController();
    await waitFor(() => expect(result.current.skeletons).toHaveLength(2));

    await act(async () => result.current.onSave());

    expect(toastError).toHaveBeenCalledWith("保存失败");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
