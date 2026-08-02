// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasVideoUpscale,
  type CanvasVideoUpscaleGenerationGateway,
} from "./generateCanvasVideoUpscale";
import type { CanvasTaskResultGateway } from "@/modules/creative_canvas/public";

describe("generateCanvasVideoUpscale", () => {
  it("submits the selected settings and completes the task", async () => {
    const task = {
      task_key: "video-upscale-task",
      task_type: "freezone_video_upscale",
      job_id: "video-upscale-job",
    };
    const submissionGateway: CanvasVideoUpscaleGenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/upscaled.mp4" },
      }),
      fetchResultUrl: vi.fn(),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasVideoUpscale(
        {
          projectId: "project-1",
          sourceUrl: "/static/source.mp4?v=42",
          resolution: "4k",
          denoiseStrength: "2x",
          canvasId: "canvas-1",
          nodeId: "video-1",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/upscaled.mp4" });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.mp4",
      resolution: "4k",
      frameInterpolation: "none",
      denoiseStrength: "2x",
      canvasId: "canvas-1",
      nodeId: "video-1",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
