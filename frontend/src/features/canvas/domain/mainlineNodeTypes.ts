// Copyright (c) 2026 AI anime
/**
 * Canonical mainline node fields, used across canvas / drag-in / spawn /
 * Push paths. `SlotTarget` is a deliberate alias for the existing `PushTarget`
 * discriminated union — every commit eventually flows through the same backend
 * `/freezone/push` route, so there is exactly one set of legal kinds + required
 * fields. Inventing a parallel type would invite divergence (frontend / backend
 * already share `PushTarget` ↔ `slots.py:PushTarget = SlotTarget` Pydantic
 * mirror).
 *
 * Naming reminder — do not confuse the two layers:
 *   - `PushTargetKind` (Freezone domain; 20 canonical writable values): slot 落点 kind.
 *     e.g. "sketch" / "frame" / "identity" / "scene_master" — these are the
 *     short verbs the Push route writes against.
 *   - `PresetRef.role` (preset emit domain, ~22 values): asset discovery role.
 *     e.g. "current_sketch" / "current_frame" / "character_identity" — used
 *     when preset-emitting nodes; not for Push routing.
 *
 * Node `data.slot_target` carries a `SlotTarget` (= `PushTarget`) shape, NOT
 * a role string.
 */

import type { PushTarget } from "@/features/freezone/public";

export type { PushTargetKind } from "@/features/freezone/public";

/** Alias for `PushTarget` expressing node intent: "this node's Push default target". */
export type SlotTarget = PushTarget;

/**
 * Canonical equality for two slot targets. Same kind + same scoping fields.
 *
 * Compares only the fields that matter for routing — episode/beat for
 * beat-scoped, character/identity_id for character-scoped, scene_id for
 * scene-scoped, prop_id for prop_ref. JSON-stringify is avoided because key
 * ordering / extra fields would create false negatives.
 */
export function slotTargetsEqual(a: SlotTarget, b: SlotTarget): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "frame":
    case "sketch":
    case "director_render":
    case "selected_background":
    case "video":
    case "beat_audio":
      return (
        a.episode === (b as typeof a).episode &&
        a.beat === (b as typeof a).beat
      );
    case "identity":
    case "identity_costume":
    case "identity_portrait":
      return (
        a.character === (b as typeof a).character &&
        a.identity_id === (b as typeof a).identity_id
      );
    case "portrait":
      return a.character === (b as typeof a).character;
    case "scene_master":
    case "scene_reverse_master":
    case "scene_spatial_layout":
    case "scene_360":
    case "scene_director_world":
    case "scene_director_pano_360":
    case "scene_3gs_active_ply":
    case "scene_3gs_master_ply":
    case "scene_3gs_reverse_ply":
    case "scene_3gs_pano_ply":
    case "scene_3gs_custom_scene":
    case "scene_3gs_collision_glb":
      return a.scene_id === (b as typeof a).scene_id;
    case "prop_ref":
      return a.prop_id === (b as typeof a).prop_id;
    default: {
      // Exhaustiveness — if a new kind lands in PushTarget without updating
      // this switch, TS will error here.
      const _exhaustive: never = a;
      return _exhaustive;
    }
  }
}
