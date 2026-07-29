// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  shouldClearProjectionStatuses,
  shouldFetchProjectionStatuses,
  shouldSkipProjectionStatusRevision,
  useCanvasProjectionStatusLifecycle,
  type CanvasProjectionStatusLifecycleOptions,
} from "./useCanvasProjectionStatusLifecycle";

const mocks = vi.hoisted(() => ({
  getProjectionStatuses: vi.fn(),
  clearCanvasProjectionStatuses: vi.fn(),
  setCanvasProjectionStatuses: vi.fn(),
}));

vi.mock("../composition", () => ({
  getProjectionStatuses: mocks.getProjectionStatuses,
}));

vi.mock("../application/canvasProjectionStatusState", () => ({
  clearCanvasProjectionStatuses: mocks.clearCanvasProjectionStatuses,
  setCanvasProjectionStatuses: mocks.setCanvasProjectionStatuses,
}));

const readyOptions: CanvasProjectionStatusLifecycleOptions = {
  projectId: "project-a",
  canvasId: "user_eric",
  hydratedCanvasId: "user_eric",
  metadata: {
    projections: {
      "beat:1:4": { projection_key: "beat:1:4" },
    },
  },
  revision: 7,
  syncStatus: "ready",
};

describe("canvas projection status lifecycle", () => {
  beforeEach(() => {
    mocks.getProjectionStatuses.mockReset().mockResolvedValue({
      canvas_id: "user_eric",
      revision: 7,
      projections: [
        { projection_key: "beat:1:4", stale: true },
      ],
    });
    mocks.clearCanvasProjectionStatuses.mockReset();
    mocks.setCanvasProjectionStatuses.mockReset();
  });

  it("keeps status visibility and fetching aligned with the hydrated revision", () => {
    expect(shouldClearProjectionStatuses({
      canvasId: "user_eric",
      hydratedCanvasId: "user_eric",
      projectionKeyCount: 2,
    })).toBe(false);
    expect(shouldClearProjectionStatuses({
      canvasId: "user_eric",
      hydratedCanvasId: "other",
      projectionKeyCount: 2,
    })).toBe(true);
    expect(shouldClearProjectionStatuses({
      canvasId: "user_eric",
      hydratedCanvasId: "user_eric",
      projectionKeyCount: 0,
    })).toBe(true);
    expect(shouldFetchProjectionStatuses({
      canvasId: "user_eric",
      hydratedCanvasId: "user_eric",
      projectionKeyCount: 2,
      revision: 7,
      syncStatus: "saving",
    })).toBe(false);
    expect(shouldFetchProjectionStatuses({
      canvasId: "user_eric",
      hydratedCanvasId: "user_eric",
      projectionKeyCount: 2,
      revision: 8,
      syncStatus: "ready",
    })).toBe(true);
  });

  it("deduplicates one persisted revision until an explicit refresh", () => {
    expect(shouldSkipProjectionStatusRevision({
      canvasId: "user_eric",
      revision: 7,
      refreshToken: 0,
      lastChecked: { canvasId: "user_eric", revision: 7, refreshToken: 0 },
    })).toBe(true);
    expect(shouldSkipProjectionStatusRevision({
      canvasId: "user_eric",
      revision: 8,
      refreshToken: 0,
      lastChecked: { canvasId: "user_eric", revision: 7, refreshToken: 0 },
    })).toBe(false);
    expect(shouldSkipProjectionStatusRevision({
      canvasId: "other",
      revision: 7,
      refreshToken: 0,
      lastChecked: { canvasId: "user_eric", revision: 7, refreshToken: 0 },
    })).toBe(false);
    expect(shouldSkipProjectionStatusRevision({
      canvasId: "user_eric",
      revision: 7,
      refreshToken: 1,
      lastChecked: { canvasId: "user_eric", revision: 7, refreshToken: 0 },
    })).toBe(false);
  });

  it("publishes fetched statuses and refreshes after window focus", async () => {
    const hook = renderHook(
      (options: CanvasProjectionStatusLifecycleOptions) =>
        useCanvasProjectionStatusLifecycle(options),
      { initialProps: readyOptions },
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.getProjectionStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.getProjectionStatuses).toHaveBeenLastCalledWith(
      "project-a",
      "user_eric",
      ["beat:1:4"],
    );
    expect(mocks.setCanvasProjectionStatuses).toHaveBeenLastCalledWith([
      { projection_key: "beat:1:4", stale: true },
    ]);

    hook.rerender({
      ...readyOptions,
      metadata: { ...readyOptions.metadata },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.getProjectionStatuses).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(mocks.getProjectionStatuses).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it("clears stale statuses while the canvas is not queryable", () => {
    const hook = renderHook(() => useCanvasProjectionStatusLifecycle({
      ...readyOptions,
      hydratedCanvasId: "other",
    }));

    expect(mocks.clearCanvasProjectionStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.getProjectionStatuses).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("clears stale statuses when the status request fails", async () => {
    mocks.getProjectionStatuses.mockRejectedValueOnce(new Error("offline"));
    const hook = renderHook(() => useCanvasProjectionStatusLifecycle(readyOptions));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.clearCanvasProjectionStatuses).toHaveBeenCalledTimes(1);
    expect(mocks.setCanvasProjectionStatuses).not.toHaveBeenCalled();
    hook.unmount();
  });
});
