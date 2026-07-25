// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Beat } from "@/modules/narrative_planning/public";
import { createUseSeedance2ConfigController } from "@/modules/production/application/use-seedance2-config-controller";
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";

const generatePrompt = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
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

function makeBackend(
  overrides: Partial<VideoBackendOption> = {},
): VideoBackendOption {
  return {
    value: "newapi_seedance-2.0-fast",
    label: "Seedance 2.0 Fast",
    is_default: true,
    is_seedance2: true,
    dialogue_only: false,
    min_duration: 4,
    max_duration: 15,
    ...overrides,
  };
}

function renderController(
  overrides: Partial<{
    backend: string;
    beat: Beat;
    selectedBackend: VideoBackendOption;
    showGrokVideoConfig: boolean;
    showHappyHorseConfig: boolean;
    showSeedance2Config: boolean;
  }> = {},
  updateBeat = vi.fn().mockResolvedValue(undefined),
) {
  const selectedBackend = overrides.selectedBackend ?? makeBackend();
  return {
    updateBeat,
    ...renderHook(() =>
      useController({
        backend: overrides.backend ?? selectedBackend.value,
        beat: overrides.beat ?? makeBeat(),
        episode: 1,
        project: "demo",
        projectAspect: "2:3",
        selectedBackend,
        showGrokVideoConfig: overrides.showGrokVideoConfig ?? false,
        showHappyHorseConfig: overrides.showHappyHorseConfig ?? false,
        showSeedance2Config: overrides.showSeedance2Config ?? true,
        refetchStatus: vi.fn(),
        updateBeat,
      }),
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
      backend: "newapi_seedance-2.0-value",
      beat: makeBeat({
        seedance2_config_json: JSON.stringify({
          mode: "multimodal_reference",
          mode_user_set: true,
          resolution: "480p",
          final_prompt: "主体提示词",
        }),
      }),
      selectedBackend: makeBackend({
        value: "newapi_seedance-2.0-value",
        resolution_options: ["720p", "1080p"],
      }),
    });

    expect(result.current.draft.resolution).toBe("720p");
    expect(result.current.draft.scene_optimize).toBe("anime");
  });

  it("uses the rounded audio duration as the Seedance 1.5 floor", () => {
    const backend = makeBackend({
      value: "newapi_seedance-1.5-pro",
      is_seedance2: false,
      min_duration: 4,
      max_duration: 12,
      resolution_options: ["720p", "1080p"],
    });
    const { result } = renderController({
      backend: backend.value,
      beat: makeBeat({ audio_duration_seconds: 6.2 }),
      selectedBackend: backend,
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

  it("applies a generated prompt response to the current beat", async () => {
    generatePrompt.mockResolvedValue({
      ok: true,
      data: {
        beat: makeBeat(),
        final_prompt: "优化后的提示词",
        seedance2_config_json: JSON.stringify({
          mode: "multimodal_reference",
          mode_user_set: true,
          duration: 5,
          resolution: "720p",
          ratio: "9:16",
          final_prompt: "优化后的提示词",
        }),
      },
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
    expect(result.current.draft.final_prompt).toBe("优化后的提示词");
    expect(result.current.promptCostDisplay).toBe("6");
    expect(toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.video.seedance2PromptGenerated",
    );
  });
});
