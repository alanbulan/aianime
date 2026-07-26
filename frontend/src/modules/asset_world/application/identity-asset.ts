// Copyright (c) 2026 AI anime
import type {
  CreateIdentityAssetPayload,
  CreateIdentityAssetResult,
} from "@/modules/asset_world/domain/identity-asset";

export interface CreateIdentityAssetParams {
  projectId: string;
  payload: CreateIdentityAssetPayload;
}

export interface IdentityAssetGateway {
  create(
    params: CreateIdentityAssetParams,
  ): Promise<CreateIdentityAssetResult>;
}

export function createIdentityAsset(
  params: CreateIdentityAssetParams,
  gateway: IdentityAssetGateway,
): Promise<CreateIdentityAssetResult> {
  return gateway.create(params);
}
