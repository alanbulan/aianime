// Copyright (c) 2026 AI anime

import { describe, expect, it } from "vitest";

import { projectImageEditToolbar } from "./imageEditToolbarModel";

describe("imageEditToolbarModel", () => {
  it("keeps the six edit actions ordered and selects the requested action", () => {
    const projection = projectImageEditToolbar(false, "outpaint");

    expect(projection.actions.map((action) => action.key)).toEqual([
      "repaint",
      "erase",
      "matting",
      "crop",
      "hd",
      "outpaint",
    ]);
    expect(projection.activeActionIndex).toBe(5);
  });

  it("removes the in-place HD action when locked and falls back to matting", () => {
    const projection = projectImageEditToolbar(true, "hd");

    expect(projection.actions.map((action) => action.key)).toEqual([
      "repaint",
      "erase",
      "matting",
      "crop",
      "outpaint",
    ]);
    expect(projection.activeActionIndex).toBe(2);
    expect(projection.actions[projection.activeActionIndex].key).toBe(
      "matting",
    );
  });
});
