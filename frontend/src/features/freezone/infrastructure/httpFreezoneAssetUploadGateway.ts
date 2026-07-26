// Copyright (c) 2026 AI anime
import { apiRequest } from "@/shared/api/client";

import type { FreezoneAssetUploadGateway } from "../application/assetUpload";
import type { FreezoneAssetUploadResult } from "../domain/assetUpload";

export const httpFreezoneAssetUploadGateway: FreezoneAssetUploadGateway = {
  async upload(params) {
    const formData = new FormData();
    formData.append("file", params.file, params.filename);
    const response = await apiRequest(
      `projects/${encodeURIComponent(params.projectId)}/freezone/upload`,
      {
        method: "POST",
        body: formData,
        timeout: params.options?.disableTimeout ? false : undefined,
      },
    ).json<{
      ok: boolean;
      data?: FreezoneAssetUploadResult;
      error?: string;
    }>();
    if (!response.ok || !response.data) {
      throw new Error(response.error ?? "upload failed");
    }
    return response.data;
  },
};
