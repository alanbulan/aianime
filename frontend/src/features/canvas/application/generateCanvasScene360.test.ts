// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasScene360,
  type CanvasScene360GenerationGateway,
} from "./generateCanvasScene360";
import type { CanvasTaskResultGateway } from "./ports";

describe("generateCanvasScene360", () => {
  it("submits, persists and completes a scene-360 task", async () => {
    const task = {
      task_key: "scene-360-task",
      task_type: "freezone_scene_360",
      job_id: "scene-360-job",
    };
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
          referenceUrl: "/static/source.png?v=42",
          aspectRatio: "21:9",
          model: "cloud-image-standard",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/pano.png" });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      referenceUrl: "/static/source.png",
      aspectRatio: "21:9",
      model: "cloud-image-standard",
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
    const submissionGateway: CanvasScene360GenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
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
          aspectRatio: "2:1",
          model: "cloud-image-standard",
        },
        {
          submissionGateway,
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
