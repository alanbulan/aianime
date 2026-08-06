// Copyright (c) 2026 AI anime
import type {
  DirectorStageManifest,
  PanoViewerManifest,
  ThreeDSceneSnapshot,
} from "@/features/viewer-kit/public";
import type {
  AssetDataResponse,
  AssetErrorResponse,
  AssetResponse,
  AssetTaskResponse,
} from "@/modules/asset_world/application/ports";
import type {
  SceneAsset,
  ScenePanoSource,
  ScenePlatePreview,
  SceneStagePlySource,
} from "@/modules/asset_world/domain/scene";

export interface ScenePayload {
  name: string;
  aliases?: string[];
  scene_type?: string;
  base_scene_id?: string;
  variant_id?: string;
  time_of_day?: string;
  environment_prompt?: string;
  variant_prompt?: string;
  description?: string;
  notes?: string;
}

export interface SceneDirectorWorldPayload {
  active_source_id: string;
  snapshot: ThreeDSceneSnapshot;
  active_source?: Record<string, unknown>;
}

export interface SceneDirectorWorldSourcePayload {
  source_id: string;
  snapshot: ThreeDSceneSnapshot;
  source?: Record<string, unknown>;
}

export interface SceneDirectorWorldSaveResult {
  active_source_id: string;
  manifest?: DirectorStageManifest | null;
}

export interface SceneDirectorWorldSourceGateway {
  saveDirectorWorldSource(
    project: string,
    name: string,
    input: SceneDirectorWorldSourcePayload,
  ): Promise<AssetResponse<SceneDirectorWorldSaveResult>>;
}

export interface SceneGateway {
  listScenes(
    project: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<SceneAsset[]>>;
  getPlatePreview(
    project: string,
    sceneId: string,
    variantId: string,
    timeOfDay: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<ScenePlatePreview>>;
  getPanoManifest(
    project: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<AssetResponse<PanoViewerManifest>>;
  updatePanoCorrection(
    project: string,
    name: string,
    correction: PanoViewerManifest["correction"],
  ): Promise<AssetResponse<PanoViewerManifest>>;
  getDirectorStageManifest(
    project: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<AssetResponse<DirectorStageManifest>>;
  saveDirectorWorld(
    project: string,
    name: string,
    input: SceneDirectorWorldPayload,
  ): Promise<AssetResponse<SceneDirectorWorldSaveResult>>;
  clearDirectorWorld(
    project: string,
    name: string,
    activeSourceId: string,
  ): Promise<AssetResponse<{ active_source_id: string }>>;
  createScene(
    project: string,
    input: ScenePayload,
  ): Promise<AssetResponse<SceneAsset>>;
  updateScene(
    project: string,
    name: string,
    input: Partial<ScenePayload>,
  ): Promise<AssetResponse<SceneAsset>>;
  deleteScene(
    project: string,
    name: string,
  ): Promise<AssetResponse<{ deleted: boolean }>>;
  buildScenes(
    project: string,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  uploadMaster(
    project: string,
    name: string,
    file: File,
  ): Promise<AssetResponse<{ master_url: string }>>;
  scheduleMaster(
    project: string,
    name: string,
    input: { model?: string } | void,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  deleteMaster(
    project: string,
    name: string,
  ): Promise<AssetResponse<{ deleted: boolean }>>;
  scheduleReverse(
    project: string,
    name: string,
    input: { model?: string } | void,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  uploadPano(
    project: string,
    name: string,
    file: File,
  ): Promise<AssetResponse<{ pano_url: string }>>;
  uploadCustomPackage(
    project: string,
    name: string,
    file: File,
  ): Promise<AssetResponse<SceneAsset>>;
  deleteCustomPackage(
    project: string,
    name: string,
  ): Promise<AssetResponse<{ deleted: boolean }>>;
  schedulePano(
    project: string,
    name: string,
    source: ScenePanoSource,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  scheduleStagePly(
    project: string,
    name: string,
    source: SceneStagePlySource,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  deletePano(
    project: string,
    name: string,
  ): Promise<AssetResponse<{ deleted: boolean }>>;
}
