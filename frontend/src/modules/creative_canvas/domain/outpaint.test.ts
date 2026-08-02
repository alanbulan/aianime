// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { calculateCanvasOutpaintFrame } from "./outpaint";

describe("outpaint domain", () => {
  it("preserves the source frame for the original ratio", () => {
    expect(calculateCanvasOutpaintFrame(400, 300, "original")).toEqual({
      width: 400,
      height: 300,
    });
  });

  it("only extends the dimension required by the target ratio", () => {
    expect(calculateCanvasOutpaintFrame(400, 300, "16:9")).toEqual({
      width: 300 * (16 / 9),
      height: 300,
    });
    expect(calculateCanvasOutpaintFrame(400, 300, "9:16")).toEqual({
      width: 400,
      height: 400 / (9 / 16),
    });
  });
});
