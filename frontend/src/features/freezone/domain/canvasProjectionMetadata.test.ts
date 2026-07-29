// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  hasLegacyPresetCanvasMetadata,
  projectionMetadataWithRequest,
  requestFromProjectionMetadata,
} from "./canvasProjectionMetadata";

describe("freezone canvas projection metadata", () => {
  it("recovers a normalized sync request from legacy projection metadata", () => {
    expect(
      requestFromProjectionMetadata(
        {
          projections: {
            "beat:1:4": {
              projection_key: "beat:1:4",
              facts_signature: "old",
            },
          },
        },
        "beat:1:4",
      ),
    ).toEqual({
      scope: "beat",
      episode: 1,
      beat: 4,
      primary_slot: "render",
      asset_kind: undefined,
      character: undefined,
      identity_id: undefined,
      asset_id: undefined,
    });
  });

  it("does not treat projection canvases as legacy preset canvases", () => {
    expect(hasLegacyPresetCanvasMetadata({ preset: { scope: "beat" } })).toBe(true);
    expect(
      hasLegacyPresetCanvasMetadata({
        preset: { scope: "beat" },
        projections: { "beat:1:4": { projection_key: "beat:1:4" } },
      }),
    ).toBe(false);
  });

  it("adds the source request to projection metadata for future syncs", () => {
    expect(
      projectionMetadataWithRequest(
        { projections: { "beat:1:4": { projection_key: "beat:1:4", facts_signature: "sig" } } },
        "beat:1:4",
        {
          scope: "beat",
          episode: 1,
          beat: 4,
          primary_slot: "sketch",
        },
      ),
    ).toMatchObject({
      projections: {
        "beat:1:4": {
          projection_key: "beat:1:4",
          facts_signature: "sig",
          request: {
            scope: "beat",
            episode: 1,
            beat: 4,
            primary_slot: "render",
          },
        },
      },
      last_projection_key: "beat:1:4",
    });
  });

  it("stores refreshed projection facts signature in metadata", () => {
    expect(
      projectionMetadataWithRequest(
        { projections: { "beat:1:4": { projection_key: "beat:1:4", facts_signature: "old" } } },
        "beat:1:4",
        {
          scope: "beat",
          episode: 1,
          beat: 4,
        },
        "new",
      ),
    ).toMatchObject({
      projections: {
        "beat:1:4": {
          projection_key: "beat:1:4",
          facts_signature: "new",
        },
      },
    });
  });
});
