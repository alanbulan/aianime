// Copyright (c) 2026 AI anime
import {
  commitProjectAsset,
  getProjectAssetImpact,
} from "@/shared/api/project-asset-transfer";

import type { FreezoneAssetCommitGateway } from "../application/assetCommit";
import type { ImpactResult, PushResult } from "@/modules/creative_canvas/domain/assetCommit";

export const httpFreezoneAssetCommitGateway: FreezoneAssetCommitGateway = {
  async commitAsset(params) {
    return await commitProjectAsset<PushResult, typeof params.target>(params);
  },

  async getImpact(params) {
    return await getProjectAssetImpact<ImpactResult, typeof params.target>(
      params,
    );
  },
};
