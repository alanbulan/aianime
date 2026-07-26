// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasGenerationTaskGateway } from "./ports";
import {
  generateCanvasReversePrompt,
  type CanvasReversePromptSubmissionGateway,
} from "./generateCanvasReversePrompt";

describe("generateCanvasReversePrompt", () => {
  it("prepares, submits, persists and completes a reverse-prompt task", async () => {
    const task = {
      task_key: "reverse-task",
      task_type: "freezone_image_reverse_prompt",
      job_id: "reverse-job",
    };
    const submissionGateway: CanvasReversePromptSubmissionGateway = {
      prepareSourceUrl: vi.fn().mockResolvedValue("/static/source.png"),
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: Pick<
      CanvasGenerationTaskGateway,
      "awaitCompletion" | "fetchReversePrompt"
    > = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
      fetchReversePrompt: vi.fn().mockResolvedValue("A cinematic portrait"),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasReversePrompt(
        {
          projectId: "project-1",
          rawSourceUrl: "data:image/png;base64,source",
          canvasId: "canvas-1",
          nodeId: "text-1",
        },
        { submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, prompt: "A cinematic portrait" });
    expect(submissionGateway.prepareSourceUrl).toHaveBeenCalledWith(
      "project-1",
      "data:image/png;base64,source",
    );
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      sourceUrl: "/static/source.png",
      canvasId: "canvas-1",
      nodeId: "text-1",
    });
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
    expect(taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "reverse-task",
      "project-1",
    );
    expect(taskGateway.fetchReversePrompt).toHaveBeenCalledWith(
      "project-1",
      "reverse-job",
    );
  });
});
