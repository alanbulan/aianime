// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { sampleTask } from "@/__mocks__/msw/handlers/tasks";
import { server } from "@/__tests__/setup-msw";
import { useTaskCenterStore, useTasks } from "@/modules/task_execution/public";
import { createTaskQueryHooks } from "@/modules/task_execution/presentation/taskQueryHooks";
import { queryKeys } from "@/lib/query-keys";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Task Center query hooks", () => {
  it("refreshes task, invocation list, invocation details and quota after cancelling", async () => {
    const cancelTask = vi.fn(async () => undefined);
    const { useCancelTask } = createTaskQueryHooks({
      listProjectTasks: vi.fn(async () => []), cancelTask,
      clearCompletedTasks: vi.fn(async () => undefined), deleteTask: vi.fn(async () => undefined),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const keys = [
      queryKeys.tasks("demo"),
      queryKeys.commercialInvocations({ page: 1, pageSize: 20, status: "", operation: "" }),
      queryKeys.commercialInvocation("invocation-1"),
      queryKeys.commercialQuota(),
    ];
    keys.forEach((key) => client.setQueryData(key, {}));
    const { result } = renderHook(() => useCancelTask(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    const target = { type: "character_portrait", project: "demo", episode: 0, scope: "Qwen" };
    await act(async () => { await result.current.mutateAsync(target); });
    expect(cancelTask).toHaveBeenCalledExactlyOnceWith(target);
    keys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    useTaskCenterStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useTaskCenterStore.getState().reset();
  });

  it("does not poll when Task Center owns the same connected project", async () => {
    let requestCount = 0;
    server.use(
      http.get("*/api/v1/projects/demo/tasks", () => {
        requestCount += 1;
        return HttpResponse.json({ ok: true, data: [] });
      }),
    );

    useTaskCenterStore.getState().setProjects([{ id: "demo", name: "Demo" }]);
    useTaskCenterStore.getState().markHydrated();
    useTaskCenterStore.getState().setHealth("connected");

    renderHook(() => useTasks({ project: "demo" }), { wrapper });

    await act(async () => {
      await vi.waitFor(() => expect(requestCount).toBe(1));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(requestCount).toBe(1);
  });

  it("keeps polling active tasks outside Task Center's accessible projects", async () => {
    let requestCount = 0;
    server.use(
      http.get("*/api/v1/projects/demo/tasks", () => {
        requestCount += 1;
        return HttpResponse.json({
          ok: true,
          data: [sampleTask({ task_key: "running", status: "running" })],
        });
      }),
    );

    useTaskCenterStore.getState().setProjects([{ id: "other", name: "Other" }]);
    useTaskCenterStore.getState().markHydrated();
    useTaskCenterStore.getState().setHealth("connected");

    renderHook(() => useTasks({ project: "demo" }), { wrapper });

    await act(async () => {
      await vi.waitFor(() => expect(requestCount).toBe(1));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    expect(requestCount).toBeGreaterThan(1);
  });
});
