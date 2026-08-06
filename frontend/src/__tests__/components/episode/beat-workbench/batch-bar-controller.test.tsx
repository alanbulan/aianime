// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Beat } from "@/modules/narrative_planning/public";
import {
  createUseBatchBarController,
  type BatchBarControllerOptions,
} from "@/modules/production/application/use-batch-bar-controller";

const hookMocks = vi.hoisted(() => ({
  audioStart: vi.fn(),
  audioStarted: false,
  globalOnError: undefined as ((error: string) => void) | undefined,
  globalStart: vi.fn(),
  globalStarted: false,
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  toastLoading: vi.fn(() => "toast-1"),
  toastSuccess: vi.fn(),
}));

vi.mock("@/modules/task_execution/public", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  useTaskController: (options: {
    key: { taskType: string };
    onError?: (error: string) => void;
  }) => {
    if (options.key.taskType === "global_optimize_video") {
      hookMocks.globalOnError = options.onError;
      return {
        start: hookMocks.globalStart,
        started: hookMocks.globalStarted,
      };
    }
    return {
      start: hookMocks.audioStart,
      started: hookMocks.audioStarted,
    };
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === "episode.workbench.batch.aiDetectSuccess") {
        return `detected:${options?.beats}:${options?.ids}:${options?.props}`;
      }
      if (key === "episode.workbench.batch.reassignColorsSuccess") {
        return `colored:${options?.count}:${options?.propCount}`;
      }
      return key;
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: hookMocks.toastError,
    info: hookMocks.toastInfo,
    loading: hookMocks.toastLoading,
    success: hookMocks.toastSuccess,
  },
}));

const assignColors = vi.fn();
const detectIdentities = vi.fn();
const generateAudio = vi.fn();
const globalOptimize = vi.fn();
const onSketchAspectRatioChange = vi.fn();
const updateRenderSettings = vi.fn();
const updateSketchSettings = vi.fn();
const assignColorsMutation = {
  isPending: false,
  mutateAsync: assignColors,
};
const detectIdentitiesMutation = {
  isPending: false,
  mutateAsync: detectIdentities,
};
const generateAudioMutation = {
  isPending: false,
  mutateAsync: generateAudio,
};
const globalOptimizeMutation = {
  isPending: false,
  mutateAsync: globalOptimize,
};
const renderSettingsQuery = {
  data: {
    ok: true as const,
    data: {
      render_image_selection: "render-a",
      sketch_aspect_padding: false,
    },
  },
  isLoading: false,
};
const sketchSettingsQuery = {
  data: {
    ok: true as const,
    data: {
      sketch_image_selection: "sketch-a",
    },
  },
  isLoading: false,
};
const updateRenderSettingsMutation = {
  isPending: false,
  mutateAsync: updateRenderSettings,
};
const updateSketchSettingsMutation = {
  isPending: false,
  mutateAsync: updateSketchSettings,
};
const videoModelsQuery = {
  data: [
    {
      value: "standard",
      label: "Standard",
      profile: "standard" as const,
      supportsAdvancedConfig: false,
      supportsNativeAudio: false,
      dialogueOnly: false,
    },
    {
      value: "seedance2",
      label: "Seedance 2",
      profile: "seedance2" as const,
      supportsAdvancedConfig: true,
      supportsNativeAudio: true,
      dialogueOnly: false,
    },
  ],
};
const audioModelsQuery = {
  data: [
    {
      value: "audio-speech-test",
      label: "Audio Speech Test",
      supportedModes: ["speech" as const],
    },
  ],
  isLoading: false,
};
const imageModelsQuery = {
  data: [
    { value: "render-a", label: "Render A" },
    { value: "render-b", label: "Render B" },
    { value: "sketch-a", label: "Sketch A" },
    { value: "sketch-b", label: "Sketch B" },
  ],
  isLoading: false,
};

const useBatchBarController = createUseBatchBarController(
  {
    useAssignColors: () => assignColorsMutation,
    useDetectIdentities: () => detectIdentitiesMutation,
    useGenerateAudio: () => generateAudioMutation,
    useGlobalOptimize: () => globalOptimizeMutation,
    useRenderSettings: () => renderSettingsQuery,
    useSketchSettings: () => sketchSettingsQuery,
    useUpdateRenderSettings: () => updateRenderSettingsMutation,
    useUpdateSketchSettings: () => updateSketchSettingsMutation,
    useAudioModels: () => audioModelsQuery,
    useImageModels: () => imageModelsQuery,
    useVideoModels: () => videoModelsQuery,
  },
  {
    formatCreditCost: (cost) => `credits:${cost}`,
    useGenerationCreditCost: (kind) =>
      kind === "beat_tts"
        ? { data: { data: { cost: 5 } } }
        : { data: { data: { display: "7" } } },
  },
);

