// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveMaxAllowedLineThickness,
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
});
