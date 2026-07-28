// Copyright (c) 2026 AI anime
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Task Center public contract", () => {
  it("exports the task query hooks from one public entry", async () => {
    const taskCenter = await import("@/task-center/public");

    expect(typeof taskCenter.useTasks).toBe("function");
    expect(typeof taskCenter.useCancelTask).toBe("function");
    expect(typeof taskCenter.useClearCompleted).toBe("function");
    expect(typeof taskCenter.useDeleteTask).toBe("function");
  });

  it("does not retain the legacy task query entry", () => {
    expect(existsSync("src/lib/queries/tasks.ts")).toBe(false);
  });

  it("keeps the active task stream adapter available", async () => {
    const taskStream = await import("@/hooks/use-task-stream");
    expect(typeof taskStream.useTaskStream).toBe("function");
  });

  it("keeps the tasks route registered", async () => {
    const route = await import("@/routes/_app/projects.$project/tasks");
    expect(route.Route).toBeDefined();
  });

  it("keeps task panel state in the app store", async () => {
    const { useAppStore } = await import("@/stores/app-store");
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
