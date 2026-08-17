// Copyright (c) 2026 AI anime
import { createStyleQueryHooks } from "@/modules/asset_world/application/style-query-hooks";
import { httpAssetWorldGateway } from "@/modules/asset_world/infrastructure/http-asset-world-gateway";

export const styleQueries = createStyleQueryHooks(httpAssetWorldGateway);

export const {
  stylesQueryOptions,
  useAnalyzeStyle,
  useCreateStyle,
  useDeleteStyle,
  useStyleDetail,
  useStyles,
  useUpdateStyle,
  useUploadStylePreview,
} = styleQueries;
