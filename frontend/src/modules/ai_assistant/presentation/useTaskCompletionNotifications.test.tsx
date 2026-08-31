// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  afterEach(() => {
    vi.useRealTimers();
  });

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
    vi.useFakeTimers();
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
      vi.runAllTimers();
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

  it.each(["parent-first", "child-first"] as const)(
    "coalesces a failed parent task and child task into the leaf notification (%s)",
    (order) => {
      vi.useFakeTimers();
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
      const error = "Agent 已完成但未生成文件";
      const parent = task({
        task_key: "workflow",
        task_id: "workflow-1",
        task_type: "production_workflow",
        display_name: "完整生产工作流",
        status: "failed",
        error,
      });
      const child = task({
        task_key: "single-video",
        task_id: "single-video-1",
        task_type: "single_video",
        display_name: "生成单镜视频 · ep1（第 1 集 Beat 8）",
        status: "failed",
        error,
        metadata: { parent_task_id: "workflow-1" },
      });

      act(() => {
        const orderedTasks = order === "parent-first" ? [parent, child] : [child, parent];
        for (const failedTask of orderedTasks) {
          eventBus.emit({ type: "task_failed", task: failedTask, previous: null });
        }
        vi.runAllTimers();
      });

      expect(appendNotification).toHaveBeenCalledTimes(1);
      expect(appendNotification).toHaveBeenCalledWith(
        "生成单镜视频 · ep1（第 1 集 Beat 8）失败：Agent 已完成但未生成文件\n请根据错误处理前置条件后再继续。",
      );
    },
  );

  it("keeps a parent failure that arrives outside the coalescing window", () => {
    vi.useFakeTimers();
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
    const child = task({
      task_key: "single-video",
      task_id: "single-video-1",
      display_name: "生成单镜视频",
      status: "failed",
      error: "子任务失败",
      metadata: { parent_task_id: "workflow-1" },
    });
    const parent = task({
      task_key: "workflow",
      task_id: "workflow-1",
      display_name: "完整生产工作流",
      status: "failed",
      error: "工作流独立失败",
    });

    act(() => {
      eventBus.emit({ type: "task_failed", task: child, previous: null });
      vi.advanceTimersByTime(751);
      eventBus.emit({ type: "task_failed", task: parent, previous: null });
      vi.runAllTimers();
    });

    expect(appendNotification.mock.calls.map(([text]) => text)).toEqual([
      "生成单镜视频失败：子任务失败\n请根据错误处理前置条件后再继续。",
      "完整生产工作流失败：工作流独立失败\n请根据错误处理前置条件后再继续。",
    ]);
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

  it("delivers a pending failure to its original scope after a project change", () => {
    vi.useFakeTimers();
    const eventBus = createTaskEventBus();
    const originalAppend = vi.fn(async (_text: string) => true);
    const nextAppend = vi.fn(async (_text: string) => true);
    const { rerender } = renderHook(
      ({ project, appendNotification }) => useTaskCompletionNotifications({
        project,
        appendNotification,
        t,
      }),
      {
        initialProps: {
          project: "project-a",
          appendNotification: originalAppend,
        },
        wrapper: wrapperFor(eventBus),
      },
    );

    act(() => {
      eventBus.emit({
        type: "task_failed",
        task: task({ task_key: "delayed-failure", error: "生成失败" }),
        previous: null,
      });
    });
    rerender({
      project: "project-b",
      appendNotification: nextAppend,
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(originalAppend).toHaveBeenCalledWith(
      "分镜生成失败：生成失败\n请根据错误处理前置条件后再继续。",
    );
    expect(nextAppend).not.toHaveBeenCalled();
  });

  it("flushes a pending failure exactly once when unmounted", () => {
    vi.useFakeTimers();
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
        task: task({ task_key: "unmount-failure", error: "生成失败" }),
        previous: null,
      });
    });
    expect(appendNotification).not.toHaveBeenCalled();

    unmount();

    expect(appendNotification).toHaveBeenCalledTimes(1);
    expect(appendNotification).toHaveBeenCalledWith(
      "分镜生成失败：生成失败\n请根据错误处理前置条件后再继续。",
    );
    act(() => {
      vi.runAllTimers();
    });
    expect(appendNotification).toHaveBeenCalledTimes(1);
  });
});
