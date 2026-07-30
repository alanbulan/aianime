// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { projectImageGridToolbarActions } from "./imageGridToolbarModel";

describe("imageGridToolbarModel", () => {
  it("projects the ordered grid requests with translated labels and prompts", () => {
    const actions = projectImageGridToolbarActions(
      "image-a",
      (key) => `translated:${key}`,
    );

    expect(actions.map(({ key, cost }) => ({ key, cost }))).toEqual([
      { key: "multiCameraGrid", cost: 14 },
      { key: "plotFourGrid", cost: 8 },
      { key: "faceThreeView", cost: 6 },
      { key: "productThreeView", cost: 6 },
      { key: "serialStoryboard25", cost: 32 },
      { key: "cinematicLightCorrection", cost: 4 },
      { key: "characterThreeView", cost: 6 },
      { key: "frameProjection3sLater", cost: 4 },
      { key: "frameProjection5sEarlier", cost: 4 },
    ]);
    expect(actions[0]).toEqual({
      nodeId: "image-a",
      key: "multiCameraGrid",
      label: "translated:nodeToolbar.gridMenu.multiCameraGrid",
      prompt: "translated:nodeToolbar.gridMenu.multiCameraGridPrompt",
      cost: 14,
    });
  });
});
