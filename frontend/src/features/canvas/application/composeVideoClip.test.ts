// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./ports";
import { composeVideoClip } from "./composeVideoClip";
import type { CanvasVideoComposeGateway } from "./composeCanvasVideo";

function dependencies(options?: { resultUrl?: string }) {
  const task = {
    job_id: "job-1",
    task_key: "task-1",
    task_type: "freezone_video_compose",
  };
  const composeGateway: CanvasVideoComposeGateway = {
    submit: vi.fn().mockResolvedValue(task),
  };
  const taskGateway: CanvasTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result: {} }),
    fetchResultUrl: vi.fn().mockResolvedValue(options?.resultUrl ?? "clip.mp4"),
  };
  return {
    composeGateway,
    taskGateway,
    now: vi.fn(() => 1_234),
  };
}

describe("composeVideoClip", () => {
  it("submits a 1080p single-video track and returns its result", async () => {
    const deps = dependencies();

    await expect(
      composeVideoClip(
        {
          projectId: "project-1",
          nodeId: "video-1",
          sourceUrl: "source.mp4",
          startMs: 250,
          endMs: 2_750,
          quality: "1080P",
        },
        deps,
      ),
    ).resolves.toEqual({ url: "clip.mp4", durationMs: 2_500 });

    expect(deps.composeGateway.submit).toHaveBeenCalledWith("project-1", {
      resolution: "1080p",
      tracks: [
        {
          trackId: "track_video-1_video",
          kind: "video",
          items: [
            {
              itemId: "item_video-1_1234",
              sourceUrl: "source.mp4",
              timelineStart: 0,
              sourceStart: 0.25,
              sourceEnd: 2.75,
            },
          ],
        },
      ],
    });
    expect(deps.taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "task-1",
      "project-1",
    );
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_compose",
      "job-1",
    );
  });

  it("falls back to 720p and normalizes an empty result URL", async () => {
    const deps = dependencies({ resultUrl: "" });

    await expect(
      composeVideoClip(
        {
          projectId: "project-1",
          nodeId: "video-1",
          sourceUrl: "source.mp4",
          startMs: 0,
          endMs: 1_000,
          quality: "480P",
        },
        deps,
      ),
    ).resolves.toEqual({ url: null, durationMs: 1_000 });
    expect(deps.composeGateway.submit).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ resolution: "720p" }),
    );
  });
});
