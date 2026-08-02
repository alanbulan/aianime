// Copyright (c) 2026 AI anime
import {
  commitFreezoneAsset,
  uploadFreezoneAsset,
} from "@/modules/creative_canvas/public";
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
    const uploaded = await uploadFreezoneAsset(project, file, file.name);

    const committed = await commitFreezoneAsset(
      project,
      uploaded.url,
      { kind: "prop_ref", prop_id: name },
      { mark_stale: true },
    );
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
