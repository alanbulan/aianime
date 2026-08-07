// Copyright (c) 2026 AI anime
import { uploadProjectAsset } from "@/shared/api/project-asset-transfer";

import type { FreezoneAssetUploadGateway } from "../application/assetUpload";

export const httpFreezoneAssetUploadGateway: FreezoneAssetUploadGateway = {
  upload: uploadProjectAsset,
};
