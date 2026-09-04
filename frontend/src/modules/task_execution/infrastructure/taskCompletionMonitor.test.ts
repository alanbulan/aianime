// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

import {
  awaitTaskCompletion,
  registerTaskCompletionSource,
  TaskCompletionError,
  listTasks,
} from "./taskCompletionMonitor";
import type { TaskState } from "@/modules/task_execution/domain/contracts";

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

  it("uses the registered task-center stream instead of opening a second SSE connection", async () => {
    const eventSourceConstructor = vi.fn();
    vi.stubGlobal(
      "EventSource",
      class {
        constructor(...args: unknown[]) {
          eventSourceConstructor(...args);
        }
        addEventListener() {}
        close() {}
      },
    );
    const source = registerTaskCompletionSource("project-1");

    try {
      const completion = awaitTaskCompletion("task-1", "project-1");

      expect(eventSourceConstructor).not.toHaveBeenCalled();
      source.onTask({
        task_key: "task-1",
        status: "completed",
      } as TaskState);

      await expect(completion).resolves.toMatchObject({
        task_key: "task-1",
        status: "completed",
      });
    } finally {
      source.close();
      vi.unstubAllGlobals();
    }
  });

  it("resolves every waiter attached to the same task key", async () => {
    const source = registerTaskCompletionSource("project-shared");

    try {
      const first = awaitTaskCompletion("task-shared", "project-shared");
      const second = awaitTaskCompletion("task-shared", "project-shared");
      const completed = {
        task_key: "task-shared",
        status: "completed",
        result: { output_url: "/static/shared.mp4" },
      } as TaskState;

      source.onTask(completed);

      await expect(Promise.all([first, second])).resolves.toEqual([
        completed,
        completed,
      ]);
    } finally {
      source.close();
    }
  });

  it("times out even while every polling request fails", async () => {
    vi.useFakeTimers();
    vi.mocked(apiCall).mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const eventSources: Array<{ closed: boolean }> = [];
    vi.stubGlobal(
      "EventSource",
      class {
        closed = false;
        onerror: ((event: Event) => void) | null = null;
        constructor() {
          eventSources.push(this);
        }
        addEventListener() {}
        close() {
          this.closed = true;
        }
      },
    );

    try {
      const error = awaitTaskCompletion("task-timeout", "project-timeout").catch(
        (caught: unknown) => caught,
      );
      await vi.advanceTimersByTimeAsync(20 * 60 * 1000);

      await expect(error).resolves.toMatchObject({
        message: "task polling timed out",
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(eventSources).toHaveLength(1);
      expect(eventSources[0]?.closed).toBe(true);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
