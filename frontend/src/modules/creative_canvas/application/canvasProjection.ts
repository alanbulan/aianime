// Copyright (c) 2026 AI anime
import type {
  FreezoneProjectionBuildResponse,
  FreezoneProjectionPresetRequest,
  FreezoneProjectionStatusResponse,
} from "@/modules/creative_canvas/domain/canvasProjection";
import {
  projectionMetadataWithRequest,
  requestFromProjectionMetadata,
} from "@/modules/creative_canvas/domain/canvasProjectionMetadata";
import { projectionTargetForCanvasPanel } from "@/modules/creative_canvas/domain/canvasProjectionRequest";
import type { LocalProjectionPayload } from "./canvasRuntimeState";

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

export interface SyncCanvasProjectionParams {
  projectId: string;
  canvasId: string;
  metadata: Record<string, unknown> | null;
  projectionKey: string;
}

export interface RemoveCanvasProjectionParams {
  projectId: string;
  canvasId: string;
  projectionKey: string;
}

export interface CanvasProjectionCommandDependencies {
  buildProjection(
    params: BuildFreezoneProjectionParams,
  ): Promise<FreezoneProjectionBuildResponse>;
  queueProjection(
    projectId: string,
    canvasId: string,
    projection: LocalProjectionPayload,
  ): void;
  consumeProjectionQueue(projectId: string, canvasId: string): boolean;
  removeProjection(
    projectId: string,
    canvasId: string,
    projectionKey: string,
  ): boolean;
  markProjectionFresh(projectionKey: string): void;
}

export interface CanvasProjectionCommands {
  sync(params: SyncCanvasProjectionParams): Promise<boolean>;
  remove(params: RemoveCanvasProjectionParams): boolean;
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

export function createCanvasProjectionCommands(
  dependencies: CanvasProjectionCommandDependencies,
): CanvasProjectionCommands {
  return {
    async sync({
      projectId,
      canvasId,
      metadata,
      projectionKey,
    }: SyncCanvasProjectionParams): Promise<boolean> {
      const request = requestFromProjectionMetadata(metadata, projectionKey);
      if (!request) return false;

      const target = projectionTargetForCanvasPanel({
        currentCanvasId: canvasId,
        request,
      });
      const projection = await dependencies.buildProjection({
        projectId,
        payload: {
          ...request,
          projection_key: target.projectionKey,
          base_revision: 0,
          force_refresh: true,
        },
      });
      dependencies.queueProjection(projectId, target.targetCanvasId, {
        projectionKey: target.projectionKey,
        nodes: projection.nodes ?? [],
        edges: projection.edges ?? [],
        metadata: projectionMetadataWithRequest(
          projection.metadata ?? null,
          target.projectionKey,
          request,
          projection.facts_signature,
        ),
      });
      dependencies.consumeProjectionQueue(projectId, target.targetCanvasId);
      dependencies.markProjectionFresh(target.projectionKey);
      return true;
    },
    remove({
      projectId,
      canvasId,
      projectionKey,
    }: RemoveCanvasProjectionParams): boolean {
      return dependencies.removeProjection(projectId, canvasId, projectionKey);
    },
  };
}
