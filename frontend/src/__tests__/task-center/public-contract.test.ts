// Copyright (c) 2026 AI anime
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Task Center public contract", () => {
  it("exports Task Center capabilities from Task Execution", async () => {
    const taskExecution = await import("@/modules/task_execution/public");

    expect(typeof taskExecution.TaskCenterProvider).toBe("function");
    expect(typeof taskExecution.useTaskCenterStore).toBe("function");
    expect(typeof taskExecution.useTaskSubscribe).toBe("function");
    expect(typeof taskExecution.useTasks).toBe("function");
    expect(typeof taskExecution.useCancelTask).toBe("function");
    expect(typeof taskExecution.useClearCompleted).toBe("function");
    expect(typeof taskExecution.useDeleteTask).toBe("function");
    expect(typeof taskExecution.listTasks).toBe("function");
    expect(typeof taskExecution.awaitTaskCompletion).toBe("function");
    expect(typeof taskExecution.TaskCompletionError).toBe("function");
  });

  it("does not retain legacy task entries", () => {
    expect(existsSync("src/lib/queries/tasks.ts")).toBe(false);
    expect(existsSync("src/api/tasks.ts")).toBe(false);
    expect(existsSync("src/task-center")).toBe(false);
  });

  it("keeps the active task stream adapter available", async () => {
    const taskStream = await import("@/modules/task_execution/public");
    expect(typeof taskStream.useTaskStream).toBe("function");
  });

  it("keeps the tasks route registered", async () => {
    const route = await import("@/routes/_app/projects.$project/tasks");
    expect(route.Route).toBeDefined();
  });

  it("keeps task panel state in the app store", async () => {
    const { useAppStore } = await import("@/modules/project_workspace/public");
    const state = useAppStore.getState();

    expect(typeof state.language).toBe("string");
    expect(typeof state.theme).toBe("string");
    expect(typeof state.dashboardTab).toBe("string");
    expect(typeof state.setLanguage).toBe("function");
    expect(typeof state.setTheme).toBe("function");
    expect(typeof state.taskPanelOpen).toBe("boolean");
    expect(typeof state.taskPanelHeight).toBe("number");
    expect(typeof state.setTaskPanelOpen).toBe("function");
    expect(typeof state.setTaskPanelHeight).toBe("function");
  });
});
