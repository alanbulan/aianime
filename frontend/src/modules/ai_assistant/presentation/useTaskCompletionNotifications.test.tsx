// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTaskCompletionNotifications } from "@/modules/ai_assistant/public";
import {
  createTaskEventBus,
  TaskEventBusContext,
  type TaskEventBus,
  type TaskState,
} from "@/modules/task_execution/public";

const t = (key: string) => key;

function task(overrides: Partial<TaskState> = {}): TaskState {
  return {
    task_key: "task:demo",
    task_id: "id-demo",
    task_type: "unknown",
    username: "alice",
    project: "project-a",
    project_id: "project-a",
    episode: 0,
    beat_num: null,
    scope: null,
    status: "completed",
    progress: 1,
    current_task: "completed",
    result: null,
    error: null,
    logs: [],
    display_name: "分镜生成",
    created_at: "",
    updated_at: "",
    completed_at: "",
    ...overrides,
  };
}

function wrapperFor(eventBus: TaskEventBus) {
  return function EventBusWrapper({ children }: { children: ReactNode }) {
    return (
      <TaskEventBusContext.Provider value={eventBus}>
        {children}
      </TaskEventBusContext.Provider>
    );
  };
}

describe("SuperChat task completion notifications", () => {
  it("does not subscribe without a project", () => {
    const eventBus = createTaskEventBus();
    const subscribe = vi.spyOn(eventBus, "on");

    renderHook(
      () => useTaskCompletionNotifications({
        project: "  ",
        appendNotification: vi.fn(async (_text: string) => true),
        t,
      }),
      { wrapper: wrapperFor(eventBus) },
    );

    expect(subscribe).not.toHaveBeenCalled();
  });

  it("ignores non-terminal events and tasks from another project", () => {
    const eventBus = createTaskEventBus();
    const appendNotification = vi.fn(async (_text: string) => true);
    renderHook(
      () => useTaskCompletionNotifications({
        project: " project-a ",
        appendNotification,
        t,
      }),
      { wrapper: wrapperFor(eventBus) },
    );

    act(() => {
      eventBus.emit({
        type: "task_updated",
        task: task(),
        previous: null,
      });
      eventBus.emit({
        type: "task_complete",
        task: task({ project: "project-b", project_id: "project-b" }),
        previous: null,
      });
    });

    expect(appendNotification).not.toHaveBeenCalled();
  });

  it("formats completed tasks and deduplicates by the task id fallback", () => {
    const eventBus = createTaskEventBus();
    const appendNotification = vi.fn(async (_text: string) => true);
    renderHook(
      () => useTaskCompletionNotifications({
        project: "project-a",
        appendNotification,
        t,
      }),
      { wrapper: wrapperFor(eventBus) },
    );
    const completedTask = task({
      task_key: "",
      task_id: "task-42",
      task_type: "scene_reference_asset",
      display_name: undefined,
      result: { scene_name: "教学楼", kind: "master" },
    });

    act(() => {
      eventBus.emit({ type: "task_complete", task: completedTask, previous: null });
      eventBus.emit({ type: "task_complete", task: completedTask, previous: null });
    });

    expect(appendNotification).toHaveBeenCalledTimes(1);
    expect(appendNotification).toHaveBeenCalledWith(
      "✅ 教学楼主场景参考图已完成。你可以让我查看结果，或继续下一步。",
    );
  });

  it("uses each failure detail fallback and unsubscribes on unmount", () => {
    const eventBus = createTaskEventBus();
    const appendNotification = vi.fn(async (_text: string) => true);
    const { unmount } = renderHook(
      () => useTaskCompletionNotifications({
        project: "project-a",
        appendNotification,
        t,
      }),
      { wrapper: wrapperFor(eventBus) },
    );

    act(() => {
      eventBus.emit({
        type: "task_failed",
        task: task({ task_key: "error", status: "failed", error: "GPU 超时" }),
        previous: null,
      });
      eventBus.emit({
        type: "task_failed",
        task: task({
          task_key: "current-task",
          status: "failed",
          current_task: "素材缺失",
          error: null,
        }),
        previous: null,
      });
      eventBus.emit({
        type: "task_failed",
        task: task({
          task_key: "fallback",
          status: "failed",
          current_task: "",
          error: null,
        }),
        previous: null,
      });
    });

    expect(appendNotification.mock.calls.map(([text]) => text)).toEqual([
      "分镜生成失败：GPU 超时\n请根据错误处理前置条件后再继续。",
      "分镜生成失败：素材缺失\n请根据错误处理前置条件后再继续。",
      "分镜生成失败：未提供具体错误原因\n请根据错误处理前置条件后再继续。",
    ]);

    unmount();
    act(() => {
      eventBus.emit({
        type: "task_complete",
        task: task({ task_key: "after-unmount" }),
        previous: null,
      });
    });
    expect(appendNotification).toHaveBeenCalledTimes(3);
  });

  it("retains deduplication across project changes", () => {
    const eventBus = createTaskEventBus();
    const appendNotification = vi.fn(async (_text: string) => true);
    const { rerender } = renderHook(
      ({ project }) => useTaskCompletionNotifications({
        project,
        appendNotification,
        t,
      }),
      {
        initialProps: { project: "project-a" },
        wrapper: wrapperFor(eventBus),
      },
    );

    act(() => {
      eventBus.emit({
        type: "task_complete",
        task: task({ task_key: "shared-key" }),
        previous: null,
      });
    });
    rerender({ project: "project-b" });
    act(() => {
      eventBus.emit({
        type: "task_complete",
        task: task({
          task_key: "shared-key",
          project: "project-b",
          project_id: "project-b",
        }),
        previous: null,
      });
    });

    expect(appendNotification).toHaveBeenCalledTimes(1);
  });
});
