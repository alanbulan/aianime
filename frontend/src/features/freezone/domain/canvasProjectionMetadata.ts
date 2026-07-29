// Copyright (c) 2026 AI anime
import type { FreezonePresetCanvasRequest } from "./canvasStorage";
import { normalizePresetProjectionRequest } from "./canvasProjectionRequest";

export function requestFromProjectionMetadata(
  metadata: Record<string, unknown> | null | undefined,
  projectionKey: string,
): Omit<
  FreezonePresetCanvasRequest,
  "canvas_id" | "overwrite_existing" | "base_revision"
> | null {
  const projections = metadata?.projections;
  if (!projections || typeof projections !== "object") return null;
  const projection = (projections as Record<string, unknown>)[projectionKey];
  if (!projection || typeof projection !== "object") return null;
  const projectionRecord = projection as Record<string, unknown>;
  const request = projectionRecord.request && typeof projectionRecord.request === "object"
    ? projectionRecord.request as Record<string, unknown>
    : fallbackProjectionRequest(projectionRecord, projectionKey);
  if (!request) return null;
  const scope = request.scope;
  if (scope !== "episode" && scope !== "beat" && scope !== "asset" && scope !== "blank") {
    return null;
  }
  return normalizePresetProjectionRequest({
    scope,
    episode: typeof request.episode === "number" ? request.episode : undefined,
    beat: typeof request.beat === "number" ? request.beat : undefined,
    primary_slot: typeof request.primary_slot === "string"
      ? request.primary_slot
      : undefined,
    asset_kind: typeof request.asset_kind === "string"
      ? request.asset_kind
      : undefined,
    character: typeof request.character === "string"
      ? request.character
      : undefined,
    identity_id: typeof request.identity_id === "string"
      ? request.identity_id
      : undefined,
    asset_id: typeof request.asset_id === "string"
      ? request.asset_id
      : undefined,
  });
}

export function hasLegacyPresetCanvasMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const projections = metadata?.projections;
  if (projections && typeof projections === "object") {
    return false;
  }
  const preset = metadata?.preset as { scope?: unknown } | undefined;
  return typeof preset?.scope === "string";
}

export function mergeProjectionMetadata(
  localMetadata: Record<string, unknown> | null | undefined,
  incomingMetadata: Record<string, unknown> | null | undefined,
  projectionKey: string,
): Record<string, unknown> | null {
  if (!incomingMetadata || typeof incomingMetadata !== "object") {
    return localMetadata ? { ...localMetadata } : null;
  }
  const incomingProjections = incomingMetadata.projections;
  const incomingProjection =
    incomingProjections && typeof incomingProjections === "object"
      ? (incomingProjections as Record<string, unknown>)[projectionKey]
      : null;
  if (!incomingProjection || typeof incomingProjection !== "object") {
    return localMetadata ? { ...localMetadata } : { ...incomingMetadata };
  }
  const local = localMetadata && typeof localMetadata === "object" ? localMetadata : {};
  const localProjections =
    local.projections && typeof local.projections === "object"
      ? (local.projections as Record<string, unknown>)
      : {};
  return {
    ...local,
    projections: {
      ...localProjections,
      [projectionKey]: incomingProjection,
    },
    last_projection_key:
      typeof incomingMetadata.last_projection_key === "string"
        ? incomingMetadata.last_projection_key
        : projectionKey,
  };
}

