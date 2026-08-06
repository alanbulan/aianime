// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Beat } from "@/modules/narrative_planning/public";
import { createUseBatchPanelController } from "@/modules/production/application/use-batch-panel-controller";
import type { SketchRegenQueueItem } from "@/modules/production/public";
import type { TaskState } from "@/modules/task_execution/public";
import { sampleTask } from "@/__mocks__/msw/handlers/tasks";

const hookMocks = vi.hoisted(() => ({
  audioStart: vi.fn(),
  renderTrack: vi.fn(),
  sketchTrack: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock("@/modules/task_execution/public", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  useTaskController: () => ({
    start: hookMocks.audioStart,
    started: false,
  }),
}));

vi.mock("@/modules/task_execution/presentation/useScopedTaskBatchInvalidation", () => ({
  useScopedTaskBatchInvalidation: ({ taskType }: { taskType: string }) => ({
    track:
      taskType === "selected_regen"
        ? hookMocks.renderTrack
        : hookMocks.sketchTrack,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: hookMocks.toastError,
    success: hookMocks.toastSuccess,
    warning: hookMocks.toastWarning,
  },
}));

const regenerateSketches = vi.fn();
const generateAudio = vi.fn();
const saveQueue = vi.fn();
const clearSelection = vi.fn();
const removeStoredValue = vi.fn();
const regenerateSketchesMutation = {
  isPending: false,
  mutateAsync: regenerateSketches,
};
const generateAudioMutation = {
  isPending: false,
  mutateAsync: generateAudio,
};
const saveQueueMutation = {
  isPending: false,
  mutate: saveQueue,
};
const queueQuery: {
  data?: { ok: true; data: { items: SketchRegenQueueItem[] } };
} = {};
const taskQuery: { data?: { data: TaskState[] } } = {};

const useBatchPanelController = createUseBatchPanelController(
  {
    useAudioModels: () => ({
      data: [
        {
          value: "audio-speech-test",
          label: "Audio Speech Test",
          supportedModes: ["speech"],
        },
      ],
      isLoading: false,
    }),
    useGenerateAudio: () => generateAudioMutation,
    useRegenerateSketches: () => regenerateSketchesMutation,
    useSaveSketchRegenQueue: () => saveQueueMutation,
    useSketchRegenQueue: () => queueQuery,
    useSketchSettings: () => ({
      data: {
        ok: true,
        data: {
          sketch_image_selection: "sketch-model",
          options: {},
        },
      },
    }),
  },
  {
    formatCreditCost: (cost) => `credits:${cost}`,
    removeStoredValue,
    useGenerationCreditCost: () => ({ data: { data: { cost: 2 } } }),
    useTasks: () => taskQuery,
  },
);

const beats: Beat[] = [
  {
    beat_number: 1,
    narration_segment: "one",
    visual_description: "one",
    scene_ref: { scene_id: "store" },
  },
  {
    beat_number: 2,
    narration_segment: "two",
    visual_description: "two",
    scene_ref: { scene_id: "store" },
  },
];

function renderController(checkedBeats: ReadonlySet<number> = new Set([2, 1])) {
  const options = {
    beats,
    checkedBeats,
    episode: 1,
    isSeedance2Backend: false,
    onClearSelection: clearSelection,
    project: "demo",
    sketchAspect: "2:3" as const,
  };
  return renderHook(() => useBatchPanelController(options));
}

beforeEach(() => {
  regenerateSketches.mockReset();
  regenerateSketches.mockResolvedValue({
    ok: true,
    task_type: "sketch_regen",
    message: "started",
    scope: "sketch-scope",
  });
  generateAudio.mockReset();
  generateAudio.mockResolvedValue({
    ok: true,
    task_type: "audio_generation_indextts2",
    message: "started",
    scope: "audio-scope",
  });
  saveQueue.mockReset();
  clearSelection.mockReset();
  removeStoredValue.mockReset();
  hookMocks.audioStart.mockReset();
  hookMocks.renderTrack.mockReset();
  hookMocks.sketchTrack.mockReset();
  hookMocks.toastError.mockReset();
  hookMocks.toastSuccess.mockReset();
  hookMocks.toastWarning.mockReset();
  regenerateSketchesMutation.isPending = false;
  generateAudioMutation.isPending = false;
  saveQueueMutation.isPending = false;
  queueQuery.data = { ok: true, data: { items: [] } };
  taskQuery.data = { data: [] };
});

describe("BatchPanel controller", () => {
  it("builds a scene-grouped sketch plan and dispatches its backend scope", async () => {
    const { result } = renderController();

    expect(result.current.beatNumbers).toEqual([1, 2]);
    expect(result.current.sketchPlanItems).toMatchObject([
      {
        beatNumbers: [1, 2],
        modeKey: "1x2_4-3_sketch",
        sceneIds: ["store"],
      },
    ]);
    expect(result.current.sketchPlanCostDisplay).toBe("credits:2");

    act(() => result.current.onConfirmSketchPlan());

    await waitFor(() =>
      expect(regenerateSketches).toHaveBeenCalledWith({
        beatIndices: [1, 2],
        modeKey: "1x2_4-3_sketch",
      }),
    );
    expect(hookMocks.sketchTrack).toHaveBeenCalledWith("sketch-scope");
    expect(saveQueue).toHaveBeenCalledWith([]);
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it("dispatches selected audio as one IndexTTS2 task", async () => {
    const { result } = renderController();

    await act(async () => {
      await result.current.onBatchAudio();
    });

    expect(generateAudio).toHaveBeenCalledWith({
      beatNumbers: [1, 2],
      model: "audio-speech-test",
      mode: "redo_selected",
    });
    expect(hookMocks.audioStart).toHaveBeenCalledWith({
      scope: "audio-scope",
    });
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it("opens Render Plan with the selected mode and tracks every task id", () => {
    const { result } = renderController();

    act(() => result.current.onOpenRenderPlan(true));
    expect(result.current.renderPlanOpen).toBe(true);
    expect(result.current.renderPlanForceOneByOne).toBe(true);

    act(() => result.current.onRenderDispatched(["render-1", "render-2"]));
    expect(hookMocks.renderTrack.mock.calls).toEqual([
      ["render-1"],
      ["render-2"],
    ]);
    expect(clearSelection).toHaveBeenCalledTimes(1);
  });

  it("disables Render while a selected single-video task is active", () => {
    taskQuery.data = {
      data: [
        sampleTask({
          task_type: "single_video",
          username: "u",
          project: "demo",
          episode: 1,
          beat_num: 2,
          status: "running",
          progress: 50,
        }),
      ],
    };

    const { result } = renderController();

    expect(result.current.actionDisabled.render).toBe(true);
  });

  it("clears a persisted legacy sketch queue once", async () => {
    queueQuery.data = {
      ok: true,
      data: {
        items: [
          {
            id: "legacy",
            modeKey: "1x1_2-3_sketch",
            modeLabel: "1x1",
            beatNumbers: [1],
            sceneIds: ["store"],
            createdAt: "2026-07-25T00:00:00.000Z",
          },
        ],
      },
    };

    renderController();

    await waitFor(() => expect(saveQueue).toHaveBeenCalledWith([]));
    expect(saveQueue).toHaveBeenCalledTimes(1);
    expect(removeStoredValue).toHaveBeenCalledWith(
      "st.sketch-regen-queue.demo.1",
    );
  });
});
