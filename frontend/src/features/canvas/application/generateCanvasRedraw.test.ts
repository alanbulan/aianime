// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import { generateCanvasRedraw } from "./generateCanvasRedraw";
import type { CanvasRedrawTaskGateway } from "./ports";

describe("generateCanvasRedraw", () => {
  it("submits the selected settings and completes the task", async () => {
    const task = {
      task_key: "redraw-task",
      task_type: "freezone_redraw",
      job_id: "redraw-job",
    };
    const redrawGateway: CanvasRedrawTaskGateway = {
      submit: vi.fn().mockResolvedValue(task),
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/redrawn.png" },
      }),
      fetchResultUrl: vi.fn(),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasRedraw(
        {
          projectId: "project-1",
          sourceUrl: "/static/source.png",
          maskUrl: "/static/mask.png",
          prompt: "replace the sky",
          aspectRatio: "16:9",
          imageSize: "4K",
          model: "image-model",
        },
        { redrawGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/redrawn.png" });
    expect(redrawGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      maskUrl: "/static/mask.png",
      prompt: "replace the sky",
      aspectRatio: "16:9",
      imageSize: "4K",
      model: "image-model",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
