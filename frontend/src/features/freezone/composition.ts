// Copyright (c) 2026 AI anime
import {
  commitFreezoneAsset as commitFreezoneAssetUseCase,
  getFreezoneAssetImpact as getFreezoneAssetImpactUseCase,
} from "./application/assetCommit";
import {
  commitDirectorRenderFromCanvasSource as commitDirectorRenderFromCanvasSourceUseCase,
  type DirectorRenderCanvasCommitSource,
  type DirectorRenderTarget,
} from "./application/directorRenderCommit";
import {
  commitSceneDirectorWorldFromCanvasNode as commitSceneDirectorWorldFromCanvasNodeUseCase,
  type SceneDirectorWorldCommitOptions,
} from "./application/sceneDirectorWorldCommit";
import {
  uploadFreezoneAsset as uploadFreezoneAssetUseCase,
} from "./application/assetUpload";
import {
  listFreezoneBeatContext as listFreezoneBeatContextUseCase,
  listFreezoneProjectAssets as listFreezoneProjectAssetsUseCase,
  type FreezoneBeatContextQueryOptions,
  type FreezoneQueryOptions,
} from "./application/contextQueries";
import { createFreezoneContextQueryHooks } from "./hooks/contextQueryHooks";
import {
  buildProjectionFromPreset as buildProjectionFromPresetUseCase,
  getProjectionStatuses as getProjectionStatusesUseCase,
} from "./application/canvasProjection";
import type { PushTarget } from "./domain/assetCommit";
import type { FreezoneAssetUploadOptions } from "./domain/assetUpload";
import type { FreezoneProjectionPresetRequest } from "./domain/canvasProjection";
import type { SceneDirectorWorldTarget } from "./domain/directorWorldCommit";
import { browserDirectorRenderCommitGateway } from "./infrastructure/browserDirectorRenderCommitGateway";
import { assetWorldSceneDirectorCommitGateway } from "./infrastructure/assetWorldSceneDirectorCommitGateway";
import { httpFreezoneAssetCommitGateway } from "./infrastructure/httpFreezoneAssetCommitGateway";
import { httpFreezoneAssetUploadGateway } from "./infrastructure/httpFreezoneAssetUploadGateway";
import { httpFreezoneCanvasProjectionGateway } from "./infrastructure/httpFreezoneCanvasProjectionGateway";
import { httpFreezoneContextQueryGateway } from "./infrastructure/httpFreezoneContextQueryGateway";

export const { useFreezoneBeatContext, useFreezoneProjectAssets } =
  createFreezoneContextQueryHooks(httpFreezoneContextQueryGateway);

export function uploadFreezoneAsset(
  projectId: string,
  file: File | Blob,
  filename: string,
  options?: FreezoneAssetUploadOptions,
) {
  return uploadFreezoneAssetUseCase(
    { projectId, file, filename, options },
    httpFreezoneAssetUploadGateway,
  );
}

export function commitFreezoneAsset(
  projectId: string,
  sourceUrl: string,
  target: PushTarget,
  options?: { mark_stale?: boolean },
) {
  return commitFreezoneAssetUseCase(
    {
      projectId,
      sourceUrl,
      target,
      markStale: options?.mark_stale,
    },
    httpFreezoneAssetCommitGateway,
  );
}

export function getFreezoneAssetImpact(
  projectId: string,
  target: PushTarget,
) {
  return getFreezoneAssetImpactUseCase(
    { projectId, target },
    httpFreezoneAssetCommitGateway,
  );
}

export function commitDirectorRenderFromCanvasSource(
  projectId: string,
  target: DirectorRenderTarget,
  source: DirectorRenderCanvasCommitSource,
) {
  return commitDirectorRenderFromCanvasSourceUseCase(
    { projectId, target, source },
    browserDirectorRenderCommitGateway,
  );
}

export function commitSceneDirectorWorldFromCanvasNode(
  project: string,
  target: SceneDirectorWorldTarget,
  nodeData: Record<string, unknown>,
  options?: SceneDirectorWorldCommitOptions,
) {
  return commitSceneDirectorWorldFromCanvasNodeUseCase(
    { project, target, nodeData, options },
    assetWorldSceneDirectorCommitGateway,
  );
}

export function buildProjectionFromPreset(
  projectId: string,
  payload: FreezoneProjectionPresetRequest,
) {
  return buildProjectionFromPresetUseCase(
    { projectId, payload },
    httpFreezoneCanvasProjectionGateway,
  );
}

export function getProjectionStatuses(
  projectId: string,
  canvasId: string,
  projectionKeys?: string[],
) {
  return getProjectionStatusesUseCase(
    { projectId, canvasId, projectionKeys },
    httpFreezoneCanvasProjectionGateway,
  );
}

export function listFreezoneProjectAssets(
  projectId: string,
  options?: FreezoneQueryOptions,
) {
  return listFreezoneProjectAssetsUseCase(
    projectId,
    options,
    httpFreezoneContextQueryGateway,
  );
}

export function listFreezoneBeatContext(
  projectId: string,
  options?: FreezoneBeatContextQueryOptions,
) {
  return listFreezoneBeatContextUseCase(
    projectId,
    options,
    httpFreezoneContextQueryGateway,
  );
}
