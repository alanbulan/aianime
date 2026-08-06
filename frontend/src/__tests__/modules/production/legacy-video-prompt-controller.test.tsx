// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Beat } from "@/modules/narrative_planning/public";
import { createUseLegacyVideoPromptController } from "@/modules/production/application/use-legacy-video-prompt-controller";

const generatePrompt = vi.hoisted(() => vi.fn());
const taskStart = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/modules/task_execution/public", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  useTaskController: () => ({
    start: taskStart,
    started: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const useController = createUseLegacyVideoPromptController(
  {
    useGenerateBeatVideoPrompt: () => ({
      isPending: false,
      mutateAsync: generatePrompt,
    }),
  },
  {
    useGenerationCreditCost: () => ({
      data: { data: { display: "5" } },
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
    video_prompt: "原视频提示词",
    keyframe_prompt: "原关键帧提示词",
    ...overrides,
  };
}

describe("legacy video prompt controller", () => {
  beforeEach(() => {
    generatePrompt.mockReset();
    taskStart.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("selects the prompt field and follows beat changes", () => {
    const updateBeat = vi.fn();
    const { result, rerender } = renderHook(
      ({ beat }) =>
        useController({
          beat,
          episode: 1,
          project: "demo",
          updateBeat,
        }),
      { initialProps: { beat: makeBeat() } },
    );

    expect(result.current.field).toBe("video_prompt");
    expect(result.current.prompt).toBe("原视频提示词");
    expect(result.current.costDisplay).toBe("5");

    rerender({
      beat: makeBeat({
        beat_number: 2,
        video_mode: "keyframe",
        keyframe_prompt: "第二镜头转场",
      }),
    });

    expect(result.current.field).toBe("keyframe_prompt");
    expect(result.current.prompt).toBe("第二镜头转场");
  });

  it("saves only a changed prompt to the selected field", async () => {
    const updateBeat = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useController({
        beat: makeBeat({ video_mode: "keyframe" }),
        episode: 1,
        project: "demo",
        updateBeat,
      }),
    );

    await act(async () => {
      await result.current.savePrompt();
    });
    expect(updateBeat).not.toHaveBeenCalled();

    act(() => result.current.setPrompt("更新后的转场"));
    await act(async () => {
      await result.current.savePrompt();
    });

    expect(updateBeat).toHaveBeenCalledWith({
      beatNum: 1,
      data: { keyframe_prompt: "更新后的转场" },
    });
  });

  it("applies a synchronous generated prompt", async () => {
    generatePrompt.mockResolvedValue({
      ok: true,
      data: {
        beat: makeBeat({ video_prompt: "生成结果" }),
        field: "video_prompt",
        prompt: "生成结果",
      },
    });
    const { result } = renderHook(() =>
      useController({
        beat: makeBeat(),
        episode: 1,
        project: "demo",
        updateBeat: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.generatePrompt();
    });

    expect(generatePrompt).toHaveBeenCalledWith({ beatNum: 1 });
    expect(result.current.prompt).toBe("生成结果");
    expect(toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.video.beatVideoPromptGenerated",
    );
  });

  it("starts task tracking for an asynchronous generation response", async () => {
    generatePrompt.mockResolvedValue({
      ok: true,
      task_type: "beat_video_prompt",
      message: "已入队",
    });
    const { result } = renderHook(() =>
      useController({
        beat: makeBeat(),
        episode: 1,
        project: "demo",
        updateBeat: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.generatePrompt();
    });

    expect(taskStart).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.video.beatVideoPromptGenerateStarted",
    );
  });

  it("reports response and request failures", async () => {
    generatePrompt
      .mockResolvedValueOnce({ ok: false, error: "生成被拒绝" })
      .mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() =>
      useController({
        beat: makeBeat(),
        episode: 1,
        project: "demo",
        updateBeat: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.generatePrompt();
      await result.current.generatePrompt();
    });

    expect(toastError).toHaveBeenNthCalledWith(1, "生成被拒绝");
    expect(toastError).toHaveBeenCalledTimes(2);
  });
});
