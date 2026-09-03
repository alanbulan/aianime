// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import {
  generateCanvasScene360,
  type CanvasScene360GenerationGateway,
} from "./generateCanvasScene360";

describe("generateCanvasScene360", () => {
  it("prepares the source, submits and completes a scene-360 task", async () => {
    const task = {
      task_key: "scene-360-task",
      task_type: "freezone_scene_360",
      job_id: "scene-360-job",
    };
    const sourceGateway = { prepare: vi.fn().mockResolvedValue("/static/source.png") };
    const submissionGateway: CanvasScene360GenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/pano.png" },
      }),
      fetchResultUrl: vi.fn().mockResolvedValue("/static/fallback.png"),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasScene360(
        {
          projectId: "project-1",
          referenceUrl: "data:image/png;base64,eA==",
          canvasId: "canvas-1",
          nodeId: "pano-1",
          model: "cloud-image-standard",
          modelSelector: "image-route",
        },
        { sourceGateway, submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/pano.png" });
    expect(sourceGateway.prepare).toHaveBeenCalledWith(
      "project-1",
      "data:image/png;base64,eA==",
    );
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      referenceUrl: "/static/source.png",
      canvasId: "canvas-1",
      nodeId: "pano-1",
      model: "cloud-image-standard",
      modelSelector: "image-route",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
    expect(taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "scene-360-task",
      "project-1",
    );
    expect(taskGateway.fetchResultUrl).not.toHaveBeenCalled();
  });

  it("uses the dedicated result endpoint when completion has no output URL", async () => {
    const task = {
      task_key: "scene-360-task",
      task_type: "freezone_scene_360",
      job_id: "scene-360-job",
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
      fetchResultUrl: vi.fn().mockResolvedValue("/static/fallback.png"),
    };

    await expect(
      generateCanvasScene360(
        {
          projectId: "project-1",
          referenceUrl: "/static/source.png",
          canvasId: "canvas-1",
          nodeId: "pano-1",
          model: "cloud-image-standard",
        },
        {
          sourceGateway: { prepare: vi.fn().mockResolvedValue("/static/source.png") },
          submissionGateway: { submit: vi.fn().mockResolvedValue(task) },
          taskGateway,
          onTaskSubmitted: vi.fn(),
        },
      ),
    ).resolves.toEqual({ task, url: "/static/fallback.png" });
    expect(taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_scene_360",
      "scene-360-job",
    );
  });
});
