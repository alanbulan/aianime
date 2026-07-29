// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef } from "react";

import { buildLibraryAssets } from "@/features/freezone/application/assetLibraryProjection";
import {
  useFreezoneBeatContext,
  useFreezoneProjectAssets,
} from "@/features/freezone/composition";

import type { CanvasKind } from "../domain/assetLibraryModel";
import {
  resolveCurrentBeat,
  resolveCurrentEpisode,
} from "../presentation/assetLibraryViewModel";

export interface AssetLibraryCatalogControllerOptions {
  project: string;
  metadata: Record<string, unknown> | null;
  canvasKind: CanvasKind;
  replacementReloadToken: number;
  reloadToken?: number;
}

export function useAssetLibraryCatalogController({
  project,
  metadata,
  canvasKind,
  replacementReloadToken,
  reloadToken,
}: AssetLibraryCatalogControllerOptions) {
  const projectAssetsQuery = useFreezoneProjectAssets(project);
  const projectAssets = projectAssetsQuery.data ?? [];
  const projectAssetsReloadKey = `${replacementReloadToken}:${reloadToken ?? 0}`;
  const previousProjectAssetsReloadKeyRef = useRef(projectAssetsReloadKey);

  useEffect(() => {
    if (
      previousProjectAssetsReloadKeyRef.current === projectAssetsReloadKey
    ) {
      return;
    }
    previousProjectAssetsReloadKeyRef.current = projectAssetsReloadKey;
    void projectAssetsQuery.refetch();
  }, [projectAssetsQuery, projectAssetsReloadKey]);

  const currentEpisode = useMemo(
    () => resolveCurrentEpisode(metadata),
    [metadata],
  );
  const currentBeat = useMemo(
    () => resolveCurrentBeat(metadata),
    [metadata],
  );
  const beatContextEnabled =
    canvasKind !== "asset" &&
    !(canvasKind === "episode" && currentEpisode === null) &&
    !(
      canvasKind === "beat" &&
      (currentEpisode === null || currentBeat === null)
    );
  const beatContextQuery = useFreezoneBeatContext(
    project,
    {
      episode: typeof currentEpisode === "number" ? currentEpisode : null,
      beat:
        canvasKind === "beat" && typeof currentBeat === "number"
          ? currentBeat
          : null,
    },
    beatContextEnabled,
  );
  const beatContext = beatContextEnabled
    ? (beatContextQuery.data ?? null)
    : null;
  const beatContextReloadKey = `${replacementReloadToken}:${reloadToken ?? 0}`;
  const previousBeatContextReloadKeyRef = useRef(beatContextReloadKey);

  useEffect(() => {
    if (previousBeatContextReloadKeyRef.current === beatContextReloadKey) {
      return;
    }
    previousBeatContextReloadKeyRef.current = beatContextReloadKey;
    if (!beatContextEnabled) return;
    void beatContextQuery.refetch();
  }, [beatContextEnabled, beatContextQuery, beatContextReloadKey]);

  const projectAssetsError = errorMessage(projectAssetsQuery.error);
  const beatContextError = errorMessage(beatContextQuery.error);
  const assets = useMemo(
    () =>
      buildLibraryAssets({
        project,
        metadata,
        projectAssets,
        beatContext,
        canvasKind,
      }),
    [project, metadata, projectAssets, beatContext, canvasKind],
  );

  return {
    assets,
    beatContext,
    error: projectAssetsError ?? beatContextError,
    assetImageCacheToken: projectAssetsReloadKey,
  };
}

function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return error ? String(error) : null;
}