const beats: Beat[] = [
  {
    beat_number: 1,
    narration_segment: "旁白",
    visual_description: "画面一",
    audio_type: "narration",
  },
  {
    beat_number: 2,
    narration_segment: "对白",
    visual_description: "画面二",
    audio_type: "dialogue",
  },
  {
    beat_number: 3,
    narration_segment: "手工镜头",
    visual_description: "画面三",
    audio_type: "narration",
    is_manual_shot: true,
  },
];

const defaultOptions: BatchBarControllerOptions = {
  beats,
  episode: 1,
  onSketchAspectRatioChange,
  project: "demo",
  sketchAspectRatio: "2:3",
  spineTemplate: "narrated",
  videoModel: "seedance2",
};

beforeEach(() => {
  assignColors.mockReset();
  detectIdentities.mockReset();
  generateAudio.mockReset();
  globalOptimize.mockReset();
  onSketchAspectRatioChange.mockReset();
  updateRenderSettings.mockReset();
  updateSketchSettings.mockReset();
  hookMocks.audioStart.mockReset();
  hookMocks.audioStarted = false;
  hookMocks.globalOnError = undefined;
  hookMocks.globalStart.mockReset();
  hookMocks.globalStarted = false;
  hookMocks.toastError.mockReset();
  hookMocks.toastInfo.mockReset();
  hookMocks.toastLoading.mockClear();
  hookMocks.toastSuccess.mockReset();
  assignColorsMutation.isPending = false;
  detectIdentitiesMutation.isPending = false;
  generateAudioMutation.isPending = false;
  globalOptimizeMutation.isPending = false;
  updateRenderSettingsMutation.isPending = false;
  updateSketchSettingsMutation.isPending = false;
});

