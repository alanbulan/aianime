// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import {
  browserCanvasNodeDefaultDataGateway,
  rememberLastVideoModel,
} from "./browserCanvasNodeDefaultDataGateway";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
describe("browserCanvasNodeDefaultDataGateway", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists and restores the last video model", () => {
    rememberLastVideoModel("video-model-2");

    expect(
      browserCanvasNodeDefaultDataGateway.getOverrides(
        CANVAS_NODE_TYPES.video,
      ),
    ).toEqual({ model: "video-model-2" });
    expect(window.localStorage.getItem("canvas.lastVideoModel")).toBe(
      "video-model-2",
    );
  });

  it("does not provide overrides for empty or unrelated preferences", () => {
    rememberLastVideoModel("");

    expect(
      browserCanvasNodeDefaultDataGateway.getOverrides(
        CANVAS_NODE_TYPES.video,
      ),
    ).toEqual({});
    expect(
      browserCanvasNodeDefaultDataGateway.getOverrides(
        CANVAS_NODE_TYPES.audio,
      ),
    ).toEqual({});
  });
});
