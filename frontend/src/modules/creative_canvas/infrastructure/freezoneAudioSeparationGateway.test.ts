// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import { freezoneAudioSeparationGateway } from "./freezoneAudioSeparationGateway";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

describe("freezoneAudioSeparationGateway", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  it("maps and projects an audio separation task", async () => {
    vi.mocked(apiCall).mockResolvedValue({
      job_id: "separate-job",
      task_key: "separate-task",
      task_type: "freezone_audio_separate",
      transport_only: true,
    });

    await expect(
      freezoneAudioSeparationGateway.submit("project/1", {
        sourceUrl: "/static/source.mp4",
        targetEpisode: 2,
        targetBeat: 3,
      }),
    ).resolves.toEqual({
      job_id: "separate-job",
      task_key: "separate-task",
      task_type: "freezone_audio_separate",
    });
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/audio-separate",
      {
        method: "POST",
        json: {
          source_url: "/static/source.mp4",
          target_episode: 2,
          target_beat: 3,
        },
      },
    );
  });

  it("rejects an unexpected task type at the adapter boundary", async () => {
    vi.mocked(apiCall).mockResolvedValue({
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
    vi.mocked(apiCall).mockResolvedValue(result);

    await expect(
      freezoneAudioSeparationGateway.fetchResult(
        "project/1",
        "separate/job",
      ),
    ).resolves.toBe(result);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/jobs/freezone_audio_separate/separate%2Fjob/result",
    );
  });
});
