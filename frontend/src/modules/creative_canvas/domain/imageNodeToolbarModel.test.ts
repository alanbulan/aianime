// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { projectImageNodeToolbar } from "./imageNodeToolbarModel";

describe("imageNodeToolbarModel", () => {
  it("projects a visible unlocked toolbar from the canonical image source", () => {
    expect(projectImageNodeToolbar("/preview.png", false, false)).toEqual({
      visible: true,
      imageSource: "/preview.png",
      canRotate: true,
    });
  });

  it("hides image-edit and empty nodes while locking in-place rotation", () => {
    expect(projectImageNodeToolbar("/source.png", false, true)).toMatchObject({
      visible: true,
      canRotate: false,
    });
    expect(projectImageNodeToolbar("/source.png", true, false)).toEqual({
      visible: false,
      imageSource: null,
      canRotate: false,
    });
    expect(projectImageNodeToolbar(null, false, false)).toEqual({
      visible: false,
      imageSource: null,
      canRotate: false,
    });
  });
});
