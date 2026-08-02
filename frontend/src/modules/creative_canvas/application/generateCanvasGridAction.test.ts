// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import {
  generateCanvasGridAction,
  type CanvasGridActionGenerationGateway,
} from "./generateCanvasGridAction";

describe("generateCanvasGridAction", () => {
  it("prepares the source, projects the action and completes the task", async () => {
    const task = {
      task_key: "grid-action-task",
      task_type: "freezone_template_edit",
      job_id: "grid-action-job",
    };
    const sourceGateway = { prepare: vi.fn().mockResolvedValue("/static/source.png") };
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
          sourceUrl: "data:image/png;base64,eA==",
          actionKey: "plotFourGrid",
          prompt: "Plot four-grid",
          model: "cloud-image-standard",
        },
        { sourceGateway, submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, url: "/static/grid.png" });
    expect(sourceGateway.prepare).toHaveBeenCalledWith(
      "project-1",
      "data:image/png;base64,eA==",
    );
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      mode: "story_pitch_four_grid",
      prompt: "Plot four-grid",
      model: "cloud-image-standard",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
  });
});
