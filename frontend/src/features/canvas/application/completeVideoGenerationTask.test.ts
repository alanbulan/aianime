// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "./ports";
import { completeVideoGenerationTask } from "./completeVideoGenerationTask";

const task = {
  job_id: "job-1",
  task_key: "task-1",
  task_type: "freezone_video_gen" as const,
};

function taskGateway(
  completionResult: Record<string, unknown>,
): CanvasTaskResultGateway {
  return {
    awaitCompletion: vi.fn().mockResolvedValue({ result: completionResult }),
    fetchResultUrl: vi.fn().mockResolvedValue("fallback.mp4"),
  };
}

describe("completeVideoGenerationTask", () => {
  it("uses the completed task payload before querying the result endpoint", async () => {
    const gateway = taskGateway({ output_url: "embedded.mp4" });

    await expect(
      completeVideoGenerationTask(
        { projectId: "project-1", task },
        { taskGateway: gateway },
      ),
    ).resolves.toEqual({
      completion: { result: { output_url: "embedded.mp4" } },
      url: "embedded.mp4",
      resultLookupError: null,
    });
    expect(gateway.fetchResultUrl).not.toHaveBeenCalled();
  });

  it("falls back to the dedicated result endpoint", async () => {
    const gateway = taskGateway({ output_format: "video" });

    await expect(
      completeVideoGenerationTask(
        { projectId: "project-1", task },
        { taskGateway: gateway },
      ),
    ).resolves.toEqual({
      completion: { result: { output_format: "video" } },
      url: "fallback.mp4",
      resultLookupError: null,
    });
    expect(gateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_gen",
      "job-1",
    );
  });

  it("reports a fallback lookup error without rejecting the completed task", async () => {
    const error = new Error("result unavailable");
    const gateway = taskGateway({ output_format: "video" });
    vi.mocked(gateway.fetchResultUrl).mockRejectedValue(error);

    await expect(
      completeVideoGenerationTask(
        { projectId: "project-1", task },
        { taskGateway: gateway },
      ),
    ).resolves.toEqual({
      completion: { result: { output_format: "video" } },
      url: null,
      resultLookupError: error,
    });
  });
});
