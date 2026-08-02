// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { presetRequestFromMetadata } from "./canvasPreset";

describe("canvas preset metadata", () => {
  it("parses a restorable preset request without carrying save-only fields", () => {
    expect(
      presetRequestFromMetadata({
        scope: "beat",
        episode: 2,
        beat: 4,
        canvas_id: "legacy-canvas",
        overwrite_existing: true,
        base_revision: 9,
      }),
    ).toEqual({
      scope: "beat",
      episode: 2,
      beat: 4,
      primary_slot: "render",
      asset_kind: null,
      character: null,
      identity_id: null,
      asset_id: null,
    });
  });

  it("normalizes malformed optional metadata", () => {
    expect(
      presetRequestFromMetadata({
        scope: "asset",
        episode: Number.NaN,
        beat: Number.POSITIVE_INFINITY,
        primary_slot: "portrait",
        asset_kind: "character",
        character: "  ",
        identity_id: 12,
        asset_id: "hero",
      }),
    ).toEqual({
      scope: "asset",
      episode: null,
      beat: null,
      primary_slot: "portrait",
      asset_kind: "character",
      character: null,
      identity_id: null,
      asset_id: "hero",
    });
  });

  it("rejects missing, blank and non-restorable scopes", () => {
    expect(presetRequestFromMetadata(null)).toBeNull();
    expect(presetRequestFromMetadata({ scope: "" })).toBeNull();
    expect(presetRequestFromMetadata({ scope: "blank" })).toBeNull();
  });
});
