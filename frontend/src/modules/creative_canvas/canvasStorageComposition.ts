// Copyright (c) 2026 AI anime
import { v4 as uuidv4 } from "uuid";

import {
  createCanvasFromPreset as createCanvasFromPresetUseCase,
  createBlankFreezoneCanvas as createBlankFreezoneCanvasUseCase,
  deleteFreezoneCanvas as deleteFreezoneCanvasUseCase,
  generateClientSaveId as generateClientSaveIdUseCase,
  getFreezoneCanvas as getFreezoneCanvasUseCase,
  listFreezoneCanvases as listFreezoneCanvasesUseCase,
  putFreezoneCanvas as putFreezoneCanvasUseCase,
  putFreezoneCanvasKeepalive as putFreezoneCanvasKeepaliveUseCase,
} from "./application/canvasStorageOperations";
import type {
  CreateBlankFreezoneCanvasRequest,
  FreezoneCanvasPayload,
  FreezonePresetCanvasRequest,
} from "./domain/canvasStorage";
import { httpFreezoneCanvasStorageGateway } from "./infrastructure/httpFreezoneCanvasStorageGateway";
import { createFreezoneCanvasQueryHooks } from "./presentation/canvasStorageQueryHooks";

const canvasSaveIdGenerator = { next: uuidv4 };

export const { useFreezoneCanvases } = createFreezoneCanvasQueryHooks(
  httpFreezoneCanvasStorageGateway,
);

export function getFreezoneCanvas(
  projectId: string,
  canvasId: string,
  options?: { signal?: AbortSignal },
) {
  return getFreezoneCanvasUseCase(
    { projectId, canvasId, signal: options?.signal },
    httpFreezoneCanvasStorageGateway,
  );
}

export function listFreezoneCanvases(
  projectId: string,
  options?: { signal?: AbortSignal },
) {
  return listFreezoneCanvasesUseCase(
    { projectId, signal: options?.signal },
    httpFreezoneCanvasStorageGateway,
  );
}

export function putFreezoneCanvas(
  projectId: string,
  canvasId: string,
  payload: FreezoneCanvasPayload,
) {
  return putFreezoneCanvasUseCase(
    { projectId, canvasId, payload },
    httpFreezoneCanvasStorageGateway,
  );
}

export function putFreezoneCanvasKeepalive(
  projectId: string,
  canvasId: string,
  payload: FreezoneCanvasPayload,
) {
  return putFreezoneCanvasKeepaliveUseCase(
    { projectId, canvasId, payload },
    httpFreezoneCanvasStorageGateway,
  );
}

export function generateClientSaveId(): string {
  return generateClientSaveIdUseCase(canvasSaveIdGenerator);
}

export function createBlankFreezoneCanvas(
  projectId: string,
  request: CreateBlankFreezoneCanvasRequest,
) {
  return createBlankFreezoneCanvasUseCase(
    projectId,
    request,
    httpFreezoneCanvasStorageGateway,
    canvasSaveIdGenerator,
  );
}

export function deleteFreezoneCanvas(projectId: string, canvasId: string) {
  return deleteFreezoneCanvasUseCase(
    { projectId, canvasId },
    httpFreezoneCanvasStorageGateway,
  );
}

export function createCanvasFromPreset(
  projectId: string,
  payload: FreezonePresetCanvasRequest,
) {
  return createCanvasFromPresetUseCase(
    { projectId, payload },
    httpFreezoneCanvasStorageGateway,
  );
}
