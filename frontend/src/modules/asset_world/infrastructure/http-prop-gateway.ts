// Copyright (c) 2026 AI anime
import type {
  AssetDataResponse,
  AssetErrorResponse,
  AssetResponse,
  AssetTaskResponse,
} from "@/modules/asset_world/application/ports";
import type { PropGateway } from "@/modules/asset_world/application/prop-gateway";
import type { PropAsset } from "@/modules/asset_world/domain/prop";
import { jsonWithBackendError } from "@/shared/api/errors";
import { p } from "@/shared/api/path";
import {
  commitProjectAsset,
  uploadProjectAsset,
} from "@/shared/api/project-asset-transfer";
import { api } from "@/shared/api/transport";

export const httpPropGateway: PropGateway = {
  async listProps(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/props`, { signal })
      .json<AssetDataResponse<PropAsset[]>>();
  },

  async createProp(project, input) {
    return api
      .post(p`api/v1/projects/${project}/props`, { json: input })
      .json<AssetResponse<PropAsset>>();
  },

  async updateProp(project, name, input) {
    return api
      .patch(p`api/v1/projects/${project}/props/${name}`, { json: input })
      .json<AssetResponse<PropAsset>>();
  },

  async deleteProp(project, name) {
    return api
      .post(p`api/v1/projects/${project}/props/${name}/delete`)
      .json<AssetResponse<{ deleted: boolean }>>();
  },

  async scheduleReference(project, name, input) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/props/${name}/reference/generate-async`,
        { json: input ?? {}, throwHttpErrors: false },
      ),
    );
  },

  async uploadReference(project, name, file) {
    const uploaded = await uploadProjectAsset({
      projectId: project,
      file,
      filename: file.name,
    });

    const committed = await commitProjectAsset({
      projectId: project,
      sourceUrl: uploaded.url,
      target: { kind: "prop_ref", prop_id: name },
      markStale: true,
    });
    return { ok: true, data: committed };
  },

  async scheduleBatchReferences(project, input) {
    return api
      .post(p`api/v1/projects/${project}/props/reference/batch-generate`, {
        json: input ?? {},
      })
      .json<AssetTaskResponse | AssetErrorResponse>();
  },
};
