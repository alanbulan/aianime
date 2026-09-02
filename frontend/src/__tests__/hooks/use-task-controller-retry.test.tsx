import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sampleTask } from "@/__mocks__/msw/handlers/tasks";
import type { TaskState } from "@/modules/task_execution/domain/contracts";

const mocks = vi.hoisted(() => ({
  tasks: [] as TaskState[],
  cancel: vi.fn().mockResolvedValue({ ok: true }),
  errorToast: vi.fn(),
  successToast: vi.fn(),
  translate: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
}));

vi.mock("@/modules/task_execution/presentation/taskQueryHooks", () => ({
  createTaskQueryHooks: () => ({
    useTasks: () => ({ data: { ok: true, data: mocks.tasks } }),
    useCancelTask: () => ({ mutateAsync: mocks.cancel, isPending: false }),
  }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.errorToast, success: mocks.successToast } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.translate }) }));

import { useAuthStore } from "@/modules/identity_access/public";
import { TaskControllerProvider } from "@/modules/task_execution/presentation/task-controller-provider";
import { useTaskController } from "@/modules/task_execution/presentation/useTaskController";

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  closed = false;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { MockEventSource.instances.push(this); }
  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  dispatch(type: string, data: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) });
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
  close() { this.closed = true; }
}

const scope = "character:Qwen:portrait";
const key = { taskType: "character_portrait", project: "demo", episode: 0, scope };
const task = (id: string, status: TaskState["status"]) => sampleTask({
  task_key: "task:character_portrait:project:demo:0:character:Qwen:portrait",
  task_id: id,
  task_type: key.taskType,
  project: key.project,
  episode: key.episode,
  scope,
  status,
  error: status === "failed" ? "previous failure" : null,
  logs: [`${id} log`],
});
const activeStream = () => [...MockEventSource.instances].reverse().find((source) => !source.closed)!;

function setup() {
  const onComplete = vi.fn();
  const onError = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = renderHook(() => useTaskController({ key, onComplete, onError }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <TaskControllerProvider project="demo" episode={0}>{children}</TaskControllerProvider>
      </QueryClientProvider>
    ),
  });
  return { ...rendered, onComplete, onError };
}

beforeEach(() => {
  mocks.tasks = [];
  mocks.cancel.mockClear();
  mocks.errorToast.mockClear();
  mocks.successToast.mockClear();
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  useAuthStore.setState({ username: "local", role: "owner" });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAuthStore.setState({ username: null, role: null });
});

describe("task controller retry isolation", () => {
  it.each(["failed", "cancelled", "completed"] as const)(
    "ignores cached %s from the previous run and accepts the successful retry once",
    (previousStatus) => {
      mocks.tasks = [task("old-run", previousStatus)];
      const { result, rerender, onComplete, onError } = setup();
      act(() => result.current.start({ scope, taskId: "new-run" }));
      expect(result.current.started).toBe(true);
      expect(result.current.stream.status).toBe("idle");
      expect(result.current.logs).not.toContain("old-run log");
      expect(onError).not.toHaveBeenCalled();
      expect(onComplete).not.toHaveBeenCalled();

      const source = activeStream();
      act(() => source.dispatch("running", task("new-run", "running")));
      act(() => source.dispatch("completed", { ...task("new-run", "completed"), result: { image: "new.png" } }));
      expect(result.current.started).toBe(false);
      expect(result.current.stream.status).toBe("completed");
      expect(onComplete).toHaveBeenCalledExactlyOnceWith({ image: "new.png" });

      mocks.tasks = [task("new-run", "completed")];
      rerender();
      act(() => source.dispatch("failed", task("old-run", "failed")));
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
      expect(mocks.errorToast).not.toHaveBeenCalled();
    },
  );

  it("ignores events still queued on the previous connection after restarting", () => {
    const { result, onError } = setup();
    act(() => result.current.start({ scope, taskId: "old-run" }));
    const previous = activeStream();
    act(() => previous.dispatch("cancelled", task("old-run", "cancelled")));
    act(() => result.current.start({ scope, taskId: "new-run" }));
    act(() => previous.dispatch("error", { error: "Task not found" }));
    act(() => previous.dispatch("failed", task("old-run", "failed")));
    expect(result.current.started).toBe(true);
    expect(result.current.stream.status).toBe("idle");
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });

  it("settles a genuine current-run failure once when polling wins the SSE race", () => {
    const { result, rerender, onError } = setup();
    act(() => result.current.start({ scope, taskId: "new-run" }));
    const source = activeStream();
    mocks.tasks = [task("new-run", "failed")];
    rerender();
    act(() => source.dispatch("failed", task("new-run", "failed")));
    expect(onError).toHaveBeenCalledExactlyOnceWith("previous failure");
    expect(result.current.started).toBe(false);
    expect(result.current.stream.status).toBe("failed");
  });

  it("learns a missing receipt ID from live events, never from an old cached terminal row", () => {
    mocks.tasks = [task("old-run", "failed")];
    const { result, onComplete, onError } = setup();
    act(() => result.current.start({ scope }));
    expect(result.current.started).toBe(true);
    act(() => activeStream().dispatch("running", task("new-run", "running")));
    act(() => activeStream().dispatch("completed", task("new-run", "completed")));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });

  it("closes a stream for a replaced run without reporting another run's error", () => {
    const { result, onError } = setup();
    act(() => result.current.start({ scope, taskId: "new-run" }));
    const source = activeStream();
    act(() => source.dispatch("failed", task("different-run", "failed")));
    expect(source.closed).toBe(true);
    expect(result.current.started).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });

  it("stops locally and ignores late cancellation/error events", async () => {
    const { result, onError } = setup();
    act(() => result.current.start({ scope, taskId: "new-run" }));
    const source = activeStream();
    await act(() => result.current.stop());
    act(() => source.dispatch("cancelled", task("new-run", "cancelled")));
    expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({ type: key.taskType, project: "demo", episode: 0, beatNum: undefined, scope });
    expect(result.current.started).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });
});
