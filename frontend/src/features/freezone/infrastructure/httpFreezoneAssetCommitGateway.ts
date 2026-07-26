// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { FreezoneAssetCommitGateway } from "../application/assetCommit";
import type { ImpactResult, PushResult } from "../domain/assetCommit";

export const httpFreezoneAssetCommitGateway: FreezoneAssetCommitGateway = {
  async commitAsset(params) {
    return await apiCall<PushResult>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/push`,
      {
        method: "POST",
        json: {
          source_url: params.sourceUrl,
          target: params.target,
          mark_stale: params.markStale ?? false,
        },
      },
    );
  },

  async getImpact(params) {
    return await apiCall<ImpactResult>(
      `projects/${encodeURIComponent(params.projectId)}/freezone/impact`,
      { method: "POST", json: { target: params.target } },
    );
  },
};
