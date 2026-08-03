// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCanvasAsyncNodeTasks } from "./useCanvasAsyncNodeTasks";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("useCanvasAsyncNodeTasks", () => {
  it("starts every pending node only when enabled", () => {
    const runNode = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ enabled }) =>
        useCanvasAsyncNodeTasks({
          enabled,
          pendingNodeIds: ["node-1", "node-2"],
          runNode,
        }),
      { initialProps: { enabled: false } },
    );

    expect(runNode).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(runNode).toHaveBeenNthCalledWith(1, "node-1");
    expect(runNode).toHaveBeenNthCalledWith(2, "node-2");
  });

  it("does not start an active node twice and releases it after completion", async () => {
    const firstRun = deferred();
    const runNode = vi.fn(() => firstRun.promise);
    const { rerender } = renderHook(
      ({ pendingNodeIds }) =>
        useCanvasAsyncNodeTasks({
          pendingNodeIds,
          runNode,
        }),
      { initialProps: { pendingNodeIds: ["node-1"] } },
    );

    rerender({ pendingNodeIds: ["node-1"] });
    expect(runNode).toHaveBeenCalledOnce();

    await act(async () => firstRun.resolve());
    rerender({ pendingNodeIds: [] });
    rerender({ pendingNodeIds: ["node-1"] });
    expect(runNode).toHaveBeenCalledTimes(2);
  });

  it("keeps active node sets independent between hook instances", () => {
    const runFirstNode = vi.fn().mockResolvedValue(undefined);
    const runSecondNode = vi.fn().mockResolvedValue(undefined);

    renderHook(() => {
      useCanvasAsyncNodeTasks({
        pendingNodeIds: ["node-1"],
        runNode: runFirstNode,
      });
      useCanvasAsyncNodeTasks({
        pendingNodeIds: ["node-1"],
        runNode: runSecondNode,
      });
    });

    expect(runFirstNode).toHaveBeenCalledOnce();
    expect(runSecondNode).toHaveBeenCalledOnce();
  });
});
