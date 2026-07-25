// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUseBeatVideoGenerationController } from "@/modules/production/application/use-beat-video-generation-controller";
import type { BeatVideoGenerationInput } from "@/modules/production/domain/beat-video-generation";
import {
  parseSeedance2Config,
  type Seedance2ConfigDraft,
} from "@/modules/production/domain/video-config";

const regenerate = vi.hoisted(() => vi.fn());
const taskStart = vi.hoisted(() => vi.fn());
const taskStop = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use-task-controller", () => ({
  useTaskController: () => ({
    start: taskStart,
    started: false,
    stop: taskStop,
    stopping: false,
    stream: { progress: 0.25 },
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const useController = createUseBeatVideoGenerationController(
  {
    useRegenerateBeatVideo: () => ({
      isPending: false,
      mutateAsync: regenerate,
    }),
  },
  {
    useGenerationCreditCost: () => ({
      data: { data: { display: "12" } },
    }),
  },
);

function makeDraft(
  overrides: Partial<Seedance2ConfigDraft> = {},
): Seedance2ConfigDraft {
  return {
    ...parseSeedance2Config("", "9:16"),
    final_prompt: "镜头提示词",
    ...overrides,
  };
}

function makeGenerationInput(): BeatVideoGenerationInput {
  const sourceConfig = makeDraft({ resolution: "1080p" });
  return {
    backend: "newapi_seedance-2.0-fast",
    beatNumber: 1,
    kind: "seedance2",
    dirty: false,
    draft: sourceConfig,
    isValueStyle: false,
    resolutionOptions: ["720p"],
    sourceConfig,
  };
}

function renderController(
  overrides: Partial<{
    applyNormalizedDraft(draft: Seedance2ConfigDraft): void;
    generationInput: BeatVideoGenerationInput;
    prompt: string;
    promptKind: "legacy" | "seedance2";
    saveDraft(draft: Seedance2ConfigDraft): Promise<boolean>;
  }> = {},
) {
  return renderHook(() =>
    useController({
      beatNumber: 1,
      episode: 2,
      generationInput:
        overrides.generationInput ?? makeGenerationInput(),
      project: "demo",
      prompt: overrides.prompt ?? "镜头提示词",
      promptKind: overrides.promptKind ?? "seedance2",
      applyNormalizedDraft:
        overrides.applyNormalizedDraft ?? vi.fn(),
      saveDraft:
        overrides.saveDraft ?? vi.fn().mockResolvedValue(true),
    }),
  );
}

describe("beat video generation controller", () => {
  beforeEach(() => {
    regenerate.mockReset();
    regenerate.mockResolvedValue({
      ok: true,
      task_type: "single_video",
      message: "已启动",
    });
    taskStart.mockReset();
    taskStop.mockReset();
    taskStop.mockResolvedValue(undefined);
    toastError.mockReset();
    toastSuccess.mockReset();
  });

  it("blocks confirmation when the configured prompt is empty", () => {
    const { result } = renderController({ prompt: "" });

    act(() => result.current.requestGeneration());

    expect(result.current.confirmationOpen).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      "episode.workbench.video.seedance2PromptRequired",
    );
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("opens confirmation for a valid prompt", () => {
    const { result } = renderController();

    act(() => result.current.requestGeneration());

    expect(result.current.confirmationOpen).toBe(true);
    expect(result.current.costDisplay).toBe("12");
    expect(result.current.progress).toBe(0.25);
  });

  it("normalizes, saves, and starts generation in order", async () => {
    const applyNormalizedDraft = vi.fn();
    const saveDraft = vi.fn().mockResolvedValue(true);
    const { result } = renderController({
      applyNormalizedDraft,
      saveDraft,
    });

    await act(async () => {
      await result.current.confirmGeneration();
    });

    expect(applyNormalizedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "720p" }),
    );
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "720p" }),
    );
    expect(saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      regenerate.mock.invocationCallOrder[0],
    );
    expect(regenerate).toHaveBeenCalledWith({
      beatNum: 1,
      videoBackend: "newapi_seedance-2.0-fast",
    });
    expect(taskStart).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.video.started",
    );
  });

  it("does not start a task after a backend rejection", async () => {
    regenerate.mockResolvedValueOnce({ ok: false, error: "生成被拒绝" });
    const { result } = renderController();

    await act(async () => {
      await result.current.confirmGeneration();
    });

    expect(toastError).toHaveBeenCalledWith("生成被拒绝");
    expect(taskStart).not.toHaveBeenCalled();
  });

  it("delegates task cancellation", async () => {
    const { result } = renderController();

    await act(async () => {
      await result.current.stopGeneration();
    });

    expect(taskStop).toHaveBeenCalledTimes(1);
  });
});
