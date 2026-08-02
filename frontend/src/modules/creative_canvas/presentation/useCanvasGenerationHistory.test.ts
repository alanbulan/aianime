// Copyright (c) 2026 AI anime
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getCanvasGenerationHistory = vi.hoisted(() => vi.fn());

vi.mock("../generationHistoryComposition", () => ({
  getCanvasGenerationHistory,
}));

import { useCanvasGenerationHistory } from "./useCanvasGenerationHistory";

const historyContext = { projectId: "p1", canvasId: "c1" };

describe("useCanvasGenerationHistory", () => {
  beforeEach(() => {
    getCanvasGenerationHistory.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the whole canvas history once (no per-node fan-out)", async () => {
    const records = [
      { id: "a", node_id: "kept", status: "completed", recorded_at: "2026-06-16T00:00:00Z" },
      // A record whose node no longer exists on the canvas still comes back —
      // that is the deleted-node-survives-in-history guarantee.
      { id: "b", node_id: "deleted", status: "completed", recorded_at: "2026-06-15T00:00:00Z" },
    ];
    getCanvasGenerationHistory.mockResolvedValue(records);

    const { result } = renderHook(() =>
      useCanvasGenerationHistory(historyContext, ["kept"], { enabled: true }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getCanvasGenerationHistory).toHaveBeenCalledTimes(1);
    expect(getCanvasGenerationHistory).toHaveBeenCalledWith({
      projectId: "p1",
      canvasId: "c1",
      fallbackNodeIds: ["kept"],
    });
    expect(result.current.records).toEqual(records);
    expect(result.current.error).toBeNull();
  });

  it("forwards fallback node ids to the application query", async () => {
    getCanvasGenerationHistory.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useCanvasGenerationHistory(historyContext, ["n1", "n2"], {
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getCanvasGenerationHistory).toHaveBeenCalledWith({
      projectId: "p1",
      canvasId: "c1",
      fallbackNodeIds: ["n1", "n2"],
    });
    expect(result.current.records).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch when disabled", async () => {
    getCanvasGenerationHistory.mockResolvedValue([]);
    renderHook(() =>
      useCanvasGenerationHistory(historyContext, ["n1"], { enabled: false }),
    );
    await Promise.resolve();
    expect(getCanvasGenerationHistory).not.toHaveBeenCalled();
  });

  it("uses an explicitly resolved default canvas id", async () => {
    getCanvasGenerationHistory.mockResolvedValue([]);

    const { result } = renderHook(() =>
      useCanvasGenerationHistory(
        { projectId: "p1", canvasId: "default" },
        [],
        { enabled: true },
      ),
    );

    await waitFor(() => expect(getCanvasGenerationHistory).toHaveBeenCalled());
    expect(getCanvasGenerationHistory).toHaveBeenCalledWith({
      projectId: "p1",
      canvasId: "default",
      fallbackNodeIds: [],
    });
    expect(result.current.error).toBeNull();
  });

  it("surfaces an application query error", async () => {
    getCanvasGenerationHistory.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useCanvasGenerationHistory(historyContext, ["n1"], { enabled: true }),
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("boom");
    expect(result.current.records).toEqual([]);
  });
});
