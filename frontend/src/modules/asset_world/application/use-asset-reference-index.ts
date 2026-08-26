// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import type { AssetReferenceGateway } from "@/modules/asset_world/application/asset-reference-gateway";
import type {
  AssetReferenceIndex,
  AssetRefType,
  BeatReference,
  SceneCoOccurrence,
} from "@/modules/asset_world/domain/character";
import { queryKeys } from "@/lib/query-keys";

const EMPTY_REFERENCES: BeatReference[] = [];
const EMPTY_CO_OCCURRENCE: SceneCoOccurrence = { identities: [], props: [] };

export function createUseAssetReferenceIndex(gateway: AssetReferenceGateway) {
  return function useAssetReferenceIndex(project: string): AssetReferenceIndex {
    const query = useQuery({
      queryKey: queryKeys.assetReferences(project),
      queryFn: ({ signal }) => gateway.loadIndex(project, signal),
      enabled: Boolean(project),
    });
    const snapshot = query.data?.data;

    return useMemo(
      () => ({
        referencesFor: (type: AssetRefType, id: string) =>
          snapshot?.references[type]?.[id] ?? EMPTY_REFERENCES,
        countFor: (type: AssetRefType, id: string) =>
          snapshot?.references[type]?.[id]?.length ?? 0,
        coOccurrenceForScene: (sceneId: string) =>
          snapshot?.sceneCoOccurrences[sceneId] ?? EMPTY_CO_OCCURRENCE,
        isLoading: query.isLoading,
      }),
      [query.isLoading, snapshot],
    );
  };
}
