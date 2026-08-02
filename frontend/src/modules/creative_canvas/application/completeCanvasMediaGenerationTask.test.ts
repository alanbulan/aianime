// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import { completeCanvasMediaGenerationTask } from "./completeCanvasMediaGenerationTask";
import type { CanvasTaskResultGateway } from "./completeCanvasMediaGenerationTask";

const task = {
  task_key: "media-task",
  task_type: "freezone_media_task",
  job_id: "media-job",
};

describe("completeCanvasMediaGenerationTask", () => {
  it("persists the task before returning its embedded output URL", async () => {
    const onTaskSubmitted = vi.fn();
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: "/static/output.png" },
      }),
      fetchResultUrl: vi.fn(),
    };

    await expect(
      completeCanvasMediaGenerationTask(
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
      fetchResultUrl: vi.fn().mockResolvedValue("/static/fallback.mp4"),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        { projectId: "project-1", task },
        { taskGateway, onTaskSubmitted: vi.fn() },
      ),
    ).resolves.toBe("/static/fallback.mp4");
    expect(taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_media_task",
      "media-job",
    );
  });

  it("ignores malformed embedded results and uses the result endpoint", async () => {
    const taskGateway: CanvasTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({
        result: { output_url: 42 },
      }),
      fetchResultUrl: vi.fn().mockResolvedValue("/static/safe-fallback.png"),
    };

    await expect(
      completeCanvasMediaGenerationTask(
        { projectId: "project-1", task },
        { taskGateway, onTaskSubmitted: vi.fn() },
      ),
    ).resolves.toBe("/static/safe-fallback.png");
  });
});
