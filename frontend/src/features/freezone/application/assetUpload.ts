// Copyright (c) 2026 AI anime
import type {
  FreezoneAssetUploadOptions,
  FreezoneAssetUploadResult,
} from "../domain/assetUpload";

export interface UploadFreezoneAssetParams {
  readonly projectId: string;
  readonly file: File | Blob;
  readonly filename: string;
  readonly options?: FreezoneAssetUploadOptions;
}

export interface FreezoneAssetUploadGateway {
  upload(params: UploadFreezoneAssetParams): Promise<FreezoneAssetUploadResult>;
}

export function uploadFreezoneAsset(
  params: UploadFreezoneAssetParams,
  gateway: FreezoneAssetUploadGateway,
): Promise<FreezoneAssetUploadResult> {
  return gateway.upload(params);
}
