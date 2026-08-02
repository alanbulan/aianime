// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  json: vi.fn(),
}));

vi.mock("@/shared/api/transport", () => ({
  api: {
    delete: transport.delete,
    get: transport.get,
  },
}));

import { sampleTask } from "@/__mocks__/msw/handlers/tasks";

import { httpTaskQueryGateway } from "./httpTaskQueryGateway";

describe("httpTaskQueryGateway", () => {
  beforeEach(() => {
    transport.delete.mockReset();
    transport.get.mockReset();
    transport.json.mockReset();
    transport.delete.mockReturnValue({ json: transport.json });
    transport.get.mockReturnValue({ json: transport.json });
  });

  it("lists the canonical project task collection", async () => {
    const signal = new AbortController().signal;
    const tasks = [sampleTask({ task_key: "task-1" })];
    transport.json.mockResolvedValue({ ok: true, data: tasks });

    await expect(
      httpTaskQueryGateway.listProjectTasks("project/one", signal),
    ).resolves.toEqual(tasks);

    expect(transport.get).toHaveBeenCalledWith(
      "api/v1/projects/project%2Fone/tasks",
      { signal },
    );
  });

  it("forwards the scoped task identity when cancelling", async () => {
    transport.json.mockResolvedValue({ ok: true, data: null });

    await httpTaskQueryGateway.cancelTask({
      type: "single_video",
      project: "project/one",
      episode: 2,
      beatNum: 7,
      scope: "render:main",
    });

    expect(transport.delete).toHaveBeenCalledWith(
      "api/v1/projects/project%2Fone/tasks/single_video/2",
      {
        searchParams: {
          beat_num: "7",
          scope: "render:main",
        },
      },
    );
  });

  it("clears completed tasks through the project endpoint", async () => {
    transport.json.mockResolvedValue({ ok: true, data: null });

    await httpTaskQueryGateway.clearCompletedTasks("project/one");

    expect(transport.delete).toHaveBeenCalledWith(
      "api/v1/projects/project%2Fone/tasks/completed",
    );
  });

  it("deletes a task through its canonical identity endpoint", async () => {
    transport.json.mockResolvedValue({ ok: true, data: null });

    await httpTaskQueryGateway.deleteTask({
      type: "script_writer",
      project: "project/one",
      episode: 3,
    });

    expect(transport.delete).toHaveBeenCalledWith(
      "api/v1/projects/project%2Fone/tasks/script_writer/3",
    );
  });
});
