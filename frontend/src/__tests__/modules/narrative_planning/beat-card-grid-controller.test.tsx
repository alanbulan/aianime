// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUseBeatCardGridController } from "@/modules/narrative_planning/application/use-beat-card-grid-controller";
import type { Beat } from "@/modules/narrative_planning/domain/types";

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { n?: number }) =>
      options?.n === undefined ? key : `${key}:${options.n}`,
  }),
}));

const deleteManualShot = vi.fn();
const openBeatFreezone = vi.fn();
let deletePending = false;

const useBeatCardGridController = createUseBeatCardGridController(
  {
    useDeleteManualShot: () => ({
      isPending: deletePending,
      mutateAsync: deleteManualShot,
    }),
    useGridsByBeat: () => ({
      assignments: { "20": "render-20" },
      byBeat: new Map(),
    }),
  },
  { openBeatFreezone },
);

const beats: Beat[] = [
  {
    beat_number: 10,
    narration_segment: "first",
    visual_description: "first visual",
  },
  {
    beat_number: 20,
    narration_segment: "second",
    visual_description: "second visual",
    is_manual_shot: true,
  },
];

beforeEach(() => {
  deletePending = false;
  deleteManualShot.mockReset();
  deleteManualShot.mockResolvedValue({ ok: true });
  openBeatFreezone.mockReset();
  openBeatFreezone.mockResolvedValue("canvas-id");
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
});

describe("BeatCardGrid controller", () => {
  it("projects selection and media toggles and resolves insert positions", () => {
    const { result } = renderHook(() =>
      useBeatCardGridController({
        beats,
        episode: 3,
        project: "demo",
        selection: { mode: "multi", checked: new Set([20]) },
        toggles: new Set(["text", "sketch"]),
      }),
    );

    expect(result.current.assignments).toEqual({ "20": "render-20" });
    expect(result.current.checkedBeats?.has(20)).toBe(true);
    expect(result.current.selectedBeat).toBeNull();
    expect(result.current.showSketch).toBe(true);
    expect(result.current.showRender).toBe(false);

    act(() => result.current.onInsertBefore(20));
    expect(result.current.insertOpen).toBe(true);
    expect(result.current.insertAfterBeat).toBe(10);

    act(() => result.current.onInsertOpenChange(false));
    expect(result.current.insertOpen).toBe(false);
    expect(result.current.insertAfterBeat).toBeNull();

    act(() => result.current.onInsertBefore(10));
    expect(result.current.insertAfterBeat).toBeNull();

    act(() => result.current.onInsertAfter(20));
    expect(result.current.insertAfterBeat).toBe(20);
  });

  it("opens the beat projection and clears pending state on failure", async () => {
    const { result } = renderHook(() =>
      useBeatCardGridController({
        beats,
        episode: 3,
        project: "demo",
        selection: { mode: "single", beatNum: 20 },
        toggles: new Set(["render"]),
      }),
    );

    await act(async () => {
      await result.current.onOpenFreezone(20, "frame");
    });

    expect(openBeatFreezone).toHaveBeenCalledWith("demo", {
      scope: "beat",
      episode: 3,
      beat: 20,
      primary_slot: "frame",
    });
    expect(result.current.freezonePendingBeat).toBe(20);

    openBeatFreezone.mockRejectedValueOnce(new Error("failed"));
    const { result: failedResult } = renderHook(() =>
      useBeatCardGridController({
        beats,
        episode: 3,
        project: "demo",
        selection: { mode: "none" },
        toggles: new Set(["text"]),
      }),
    );

    await act(async () => {
      await failedResult.current.onOpenFreezone(10, "sketch");
    });

    expect(failedResult.current.freezonePendingBeat).toBeNull();
    expect(toastMocks.error).toHaveBeenCalledWith(
      "episode.beat.openFreezoneFailed",
    );
  });

  it("deletes the requested manual beat and preserves failures", async () => {
    const { result } = renderHook(() =>
      useBeatCardGridController({
        beats,
        episode: 3,
        project: "demo",
        selection: { mode: "none" },
        toggles: new Set(["text"]),
      }),
    );

    act(() => result.current.onDeleteManualRequest(20, 2));
    await act(async () => {
      await result.current.onDeleteManual();
    });

    expect(deleteManualShot).toHaveBeenCalledWith(20);
    expect(toastMocks.success).toHaveBeenCalledWith(
      "episode.beat.deleteManualShotSuccess:2",
    );
    expect(result.current.deleteTarget).toBeNull();

    deleteManualShot.mockResolvedValueOnce({ ok: false, error: "denied" });
    act(() => result.current.onDeleteManualRequest(20, 2));
    await act(async () => {
      await result.current.onDeleteManual();
    });

    expect(toastMocks.error).toHaveBeenCalledWith("denied");
    expect(result.current.deleteTarget).toEqual({
      beatNumber: 20,
      displayNumber: 2,
    });
  });
});
