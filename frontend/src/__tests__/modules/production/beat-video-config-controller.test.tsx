// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Beat } from "@/modules/narrative_planning/public";
import { createUseBeatVideoConfigController } from "@/modules/production/application/use-beat-video-config-controller";
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

const useController = createUseBeatVideoConfigController(
  {
    useGenerateVideoPrompt: () => ({
      isPending: false,
      mutateAsync: generatePrompt,
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
    video_config_json: JSON.stringify({
      mode: "multimodal_reference",
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
    value: "video-model-reference",
    label: "Video Model Reference",
    workflow: "advanced-reference",
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
    showAdvancedVideoConfig: boolean;
    showReferenceVideoConfig: boolean;
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
        showAdvancedVideoConfig: overrides.showAdvancedVideoConfig ?? true,
        showReferenceVideoConfig: overrides.showReferenceVideoConfig ?? false,
        refetchStatus: vi.fn(),
        updateBeat,
      }),
      { wrapper },
    ),
  };
}

describe("VideoReference config controller", () => {
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
    expect(JSON.parse(command.data.video_config_json)).toMatchObject({
      final_prompt: "更新后的提示词",
      prompt_source: "manual",
    });
  });

  it("normalizes unsupported settings from declared capabilities", () => {
    const { result } = renderController({
      model: "video-model-a",
      beat: makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          resolution: "480p",
          final_prompt: "主体提示词",
        }),
      }),
      selectedModel: makeModel({
        value: "video-model-a",
        resolutionOptions: ["720p", "1080p"],
        sceneOptimizeOptions: ["anime", "realistic"],
      }),
    });

    expect(result.current.draft.resolution).toBe("720p");
    expect(result.current.draft.scene_optimize).toBe("anime");
  });

  it("uses catalog-declared resolution options", () => {
    const { result } = renderController({
      model: "catalog-route-without-model-family-name",
      selectedModel: makeModel({
        value: "catalog-route-without-model-family-name",
        apiModel: "provider/video-model-a",
        resolutionOptions: ["480p", "720p", "1080p"],
      }),
    });

    expect(result.current.videoResolutionOptions).toEqual([
      "480p",
      "720p",
      "1080p",
    ]);
  });

  it("keeps H3 quality and ratio as independent visible controls", () => {
    const h3 = makeModel({
      value: "cloud:video-model-c",
      apiModel: "video-model-c",
      routeSelector: "cloud:video-model-c",
      workflow: "advanced-reference",
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
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
          duration: 4,
          resolution: "720p",
          ratio: "9:16",
          final_prompt: "主体提示词",
        }),
      }),
    });

    expect(result.current.videoResolutionOptions).toEqual(["768p"]);
    expect(result.current.draft.resolution).toBe("768p");
    expect(result.current.generationInput).toMatchObject({
      kind: "advanced",
      model: "video-model-c",
      modelSelector: "cloud:video-model-c",
      resolutionOptions: ["768p"],
      sizeOptions: ["1344x768", "768x1344", "1024x1024"],
    });

    act(() => result.current.updateDraft("ratio", "16:9"));

    expect(result.current.videoResolutionOptions).toEqual(["768p"]);
    expect(result.current.draft.resolution).toBe("768p");
  });

  it("submits prompt generation to the task controller", async () => {
    generatePrompt.mockResolvedValue({
      ok: true,
      task_type: "video_prompt_optimization",
      task_id: "task-video-reference-1",
      task_key: "videoReference_prompt:demo:1:1",
      message: "任务已提交",
      scope: "videoReference_prompt:1",
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
    expect(toastSuccess).toHaveBeenCalledWith("任务已提交");
  });

  it("does not submit an unchanged generated prompt as a manual reference", async () => {
    generatePrompt.mockResolvedValue({
      ok: true,
      task_type: "video_prompt_optimization",
      task_id: "task-video-reference-2",
      task_key: "videoReference_prompt:demo:1:1",
      message: "任务已提交",
      scope: "videoReference_prompt:1",
    });
    const { result } = renderController({
      beat: makeBeat({
        video_config_json: JSON.stringify({
          mode: "multimodal_reference",
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
