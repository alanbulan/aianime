// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasMultiAngle,
  type CanvasMultiAngleGenerationGateway,
} from "./generateCanvasMultiAngle";
import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";

describe("generateCanvasMultiAngle", () => {
  it("projects editor values and completes the submitted task", async () => {
    const task = {
      task_key: "multi-angle-task",
      task_type: "freezone_multi_view",
      job_id: "multi-angle-job",
    };
    const submissionGateway: CanvasMultiAngleGenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/angle.png" },
      }),
      fetchResultUrl: vi.fn(),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasMultiAngle(
        {
          projectId: "project-1",
          sourceUrl: "/static/source.png?v=42",
          preset: "tilted",
          yawDegrees: 181,
          pitchDegrees: -30,
          shotSize: "medium",
          promptOverride: null,
          model: "image-model",
          imageSize: "2K",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/angle.png" });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      preset: "oblique",
      yawDegrees: -179,
      pitchDegrees: -30,
      shotSize: "medium",
      prompt: "",
      model: "image-model",
      imageSize: "2K",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
