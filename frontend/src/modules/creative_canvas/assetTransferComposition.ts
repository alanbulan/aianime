// Copyright (c) 2026 AI anime
import {
  commitFreezoneAsset as commitFreezoneAssetUseCase,
  getFreezoneAssetImpact as getFreezoneAssetImpactUseCase,
} from "@/modules/creative_canvas/application/assetCommit";
import { uploadFreezoneAsset as uploadFreezoneAssetUseCase } from "@/modules/creative_canvas/application/assetUpload";
import type {
  PushTarget,
} from "@/modules/creative_canvas/domain/assetCommit";
import type { FreezoneAssetUploadOptions } from "@/modules/creative_canvas/domain/assetUpload";
import { httpFreezoneAssetCommitGateway } from "@/modules/creative_canvas/infrastructure/httpFreezoneAssetCommitGateway";
import { httpFreezoneAssetUploadGateway } from "@/modules/creative_canvas/infrastructure/httpFreezoneAssetUploadGateway";

export function uploadFreezoneAsset(
  projectId: string,
  file: File | Blob,
  filename: string,
  options?: FreezoneAssetUploadOptions,
) {
  return uploadFreezoneAssetUseCase(
    { projectId, file, filename, options },
    httpFreezoneAssetUploadGateway,
  );
}

export function commitFreezoneAsset(
  projectId: string,
  sourceUrl: string,
  target: PushTarget,
  options?: { mark_stale?: boolean },
) {
  return commitFreezoneAssetUseCase(
    {
      projectId,
      sourceUrl,
      target,
      markStale: options?.mark_stale,
    },
    httpFreezoneAssetCommitGateway,
  );
}

export function getFreezoneAssetImpact(
  projectId: string,
  target: PushTarget,
) {
  return getFreezoneAssetImpactUseCase(
    { projectId, target },
    httpFreezoneAssetCommitGateway,
  );
}
