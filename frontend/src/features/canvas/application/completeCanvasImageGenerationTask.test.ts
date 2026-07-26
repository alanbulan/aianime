// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import { completeCanvasImageGenerationTask } from "./completeCanvasImageGenerationTask";
import type { CanvasTaskResultGateway } from "./ports";

const task = {
  task_key: "image-task",
  task_type: "freezone_image_task",
  job_id: "image-job",
};

describe("completeCanvasImageGenerationTask", () => {
  it("persists the task before returning its embedded output URL", async () => {
    const onTaskSubmitted = vi.fn();
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/output.png" },
      }),
      fetchResultUrl: vi.fn(),
    };

    await expect(
      completeCanvasImageGenerationTask(
        { projectId: "project-1", task },
        { taskGateway, onTaskSubmitted },
      ),
    ).resolves.toBe("/static/output.png");
    expect(onTaskSubmitted).toHaveBeenCalledWith(task);
    expect(onTaskSubmitted.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(taskGateway.awaitCompletion).mock.invocationCallOrder[0] ?? 0,
    );
    expect(taskGateway.fetchResultUrl).not.toHaveBeenCalled();
  });

  it("falls back to the dedicated result endpoint", async () => {
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
      fetchResultUrl: vi.fn().mockResolvedValue("/static/fallback.png"),
    };

    await expect(
      completeCanvasImageGenerationTask(
        { projectId: "project-1", task },
        { taskGateway, onTaskSubmitted: vi.fn() },
      ),
    ).resolves.toBe("/static/fallback.png");
    expect(taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_image_task",
      "image-job",
    );
  });
});