describe("BatchBar controller", () => {
  it("projects model capabilities, visibility, and episode costs", () => {
    const { result, rerender } = renderHook(
      (options: BatchBarControllerOptions) =>
        useBatchBarController(options),
      { initialProps: defaultOptions },
    );

    expect(result.current.audioUnavailableForVideoModel).toBe(true);
    expect(result.current.detectIdentitiesCostDisplay).toBe("7");
    expect(result.current.episodeAudioCostDisplay).toBe("credits:10");
    expect(result.current.renderModel).toMatchObject({
      isLoading: false,
      isPending: false,
      isVisible: true,
      options: [
        { label: "Render A", value: "render-a" },
        { label: "Render B", value: "render-b" },
        { label: "Sketch A", value: "sketch-a" },
        { label: "Sketch B", value: "sketch-b" },
      ],
      value: "render-a",
    });
    expect(result.current.sketchAspectRatio).toBe("2:3");
    expect(result.current.sketchModel).toMatchObject({
      isLoading: false,
      isPending: false,
      isVisible: true,
      options: [
        { label: "Render A", value: "render-a" },
        { label: "Render B", value: "render-b" },
        { label: "Sketch A", value: "sketch-a" },
        { label: "Sketch B", value: "sketch-b" },
      ],
      value: "sketch-a",
    });
    expect(result.current.showEpisodeAudio).toBe(true);
    expect(result.current.showGlobalOptimize).toBe(true);

    rerender({
      ...defaultOptions,
      spineTemplate: "drama",
      videoModel: "standard",
    });

    expect(result.current.audioUnavailableForVideoModel).toBe(false);
    expect(result.current.showEpisodeAudio).toBe(false);
    expect(result.current.showGlobalOptimize).toBe(false);
  });

  it("updates render, sketch, and aspect settings through one controller", async () => {
    updateRenderSettings.mockResolvedValue({
      ok: true,
      data: renderSettingsQuery.data.data,
    });
    updateSketchSettings.mockResolvedValue({
      ok: true,
      data: sketchSettingsQuery.data.data,
    });
    const { result } = renderHook(() =>
      useBatchBarController(defaultOptions),
    );

    await act(async () => result.current.renderModel.onChange("render-b"));
    await act(async () => result.current.sketchModel.onChange("sketch-b"));
    act(() => result.current.onSketchAspectRatioChange("16:9"));

    expect(updateRenderSettings).toHaveBeenCalledWith({
      renderImageSelection: "render-b",
    });
    expect(updateSketchSettings).toHaveBeenCalledWith({
      sketchImageSelection: "sketch-b",
    });
    expect(onSketchAspectRatioChange).toHaveBeenCalledWith("16:9");
  });

  it("reports rejected model setting updates", async () => {
    updateRenderSettings.mockResolvedValue({
      ok: false,
      error: "Render 设置失败",
    });
    updateSketchSettings.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() =>
      useBatchBarController(defaultOptions),
    );

    await act(async () => result.current.renderModel.onChange("render-b"));
    await act(async () => result.current.sketchModel.onChange("sketch-b"));

    expect(hookMocks.toastError).toHaveBeenNthCalledWith(
      1,
      "Render 设置失败",
    );
    expect(hookMocks.toastError).toHaveBeenNthCalledWith(2, "common.error");
  });

  it("starts episode audio tracking and exposes response failures", async () => {
    generateAudio.mockResolvedValueOnce({
      ok: true,
      task_type: "audio_generation_indextts2",
      message: "started",
      scope: "audio-scope",
    });
    const { result } = renderHook(() =>
      useBatchBarController(defaultOptions),
    );

    await act(async () => result.current.onGenerateAudio());

    expect(generateAudio).toHaveBeenCalledWith({
      model: "audio-speech-test",
    });
    expect(hookMocks.audioStart).toHaveBeenCalledWith({
      scope: "audio-scope",
    });

    generateAudio.mockResolvedValueOnce({ ok: false, error: "缺少声线" });
    await act(async () => result.current.onGenerateAudio());

    expect(result.current.errorDialog).toEqual({
      title: "episode.workbench.batch.genAudioTitle",
      description: "缺少声线",
    });
    act(() => result.current.onDismissError());
    expect(result.current.errorDialog).toBeNull();
  });

  it("tracks global optimization and forwards task failures to the dialog", async () => {
    globalOptimize.mockResolvedValue({
      ok: true,
      task_type: "global_optimize_video",
      message: "started",
    });
    const { result } = renderHook(() =>
      useBatchBarController(defaultOptions),
    );

    await act(async () => result.current.onGlobalOptimize());

    expect(hookMocks.globalStart).toHaveBeenCalledTimes(1);
    expect(hookMocks.toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.batch.globalOptimizeStarted",
    );

    act(() => hookMocks.globalOnError?.("优化任务失败"));
    expect(result.current.errorDialog).toEqual({
      title: "episode.workbench.batch.aiOptimizeTitle",
      description: "优化任务失败",
    });
  });

  it("reports populated, empty, rejected, and failed identity detection", async () => {
    detectIdentities
      .mockResolvedValueOnce({
        ok: true,
        data: {
          detections: {},
          total_beats: 3,
          total_identities: 2,
          total_props: 1,
          review_message: "review",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          detections: {},
          total_beats: 3,
          total_identities: 0,
          total_props: 0,
        },
      })
      .mockResolvedValueOnce({ ok: false, error: "检测被拒绝" })
      .mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() =>
      useBatchBarController(defaultOptions),
    );

    await act(async () => result.current.onDetectIdentities());
    expect(hookMocks.toastSuccess).toHaveBeenCalledWith(
      "detected:3:2:1\nreview",
      { id: "toast-1" },
    );

    await act(async () => result.current.onDetectIdentities());
    expect(hookMocks.toastInfo).toHaveBeenCalledWith(
      "episode.workbench.batch.aiDetectEmpty\nepisode.workbench.batch.aiDetectReview",
      { id: "toast-1" },
    );

    await act(async () => result.current.onDetectIdentities());
    expect(hookMocks.toastError).toHaveBeenCalledWith("检测被拒绝", {
      id: "toast-1",
    });

    await act(async () => result.current.onDetectIdentities());
    expect(hookMocks.toastError).toHaveBeenCalledWith("network", {
      id: "toast-1",
    });
  });

  it("forces color reassignment and reports its result", async () => {
    assignColors.mockResolvedValue({
      ok: true,
      data: { colors: {}, count: 2, prop_count: 1 },
    });
    const { result } = renderHook(() =>
      useBatchBarController(defaultOptions),
    );

    await act(async () => result.current.onReassignColors());

    expect(assignColors).toHaveBeenCalledWith({ force: true });
    expect(hookMocks.toastSuccess).toHaveBeenCalledWith("colored:2:1");
  });
});
