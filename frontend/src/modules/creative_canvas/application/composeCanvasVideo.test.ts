// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  composeCanvasVideo,
  type CanvasVideoComposeGateway,
} from "./composeCanvasVideo";
import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";

function dependencies(options?: { embeddedUrl?: string; fallbackUrl?: string }) {
  const task = {
    job_id: "job-1",
    task_key: "task-1",
    task_type: "freezone_video_compose",
  };
  const composeGateway: CanvasVideoComposeGateway = {
    submit: vi.fn().mockResolvedValue(task),
  };
  const taskGateway: CanvasTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({
      result: options?.embeddedUrl
        ? { output_url: options.embeddedUrl }
        : {},
    }),
    fetchResultUrl: vi.fn().mockResolvedValue(options?.fallbackUrl ?? "fallback.mp4"),
  };
  return { task, composeGateway, taskGateway };
}

describe("composeCanvasVideo", () => {
  it("submits the complete timeline and uses the embedded result URL", async () => {
    const deps = dependencies({ embeddedUrl: "embedded.mp4" });
    const request = {
      resolution: "1080p" as const,
      tracks: [
        {
          trackId: "video",
          kind: "video" as const,
          items: [
            {
              itemId: "clip-1",
              sourceUrl: "source.mp4",
              sourceEnd: 3,
            },
          ],
        },
      ],
    };

    await expect(
      composeCanvasVideo(
        { projectId: "project-1", request },
        deps,
      ),
    ).resolves.toEqual({ task: deps.task, url: "embedded.mp4" });
    expect(deps.composeGateway.submit).toHaveBeenCalledWith(
      "project-1",
      request,
    );
    expect(deps.taskGateway.fetchResultUrl).not.toHaveBeenCalled();
  });

  it("falls back to the compose result endpoint", async () => {
    const deps = dependencies({ fallbackUrl: "fallback.mp4" });

    await expect(
      composeCanvasVideo(
        { projectId: "project-1", request: { tracks: [] } },
        deps,
      ),
    ).resolves.toEqual({ task: deps.task, url: "fallback.mp4" });
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_compose",
      "job-1",
    );
  });
});
