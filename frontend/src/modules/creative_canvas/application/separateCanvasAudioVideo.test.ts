// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  separateCanvasAudioVideo,
  type CanvasAudioSeparationGateway,
  type CanvasAudioSeparationTaskGateway,
} from "./separateCanvasAudioVideo";

const task = {
  job_id: "separate-job",
  task_key: "separate-task",
  task_type: "freezone_audio_separate" as const,
};

function dependencies(result: Record<string, unknown> | null) {
  const audioSeparationGateway: CanvasAudioSeparationGateway = {
    submit: vi.fn().mockResolvedValue(task),
    fetchResult: vi.fn().mockResolvedValue({}),
  };
  const taskGateway: CanvasAudioSeparationTaskGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result }),
  };
  return { audioSeparationGateway, taskGateway };
}

describe("separateCanvasAudioVideo", () => {
  it("returns both outputs from task completion without a fallback request", async () => {
    const deps = dependencies({
      audio_url: "/static/audio.m4a",
      mute_video_url: "/static/mute.mp4",
    });

    await expect(
      separateCanvasAudioVideo(
        { projectId: "project-1", sourceUrl: "/static/source.mp4" },
        deps,
      ),
    ).resolves.toEqual({
      audioUrl: "/static/audio.m4a",
      silentVideoUrl: "/static/mute.mp4",
    });
    expect(deps.audioSeparationGateway.submit).toHaveBeenCalledWith(
      "project-1",
      {
        sourceUrl: "/static/source.mp4",
        targetEpisode: undefined,
        targetBeat: undefined,
      },
    );
    expect(deps.taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "separate-task",
      "project-1",
    );
    expect(deps.audioSeparationGateway.fetchResult).not.toHaveBeenCalled();
  });

  it("fills a missing output from the dedicated result endpoint", async () => {
    const deps = dependencies({ audio_url: "/static/audio.m4a" });
    vi.mocked(deps.audioSeparationGateway.fetchResult).mockResolvedValue({
      audio_url: "/static/other-audio.m4a",
      mute_video_url: "/static/mute.mp4",
    });

    await expect(
      separateCanvasAudioVideo(
        { projectId: "project-1", sourceUrl: "/static/source.mp4" },
        deps,
      ),
    ).resolves.toEqual({
      audioUrl: "/static/audio.m4a",
      silentVideoUrl: "/static/mute.mp4",
    });
    expect(deps.audioSeparationGateway.fetchResult).toHaveBeenCalledWith(
      "project-1",
      "separate-job",
    );
  });

  it("keeps a completed task non-fatal when result fallback fails", async () => {
    const deps = dependencies({ status: "completed" });
    const error = new Error("result endpoint unavailable");
    vi.mocked(deps.audioSeparationGateway.fetchResult).mockRejectedValue(error);

    await expect(
      separateCanvasAudioVideo(
        { projectId: "project-1", sourceUrl: "/static/source.mp4" },
        deps,
      ),
    ).resolves.toEqual({
      audioUrl: null,
      silentVideoUrl: null,
      resultFallbackError: error,
    });
  });
});
