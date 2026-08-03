// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  getCanvasDirectorStagePalette,
  type CanvasDirectorStagePaletteGateway,
} from "./directorStagePalette";

describe("getCanvasDirectorStagePalette", () => {
  it("delegates the project to the palette gateway", async () => {
    const palette = {
      actors: [],
      props: [],
      anonymous_colors: [],
      anonymous_prop_colors: [],
    };
    const getPalette = vi.fn().mockResolvedValue(palette);
    const gateway: CanvasDirectorStagePaletteGateway = { getPalette };

    await expect(getCanvasDirectorStagePalette(
      { projectId: "project-1" },
      gateway,
    )).resolves.toBe(palette);
    expect(getPalette).toHaveBeenCalledWith("project-1");
  });
});
