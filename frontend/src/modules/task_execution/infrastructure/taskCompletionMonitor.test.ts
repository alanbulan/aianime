// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import {
  TaskCompletionError,
  listTasks,
} from "./taskCompletionMonitor";

vi.mock("@/shared/api/client", () => ({
  apiCall: vi.fn(),
}));

describe("task completion monitor", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  it("requires an explicit project id", async () => {
    await expect(listTasks("  ")).rejects.toThrow(
      "project_id is required for task monitoring",
    );
    expect(apiCall).not.toHaveBeenCalled();
  });

  it("loads the canonical project task collection", async () => {
    vi.mocked(apiCall).mockResolvedValue([]);

    await expect(listTasks(" project/one ")).resolves.toEqual([]);

    expect(apiCall).toHaveBeenCalledWith("projects/project%2Fone/tasks");
  });

  it("preserves the terminal failure identity", () => {
    const error = new TaskCompletionError("cancelled", "cancelled", "task-1");

    expect(error).toMatchObject({
      name: "TaskCompletionError",
      message: "cancelled",
      status: "cancelled",
      taskKey: "task-1",
    });
  });
});
