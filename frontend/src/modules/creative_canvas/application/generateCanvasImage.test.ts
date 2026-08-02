// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import {
  generateCanvasImage,
  submitCanvasImageGeneration,
  type CanvasImageGenerationSubmissionGateway,
  type CanvasImageReferencePreparationGateway,
} from "./generateCanvasImage";

function dependencies(result: Record<string, unknown>) {
  const task = {
    job_id: "job-1",
    task_key: "task-1",
    task_type: "freezone_gen" as const,
  };
  const sourceGateway: CanvasImageReferencePreparationGateway = {
    prepareAll: vi.fn().mockResolvedValue(["/static/reference.png"]),
  };
  const submissionGateway: CanvasImageGenerationSubmissionGateway = {
    submit: vi.fn().mockResolvedValue(task),
  };
  const taskGateway: CanvasTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result }),
    fetchResultUrl: vi.fn().mockResolvedValue("/static/fallback.png"),
  };
  return {
    task,
    sourceGateway,
    submissionGateway,
    taskGateway,
    onTaskSubmitted: vi.fn(),
  };
}

const params = {
  projectId: "project-1",
  prompt: "character portrait",
  aspectRatio: "16:9",
  imageSize: "2K",
  referenceUrls: ["data:image/png;base64,eA=="],
  model: "cloud-image-standard",
  modelId: "cloud-image-standard",
  quality: "medium",
  canvasId: "canvas-1",
  nodeId: "image-1",
};

describe("generateCanvasImage", () => {
  it("prepares sources and submits the complete image command", async () => {
    const deps = dependencies({ output_url: "/static/generated.png" });

    await expect(
      submitCanvasImageGeneration(params, deps),
    ).resolves.toEqual(deps.task);
    expect(deps.sourceGateway.prepareAll).toHaveBeenCalledWith(
      "project-1",
      ["data:image/png;base64,eA=="],
    );
    expect(deps.submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      prompt: "character portrait",
      aspectRatio: "16:9",
      imageSize: "2K",
      referenceUrls: ["/static/reference.png"],
      camera: undefined,
      style: undefined,
      model: "cloud-image-standard",
      modelId: "cloud-image-standard",
      genMode: undefined,
      quality: "medium",
      canvasId: "canvas-1",
      nodeId: "image-1",
    });
  });

  it("uses the embedded completion URL", async () => {
    const deps = dependencies({ output_url: "/static/generated.png" });

    await expect(generateCanvasImage(params, deps)).resolves.toEqual({
      task: deps.task,
      url: "/static/generated.png",
    });
    expect(deps.onTaskSubmitted).toHaveBeenCalledWith(deps.task);
    expect(deps.taskGateway.fetchResultUrl).not.toHaveBeenCalled();
  });

  it("falls back to the dedicated result endpoint", async () => {
    const deps = dependencies({ status: "completed" });

    await expect(generateCanvasImage(params, deps)).resolves.toEqual({
      task: deps.task,
      url: "/static/fallback.png",
    });
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_gen",
      "job-1",
    );
  });

  it("preserves a completed task when the result fallback fails", async () => {
    const deps = dependencies({ status: "completed" });
    const error = new Error("result endpoint unavailable");
    vi.mocked(deps.taskGateway.fetchResultUrl).mockRejectedValue(error);

    await expect(generateCanvasImage(params, deps)).resolves.toEqual({
      task: deps.task,
      url: null,
      resultFallbackError: error,
    });
  });
});
