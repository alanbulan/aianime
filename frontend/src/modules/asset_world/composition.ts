import { createStyleQueryHooks } from "@/modules/asset_world/application/style-query-hooks";
import { httpAssetWorldGateway } from "@/modules/asset_world/infrastructure/http-asset-world-gateway";

const styleQueries = createStyleQueryHooks(httpAssetWorldGateway);

export const {
  stylesQueryOptions,
  useAnalyzeStyle,
  useCreateStyle,
  useDeleteStyle,
  useStyleDetail,
  useStyles,
  useUploadStylePreview,
} = styleQueries;
