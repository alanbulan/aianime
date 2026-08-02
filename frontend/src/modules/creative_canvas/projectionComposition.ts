// Copyright (c) 2026 AI anime
import {
  buildProjectionFromPreset as buildProjectionFromPresetUseCase,
  getProjectionStatuses as getProjectionStatusesUseCase,
} from "@/modules/creative_canvas/application/canvasProjection";
import type { FreezoneProjectionPresetRequest } from "@/modules/creative_canvas/domain/canvasProjection";
import { httpFreezoneCanvasProjectionGateway } from "@/modules/creative_canvas/infrastructure/httpFreezoneCanvasProjectionGateway";

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
