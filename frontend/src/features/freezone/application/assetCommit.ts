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

export async function commitFreezoneAsset(
  params: CommitFreezoneAssetParams,
  gateway: FreezoneAssetCommitGateway,
): Promise<PushResult> {
  validateCommitTarget(params.target);
  return await gateway.commitAsset(params);
}

export async function getFreezoneAssetImpact(
  params: GetFreezoneAssetImpactParams,
  gateway: FreezoneAssetCommitGateway,
): Promise<ImpactResult> {
  validateCommitTarget(params.target);
  return await gateway.getImpact(params);
}

function validateCommitTarget(target: PushTarget): void {
  if (target.kind === "scene_director_world") {
    throw new Error("Scene director world commit requires canvas node state.");
  }
  if (
    (target.kind === "frame" ||
      target.kind === "sketch" ||
      target.kind === "director_render" ||
      target.kind === "video" ||
      target.kind === "beat_audio") &&
    (!Number.isFinite(target.episode) || !Number.isFinite(target.beat))
  ) {
    throw new Error("Beat-scoped asset target requires episode and beat.");
  }
  if (
    (target.kind === "identity" ||
      target.kind === "identity_costume" ||
      target.kind === "identity_portrait") &&
    (!target.character || !target.identity_id)
  ) {
    throw new Error("Identity asset target requires character and identity_id.");
  }
  if (target.kind === "portrait" && !target.character) {
    throw new Error("Portrait asset target requires character.");
  }
  if (isSceneTargetKind(target.kind) && !(target as unknown as Record<string, unknown>).scene_id) {
    throw new Error("Scene asset target requires scene_id.");
  }
}

function isSceneTargetKind(kind: PushTarget["kind"]): boolean {
  return (
    kind === "scene_master" ||
    kind === "scene_reverse_master" ||
    kind === "scene_spatial_layout" ||
    kind === "scene_director_world" ||
    kind === "scene_director_pano_360" ||
    kind === "scene_3gs_master_ply" ||
    kind === "scene_3gs_reverse_ply" ||
    kind === "scene_3gs_pano_ply" ||
    kind === "scene_3gs_custom_scene"
  );
}
