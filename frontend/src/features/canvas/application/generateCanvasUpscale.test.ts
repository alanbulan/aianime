// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasUpscale,
  type CanvasUpscaleGenerationGateway,
} from "./generateCanvasUpscale";
import type { CanvasTaskResultGateway } from "./ports";

describe("generateCanvasUpscale", () => {
  it("submits the selected settings and completes the task", async () => {
    const task = {
      task_key: "upscale-task",
      task_type: "freezone_upscale",
      job_id: "upscale-job",
    };
    const submissionGateway: CanvasUpscaleGenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/upscaled.png" },
      }),
      fetchResultUrl: vi.fn(),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasUpscale(
        {
          projectId: "project-1",
          sourceUrl: "/static/source.png?v=42",
          scaleFactor: 4,
          imageSize: "4K",
          model: "image-model",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/upscaled.png" });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      scaleFactor: 4,
      imageSize: "4K",
      model: "image-model",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
