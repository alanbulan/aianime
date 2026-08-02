// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { awaitTaskCompletion, listTasks } from "@/modules/task_execution/public";
import type { TaskState } from "@/modules/task_execution/public";
import {
  fetchCanvasGenerationResult,
  fetchCanvasGenerationResultUrl,
} from "@/modules/creative_canvas/public";

vi.mock("@/modules/task_execution/public", () => ({
  awaitTaskCompletion: vi.fn(),
  listTasks: vi.fn(),
}));
vi.mock("@/modules/creative_canvas/public", () => ({
  fetchCanvasGenerationResult: vi.fn(),
  fetchCanvasGenerationResultUrl: vi.fn(),
}));

import { freezoneGenerationTaskGateway } from "./freezoneGenerationTaskGateway";

function completedTask(taskKey: string, result: unknown = null): TaskState {
  return {
    task_key: taskKey,
    task_id: taskKey,
    task_type: "freezone_gen",
    username: "local",
    project: "project-1",
    episode: 0,
    beat_num: null,
    scope: null,
    status: "completed",
    progress: 1,
    current_task: "completed",
    result,
    error: null,
    logs: [],
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:01Z",
    completed_at: "2026-08-01T00:00:01Z",
  };
}

beforeEach(() => {
  vi.mocked(fetchCanvasGenerationResult).mockReset();
  vi.mocked(fetchCanvasGenerationResultUrl).mockReset();
  vi.mocked(awaitTaskCompletion).mockReset();
  vi.mocked(listTasks).mockReset();
});

describe("freezoneGenerationTaskGateway", () => {
  it("finds a project task by its task key", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      completedTask("other-task"),
      completedTask("target-task"),
    ]);

    await expect(
      freezoneGenerationTaskGateway.hasTask("project-1", "target-task"),
    ).resolves.toBe(true);
    expect(listTasks).toHaveBeenCalledWith("project-1");
  });

  it("returns the completed task result", async () => {
    vi.mocked(awaitTaskCompletion).mockResolvedValue(
      completedTask("task-1", { output_url: "/result.png" }),
    );

    await expect(
      freezoneGenerationTaskGateway.awaitCompletion("task-1", "project-1"),
    ).resolves.toEqual({ result: { output_url: "/result.png" } });
    expect(awaitTaskCompletion).toHaveBeenCalledWith("task-1", "project-1");
  });

  it("normalizes a non-object transport result at the Canvas boundary", async () => {
    vi.mocked(awaitTaskCompletion).mockResolvedValue(
      completedTask("task-2", ["unexpected"]),
    );

    await expect(
      freezoneGenerationTaskGateway.awaitCompletion("task-2", "project-1"),
    ).resolves.toEqual({ result: null });
  });

  it("fetches a generated media result URL from the encoded task path", async () => {
    vi.mocked(fetchCanvasGenerationResultUrl).mockResolvedValue(
      "/result.png",
    );

    await expect(
      freezoneGenerationTaskGateway.fetchResultUrl(
        "project/1",
        "freezone/video",
        "job/1",
      ),
    ).resolves.toBe("/result.png");
    expect(fetchCanvasGenerationResultUrl).toHaveBeenCalledWith(
      "project/1",
      "freezone/video",
      "job/1",
    );
  });

  it("fetches reverse-prompt text from its task result", async () => {
    vi.mocked(fetchCanvasGenerationResult).mockResolvedValue({
      prompt: "cinematic rain",
    });

    await expect(
      freezoneGenerationTaskGateway.fetchReversePrompt("project/2", "job/2"),
    ).resolves.toBe("cinematic rain");
    expect(fetchCanvasGenerationResult).toHaveBeenCalledWith(
      "project/2",
      "freezone_image_reverse_prompt",
      "job/2",
    );
  });

  it("fetches a story-script result without exposing transport types", async () => {
    const result = {
      title: "Episode 1",
      rows: [{ shot_no: 1, dialogue: "Hello" }],
    };
    vi.mocked(fetchCanvasGenerationResult).mockResolvedValue(result);

    await expect(
      freezoneGenerationTaskGateway.fetchStoryScriptResult(
        "project/3",
        "job/3",
      ),
    ).resolves.toBe(result);
    expect(fetchCanvasGenerationResult).toHaveBeenCalledWith(
      "project/3",
      "freezone_story_script",
      "job/3",
    );
  });
});
