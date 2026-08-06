// Copyright (c) 2026 AI anime
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sampleTask } from "@/__mocks__/msw/handlers/tasks";
import type { TaskState } from "@/modules/task_execution/public";

const state = vi.hoisted(() => ({
  tasks: [] as TaskState[],
}));

vi.mock("@/modules/task_execution/presentation/useTaskStream", () => ({
  useTaskStream: () => ({
    status: "idle" as const,
    progress: 0,
    currentTask: "",
    result: null,
    error: null,
    logs: [],
  }),
}));

vi.mock("@/modules/task_execution/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  useTasks: () => ({ data: { ok: true, data: state.tasks } }),
  useCancelTask: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ ok: true, data: null }),
    isPending: false,
  }),
}));

import { TaskControllerProvider } from "@/modules/task_execution/presentation/task-controller-provider";
import { useTaskController } from "@/modules/task_execution/presentation/useTaskController";

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <TaskControllerProvider project="demo" episode={1}>
        {children}
      </TaskControllerProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  state.tasks = [];
});

describe("useTaskController logs", () => {
  it("hydrates stage logs from task list snapshots", async () => {
    state.tasks = [
      sampleTask({
        task_type: "script_writer",
        username: "u",
        project: "demo",
        episode: 1,
        status: "running",
        progress: 0.5,
        current_task: "生成第 1 行",
        logs: ["[INFO] 启动", "[INFO] 生成第 1 行"],
      }),
    ];

    const { result } = renderHook(
      () =>
        useTaskController({
          key: { taskType: "script_writer", project: "demo", episode: 1 },
        }),
      { wrapper: ({ children }) => wrap(children) },
    );

    await waitFor(() =>
      expect(result.current.logs).toEqual([
        "[INFO] 启动",
        "[INFO] 生成第 1 行",
      ]),
    );
  });
});
