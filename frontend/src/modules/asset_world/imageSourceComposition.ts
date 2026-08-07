// Copyright (c) 2026 AI anime
import { createImageSourceQueryHooks } from "@/modules/asset_world/application/image-source-query-hooks";
import { httpImageSourceGateway } from "@/modules/asset_world/infrastructure/http-image-source-gateway";

export const imageSourceQueries = createImageSourceQueryHooks(
  httpImageSourceGateway,
);

export const {
  useAssetImageSourceSelection,
  useCharacterImageSelection,
  useUpdateAssetImageSourceSelection,
} = imageSourceQueries;
