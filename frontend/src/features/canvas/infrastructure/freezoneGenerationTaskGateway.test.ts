// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { awaitTaskCompletion, listTasks } from "@/api/tasks";
import { apiCall } from "@/shared/api/client";

vi.mock("@/api/tasks", () => ({
  awaitTaskCompletion: vi.fn(),
  listTasks: vi.fn(),
}));
vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneGenerationTaskGateway } from "./freezoneGenerationTaskGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(awaitTaskCompletion).mockReset();
  vi.mocked(listTasks).mockReset();
});

describe("freezoneGenerationTaskGateway", () => {
  it("finds a project task by its task key", async () => {
    vi.mocked(listTasks).mockResolvedValue([
      {
        task_type: "freezone_gen",
        task_key: "other-task",
        username: "local",
        project: "project-1",
        episode: 0,
        status: "completed",
      },
      {
        task_type: "freezone_gen",
        task_key: "target-task",
        username: "local",
        project: "project-1",
        episode: 0,
        status: "completed",
      },
    ]);

    await expect(
      freezoneGenerationTaskGateway.hasTask("project-1", "target-task"),
    ).resolves.toBe(true);
    expect(listTasks).toHaveBeenCalledWith("project-1");
  });

  it("returns the completed task result", async () => {
    vi.mocked(awaitTaskCompletion).mockResolvedValue({
      task_type: "freezone_gen",
      task_key: "task-1",
      username: "local",
      project: "project-1",
      episode: 0,
      status: "completed",
      result: { output_url: "/result.png" },
    });

    await expect(
      freezoneGenerationTaskGateway.awaitCompletion("task-1", "project-1"),
    ).resolves.toEqual({ result: { output_url: "/result.png" } });
    expect(awaitTaskCompletion).toHaveBeenCalledWith("task-1", "project-1");
  });

  it("fetches a generated media result URL from the encoded task path", async () => {
    vi.mocked(apiCall).mockResolvedValue({ url: "/result.png", size: 2048 });

    await expect(
      freezoneGenerationTaskGateway.fetchResultUrl(
        "project/1",
        "freezone/video",
        "job/1",
      ),
    ).resolves.toBe("/result.png");
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/jobs/freezone%2Fvideo/job%2F1/result",
    );
  });

  it("fetches reverse-prompt text from its task result", async () => {
    vi.mocked(apiCall).mockResolvedValue({ prompt: "cinematic rain" });

    await expect(
      freezoneGenerationTaskGateway.fetchReversePrompt("project/2", "job/2"),
    ).resolves.toBe("cinematic rain");
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F2/freezone/jobs/freezone_image_reverse_prompt/job%2F2/result",
    );
  });

  it("fetches a story-script result without exposing transport types", async () => {
    const result = {
      title: "Episode 1",
      rows: [{ shot_no: 1, dialogue: "Hello" }],
    };
    vi.mocked(apiCall).mockResolvedValue(result);

    await expect(
      freezoneGenerationTaskGateway.fetchStoryScriptResult(
        "project/3",
        "job/3",
      ),
    ).resolves.toBe(result);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F3/freezone/jobs/freezone_story_script/job%2F3/result",
    );
  });
});
