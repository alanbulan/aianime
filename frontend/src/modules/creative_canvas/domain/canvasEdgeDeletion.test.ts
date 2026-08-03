// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { canDeleteCanvasEdge, deleteCanvasEdge } from "./canvasEdgeDeletion";

interface TestEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

function edge(id: string, data?: Record<string, unknown>): TestEdge {
  return {
    id,
    source: `${id}-source`,
    target: `${id}-target`,
    data,
  };
}

describe("Canvas edge deletion", () => {
  it("returns null when the edge does not exist", () => {
    expect(deleteCanvasEdge([edge("kept")], "missing")).toBeNull();
    expect(canDeleteCanvasEdge(undefined)).toBe(false);
  });

  it("rejects backend-managed edges", () => {
    const preset = edge("preset", { preset_managed: true });
    const projection = edge("projection", { projection_key: "beat:1:4" });

    expect(deleteCanvasEdge([preset], preset.id)).toBeNull();
    expect(deleteCanvasEdge([projection], projection.id)).toBeNull();
    expect(canDeleteCanvasEdge(preset)).toBe(false);
    expect(canDeleteCanvasEdge(projection)).toBe(false);
  });

  it("removes only the requested user edge", () => {
    const kept = edge("kept");
    const removed = edge("removed", {
      preset_managed: true,
      user_spawned: true,
    });

    expect(deleteCanvasEdge([kept, removed], removed.id)).toEqual([kept]);
    expect(canDeleteCanvasEdge(removed)).toBe(true);
  });
});
