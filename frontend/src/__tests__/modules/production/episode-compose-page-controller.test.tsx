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
        data: { exists: true, video_url: "/static/final.mp4" },
      },
    }),
    useProject: () => ({
      data: {
        add_subtitles: false,
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
  });

  it("normalizes saved preferences for the project orientation", async () => {
    const { result } = renderController();

    await waitFor(() => {
      expect(result.current.resolution).toBe("1920x1080");
      expect(result.current.addSubtitles).toBe(false);
      expect(result.current.resultUrl).toBe("/static/final.mp4");
    });
    expect(result.current.displayTitle).toBe("第二集");
    expect(result.current.durationLabel).toBe("1:01");

    act(() => result.current.handleResolutionChange("720x1280"));
    expect(result.current.resolution).toBe("1280x720");
    expect(updateProject).toHaveBeenCalledWith({
      video_resolution: "1280x720",
    });

    act(() => result.current.handleAddSubtitlesChange());
    expect(updateProject).toHaveBeenCalledWith({ add_subtitles: true });
  });

  it("starts composition with BGM explicitly disabled", async () => {
    const { result } = renderController();

    await act(async () => {
      await result.current.handleCompose();
    });

    expect(composeEpisode).toHaveBeenCalledWith({
      addBgm: false,
      addSubtitles: false,
      resolution: "1920x1080",
    });
    expect(taskStart).toHaveBeenCalledTimes(1);
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
});
