// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Beat, Episode } from "@/modules/narrative_planning/public";
import { createUseEpisodeComposePageController } from "@/modules/production/application/use-episode-compose-page-controller";

const composeEpisode = vi.hoisted(() => vi.fn());
const downloadFile = vi.hoisted(() => vi.fn());
const exportEpisode = vi.hoisted(() => vi.fn());
const taskStart = vi.hoisted(() => vi.fn());
const updateProject = vi.hoisted(() => vi.fn());
let finalVideoUrl = "/static/final.mp4";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { n?: number }) =>
      options?.n ? `${key}:${options.n}` : key,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

const task = {
  logs: [],
  start: taskStart,
  started: false,
  stop: vi.fn().mockResolvedValue(undefined),
  stopping: false,
  stream: {
    currentTask: "",
    error: null,
    logs: [],
    progress: 0,
    result: null,
    status: "idle" as const,
  },
};

const useController = createUseEpisodeComposePageController(
  {
    useComposeEpisode: () => ({
      isPending: false,
      mutateAsync: composeEpisode,
    }),
    useEpisodeBeats: () => ({
      data: {
        ok: true,
        data: [
          { estimated_duration: 31.2 } as Beat,
          { estimated_duration: 30 } as Beat,
        ],
      },
      isLoading: false,
    }),
    useEpisodeDetail: () => ({
      data: {
        ok: true,
        data: { number: 2, title: "第二集" } as Episode,
      },
    }),
    useFinalVideo: () => ({
      data: {
        data: { exists: true, video_url: finalVideoUrl },
      },
    }),
    useProject: () => ({
      data: {
        add_subtitles: false,
        add_bgm: true,
        aspect_ratio: "16:9",
        video_resolution: "1080x1920",
      },
    }),
    useUpdateProject: () => ({ mutateAsync: updateProject }),
  },
  {
    downloadFile,
    exportEpisode,
    useBeatStates: () => ({
      counts: {
        audio: { active: 0, failed: 0, ready: 2, total: 2 },
        compose: { missing: [], ready: true },
        script: { active: 0, failed: 0, ready: 2, total: 2 },
        sketch: { active: 0, failed: 0, ready: 2, total: 2 },
        video: { active: 0, failed: 0, ready: 2, total: 2 },
      },
    }),
    useTaskController: () => task,
  },
);

function renderController() {
  return renderHook(() =>
    useController({
      episode: 2,
      onOpenBeat: vi.fn(),
      project: "demo",
    }),
  );
}

describe("episode compose page controller", () => {
  beforeEach(() => {
    composeEpisode.mockReset();
    composeEpisode.mockResolvedValue({ ok: true });
    downloadFile.mockReset();
    exportEpisode.mockReset();
    exportEpisode.mockResolvedValue(new Blob(["data"]));
    taskStart.mockReset();
    updateProject.mockReset();
    updateProject.mockResolvedValue({});
    finalVideoUrl = "/static/final.mp4";
  });

  it("preserves explicit export dimensions independently of the project orientation", async () => {
    const { result } = renderController();

    await waitFor(() => {
      expect(result.current.resolution).toBe("1080x1920");
      expect(result.current.addSubtitles).toBe(false);
      expect(result.current.addBgm).toBe(true);
      expect(result.current.resultUrl).toBe("/static/final.mp4");
    });
    expect(result.current.displayTitle).toBe("第二集");
    expect(result.current.durationLabel).toBe("1:01");

    act(() => result.current.handleResolutionChange("720x1280"));
    expect(result.current.resolution).toBe("720x1280");
    expect(updateProject).toHaveBeenCalledWith({
      video_resolution: "720x1280",
    });

    act(() => result.current.handleAddSubtitlesChange());
    expect(updateProject).toHaveBeenCalledWith({ add_subtitles: true });
    act(() => result.current.handleAddBgmChange());
    expect(updateProject).toHaveBeenCalledWith({ add_bgm: false });
  });

  it("starts composition with the selected subtitle and resolution settings", async () => {
    const { result } = renderController();

    await act(async () => {
      await result.current.handleCompose();
    });

    expect(composeEpisode).toHaveBeenCalledWith({
      addBgm: true,
      addSubtitles: false,
      resolution: "1080x1920",
    });
    expect(taskStart).toHaveBeenCalledTimes(1);
  });

  it("recomposes an existing video with the selected portrait frame and subtitles", async () => {
    const { result } = renderController();
    act(() => result.current.handleResolutionChange("1920x1080"));
    expect(result.current.resolution).toBe("1920x1080");
    act(() => {
      result.current.handleResolutionChange("1080x1920");
      result.current.handleAddSubtitlesChange();
    });
    await act(async () => {
      await result.current.handleCompose();
    });
    expect(composeEpisode).toHaveBeenCalledWith({
      addBgm: true,
      addSubtitles: true,
      resolution: "1080x1920",
    });
  });

  it("delegates all exports and applies stable filenames", async () => {
    const { result } = renderController();

    await act(async () => {
      await result.current.handleDownloadVideo();
      await result.current.handleExport("srt");
      await result.current.handleExport("zip");
    });

    expect(exportEpisode).toHaveBeenNthCalledWith(1, "demo", 2, "video");
    expect(exportEpisode).toHaveBeenNthCalledWith(2, "demo", 2, "srt");
    expect(exportEpisode).toHaveBeenNthCalledWith(3, "demo", 2, "zip");
    expect(downloadFile).toHaveBeenNthCalledWith(
      1,
      expect.any(Blob),
      "demo_ep002_final.mp4",
    );
    expect(downloadFile).toHaveBeenNthCalledWith(
      2,
      expect.any(Blob),
      "demo_ep2.srt",
    );
    expect(downloadFile).toHaveBeenNthCalledWith(
      3,
      expect.any(Blob),
      "demo_ep2.zip",
    );
  });

  it("refreshes the preview when recomposition publishes a new file version", async () => {
    const { result, rerender } = renderController();
    await waitFor(() => expect(result.current.resultUrl).toBe("/static/final.mp4"));
    finalVideoUrl = "/static/final.mp4?v=2";
    rerender();
    await waitFor(() => expect(result.current.resultUrl).toBe(finalVideoUrl));
  });
});
