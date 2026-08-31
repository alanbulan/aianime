// Copyright (c) 2026 AI anime
import { useEffect, useRef } from "react";

import { buildChatTaskLabel } from "@/modules/ai_assistant/presentation/taskNotificationLabel";
import {
  type TaskState,
  useTaskEventBus,
} from "@/modules/task_execution/public";

type AppendNotification = (text: string) => Promise<boolean>;
type Translate = Parameters<typeof buildChatTaskLabel>[1];

type UseTaskCompletionNotificationsOptions = {
  project?: string;
  appendNotification: AppendNotification;
  t: Translate;
};

interface PendingFailure {
  timer: ReturnType<typeof setTimeout>;
  deliver: () => void;
}

const PARENT_CHILD_FAILURE_COALESCE_MS = 750;

function taskIdentity(task: TaskState): string {
  return task.task_id.trim() || task.task_key.trim();
}

function parentTaskIdentity(task: TaskState): string | null {
  const parentTaskId = task.metadata?.parent_task_id;
  if (typeof parentTaskId !== "string") return null;
  return parentTaskId.trim() || null;
}

export function useTaskCompletionNotifications({
  project,
  appendNotification,
  t,
}: UseTaskCompletionNotificationsOptions): void {
  const taskEventBus = useTaskEventBus();
  const notifiedTaskKeysRef = useRef<Set<string>>(new Set());
  const failedParentDeadlinesRef = useRef<Map<string, number>>(new Map());
  const pendingFailuresRef = useRef<Map<string, PendingFailure>>(new Map());

  useEffect(() => () => {
    const pendingFailures = [...pendingFailuresRef.current.values()];
    for (const pending of pendingFailures) {
      clearTimeout(pending.timer);
      pending.deliver();
    }
    pendingFailuresRef.current.clear();
    failedParentDeadlinesRef.current.clear();
  }, []);

  useEffect(() => {
    const scopedProject = project?.trim();
    if (!scopedProject) return;

    const unsubscribe = taskEventBus.on("*", (event) => {
      if (event.type !== "task_complete" && event.type !== "task_failed") return;
      const taskProject = (event.task.project_id ?? event.task.project).trim();
      if (taskProject !== scopedProject) return;

      const now = Date.now();
      for (const [parentTaskId, deadline] of failedParentDeadlinesRef.current) {
        if (deadline < now) {
          failedParentDeadlinesRef.current.delete(parentTaskId);
        }
      }

      const dedupeKey = `${event.type}:${event.task.task_key || event.task.task_id}`;
      if (notifiedTaskKeysRef.current.has(dedupeKey)) return;
      notifiedTaskKeysRef.current.add(dedupeKey);

      const label = buildChatTaskLabel(event.task, t);
      if (event.type === "task_complete") {
        void appendNotification(`✅ ${label}已完成。你可以让我查看结果，或继续下一步。`);
        return;
      }

      const taskId = taskIdentity(event.task);
      const parentTaskId = parentTaskIdentity(event.task);
      let parentDeadline: number | null = null;
      if (parentTaskId) {
        parentDeadline = Date.now() + PARENT_CHILD_FAILURE_COALESCE_MS;
        failedParentDeadlinesRef.current.set(
          parentTaskId,
          parentDeadline,
        );
        const pendingParent = pendingFailuresRef.current.get(parentTaskId);
        if (pendingParent !== undefined) {
          clearTimeout(pendingParent.timer);
          pendingFailuresRef.current.delete(parentTaskId);
        }
      }

      const isCoalescedParentFailure = () => {
        const deadline = failedParentDeadlinesRef.current.get(taskId);
        if (deadline === undefined) return false;
        failedParentDeadlinesRef.current.delete(taskId);
        return deadline >= Date.now();
      };
      if (isCoalescedParentFailure()) return;

      const deliverFailure = () => {
        pendingFailuresRef.current.delete(taskId);
        if (
          parentTaskId
          && failedParentDeadlinesRef.current.get(parentTaskId) === parentDeadline
        ) {
          failedParentDeadlinesRef.current.delete(parentTaskId);
        }
        if (isCoalescedParentFailure()) return;
        void appendNotification(
          `${label}失败：${event.task.error || event.task.current_task || "未提供具体错误原因"}\n请根据错误处理前置条件后再继续。`,
        );
      };
      const timer = setTimeout(
        deliverFailure,
        PARENT_CHILD_FAILURE_COALESCE_MS,
      );
      pendingFailuresRef.current.set(taskId, { timer, deliver: deliverFailure });
    });

    return unsubscribe;
  }, [appendNotification, project, t, taskEventBus]);
}
