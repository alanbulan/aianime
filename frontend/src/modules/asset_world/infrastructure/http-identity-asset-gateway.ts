// Copyright (c) 2026 AI anime
import type { IdentityAssetGateway } from "@/modules/asset_world/application/identity-asset";
import type { CreateIdentityAssetResult } from "@/modules/asset_world/domain/identity-asset";
import { apiCall } from "@/shared/api/client";

export const httpIdentityAssetGateway: IdentityAssetGateway = {
  async create({ projectId, payload }) {
    return await apiCall<CreateIdentityAssetResult>(
      `projects/${encodeURIComponent(projectId)}/freezone/assets/identities`,
      { method: "POST", json: payload },
    );
  },
};
