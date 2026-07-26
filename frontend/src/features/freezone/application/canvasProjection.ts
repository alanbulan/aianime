// Copyright (c) 2026 AI anime
import type {
  FreezoneProjectionBuildResponse,
  FreezoneProjectionPresetRequest,
  FreezoneProjectionStatusResponse,
} from "../domain/canvasProjection";

export interface BuildFreezoneProjectionParams {
  projectId: string;
  payload: FreezoneProjectionPresetRequest;
}

export interface GetFreezoneProjectionStatusesParams {
  projectId: string;
  canvasId: string;
  projectionKeys?: string[];
}

export interface FreezoneCanvasProjectionGateway {
  buildProjection(
    params: BuildFreezoneProjectionParams,
  ): Promise<FreezoneProjectionBuildResponse>;
  getStatuses(
    params: GetFreezoneProjectionStatusesParams,
  ): Promise<FreezoneProjectionStatusResponse>;
}

export function buildProjectionFromPreset(
  params: BuildFreezoneProjectionParams,
  gateway: FreezoneCanvasProjectionGateway,
): Promise<FreezoneProjectionBuildResponse> {
  return gateway.buildProjection(params);
}

export function getProjectionStatuses(
  params: GetFreezoneProjectionStatusesParams,
  gateway: FreezoneCanvasProjectionGateway,
): Promise<FreezoneProjectionStatusResponse> {
  return gateway.getStatuses(params);
}
