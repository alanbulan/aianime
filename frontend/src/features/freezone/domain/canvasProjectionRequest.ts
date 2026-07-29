// Copyright (c) 2026 AI anime
import type { FreezonePresetCanvasRequest } from "./canvasStorage";

export function projectionKeyForPresetRequest(
  request: Pick<
    FreezonePresetCanvasRequest,
    "scope" | "episode" | "beat" | "asset_kind" | "asset_id" | "character" | "identity_id"
  >,
): string {
  if (request.scope === "beat") return `beat:${request.episode ?? 0}:${request.beat ?? 0}`;
  if (request.scope === "episode") return `episode:${request.episode ?? 0}`;
  const kind = sanitizeProjectionPart(request.asset_kind ?? "asset");
  const assetId = sanitizeProjectionPart(
    request.asset_id ?? request.identity_id ?? request.character ?? "unknown",
  );
  return `asset:${kind}:${assetId}`;
}

export function normalizePresetProjectionRequest<T extends FreezonePresetCanvasRequest>(
  request: T,
): T {
  if (request.scope !== "beat") return request;
  return {
    ...request,
    primary_slot: "render",
  };
}

export function projectionLabelForPresetRequest(
  request: Pick<
    FreezonePresetCanvasRequest,
    "scope" | "episode" | "beat" | "asset_kind" | "asset_id" | "character" | "identity_id"
  >,
): string {
  if (request.scope === "beat") return `EP${request.episode ?? 0}/B${request.beat ?? 0}`;
  if (request.scope === "episode") return `EP${request.episode ?? 0}`;
  const kind = request.asset_kind ?? "asset";
  const assetId = request.asset_id ?? request.identity_id ?? request.character ?? "unknown";
  return `${kind} · ${assetId}`;
}

export function shouldProjectPresetIntoPersonalCanvas({
  personalCanvasId,
  request,
}: {
  currentCanvasId: string;
  personalCanvasId: string;
  request: Pick<
    FreezonePresetCanvasRequest,
    "scope" | "episode" | "beat" | "asset_kind" | "asset_id" | "character" | "identity_id"
  >;
}): { targetCanvasId: string; projectionKey: string } {
  return {
    targetCanvasId: personalCanvasId,
    projectionKey: projectionKeyForPresetRequest(request),
  };
}

export function projectionTargetForCanvasPanel({
  currentCanvasId,
  request,
}: {
  currentCanvasId: string;
  request: Pick<
    FreezonePresetCanvasRequest,
    "scope" | "episode" | "beat" | "asset_kind" | "asset_id" | "character" | "identity_id"
  >;
}): { targetCanvasId: string; projectionKey: string } {
  return {
    targetCanvasId: currentCanvasId,
    projectionKey: projectionKeyForPresetRequest(request),
  };
}

function sanitizeProjectionPart(value: string): string {
  return value.trim().replace(/[:\s]+/g, "_").slice(0, 80) || "unknown";
}
