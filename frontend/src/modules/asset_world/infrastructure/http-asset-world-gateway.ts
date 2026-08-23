// Copyright (c) 2026 AI anime
import type {
  AssetDataResponse,
  AssetResponse,
  AssetWorldGateway,
} from "@/modules/asset_world/application/ports";
import type { Style } from "@/modules/asset_world/domain/style";
import { p } from "@/shared/api/path";
import { api, uploadApi } from "@/shared/api/transport";

export const httpAssetWorldGateway: AssetWorldGateway = {
  async listStyles(signal) {
    return api
      .get("api/v1/styles", { signal })
      .json<AssetDataResponse<Style[]>>();
  },

  async getStyle(styleId, signal) {
    return api
      .get(p`api/v1/styles/${styleId}`, { signal })
      .json<AssetDataResponse<Style>>();
  },

  async createStyle(input) {
    return api
      .post("api/v1/styles", { json: input })
      .json<AssetResponse<{ id: string }>>();
  },

  async updateStyle({ id, ...input }) {
    return api
      .put(p`api/v1/styles/${id}`, { json: input })
      .json<AssetResponse<{ id: string }>>();
  },

  async deleteStyle(styleId) {
    return api
      .delete(p`api/v1/styles/${styleId}`)
      .json<AssetDataResponse<unknown>>();
  },

  async analyzeStyle(project, file) {
    const formData = new FormData();
    formData.append("file", file);
    return uploadApi
      .post(p`api/v1/projects/${project}/styles/analyze`, {
        body: formData,
        throwHttpErrors: false,
      })
      .json<AssetResponse<Record<string, unknown>>>();
  },

  async uploadStylePreview({ file, styleId }) {
    const formData = new FormData();
    formData.append("file", file);
    return uploadApi
      .put(p`api/v1/styles/${styleId}/preview`, {
        body: formData,
        throwHttpErrors: false,
      })
      .json<AssetResponse<{ preview_path: string }>>();
  },
};
