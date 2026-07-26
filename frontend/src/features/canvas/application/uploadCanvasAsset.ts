// Copyright (c) 2026 AI anime
import type {
  CanvasAssetGateway,
  CanvasAssetUploadResult,
} from "./ports";

export interface UploadCanvasAssetOptions {
  readonly disableTimeout?: boolean;
}

export interface UploadCanvasAssetParams {
  readonly projectId: string;
  readonly file: File | Blob;
  readonly filename: string;
  readonly options?: UploadCanvasAssetOptions;
}

export async function uploadCanvasAsset(
  params: UploadCanvasAssetParams,
  assetGateway: CanvasAssetGateway,
): Promise<CanvasAssetUploadResult> {
  return await assetGateway.upload(
    params.projectId,
    params.file,
    params.filename,
    params.options,
  );
}
