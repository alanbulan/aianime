// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Beat } from "@/modules/narrative_planning/public";
import { createUseSeedance2ConfigController } from "@/modules/production/application/use-seedance2-config-controller";
import type { VideoModelOption } from "@/modules/production/domain/video-model";
import { TaskControllerProvider } from "@/modules/task_execution/public";

const generatePrompt = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

vi.mock("@/modules/task_execution/presentation/useTaskStream", () => ({
  useTaskStream: () => ({
    status: "idle" as const,
    progress: 0,
    currentTask: "",
    result: null,
    error: null,
    logs: [],
  }),
}));

const useController = createUseSeedance2ConfigController(
  {
    useGenerateSeedance2Prompt: () => ({
      isPending: false,
      mutateAsync: generatePrompt,
    }),
  },
  {
    useGenerationCreditCost: () => ({
      data: { data: { display: "6" } },
    }),
  },
);

function makeBeat(overrides: Partial<Beat> = {}): Beat {
  return {
    beat_number: 1,
    narration_segment: "旁白",
    visual_description: "画面",
    audio_type: "narration",
    video_mode: "first_frame",
    detected_identities: [],
    video_prompt: "视频提示词",
    keyframe_prompt: "",
    seedance2_config_json: JSON.stringify({
      mode: "multimodal_reference",
      mode_user_set: true,
      duration: 5,
      resolution: "720p",
      ratio: "9:16",
      final_prompt: "主体提示词",
    }),
    ...overrides,
  };
}

function makeModel(
  overrides: Partial<VideoModelOption> = {},
): VideoModelOption {
  return {
    value: "seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    profile: "seedance2",
    supportsAdvancedConfig: true,
    supportsNativeAudio: true,
    dialogueOnly: false,
    minDuration: 4,
    maxDuration: 15,
    ...overrides,
  };
}

function renderController(
  overrides: Partial<{
    model: string;
    beat: Beat;
    selectedModel: VideoModelOption;
    showGrokVideoConfig: boolean;
    showHappyHorseConfig: boolean;
    showSeedance2Config: boolean;
  }> = {},
  updateBeat = vi.fn().mockResolvedValue(undefined),
) {
  const selectedModel = overrides.selectedModel ?? makeModel();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TaskControllerProvider project="demo" episode={1}>
        {children}
      </TaskControllerProvider>
    </QueryClientProvider>
  );
  return {
    updateBeat,
    ...renderHook(() =>
      useController({
        model: overrides.model ?? selectedModel.value,
        beat: overrides.beat ?? makeBeat(),
        episode: 1,
        project: "demo",
        projectAspect: "2:3",
        selectedModel,
        showGrokVideoConfig: overrides.showGrokVideoConfig ?? false,
        showHappyHorseConfig: overrides.showHappyHorseConfig ?? false,
        showSeedance2Config: overrides.showSeedance2Config ?? true,
        refetchStatus: vi.fn(),
        updateBeat,
      }),
      { wrapper },
    ),
  };
}

