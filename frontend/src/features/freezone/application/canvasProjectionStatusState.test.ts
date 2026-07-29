// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it } from "vitest";

import {
  clearCanvasProjectionStatuses,
  getCanvasProjectionStatus,
  markCanvasProjectionFresh,
  setCanvasProjectionStatuses,
} from "./canvasProjectionStatusState";

describe("freezone projection status state", () => {
  afterEach(() => {
    clearCanvasProjectionStatuses();
  });

  it("keeps projection freshness as ephemeral UI state keyed by projection key", () => {
    setCanvasProjectionStatuses([
      { projection_key: "beat:1:4", stale: true },
      { projection_key: "asset:scene:hall", stale: false },
    ]);

    expect(getCanvasProjectionStatus("beat:1:4")?.stale).toBe(true);
    expect(getCanvasProjectionStatus("asset:scene:hall")?.stale).toBe(false);
    expect(getCanvasProjectionStatus("missing")).toBeNull();
  });

  it("can optimistically mark one projection fresh after local sync", () => {
    setCanvasProjectionStatuses([
      { projection_key: "beat:1:4", stale: true },
      { projection_key: "asset:scene:hall", stale: true },
    ]);

    markCanvasProjectionFresh("beat:1:4");

    expect(getCanvasProjectionStatus("beat:1:4")?.stale).toBe(false);
    expect(getCanvasProjectionStatus("asset:scene:hall")?.stale).toBe(true);
  });
});
