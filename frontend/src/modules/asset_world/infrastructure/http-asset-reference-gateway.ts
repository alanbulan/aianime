// Copyright (c) 2026 AI anime
import type {
  AssetReferenceGateway,
  AssetReferenceSnapshot,
} from "@/modules/asset_world/application/asset-reference-gateway";
import type { AssetDataResponse } from "@/modules/asset_world/application/ports";
import type {
  AssetRefType,
  BeatReference,
} from "@/modules/asset_world/domain/character";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";

interface RawBeatReference {
  episode: number;
  beat_number: number;
}

interface RawAssetReferenceSnapshot {
  references: Record<AssetRefType, Record<string, RawBeatReference[]>>;
  scene_co_occurrences: Record<
    string,
    { identities: string[]; props: string[] }
  >;
}

function mapReferences(
  references: Record<string, RawBeatReference[]> | undefined,
): Record<string, BeatReference[]> {
  return Object.fromEntries(
    Object.entries(references ?? {}).map(([assetId, entries]) => [
      assetId,
      entries.map((entry) => ({
        beatNumber: entry.beat_number,
        episode: entry.episode,
      })),
    ]),
  );
}

export const httpAssetReferenceGateway: AssetReferenceGateway = {
  async loadIndex(project, signal) {
    const response = await api
      .get(p`api/v1/projects/${project}/assets/references`, { signal })
      .json<AssetDataResponse<RawAssetReferenceSnapshot>>();
    const data: AssetReferenceSnapshot = {
      references: {
        identity: mapReferences(response.data.references.identity),
        prop: mapReferences(response.data.references.prop),
        scene: mapReferences(response.data.references.scene),
      },
      sceneCoOccurrences: response.data.scene_co_occurrences ?? {},
    };
    return { ok: true, data };
  },
};
