// Copyright (c) 2026 AI anime
import type {
  CreateBlankFreezoneCanvasRequest,
  FreezoneCanvasHistoryEntry,
  FreezoneCanvasPayload,
  FreezoneCanvasRestoreRequest,
  FreezoneCanvasSaveResult,
  FreezoneCanvasSummary,
  FreezonePresetCanvasRequest,
  FreezonePresetCanvasResponse,
} from "@/features/freezone/public";
import type { IdGenerator } from "./ports";

export interface ListFreezoneCanvasesParams {
  projectId: string;
  signal?: AbortSignal;
}

export interface GetFreezoneCanvasParams {
  projectId: string;
  canvasId: string;
  signal?: AbortSignal;
}

export interface CreateCanvasFromPresetParams {
  projectId: string;
  payload: FreezonePresetCanvasRequest;
}

export interface SaveFreezoneCanvasParams {
  projectId: string;
  canvasId: string;
  payload: FreezoneCanvasPayload;
}

export interface DeleteFreezoneCanvasParams {
  projectId: string;
  canvasId: string;
}

export interface FreezoneCanvasHistoryParams {
  projectId: string;
  canvasId: string;
}

export interface RestoreFreezoneCanvasVersionParams
  extends FreezoneCanvasHistoryParams {
  payload: FreezoneCanvasRestoreRequest;
}

export interface FreezoneCanvasStorageGateway {
  listCanvases(
    params: ListFreezoneCanvasesParams,
  ): Promise<FreezoneCanvasSummary[]>;
  getCanvas(params: GetFreezoneCanvasParams): Promise<FreezoneCanvasPayload>;
  saveCanvas(
    params: SaveFreezoneCanvasParams,
  ): Promise<FreezoneCanvasSaveResult>;
  createFromPreset(
    params: CreateCanvasFromPresetParams,
  ): Promise<FreezonePresetCanvasResponse>;
  deleteCanvas(
    params: DeleteFreezoneCanvasParams,
  ): Promise<{ deleted: boolean }>;
  listHistory(
    params: FreezoneCanvasHistoryParams,
  ): Promise<FreezoneCanvasHistoryEntry[]>;
  restoreVersion(
    params: RestoreFreezoneCanvasVersionParams,
  ): Promise<FreezoneCanvasSaveResult>;
}

export function listFreezoneCanvases(
  params: ListFreezoneCanvasesParams,
  gateway: FreezoneCanvasStorageGateway,
): Promise<FreezoneCanvasSummary[]> {
  return gateway.listCanvases(params);
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

export function putFreezoneCanvas(
  params: SaveFreezoneCanvasParams,
  gateway: FreezoneCanvasStorageGateway,
): Promise<FreezoneCanvasSaveResult> {
  return gateway.saveCanvas(params);
}

export function generateClientSaveId(idGenerator: IdGenerator): string {
  return idGenerator.next();
}

export function createBlankFreezoneCanvas(
  projectId: string,
  request: CreateBlankFreezoneCanvasRequest,
  gateway: FreezoneCanvasStorageGateway,
  idGenerator: IdGenerator,
): Promise<FreezoneCanvasSaveResult> {
  return gateway.saveCanvas({
    projectId,
    canvasId: request.canvasId,
    payload: {
      schema_version: 2,
      canvas_id: request.canvasId,
      project_id: projectId,
      base_revision: null,
      client_save_id: generateClientSaveId(idGenerator),
      save_source: "manual_save",
      nodes: [],
      edges: [],
      viewport: null,
      metadata: {
        canvas_origin: "user_created",
        display_name: request.name,
        creator_username: request.creatorUsername ?? null,
      },
    },
  });
}

export function deleteFreezoneCanvas(
  params: DeleteFreezoneCanvasParams,
  gateway: FreezoneCanvasStorageGateway,
): Promise<{ deleted: boolean }> {
  return gateway.deleteCanvas(params);
}

export function listFreezoneCanvasHistory(
  params: FreezoneCanvasHistoryParams,
  gateway: FreezoneCanvasStorageGateway,
): Promise<FreezoneCanvasHistoryEntry[]> {
  return gateway.listHistory(params);
}

export function restoreFreezoneCanvasVersion(
  params: RestoreFreezoneCanvasVersionParams,
  gateway: FreezoneCanvasStorageGateway,
): Promise<FreezoneCanvasSaveResult> {
  return gateway.restoreVersion(params);
}
