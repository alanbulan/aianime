// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  assetToPushTarget,
  coercePushTarget,
  completeTarget,
  inferDefaultTarget,
  isCanonicalPushTarget,
  isPlyOrGlbPushTargetKind,
} from "./pushTarget";

describe("pushTarget", () => {
  it("accepts canonical targets and migrates persisted legacy kinds", () => {
    const canonical = { kind: "frame", episode: 1, beat: 2 };

    expect(isCanonicalPushTarget(canonical)).toBe(true);
    expect(coercePushTarget(canonical)).toBe(canonical);
    expect(coercePushTarget({
      kind: "scene_360",
      scene_id: "hall",
    })).toEqual({
      kind: "scene_director_pano_360",
      scene_id: "hall",
    });
    expect(coercePushTarget({
      kind: "scene_3gs_uploaded_ply",
      scene_id: "hall",
    })).toEqual({
      kind: "scene_3gs_custom_scene",
      scene_id: "hall",
    });
  });

  it("rejects non-canonical target kinds", () => {
    expect(isCanonicalPushTarget({ kind: "scene_360" })).toBe(false);
    expect(coercePushTarget({ kind: "unknown" })).toBeNull();
    expect(coercePushTarget(null)).toBeNull();
  });

  it("normalizes old scene sources to the Director Pano 360 target", () => {
    expect(completeTarget(inferDefaultTarget({
      kind: "scene_360",
      meta: { scene_id: "厨房" },
    }))).toEqual({
      kind: "scene_director_pano_360",
      scene_id: "厨房",
    });
  });

  it("keeps exact 3GS and director world roles ahead of scene fallbacks", () => {
    expect(inferDefaultTarget({
      kind: "scene",
      role: "scene_3gs_master_ply",
      meta: { scene_id: "hall" },
    })).toEqual({ kind: "scene_3gs_master_ply", scene_id: "hall" });
    expect(inferDefaultTarget({
      kind: "director",
      role: "scene_director_world",
      meta: { scene_id: "hall" },
    })).toEqual({ kind: "scene_director_world", scene_id: "hall" });
  });

  it("maps audio and identity portrait sources to canonical targets", () => {
    expect(inferDefaultTarget({
      kind: "audio",
      meta: { episode: 2, beat: 3 },
    })).toEqual({ kind: "beat_audio", episode: 2, beat: 3 });
    expect(inferDefaultTarget({
      kind: "identity",
      role: "identity_portrait",
      meta: { character: "Alice", identity_id: "adult" },
    })).toEqual({
      kind: "identity_portrait",
      character: "Alice",
      identity_id: "adult",
    });
    expect(inferDefaultTarget({
      kind: "identity",
      role: "character_portrait",
      meta: { character: "Alice" },
    })).toEqual({ kind: "portrait", character: "Alice" });
  });

  it("prefers backend slot targets and falls back to source inference", () => {
    expect(assetToPushTarget({
      slot_target: { kind: "frame", episode: 4, beat: 5 },
      kind: "portrait",
      meta: { character: "Alice" },
    })).toEqual({ kind: "frame", episode: 4, beat: 5 });
    expect(assetToPushTarget({
      slot_target: { kind: "unknown" },
      kind: "portrait",
      meta: { character: "Alice" },
    })).toEqual({ kind: "portrait", character: "Alice" });
  });

  it("rejects incomplete targets and classifies writable 3GS slots", () => {
    expect(completeTarget({ kind: "identity", character: "Alice" })).toBeNull();
    expect(completeTarget({ kind: "scene_master" })).toBeNull();
    expect(isPlyOrGlbPushTargetKind("scene_3gs_custom_scene")).toBe(true);
    expect(isPlyOrGlbPushTargetKind("scene_director_pano_360")).toBe(false);
  });
});