describe("Seedance2 config controller", () => {
  beforeEach(() => {
    generatePrompt.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("autosaves a changed draft after the existing delay", async () => {
    vi.useFakeTimers();
    const { result, updateBeat } = renderController();

    act(() => result.current.updateDraft("final_prompt", "更新后的提示词"));
    await act(async () => {
      vi.advanceTimersByTime(800);
      await Promise.resolve();
    });

    expect(updateBeat).toHaveBeenCalledTimes(1);
    const command = updateBeat.mock.calls[0][0];
    expect(JSON.parse(command.data.seedance2_config_json)).toMatchObject({
      final_prompt: "更新后的提示词",
      prompt_source: "manual",
    });
  });

  it("normalizes an unsupported value-model resolution", () => {
    const { result } = renderController({
      model: "seedance-2.0-value",
      beat: makeBeat({
        seedance2_config_json: JSON.stringify({
          mode: "multimodal_reference",
          mode_user_set: true,
          resolution: "480p",
          final_prompt: "主体提示词",
        }),
      }),
      selectedModel: makeModel({
        value: "seedance-2.0-value",
        resolutionOptions: ["720p", "1080p"],
      }),
    });

    expect(result.current.draft.resolution).toBe("720p");
    expect(result.current.draft.scene_optimize).toBe("anime");
  });

  it("prefers catalog-declared Seedance resolution options over the route name", () => {
    const { result } = renderController({
      model: "catalog-route-without-model-family-name",
      selectedModel: makeModel({
        value: "catalog-route-without-model-family-name",
        apiModel: "provider/seedance-2.0",
        resolutionOptions: ["480p", "720p", "1080p"],
      }),
    });

    expect(result.current.seedance2ResolutionOptions).toEqual([
      "480p",
      "720p",
      "1080p",
    ]);
  });

  it("keeps H3 quality and ratio as independent visible controls", () => {
    const h3 = makeModel({
      value: "cloud:MINIMAX_H3",
      apiModel: "MINIMAX_H3",
      routeSelector: "cloud:MINIMAX_H3",
      profile: "standard",
      minDuration: 1,
      ratioOptions: ["16:9", "9:16", "1:1"],
      resolutionOptions: ["768p"],
      sizeOptions: ["1344x768", "768x1344", "1024x1024"],
      supportedModes: ["IMAGE_TO_VIDEO", "MULTIMODAL_REFERENCE"],
    });
    const { result } = renderController({
      model: h3.value,
      selectedModel: h3,
      beat: makeBeat({
        seedance2_config_json: JSON.stringify({
          mode: "multimodal_reference",
          mode_user_set: true,
          duration: 4,
          resolution: "720p",
          ratio: "9:16",
          final_prompt: "主体提示词",
        }),
      }),
    });

    expect(result.current.seedance2ResolutionOptions).toEqual(["768p"]);
    expect(result.current.draft.resolution).toBe("768p");
    expect(result.current.generationInput).toMatchObject({
      kind: "seedance2",
      model: "MINIMAX_H3",
      modelSelector: "cloud:MINIMAX_H3",
      resolutionOptions: ["768p"],
      sizeOptions: ["1344x768", "768x1344", "1024x1024"],
    });

    act(() => result.current.updateDraft("ratio", "16:9"));

    expect(result.current.seedance2ResolutionOptions).toEqual(["768p"]);
    expect(result.current.draft.resolution).toBe("768p");
  });

  it("uses the rounded audio duration as the Seedance 1.5 floor", () => {
    const model = makeModel({
      value: "seedance-1.5-pro",
      profile: "standard",
      supportsAdvancedConfig: false,
      supportsNativeAudio: false,
      minDuration: 4,
      maxDuration: 12,
      resolutionOptions: ["720p", "1080p"],
    });
    const { result } = renderController({
      model: model.value,
      beat: makeBeat({ audio_duration_seconds: 6.2 }),
      selectedModel: model,
      showSeedance2Config: false,
    });

    expect(result.current.isSeedance15ProConfig).toBe(true);
    expect(result.current.seedance15DurationBounds).toEqual({
      min: 7,
      max: 12,
    });
    expect(result.current.seedance15Duration).toBe(7);
    expect(result.current.generationInput).toMatchObject({
      kind: "legacy",
      seedance15: { duration: 7, resolution: "720p" },
    });
  });

  it("submits prompt generation to the task controller", async () => {
    generatePrompt.mockResolvedValue({
      ok: true,
      task_type: "seedance2_prompt",
      task_id: "task-seedance2-1",
      task_key: "seedance2_prompt:demo:1:1",
      message: "任务已提交",
      scope: "seedance2_prompt:1",
    });
    const { result } = renderController();

    await act(async () => {
      await result.current.generatePrompt();
    });

    expect(generatePrompt).toHaveBeenCalledWith({
      beatNum: 1,
      manualPromptReference: "主体提示词",
      promptGuidance: "",
    });
    expect(result.current.draft.final_prompt).toBe("主体提示词");
    expect(result.current.promptPending).toBe(true);
    expect(result.current.promptCostDisplay).toBe("6");
    expect(toastSuccess).toHaveBeenCalledWith("任务已提交");
  });

  it("does not submit an unchanged generated prompt as a manual reference", async () => {
    generatePrompt.mockResolvedValue({
      ok: true,
      task_type: "seedance2_prompt",
      task_id: "task-seedance2-2",
      task_key: "seedance2_prompt:demo:1:1",
      message: "任务已提交",
      scope: "seedance2_prompt:1",
    });
    const { result } = renderController({
      beat: makeBeat({
        seedance2_config_json: JSON.stringify({
          mode: "multimodal_reference",
          mode_user_set: true,
          duration: 5,
          resolution: "720p",
          ratio: "9:16",
          final_prompt: "上一轮生成稿 Привет",
          prompt_source: "generated",
        }),
      }),
    });

    await act(async () => {
      await result.current.generatePrompt();
    });

    expect(generatePrompt).toHaveBeenCalledWith({
      beatNum: 1,
      promptGuidance: "",
    });
  });
});
