// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasGridAction,
  type CanvasGridActionGenerationGateway,
} from "./generateCanvasGridAction";
import type { CanvasTaskResultGateway } from "./ports";

describe("generateCanvasGridAction", () => {
  it("projects the toolbar action and completes the submitted task", async () => {
    const task = {
      task_key: "grid-action-task",
      task_type: "freezone_template_edit",
      job_id: "grid-action-job",
    };
    const submissionGateway: CanvasGridActionGenerationGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/grid.png" },
      }),
      fetchResultUrl: vi.fn(),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasGridAction(
        {
          projectId: "project-1",
          sourceUrl: "/static/source.png?v=42",
          actionKey: "plotFourGrid",
          prompt: "Plot four-grid",
          model: "cloud-image-standard",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/grid.png" });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      mode: "story_pitch_four_grid",
      prompt: "Plot four-grid",
      model: "cloud-image-standard",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
