// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUseVideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";

const select = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { n?: number; time?: string; value?: string }) =>
      key === "episode.workbench.video.switched"
        ? `Beat #${values?.n} 已切换版本`
        : key === "common.generatedAgo.hour"
          ? `${values?.value}小时前`
          : key === "common.generatedAgo.tooltip"
            ? `生成于 ${values?.time}`
          : "切换失败",
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const useVideoPaneMediaController = createUseVideoPaneMediaController(
  {
    useVideoPool: () => ({
      data: {
        ok: true,
        data: {
          episode: 2,
          beat_assignments: { "3": "new" },
          videos: [
            {
              id: "old",
              beat_num: 3,
              video_path: "old.mp4",
              video_url: "/static/old.mp4",
              generated_at: "2026-07-25T08:00:00Z",
              duration: 5,
              video_mode: "first_frame",
              video_model: "video-model-reference",
              prompt: "old",
            },
            {
              id: "new",
              beat_num: 3,
              video_path: "new.mp4",
              video_url: "/static/new.mp4",
              generated_at: "2026-07-25T09:00:00Z",
              duration: 5,
              video_mode: "first_frame",
              video_model: "configured",
              prompt: "new",
            },
            {
              id: "other-beat",
              beat_num: 4,
              video_path: "other.mp4",
              video_url: "/static/other.mp4",
              generated_at: "2026-07-25T10:00:00Z",
              duration: 5,
              video_mode: "first_frame",
              video_model: "configured",
              prompt: "other",
            },
          ],
        },
      },
    }),
    useVideoPoolSelect: () => ({
      isPending: false,
      mutateAsync: select,
    }),
    useVideoPoolDelete: () => ({
      isPending: false,
      mutateAsync: remove,
    }),
  },
  { useNow: () => Date.parse("2026-07-25T10:00:00Z") },
);

const options = {
  beatNumber: 3,
  episode: 2,
  project: "demo",
  state: "ready" as const,
  videoActive: true,
  videoModels: [
    { value: "configured", label: "配置模型" },
    {
      value: "cloud:video-model-reference",
      apiModel: "video-model-reference",
      label: "Video Model Reference",
    },
  ],
  videoProgress: 0.426,
  videoUrl: "/static/current.mp4",
  useVideoReferencePreview: true,
};

describe("Production video pane media controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockResolvedValue({ ok: true });
    remove.mockResolvedValue({ ok: true });
  });

  it("projects the current preview and sorted beat candidates", () => {
    const { result } = renderHook(() => useVideoPaneMediaController(options));

    expect(result.current).toMatchObject({
      candidateCount: 2,
      downloadUrl: "/static/current.mp4",
      hasGeneratedVideo: true,
      previewSource: "/static/current.mp4#t=0.1",
      videoTask: { status: "running", progress: 0.426 },
    });
    expect(result.current.candidates).toEqual([
      expect.objectContaining({
        active: true,
        modelLabel: "配置模型",
        id: "new",
        previewSource: "/static/new.mp4#t=0.1",
        timeLabel: "1小时前",
        timeTooltip: "生成于 1小时前",
      }),
      expect.objectContaining({
        active: false,
        modelLabel: "Video Model Reference",
        id: "old",
        timeLabel: "2小时前",
        timeTooltip: "生成于 2小时前",
      }),
    ]);
  });

  it("ignores the active candidate and selects a different version", async () => {
    const { result } = renderHook(() => useVideoPaneMediaController(options));

    await act(() => result.current.selectCandidate("new"));
    expect(select).not.toHaveBeenCalled();

    await act(() => result.current.selectCandidate("old"));
    expect(select).toHaveBeenCalledWith({ beatNum: 3, poolId: "old" });
    expect(toastSuccess).toHaveBeenCalledWith("Beat #3 已切换版本");
  });

  it("reports selection failures", async () => {
    select.mockRejectedValueOnce(new Error("failed"));
    const { result } = renderHook(() => useVideoPaneMediaController(options));

    await act(() => result.current.selectCandidate("old"));

    expect(toastError).toHaveBeenCalledWith("切换失败");
  });

  it("deletes an inactive candidate", async () => {
    const { result } = renderHook(() => useVideoPaneMediaController(options));

    await act(() => result.current.deleteCandidate("old"));

    expect(remove).toHaveBeenCalledWith({ poolId: "old" });
  });
});
