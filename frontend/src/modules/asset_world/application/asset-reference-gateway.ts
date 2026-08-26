// Copyright (c) 2026 AI anime
import type { AssetDataResponse } from "@/modules/asset_world/application/ports";
import type {
  AssetRefType,
  BeatReference,
  SceneCoOccurrence,
} from "@/modules/asset_world/domain/character";

export interface AssetReferenceSnapshot {
  references: Record<AssetRefType, Record<string, BeatReference[]>>;
  sceneCoOccurrences: Record<string, SceneCoOccurrence>;
}

export interface AssetReferenceGateway {
  loadIndex(
    project: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<AssetReferenceSnapshot>>;
}
