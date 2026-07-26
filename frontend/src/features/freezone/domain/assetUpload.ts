// Copyright (c) 2026 AI anime

export interface FreezoneAssetUploadOptions {
  readonly disableTimeout?: boolean;
}

export interface FreezoneAssetUploadResult {
  readonly url: string;
  readonly filename: string;
  readonly size: number;
}
