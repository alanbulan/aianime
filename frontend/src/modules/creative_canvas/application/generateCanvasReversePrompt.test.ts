// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  generateCanvasReversePrompt,
  type CanvasReversePromptSubmissionGateway,
  type CanvasReversePromptTaskGateway,
} from "./generateCanvasReversePrompt";

describe("generateCanvasReversePrompt", () => {
  it("prepares, submits, persists and completes a reverse-prompt task", async () => {
    const task = {
      task_key: "reverse-task",
      task_type: "freezone_image_reverse_prompt",
      job_id: "reverse-job",
    };
    const sourceGateway = { prepare: vi.fn().mockResolvedValue("/static/source.png") };
    const submissionGateway: CanvasReversePromptSubmissionGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const taskGateway: CanvasReversePromptTaskGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
      fetchReversePrompt: vi.fn().mockResolvedValue("A cinematic portrait"),
    };
    const onTaskSubmitted = vi.fn();

    await expect(
      generateCanvasReversePrompt(
        {
          projectId: "project-1",
          rawSourceUrl: "data:image/png;base64,eA==",
          canvasId: "canvas-1",
          nodeId: "text-1",
        },
        { sourceGateway, submissionGateway, taskGateway, onTaskSubmitted },
      ),
    ).resolves.toEqual({ task, prompt: "A cinematic portrait" });
    expect(sourceGateway.prepare).toHaveBeenCalledWith(
      "project-1",
      "data:image/png;base64,eA==",
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

  it("uses the prompt embedded in the completed task", async () => {
    const task = {
      task_key: "reverse-inline-task",
      task_type: "freezone_image_reverse_prompt",
      job_id: "reverse-inline-job",
    };
    const taskGateway: CanvasReversePromptTaskGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { prompt: "Embedded prompt" },
      }),
      fetchReversePrompt: vi.fn(),
    };

    await expect(
      generateCanvasReversePrompt(
        {
          projectId: "project-1",
          rawSourceUrl: "/source.png",
          canvasId: "canvas-1",
          nodeId: "text-1",
        },
        {
          sourceGateway: { prepare: vi.fn().mockResolvedValue("/source.png") },
          submissionGateway: { submit: vi.fn().mockResolvedValue(task) },
          taskGateway,
          onTaskSubmitted: vi.fn(),
        },
      ),
    ).resolves.toEqual({ task, prompt: "Embedded prompt" });
    expect(taskGateway.fetchReversePrompt).not.toHaveBeenCalled();
  });

  it("rejects a completed task without a prompt", async () => {
    const task = {
      task_key: "reverse-empty-task",
      task_type: "freezone_image_reverse_prompt",
      job_id: "reverse-empty-job",
    };

    await expect(
      generateCanvasReversePrompt(
        {
          projectId: "project-1",
          rawSourceUrl: "/source.png",
          canvasId: "canvas-1",
          nodeId: "text-1",
        },
        {
          sourceGateway: { prepare: vi.fn().mockResolvedValue("/source.png") },
          submissionGateway: { submit: vi.fn().mockResolvedValue(task) },
          taskGateway: {
            awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
            fetchReversePrompt: vi.fn().mockResolvedValue(""),
          },
          onTaskSubmitted: vi.fn(),
        },
      ),
    ).rejects.toThrow("反推提示词任务已完成，但没有返回提示词");
  });
});
