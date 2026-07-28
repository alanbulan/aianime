// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { sampleTask } from "@/__mocks__/msw/handlers/tasks";
import { server } from "@/__mocks__/msw/server";
import { useTasks } from "@/task-center/public";
import { useTaskCenterStore } from "@/task-center/store";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Task Center query hooks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTaskCenterStore.getState().reset();
  });

  afterEach(() => {
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

    useTaskCenterStore.getState().setProject("demo");
    useTaskCenterStore.getState().setHealth("connected");

    renderHook(() => useTasks({ project: "demo" }), { wrapper });

    await vi.waitFor(() => expect(requestCount).toBe(1));
    await vi.advanceTimersByTimeAsync(6000);

    expect(requestCount).toBe(1);
  });

  it("keeps polling active tasks when Task Center owns another project", async () => {
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

    useTaskCenterStore.getState().setProject("other");
    useTaskCenterStore.getState().setHealth("connected");

    renderHook(() => useTasks({ project: "demo" }), { wrapper });

    await vi.waitFor(() => expect(requestCount).toBe(1));
    await vi.advanceTimersByTimeAsync(2500);

    expect(requestCount).toBeGreaterThan(1);
  });
});
