// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearCanvasProjectionStatuses,
  markCanvasProjectionFresh,
  setCanvasProjectionStatuses,
} from "../application/canvasProjectionStatusState";
import { useCanvasProjectionStatus } from "./useCanvasProjectionStatus";

describe("useCanvasProjectionStatus", () => {
  afterEach(() => {
    act(() => {
      clearCanvasProjectionStatuses();
    });
  });

  it("subscribes to the status for the requested projection", () => {
    const hook = renderHook(() => useCanvasProjectionStatus("beat:1:4"));

    expect(hook.result.current).toBeNull();

    act(() => {
      setCanvasProjectionStatuses([
        { projection_key: "beat:1:4", stale: true },
      ]);
    });
    expect(hook.result.current?.stale).toBe(true);

    act(() => {
      markCanvasProjectionFresh("beat:1:4");
    });
    expect(hook.result.current?.stale).toBe(false);
  });
});
