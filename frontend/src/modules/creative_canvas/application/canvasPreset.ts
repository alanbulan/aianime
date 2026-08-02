// Copyright (c) 2026 AI anime
import type { FreezonePresetCanvasRequest } from "../domain/canvasStorage";

type RestorablePresetRequest = Omit<
  FreezonePresetCanvasRequest,
  "canvas_id" | "overwrite_existing" | "base_revision"
>;

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonBlankStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function presetRequestFromMetadata(
  preset: unknown,
): RestorablePresetRequest | null {
  if (!preset || typeof preset !== "object") return null;
  const data = preset as Record<string, unknown>;
  const scope = typeof data.scope === "string" ? data.scope : "";
  if (scope !== "episode" && scope !== "beat" && scope !== "asset") {
    return null;
  }
  return {
    scope,
    episode: finiteNumberOrNull(data.episode),
    beat: finiteNumberOrNull(data.beat),
    primary_slot:
      typeof data.primary_slot === "string" ? data.primary_slot : "render",
    asset_kind: nonBlankStringOrNull(data.asset_kind),
    character: nonBlankStringOrNull(data.character),
    identity_id: nonBlankStringOrNull(data.identity_id),
    asset_id: nonBlankStringOrNull(data.asset_id),
  };
}