export function projectionMetadataWithRequest(
  incomingMetadata: Record<string, unknown> | null | undefined,
  projectionKey: string,
  request: Omit<FreezonePresetCanvasRequest, "canvas_id" | "overwrite_existing" | "base_revision">,
  factsSignature?: string | null,
): Record<string, unknown> {
  const metadata =
    incomingMetadata && typeof incomingMetadata === "object"
      ? { ...incomingMetadata }
      : {};
  const projections =
    metadata.projections && typeof metadata.projections === "object"
      ? { ...(metadata.projections as Record<string, unknown>) }
      : {};
  const existingProjection =
    projections[projectionKey] && typeof projections[projectionKey] === "object"
      ? { ...(projections[projectionKey] as Record<string, unknown>) }
      : {};
  const normalizedFactsSignature = String(factsSignature ?? "").trim();
  projections[projectionKey] = {
    ...existingProjection,
    projection_key: projectionKey,
    ...(normalizedFactsSignature ? { facts_signature: normalizedFactsSignature } : {}),
    request: normalizePresetProjectionRequest(request),
  };
  return {
    ...metadata,
    projections,
    last_projection_key:
      typeof metadata.last_projection_key === "string"
        ? metadata.last_projection_key
        : projectionKey,
  };
}

export function removeProjectionMetadata(
  localMetadata: Record<string, unknown> | null | undefined,
  projectionKey: string,
): Record<string, unknown> | null {
  if (!localMetadata || typeof localMetadata !== "object") {
    return null;
  }
  const projections =
    localMetadata.projections && typeof localMetadata.projections === "object"
      ? { ...(localMetadata.projections as Record<string, unknown>) }
      : {};
  delete projections[projectionKey];
  const next: Record<string, unknown> = {
    ...localMetadata,
    projections,
  };
  if (next.last_projection_key === projectionKey) {
    delete next.last_projection_key;
  }
  return next;
}

function fallbackProjectionRequest(
  projection: Record<string, unknown>,
  projectionKey: string,
): Record<string, unknown> | null {
  const scope = typeof projection.scope === "string"
    ? projection.scope
    : scopeFromProjectionKey(projectionKey);
  if (scope === "beat") {
    const parsed = parseBeatProjectionKey(projectionKey);
    return {
      scope,
      episode: numberOrUndefined(projection.episode) ?? parsed?.episode,
      beat: numberOrUndefined(projection.beat) ?? parsed?.beat,
      primary_slot: typeof projection.primary_slot === "string"
        ? projection.primary_slot
        : "render",
    };
  }
  if (scope === "episode") {
    return {
      scope,
      episode: numberOrUndefined(projection.episode) ?? parseEpisodeProjectionKey(projectionKey),
    };
  }
  if (scope === "asset") {
    const parsed = parseAssetProjectionKey(projectionKey);
    return {
      scope,
      asset_kind: stringOrUndefined(projection.asset_kind) ?? parsed?.asset_kind,
      asset_id: stringOrUndefined(projection.asset_id) ?? parsed?.asset_id,
      character: stringOrUndefined(projection.character),
      identity_id: stringOrUndefined(projection.identity_id),
    };
  }
  if (scope === "blank") {
    return { scope };
  }
  return null;
}

function scopeFromProjectionKey(projectionKey: string): string | null {
  if (projectionKey.startsWith("beat:")) return "beat";
  if (projectionKey.startsWith("episode:")) return "episode";
  if (projectionKey.startsWith("asset:")) return "asset";
  if (projectionKey.startsWith("blank:")) return "blank";
  return null;
}

function parseBeatProjectionKey(
  projectionKey: string,
): { episode: number; beat: number } | null {
  const [, episodeRaw, beatRaw] = projectionKey.split(":");
  const episode = Number(episodeRaw);
  const beat = Number(beatRaw);
  if (!Number.isFinite(episode) || !Number.isFinite(beat)) return null;
  return { episode, beat };
}

function parseEpisodeProjectionKey(projectionKey: string): number | undefined {
  const [, episodeRaw] = projectionKey.split(":");
  const episode = Number(episodeRaw);
  return Number.isFinite(episode) ? episode : undefined;
}

function parseAssetProjectionKey(
  projectionKey: string,
): { asset_kind: string; asset_id: string } | null {
  const [, assetKind, ...assetParts] = projectionKey.split(":");
  const assetId = assetParts.join(":");
  if (!assetKind || !assetId) return null;
  return { asset_kind: assetKind, asset_id: assetId };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
