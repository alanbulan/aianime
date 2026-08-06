// Copyright (c) 2026 AI anime
import type { DirectorStageManifest } from "@/features/viewer-kit/public";
import type { AssetResponse } from "@/modules/asset_world/application/ports";
import type {
  SceneDirectorWorldPayload,
  SceneDirectorWorldSaveResult,
  SceneDirectorWorldSourceGateway,
  SceneDirectorWorldSourcePayload,
  SceneGateway,
} from "@/modules/asset_world/application/scene-gateway";

interface SceneDirectorWorldTarget {
  project: string;
  sceneId: string;
}

function unwrapSceneDirectorWorldResponse<T>(response: AssetResponse<T>): T {
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}

export async function loadSceneDirectorStageManifest(
  params: SceneDirectorWorldTarget,
  gateway: Pick<SceneGateway, "getDirectorStageManifest">,
): Promise<DirectorStageManifest> {
  return unwrapSceneDirectorWorldResponse(
    await gateway.getDirectorStageManifest(params.project, params.sceneId),
  );
}

export async function saveSceneDirectorWorld(
  params: SceneDirectorWorldTarget & { payload: SceneDirectorWorldPayload },
  gateway: Pick<SceneGateway, "saveDirectorWorld">,
): Promise<SceneDirectorWorldSaveResult> {
  return unwrapSceneDirectorWorldResponse(
    await gateway.saveDirectorWorld(
      params.project,
      params.sceneId,
      params.payload,
    ),
  );
}

export async function saveSceneDirectorWorldSource(
  params: SceneDirectorWorldTarget & {
    payload: SceneDirectorWorldSourcePayload;
  },
  gateway: SceneDirectorWorldSourceGateway,
): Promise<SceneDirectorWorldSaveResult> {
  return unwrapSceneDirectorWorldResponse(
    await gateway.saveDirectorWorldSource(
      params.project,
      params.sceneId,
      params.payload,
    ),
  );
}

export async function clearSceneDirectorWorld(
  params: SceneDirectorWorldTarget & { activeSourceId: string },
  gateway: Pick<SceneGateway, "clearDirectorWorld">,
): Promise<{ active_source_id: string }> {
  return unwrapSceneDirectorWorldResponse(
    await gateway.clearDirectorWorld(
      params.project,
      params.sceneId,
      params.activeSourceId,
    ),
  );
}
