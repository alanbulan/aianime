// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUseVideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";

const select = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { n?: number }) =>
      key === "episode.workbench.video.switched"
        ? `Beat #${values?.n} 已切换版本`
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
              backend: "newapi_seedance-2.0-fast",
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
              backend: "configured",
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
              backend: "configured",
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
  },
  { useNow: () => Date.parse("2026-07-25T10:00:00Z") },
);

const options = {
  beatNumber: 3,
  episode: 2,
  project: "demo",
  state: "ready" as const,
  videoActive: true,
  videoBackends: [{ value: "configured", label: "配置模型" }],
  videoProgress: 0.426,
  videoUrl: "/static/current.mp4",
  useSeedance2Preview: true,
};

describe("Production video pane media controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockResolvedValue({ ok: true });
  });

  it("projects the current preview and sorted beat candidates", () => {
    const { result } = renderHook(() => useVideoPaneMediaController(options));

    expect(result.current).toMatchObject({
      candidateCount: 2,
      downloadUrl: "/static/current.mp4",
      hasGeneratedVideo: true,
      previewSource: "/static/current.mp4#t=0.1",
      videoPercent: 43,
    });
    expect(result.current.candidates).toEqual([
      expect.objectContaining({
        active: true,
        backendLabel: "配置模型",
        id: "new",
        previewSource: "/static/new.mp4#t=0.1",
        timeLabel: "1.0h",
      }),
      expect.objectContaining({
        active: false,
        backendLabel: "Seedance 2.0-fast",
        id: "old",
        timeLabel: "2.0h",
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
});
