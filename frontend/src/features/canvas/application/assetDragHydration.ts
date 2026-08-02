// Copyright (c) 2026 AI anime
import {
  directorWorldSourcesFromManifest,
} from "@/features/canvas/domain/directorWorldSources";
import type { CanvasAssetDragPayload } from "@/modules/creative_canvas/public";
import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";
import type { ThreeDSceneSnapshot } from "@/features/viewer-kit/three-d/engine/viewerApp";

const SCENE_DIRECTOR_WORLD_ROLE = "scene_director_world";

export interface CanvasSceneDirectorManifestGateway {
  getSceneDirectorStageManifest(
    project: string,
    sceneId: string,
  ): Promise<DirectorStageManifest>;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sceneDirectorImportInfo(
  payload: CanvasAssetDragPayload,
): { project: string; sceneId: string } | null {
  const source = recordValue(payload.source);
  const meta = recordValue(source?.meta);
  const role = stringValue(source?.role);
  const sceneContext = (payload.mainlineContext ?? [])
    .map(recordValue)
    .find((context) => context?.kind === "scene");
  const project = stringValue(source?.projectId) || stringValue(sceneContext?.projectId);
  const sceneId =
    stringValue(meta?.scene_id) ||
    stringValue(source?.scene_id) ||
    stringValue(sceneContext?.sceneId);
  if (!project || !sceneId) return null;
  if (role !== SCENE_DIRECTOR_WORLD_ROLE) return null;
  return { project, sceneId };
}

function nonNullSceneMap(
  value: Record<string, ThreeDSceneSnapshot | null | undefined> | null | undefined,
): Record<string, ThreeDSceneSnapshot> | undefined {
  const out: Record<string, ThreeDSceneSnapshot> = {};
  for (const [key, snapshot] of Object.entries(value ?? {})) {
    if (snapshot) out[key] = snapshot;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function hydrateAssetDragPayload(
  manifestGateway: CanvasSceneDirectorManifestGateway,
  payload: CanvasAssetDragPayload,
): Promise<CanvasAssetDragPayload> {
  const info = sceneDirectorImportInfo(payload);
  if (!info) return payload;
  const manifest = await manifestGateway.getSceneDirectorStageManifest(
    info.project,
    info.sceneId,
  );
  const sources = directorWorldSourcesFromManifest(manifest);
  const manifestActiveSourceId = stringValue(manifest.active_source_id);
  const activeSource =
    sources.find((source) => source.id && source.id === manifestActiveSourceId) ??
    sources.find((source) => source.current) ??
    sources[0];
  return {
    ...payload,
    modelSources: sources.length > 0 ? sources : payload.modelSources,
    activeSourceId: manifestActiveSourceId || payload.activeSourceId || activeSource?.id || null,
    scene: (manifest.scene as ThreeDSceneSnapshot | null | undefined) ?? payload.scene ?? null,
    scenesBySourceId:
      nonNullSceneMap(manifest.scenes_by_source_id as Record<string, ThreeDSceneSnapshot | null | undefined>) ??
      payload.scenesBySourceId,
    plyUrl:
      activeSource?.ply_url ??
      (activeSource?.source_type === "sog" ? activeSource.url : undefined) ??
      payload.plyUrl,
    panoUrl:
      activeSource?.pano_url ??
      (activeSource?.source_type === "pano360" ? activeSource.url : undefined) ??
      payload.panoUrl,
  };
}
