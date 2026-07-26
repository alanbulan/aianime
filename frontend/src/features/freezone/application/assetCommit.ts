// Copyright (c) 2026 AI anime
import type {
  ImpactResult,
  PushResult,
  PushTarget,
} from "../domain/assetCommit";

export interface CommitFreezoneAssetParams {
  projectId: string;
  sourceUrl: string;
  target: PushTarget;
  markStale?: boolean;
}

export interface GetFreezoneAssetImpactParams {
  projectId: string;
  target: PushTarget;
}

export interface FreezoneAssetCommitGateway {
  commitAsset(params: CommitFreezoneAssetParams): Promise<PushResult>;
  getImpact(params: GetFreezoneAssetImpactParams): Promise<ImpactResult>;
}

export function commitFreezoneAsset(
  params: CommitFreezoneAssetParams,
  gateway: FreezoneAssetCommitGateway,
): Promise<PushResult> {
  return gateway.commitAsset(params);
}

export function getFreezoneAssetImpact(
  params: GetFreezoneAssetImpactParams,
  gateway: FreezoneAssetCommitGateway,
): Promise<ImpactResult> {
  return gateway.getImpact(params);
}
