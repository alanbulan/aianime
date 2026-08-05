// Copyright (c) 2026 AI anime
import type {
  CanvasToolAssetGateway,
  CanvasToolAssetUploadResult,
} from "./uploadToolOutput";

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
  assetGateway: CanvasToolAssetGateway,
): Promise<CanvasToolAssetUploadResult> {
  return await assetGateway.upload(
    params.projectId,
    params.file,
    params.filename,
    params.options,
  );
}
