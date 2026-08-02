// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "@/modules/creative_canvas/public";
import {
  eraseVideoSubtitles,
  type VideoSubtitleEraseGateway,
} from "./eraseVideoSubtitles";

function dependencies(options?: { resultUrl?: string }) {
  const task = {
    job_id: "job-1",
    task_key: "task-1",
    task_type: "freezone_video_erase",
  };
  const eraseGateway: VideoSubtitleEraseGateway = {
    submit: vi.fn().mockResolvedValue(task),
  };
  const taskGateway: CanvasTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result: {} }),
    fetchResultUrl: vi.fn().mockResolvedValue(options?.resultUrl ?? "clean.mp4"),
  };
  return { eraseGateway, taskGateway };
}

describe("eraseVideoSubtitles", () => {
  it("maps smart mode and resolves the processed video", async () => {
    const deps = dependencies();

    await expect(
      eraseVideoSubtitles(
        {
          projectId: "project-1",
          sourceUrl: "source.mp4",
          mode: "smart",
          box: { x: 0.1, y: 0.7, width: 0.8, height: 0.2 },
        },
        deps,
      ),
    ).resolves.toEqual({ url: "clean.mp4" });
    expect(deps.eraseGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "source.mp4",
      mode: "smart_subtitle",
      box: null,
    });
    expect(deps.taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "task-1",
      "project-1",
    );
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_erase",
      "job-1",
    );
  });

  it("preserves a box selection and normalizes an empty result URL", async () => {
    const deps = dependencies({ resultUrl: "" });
    const box = { x: 0.1, y: 0.7, width: 0.8, height: 0.2 };

    await expect(
      eraseVideoSubtitles(
        {
          projectId: "project-1",
          sourceUrl: "source.mp4",
          mode: "box",
          box,
        },
        deps,
      ),
    ).resolves.toEqual({ url: null });
    expect(deps.eraseGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "source.mp4",
      mode: "box",
      box,
    });
  });
});
