// Copyright (c) 2026 AI anime
import type {
  AssetDataResponse,
  AssetImageSourceGateway,
} from "@/modules/asset_world/application/ports";
import type {
  AssetImageSourceSelection,
  CharacterImageSelection,
} from "@/modules/asset_world/domain/character";
import { p } from "@/shared/api/path";
import { api } from "@/shared/api/transport";

export const httpImageSourceGateway: AssetImageSourceGateway = {
  async getAssetImageSourceSelection(project, kind, signal) {
    return api
      .get(p`api/v1/projects/${project}/image-source-selection/${kind}`, {
        signal,
      })
      .json<AssetDataResponse<AssetImageSourceSelection>>();
  },

  async getCharacterImageSelection(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/character-image-selection`, {
        signal,
      })
      .json<AssetDataResponse<CharacterImageSelection>>();
  },

  async updateAssetImageSourceSelection(
    project,
    kind,
    imageSourceSelection,
  ) {
    return api
      .patch(p`api/v1/projects/${project}/image-source-selection/${kind}`, {
        json: { image_source_selection: imageSourceSelection },
      })
      .json<AssetDataResponse<AssetImageSourceSelection>>();
  },

};
