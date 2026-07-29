// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it } from "vitest";

import {
  getFreezoneCanvasMetadata,
  setFreezoneCanvasMetadata,
} from "./canvasMetadataState";

describe("freezone canvas metadata state", () => {
  afterEach(() => {
    setFreezoneCanvasMetadata(null);
  });

  it("publishes the current hydrated metadata until it is cleared", () => {
    const metadata = {
      shotMetadata: { angle: "low angle" },
      projections: { "beat:1:2": { projection_key: "beat:1:2" } },
    };

    setFreezoneCanvasMetadata(metadata);
    expect(getFreezoneCanvasMetadata()).toBe(metadata);

    setFreezoneCanvasMetadata(null);
    expect(getFreezoneCanvasMetadata()).toBeNull();
  });
});
