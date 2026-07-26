// Copyright (c) 2026 AI anime
import {
  listFreezoneBeatContext as listFreezoneBeatContextUseCase,
  listFreezoneProjectAssets as listFreezoneProjectAssetsUseCase,
  type FreezoneBeatContextQueryOptions,
  type FreezoneQueryOptions,
} from "./application/contextQueries";
import {
  buildProjectionFromPreset as buildProjectionFromPresetUseCase,
  getProjectionStatuses as getProjectionStatusesUseCase,
} from "./application/canvasProjection";
import type { FreezoneProjectionPresetRequest } from "./domain/canvasProjection";
import { httpFreezoneCanvasProjectionGateway } from "./infrastructure/httpFreezoneCanvasProjectionGateway";
import { httpFreezoneContextQueryGateway } from "./infrastructure/httpFreezoneContextQueryGateway";

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
