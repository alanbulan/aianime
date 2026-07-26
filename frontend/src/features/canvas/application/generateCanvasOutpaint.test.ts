// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasOutpaint,
  type CanvasOutpaintGenerationGateway,
} from "./generateCanvasOutpaint";
import type { CanvasTaskResultGateway } from "./ports";

describe("generateCanvasOutpaint", () => {
  it("submits one output for the selected settings and completes the task", async () => {
    const task = {
      task_key: "outpaint-task",
      task_type: "freezone_outpaint",
      job_id: "outpaint-job",
    };
    const submissionGateway: CanvasOutpaintGenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/outpainted.png" },
      }),
      fetchResultUrl: vi.fn(),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasOutpaint(
        {
          projectId: "project-1",
          sourceUrl: "/static/source.png?v=42",
          targetAspectRatio: "16:9",
          imageSize: "4K",
          model: "image-model",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/outpainted.png" });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      targetAspectRatio: "16:9",
      numImages: 1,
      imageSize: "4K",
      model: "image-model",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
