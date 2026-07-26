// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchFreezoneAudioSeparateResult, submitFreezoneAudioSeparate } =
  vi.hoisted(() => ({
    fetchFreezoneAudioSeparateResult: vi.fn(),
    submitFreezoneAudioSeparate: vi.fn(),
  }));

vi.mock("@/api/ops", () => ({
  fetchFreezoneAudioSeparateResult,
  submitFreezoneAudioSeparate,
}));

import { freezoneAudioSeparationGateway } from "./freezoneAudioSeparationGateway";

describe("freezoneAudioSeparationGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps and projects an audio separation task", async () => {
    submitFreezoneAudioSeparate.mockResolvedValue({
      job_id: "separate-job",
      task_key: "separate-task",
      task_type: "freezone_audio_separate",
      transport_only: true,
    });

    await expect(
      freezoneAudioSeparationGateway.submit("project-1", {
        sourceUrl: "/static/source.mp4",
        targetEpisode: 2,
        targetBeat: 3,
      }),
    ).resolves.toEqual({
      job_id: "separate-job",
      task_key: "separate-task",
      task_type: "freezone_audio_separate",
    });
    expect(submitFreezoneAudioSeparate).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.mp4",
      targetEpisode: 2,
      targetBeat: 3,
    });
  });

  it("rejects an unexpected task type at the adapter boundary", async () => {
    submitFreezoneAudioSeparate.mockResolvedValue({
      job_id: "separate-job",
      task_key: "separate-task",
      task_type: "freezone_video_gen",
    });

    await expect(
      freezoneAudioSeparationGateway.submit("project-1", {
        sourceUrl: "/static/source.mp4",
      }),
    ).rejects.toThrow(
      "Unexpected audio separation task type: freezone_video_gen",
    );
  });

  it("loads the dedicated audio separation result", async () => {
    const result = {
      audio_url: "/static/audio.m4a",
      mute_video_url: "/static/mute.mp4",
    };
    fetchFreezoneAudioSeparateResult.mockResolvedValue(result);

    await expect(
      freezoneAudioSeparationGateway.fetchResult(
        "project-1",
        "separate-job",
      ),
    ).resolves.toBe(result);
    expect(fetchFreezoneAudioSeparateResult).toHaveBeenCalledWith(
      "project-1",
      "separate-job",
    );
  });
});
