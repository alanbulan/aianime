// Copyright (c) 2026 AI anime
import type {
  FreezoneCanvasPayload,
  FreezonePresetCanvasRequest,
  FreezonePresetCanvasResponse,
} from "@/features/freezone/public";

export interface GetFreezoneCanvasParams {
  projectId: string;
  canvasId: string;
  signal?: AbortSignal;
}

export interface CreateCanvasFromPresetParams {
  projectId: string;
  payload: FreezonePresetCanvasRequest;
}

export interface FreezoneCanvasStorageGateway {
  getCanvas(params: GetFreezoneCanvasParams): Promise<FreezoneCanvasPayload>;
  createFromPreset(
    params: CreateCanvasFromPresetParams,
  ): Promise<FreezonePresetCanvasResponse>;
}

export function getFreezoneCanvas(
  params: GetFreezoneCanvasParams,
  gateway: FreezoneCanvasStorageGateway,
): Promise<FreezoneCanvasPayload> {
  return gateway.getCanvas(params);
}

export function createCanvasFromPreset(
  params: CreateCanvasFromPresetParams,
  gateway: FreezoneCanvasStorageGateway,
): Promise<FreezonePresetCanvasResponse> {
  return gateway.createFromPreset(params);
}
