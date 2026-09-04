// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  clampImageSplitLineThicknessPx,
  resolveMaxAllowedLineThickness,
  resolveImageSplitLayout,
  resolveImageSplitLineThicknessPx,
  splitIntoSegments,
} from "./toolImageGeometry";

describe("toolImageGeometry", () => {
  it("distributes remainder pixels across the leading segments", () => {
    expect(splitIntoSegments(10, 3)).toEqual([4, 3, 3]);
  });

  it("caps separator thickness by the narrowest grid axis", () => {
    expect(resolveMaxAllowedLineThickness(12, 10, 2, 3)).toBe(4);
    expect(resolveMaxAllowedLineThickness(2, 2, 3, 3)).toBe(0);
  });

  it("converts percent thickness once for preview and processing", () => {
    expect(resolveImageSplitLineThicknessPx(1200, 600, 2, 2, 1)).toBe(6);
    expect(resolveImageSplitLineThicknessPx(2, 2, 3, 3, 20)).toBe(0);
    expect(clampImageSplitLineThicknessPx(10, 8, 2, 3, 99)).toBe(3);
  });

  it("uses one layout for preview and export while excluding separator pixels", () => {
    const layout = resolveImageSplitLayout(10, 8, 2, 3, 1);

    expect(layout).toEqual({
      lineThickness: 1,
      lineRects: [
        { x: 3, y: 0, width: 1, height: 8 },
        { x: 7, y: 0, width: 1, height: 8 },
        { x: 0, y: 4, width: 10, height: 1 },
      ],
      cellRects: [
        { x: 0, y: 0, width: 3, height: 4 },
        { x: 4, y: 0, width: 3, height: 4 },
        { x: 8, y: 0, width: 2, height: 4 },
        { x: 0, y: 5, width: 3, height: 3 },
        { x: 4, y: 5, width: 3, height: 3 },
        { x: 8, y: 5, width: 2, height: 3 },
      ],
      minCellWidth: 2,
      maxCellWidth: 3,
      minCellHeight: 3,
      maxCellHeight: 4,
    });
  });
});
