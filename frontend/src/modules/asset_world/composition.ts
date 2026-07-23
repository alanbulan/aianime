import { createElement } from "react";

import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import { createStyleQueryHooks } from "@/modules/asset_world/application/style-query-hooks";
import { createUseCreateStyleController } from "@/modules/asset_world/application/use-create-style-controller";
import { createUseStyleDetailController } from "@/modules/asset_world/application/use-style-detail-controller";
import { createUseStylesPageController } from "@/modules/asset_world/application/use-styles-page-controller";
import type { Style } from "@/modules/asset_world/domain/style";
import { httpAssetWorldGateway } from "@/modules/asset_world/infrastructure/http-asset-world-gateway";
import { stylePreviewUrl } from "@/modules/asset_world/infrastructure/style-preview-url";
import {
  CreateStyleDialogView,
  StyleDetailView,
  StylesPageView,
} from "@/modules/asset_world/presentation/StylesPageView";
import {
  useProject,
  useUpdateProject,
} from "@/modules/project_workspace/public";

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

const useStylesPageController = createUseStylesPageController(styleQueries, {
  stylePreviewUrl,
  useProject,
});
const useStyleDetailController = createUseStyleDetailController(styleQueries, {
  stylePreviewUrl,
  useUpdateProject,
});
const useCreateStyleController = createUseCreateStyleController(styleQueries, {
  useGenerationCreditCost,
});

function StyleDetailContent({
  isProjectDefault,
  onClearSelection,
  project,
  style,
}: {
  isProjectDefault: boolean;
  onClearSelection(): void;
  project: string;
  style: Style;
}) {
  const controller = useStyleDetailController({
    isProjectDefault,
    onClearSelection,
    project,
    style,
  });
  return createElement(StyleDetailView, { controller });
}

function CreateStyleDialogContent({
  onCreated,
  onOpenChange,
  open,
  project,
}: {
  onCreated(styleId: string): void;
  onOpenChange(open: boolean): void;
  open: boolean;
  project: string;
}) {
  const controller = useCreateStyleController({
    onCreated,
    onOpenChange,
    open,
    project,
  });
  return createElement(CreateStyleDialogView, { controller });
}

export function StylesPageContent({ project }: { project: string }) {
  const controller = useStylesPageController(project);
  const detailContent = controller.selectedStyle
    ? createElement(StyleDetailContent, {
        isProjectDefault: controller.isProjectDefault,
        key: controller.selectedStyle.id,
        onClearSelection: controller.clearSelection,
        project,
        style: controller.selectedStyle,
      })
    : null;
  const createDialog = createElement(CreateStyleDialogContent, {
    onCreated: controller.handleCreated,
    onOpenChange: controller.setCreateOpen,
    open: controller.createOpen,
    project,
  });
  return createElement(StylesPageView, {
    controller,
    createDialog,
    detailContent,
  });
}
