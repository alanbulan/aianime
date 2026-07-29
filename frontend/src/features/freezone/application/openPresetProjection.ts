// Copyright (c) 2026 AI anime
import type {
  FreezoneProjectionBuildResponse,
  FreezoneProjectionPresetRequest,
} from "../domain/canvasProjection";
import { personalCanvasIdForUsername } from "../domain/canvasIdentity";
import { projectionMetadataWithRequest } from "../domain/canvasProjectionMetadata";
import {
  normalizePresetProjectionRequest,
  projectionKeyForPresetRequest,
} from "../domain/canvasProjectionRequest";
import type { FreezonePresetCanvasRequest } from "../domain/canvasStorage";

export type OpenPresetProjectionRequest = Omit<
  FreezonePresetCanvasRequest,
  "canvas_id" | "overwrite_existing" | "base_revision"
>;

export interface StagedPresetProjection {
  projectionKey: string;
  nodes: unknown[];
  edges: unknown[];
  metadata?: Record<string, unknown> | null;
}

export interface PresetProjectionNavigation {
  currentPathname(): string | null;
  openCanvas(
    projectId: string,
    canvasId: string,
    currentPathname: string | null,
  ): void;
}

export interface OpenPresetProjectionDependencies {
  currentUsername(): string | null | undefined;
  createNavigation(): PresetProjectionNavigation;
  buildProjection(
    projectId: string,
    request: FreezoneProjectionPresetRequest,
  ): Promise<FreezoneProjectionBuildResponse>;
  publishProjection(
    projectId: string,
    canvasId: string,
    projection: StagedPresetProjection,
  ): void;
}

export type OpenPresetProjection = (
  projectId: string,
  request: OpenPresetProjectionRequest,
) => Promise<string>;

export function createOpenPresetProjection(
  dependencies: OpenPresetProjectionDependencies,
): OpenPresetProjection {
  return async (projectId, request) => {
    const navigation = dependencies.createNavigation();
    const startPathname = navigation.currentPathname();
    const username = dependencies.currentUsername()?.trim();
    if (!username) {
      throw new Error("Missing current user");
    }
    const canvasId = personalCanvasIdForUsername(username);
    const normalizedRequest = normalizePresetProjectionRequest(request);
    const projectionKey = projectionKeyForPresetRequest(normalizedRequest);
    const projection = await dependencies.buildProjection(projectId, {
      ...normalizedRequest,
      projection_key: projectionKey,
      base_revision: 0,
    });
    dependencies.publishProjection(projectId, canvasId, {
      projectionKey,
      nodes: projection.nodes ?? [],
      edges: projection.edges ?? [],
      metadata: projectionMetadataWithRequest(
        projection.metadata ?? null,
        projectionKey,
        normalizedRequest,
        projection.facts_signature,
      ),
    });

    const currentPathname = navigation.currentPathname();
    if (currentPathname === startPathname) {
      navigation.openCanvas(projectId, canvasId, currentPathname);
    }
    return canvasId;
  };
}
