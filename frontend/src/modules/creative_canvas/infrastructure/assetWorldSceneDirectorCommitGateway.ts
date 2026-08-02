// Copyright (c) 2026 AI anime
import {
  clearSceneDirectorWorld as clearSceneDirectorWorldApi,
  loadSceneDirectorStageManifest as loadSceneDirectorStageManifestApi,
  saveSceneDirectorWorld as saveSceneDirectorWorldApi,
  saveSceneDirectorWorldSource as saveSceneDirectorWorldSourceApi,
  type SceneDirectorWorldPayload,
  type SceneDirectorWorldSourcePayload,
} from "@/modules/asset_world/public";

import type {
  PersistSceneDirectorWorldSourceParams,
  SceneDirectorWorldCommitGateway,
} from "../application/sceneDirectorWorldCommit";

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function worldPayload(
  params: PersistSceneDirectorWorldSourceParams,
): SceneDirectorWorldPayload {
  return {
    active_source_id: params.sourceId,
    snapshot:
      params.snapshot as unknown as SceneDirectorWorldPayload["snapshot"],
    active_source: params.source,
  };
}

function sourcePayload(
  params: PersistSceneDirectorWorldSourceParams,
): SceneDirectorWorldSourcePayload {
  return {
    source_id: params.sourceId,
    snapshot:
      params.snapshot as unknown as SceneDirectorWorldSourcePayload["snapshot"],
    source: params.source,
  };
}

export interface AssetWorldSceneDirectorCommitDependencies {
  clearSceneDirectorWorld: typeof clearSceneDirectorWorldApi;
  loadSceneDirectorStageManifest: typeof loadSceneDirectorStageManifestApi;
  saveSceneDirectorWorld: typeof saveSceneDirectorWorldApi;
  saveSceneDirectorWorldSource: typeof saveSceneDirectorWorldSourceApi;
}

export function createAssetWorldSceneDirectorCommitGateway(
  dependencies: AssetWorldSceneDirectorCommitDependencies,
): SceneDirectorWorldCommitGateway {
  return {
    async loadSourceIds(project, sceneId) {
      const manifest = await dependencies.loadSceneDirectorStageManifest(
        project,
        sceneId,
      );
      const sourceIds = new Set<string>();
      const activeSourceId = stringValue(manifest.active_source_id);
      if (activeSourceId) sourceIds.add(activeSourceId);
      for (const source of manifest.sources ?? []) {
        const sourceId = stringValue(source.id);
        if (sourceId) sourceIds.add(sourceId);
      }
      for (const sourceId of Object.keys(manifest.scenes_by_source_id ?? {})) {
        if (sourceId.trim()) sourceIds.add(sourceId.trim());
      }
      return sourceIds;
    },
    async saveWorld(params) {
      await dependencies.saveSceneDirectorWorld(
        params.project,
        params.sceneId,
        worldPayload(params),
      );
    },
    async saveSource(params) {
      await dependencies.saveSceneDirectorWorldSource(
        params.project,
        params.sceneId,
        sourcePayload(params),
      );
    },
    async clearSource(project, sceneId, sourceId) {
      await dependencies.clearSceneDirectorWorld(project, sceneId, sourceId);
    },
  };
}

export const assetWorldSceneDirectorCommitGateway =
  createAssetWorldSceneDirectorCommitGateway({
    clearSceneDirectorWorld: clearSceneDirectorWorldApi,
    loadSceneDirectorStageManifest: loadSceneDirectorStageManifestApi,
    saveSceneDirectorWorld: saveSceneDirectorWorldApi,
    saveSceneDirectorWorldSource: saveSceneDirectorWorldSourceApi,
  });
