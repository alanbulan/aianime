// Copyright (c) 2026 AI anime
import { describe, it, expect, vi } from "vitest";
import { sampleTask } from "@/__mocks__/msw/handlers/tasks";
import { createTaskEventBus } from "@/modules/task_execution/public";

describe("event-bus", () => {
  it("emits to specific type listener", () => {
    const bus = createTaskEventBus();
    const listener = vi.fn();
    bus.on("task_complete", listener);
    const task = sampleTask({ status: "completed" });
    bus.emit({ type: "task_complete", task, previous: null });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ type: "task_complete", task, previous: null });
  });

  it("does not cross-fire between types", () => {
    const bus = createTaskEventBus();
    const completeL = vi.fn();
    const failedL = vi.fn();
    bus.on("task_complete", completeL);
    bus.on("task_failed", failedL);
    bus.emit({ type: "task_complete", task: sampleTask(), previous: null });
    expect(completeL).toHaveBeenCalledOnce();
    expect(failedL).not.toHaveBeenCalled();
  });

  it("fires wildcard listener for every event", () => {
    const bus = createTaskEventBus();
    const listener = vi.fn();
    bus.on("*", listener);
    bus.emit({ type: "task_complete", task: sampleTask(), previous: null });
    bus.emit({ type: "task_failed", task: sampleTask(), previous: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns unsubscribe from on()", () => {
    const bus = createTaskEventBus();
    const listener = vi.fn();
    const off = bus.on("task_complete", listener);
    off();
    bus.emit({ type: "task_complete", task: sampleTask(), previous: null });
    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates listener throws from other listeners", () => {
    const bus = createTaskEventBus();
    const thrower = vi.fn(() => {
      throw new Error("boom");
    });
    const survivor = vi.fn();
    bus.on("task_complete", thrower);
    bus.on("task_complete", survivor);
    bus.emit({ type: "task_complete", task: sampleTask(), previous: null });
    expect(survivor).toHaveBeenCalledOnce();
  });
});
