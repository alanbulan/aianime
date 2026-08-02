// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import {
  generateCanvasRedraw,
  type CanvasRedrawGenerationGateway,
} from "./generateCanvasRedraw";

function dependencies(result: unknown) {
  const task = {
    task_key: "redraw-task",
    task_type: "freezone_redraw",
    job_id: "redraw-job",
  };
  const submissionGateway: CanvasRedrawGenerationGateway = {
    submit: vi.fn().mockResolvedValue(task),
  };
  const taskGateway: CanvasTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result }),
    fetchResultUrl: vi.fn(),
  };
  return { task, submissionGateway, taskGateway, onTaskSubmitted: vi.fn() };
}

const params = {
  projectId: "project-1",
  sourceUrl: "/static/source.png",
  maskUrl: "/static/mask.png",
  prompt: "replace the sky",
  aspectRatio: "16:9" as const,
  imageSize: "4K" as const,
  model: "image-model",
};

describe("generateCanvasRedraw", () => {
  it("submits the selected settings and completes the task", async () => {
    const deps = dependencies({ output_url: "/static/redrawn.png" });

    await expect(generateCanvasRedraw(params, deps)).resolves.toEqual({
      task: deps.task,
      url: "/static/redrawn.png",
    });
    expect(deps.submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      maskUrl: "/static/mask.png",
      prompt: "replace the sky",
      aspectRatio: "16:9",
      imageSize: "4K",
      model: "image-model",
    });
    expect(deps.onTaskSubmitted).toHaveBeenCalledWith(deps.task);
  });

  it("uses the shared result endpoint when completion has no embedded URL", async () => {
    const deps = dependencies({});
    vi.mocked(deps.taskGateway.fetchResultUrl).mockResolvedValue(
      "/static/fallback.png",
    );

    await expect(generateCanvasRedraw(params, deps)).resolves.toEqual({
      task: deps.task,
      url: "/static/fallback.png",
    });
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_redraw",
      "redraw-job",
    );
  });
});
