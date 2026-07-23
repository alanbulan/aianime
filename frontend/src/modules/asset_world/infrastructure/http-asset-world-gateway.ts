// Copyright (c) 2026 AI anime
import type {
  AssetDataResponse,
  AssetResponse,
  AssetWorldGateway,
} from "@/modules/asset_world/application/ports";
import type { Style } from "@/modules/asset_world/domain/style";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";

export const httpAssetWorldGateway: AssetWorldGateway = {
  async listStyles(project, signal) {
    return api
      .get("api/v1/styles", {
        ...(project ? { searchParams: { project } } : {}),
        signal,
      })
      .json<AssetDataResponse<Style[]>>();
  },

  async getStyle(project, styleId, signal) {
    return api
      .get(p`api/v1/styles/${styleId}`, {
        ...(project ? { searchParams: { project } } : {}),
        signal,
      })
      .json<AssetDataResponse<Style>>();
  },

  async createStyle(input) {
    return api
      .post("api/v1/styles", { json: input })
      .json<AssetResponse<{ id: string }>>();
  },

  async deleteStyle(styleId, project) {
    return api
      .delete(
        p`api/v1/styles/${styleId}`,
        project ? { searchParams: { project } } : undefined,
      )
      .json<AssetDataResponse<unknown>>();
  },

  async analyzeStyle(project, file) {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post(p`api/v1/projects/${project}/styles/analyze`, {
        body: formData,
        throwHttpErrors: false,
      })
      .json<AssetResponse<Record<string, unknown>>>();
  },

  async uploadStylePreview(project, { file, styleId }) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("style_id", styleId);
    return api
      .post(p`api/v1/projects/${project}/styles/preview-upload`, {
        body: formData,
        throwHttpErrors: false,
      })
      .json<AssetResponse<{ preview_path: string }>>();
  },
};
