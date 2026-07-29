// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  normalizePresetProjectionRequest,
  projectionKeyForPresetRequest,
  projectionLabelForPresetRequest,
  projectionTargetForCanvasPanel,
  shouldProjectPresetIntoPersonalCanvas,
} from "./canvasProjectionRequest";

describe("freezone canvas projection request", () => {
  it("creates deterministic projection keys", () => {
    expect(projectionKeyForPresetRequest({ scope: "beat", episode: 1, beat: 4 })).toBe("beat:1:4");
    expect(projectionKeyForPresetRequest({ scope: "episode", episode: 2 })).toBe("episode:2");
    expect(projectionKeyForPresetRequest({ scope: "asset", asset_kind: "prop", asset_id: "paper_box" })).toBe(
      "asset:prop:paper_box",
    );
  });

  it("normalizes beat projections to the full beat workbench request", () => {
    expect(
      normalizePresetProjectionRequest({
        scope: "beat",
        episode: 1,
        beat: 4,
        primary_slot: "sketch",
      }),
    ).toEqual({
      scope: "beat",
      episode: 1,
      beat: 4,
      primary_slot: "render",
    });
  });

  it("creates readable projection labels", () => {
    expect(projectionLabelForPresetRequest({ scope: "beat", episode: 1, beat: 4 })).toBe("EP1/B4");
    expect(projectionLabelForPresetRequest({ scope: "episode", episode: 2 })).toBe("EP2");
    expect(projectionLabelForPresetRequest({ scope: "asset", asset_kind: "prop", asset_id: "paper_box" })).toBe(
      "prop · paper_box",
    );
  });

  it("always targets the current user's personal canvas for preset projection", () => {
    expect(
      shouldProjectPresetIntoPersonalCanvas({
        currentCanvasId: "user_director_example_com_abc123",
        personalCanvasId: "user_eric_example_com_1m9fjbn",
        request: { scope: "beat", episode: 1, beat: 4 },
      }),
    ).toEqual({
      targetCanvasId: "user_eric_example_com_1m9fjbn",
      projectionKey: "beat:1:4",
    });
  });

  it("targets the currently open canvas when syncing from the projection panel", () => {
    expect(
      projectionTargetForCanvasPanel({
        currentCanvasId: "user_director_example_com_abc123",
        request: { scope: "beat", episode: 1, beat: 4 },
      }),
    ).toEqual({
      targetCanvasId: "user_director_example_com_abc123",
      projectionKey: "beat:1:4",
    });
  });
});
