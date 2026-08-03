// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  computeStoryboardCell,
  computeStoryboardGridLayout,
  resolveStoryboardCols,
  restoreStoryboardEdges,
} from "./storyboardGroup";

interface TestEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
  hidden?: boolean;
}

describe("storyboard grid layout", () => {
  it("packs five cells into a near-square grid in reading order", () => {
    const layout = computeStoryboardGridLayout({
      count: 5,
      cellWidth: 320,
      cellHeight: 180,
    });

    expect(layout.cols).toBe(3);
    expect(layout.rows).toBe(2);
    expect(layout.cells).toHaveLength(5);
    expect(layout.cells[3].x).toBe(layout.cells[0].x);
    expect(layout.cells[3].y).toBeGreaterThan(layout.cells[0].y);
  });

  it("sizes a cell to contain its content at the target aspect", () => {
    const wide = computeStoryboardCell(640, 300, "16:9");
    expect(wide.cellWidth).toBe(640);
    expect(wide.cellHeight).toBe(Math.round(640 / (16 / 9)));
    expect(wide.cellHeight).toBeGreaterThanOrEqual(300);

    const tall = computeStoryboardCell(300, 520, "16:9");
    expect(tall.cellHeight).toBe(520);
    expect(tall.cellWidth).toBeGreaterThanOrEqual(300);
  });

  it("honors an explicit column count", () => {
    expect(resolveStoryboardCols(5, 2)).toBe(2);
    expect(resolveStoryboardCols(5)).toBe(3);
    expect(resolveStoryboardCols(3, 9)).toBe(3);
  });
});

describe("restoreStoryboardEdges", () => {
  it("restores member endpoints and reveals hidden member edges", () => {
    const edges: TestEdge[] = [
      {
        id: "outgoing",
        source: "group",
        target: "outside",
        data: { __sbOrigSource: "child", role: "output" },
      },
      {
        id: "incoming",
        source: "outside",
        target: "group",
        data: { __sbOrigTarget: "child", role: "input" },
      },
      {
        id: "internal",
        source: "child",
        target: "sibling",
        hidden: true,
      },
    ];

    expect(
      restoreStoryboardEdges(
        edges,
        "group",
        new Set(["child", "sibling"]),
      ),
    ).toEqual([
      expect.objectContaining({
        id: "outgoing",
        source: "child",
        data: { role: "output" },
      }),
      expect.objectContaining({
        id: "incoming",
        target: "child",
        data: { role: "input" },
      }),
      expect.objectContaining({ id: "internal", hidden: false }),
    ]);
  });
});
