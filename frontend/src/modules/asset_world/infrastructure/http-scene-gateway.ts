// Copyright (c) 2026 AI anime
import type {
  DirectorStageManifest,
  PanoViewerManifest,
} from "@/features/viewer-kit/public";
import type {
  AssetDataResponse,
  AssetErrorResponse,
  AssetResponse,
  AssetTaskResponse,
} from "@/modules/asset_world/application/ports";
import type {
  SceneDirectorWorldSaveResult,
  SceneDirectorWorldSourceGateway,
  SceneGateway,
} from "@/modules/asset_world/application/scene-gateway";
import type {
  SceneAsset,
  ScenePlatePreview,
} from "@/modules/asset_world/domain/scene";
import { jsonWithBackendError } from "@/shared/api/errors";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";

function uploadBody(file: File): FormData {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
}

export const httpSceneGateway: SceneGateway & SceneDirectorWorldSourceGateway = {
  async listScenes(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/scenes`, { signal })
      .json<AssetDataResponse<SceneAsset[]>>();
  },

  async getPlatePreview(
    project,
    sceneId,
    variantId,
    timeOfDay,
    signal,
  ) {
    return api
      .get(p`api/v1/projects/${project}/scenes/plate-preview`, {
        signal,
        searchParams: {
          scene_id: sceneId,
          variant_id: variantId,
          time_of_day: timeOfDay,
        },
      })
      .json<AssetDataResponse<ScenePlatePreview>>();
  },

  async getPanoManifest(project, name, signal) {
    return api
      .get(p`api/v1/projects/${project}/scenes/${name}/pano/manifest`, {
        signal,
      })
      .json<AssetResponse<PanoViewerManifest>>();
  },

  async updatePanoCorrection(project, name, correction) {
    return api
      .patch(p`api/v1/projects/${project}/scenes/${name}/pano/correction`, {
        json: correction,
      })
      .json<AssetResponse<PanoViewerManifest>>();
  },

  async getDirectorStageManifest(project, name, signal) {
    return api
      .get(
        p`api/v1/projects/${project}/scenes/${name}/director-stage/manifest`,
        { signal },
      )
      .json<AssetResponse<DirectorStageManifest>>();
  },

  async saveDirectorWorld(project, name, input) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/director-stage/world`, {
        json: input,
      })
      .json<AssetResponse<SceneDirectorWorldSaveResult>>();
  },

  async saveDirectorWorldSource(project, name, input) {
    return api
      .post(
        p`api/v1/projects/${project}/scenes/${name}/director-stage/world/source`,
        { json: input },
      )
      .json<AssetResponse<SceneDirectorWorldSaveResult>>();
  },

  async clearDirectorWorld(project, name, activeSourceId) {
    return api
      .post(
        p`api/v1/projects/${project}/scenes/${name}/director-stage/world/clear`,
        { json: { active_source_id: activeSourceId } },
      )
      .json<AssetResponse<{ active_source_id: string }>>();
  },

  async createScene(project, input) {
    return api
      .post(p`api/v1/projects/${project}/scenes`, { json: input })
      .json<AssetResponse<SceneAsset>>();
  },

  async updateScene(project, name, input) {
    return api
      .patch(p`api/v1/projects/${project}/scenes/${name}`, { json: input })
      .json<AssetResponse<SceneAsset>>();
  },

  async deleteScene(project, name) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/delete`)
      .json<AssetResponse<{ deleted: boolean }>>();
  },

  async buildScenes(project) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(p`api/v1/projects/${project}/scenes/build`, {
        json: {},
        throwHttpErrors: false,
      }),
    );
  },

  async uploadMaster(project, name, file) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/master/upload`, {
        body: uploadBody(file),
      })
      .json<AssetResponse<{ master_url: string }>>();
  },

  async scheduleMaster(project, name, input) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/scenes/${name}/master/generate-async`,
        { json: input ?? {}, throwHttpErrors: false },
      ),
    );
  },

  async deleteMaster(project, name) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/master/delete`)
      .json<AssetResponse<{ deleted: boolean }>>();
  },

  async scheduleReverse(project, name, input) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/scenes/${name}/reverse/generate-async`,
        { json: input ?? {}, throwHttpErrors: false },
      ),
    );
  },

  async uploadPano(project, name, file) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/pano/upload`, {
        body: uploadBody(file),
      })
      .json<AssetResponse<{ pano_url: string }>>();
  },

  async uploadCustomPackage(project, name, file) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/custom/upload`, {
        body: uploadBody(file),
      })
      .json<AssetResponse<SceneAsset>>();
  },

  async deleteCustomPackage(project, name) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/custom/delete`)
      .json<AssetResponse<{ deleted: boolean }>>();
  },

  async schedulePano(project, name, source) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/scenes/${name}/pano/generate-async`,
        { json: { source }, throwHttpErrors: false },
      ),
    );
  },

  async scheduleStagePly(project, name, source) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/scenes/${name}/3gs/${source}-ply/generate-async`,
        { json: {}, throwHttpErrors: false },
      ),
    );
  },

  async deletePano(project, name) {
    return api
      .post(p`api/v1/projects/${project}/scenes/${name}/pano/delete`)
      .json<AssetResponse<{ deleted: boolean }>>();
  },
};
