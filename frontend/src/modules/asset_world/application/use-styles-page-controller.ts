// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { StyleQueryHooks } from "@/modules/asset_world/application/style-query-hooks";
import {
  isPresetStyle,
  type Style,
} from "@/modules/asset_world/domain/style";

interface ProjectQuery {
  data?: { visual_style?: string | null };
}

export interface StylesPageControllerDependencies {
  stylePreviewUrl(styleId: string): string;
  useProject(project: string): ProjectQuery;
}

export function createUseStylesPageController(
  queries: StyleQueryHooks,
  dependencies: StylesPageControllerDependencies,
) {
  return function useStylesPageController(project: string) {
    const { t } = useTranslation();
    const { data: stylesResponse, isLoading, isRefetching, refetch } =
      queries.useStyles(project);
    const { data: projectResponse } = dependencies.useProject(project);
    const styles = stylesResponse?.data ?? [];
    const projectVisualStyle = projectResponse?.visual_style;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);

    useEffect(() => {
      if (styles.length === 0) {
        if (selectedId !== null) setSelectedId(null);
        return;
      }
      if (!selectedId || !styles.some((style) => style.id === selectedId)) {
        setSelectedId(styles[0].id);
      }
    }, [selectedId, styles]);

    const { data: detailResponse, isFetching: detailFetching } =
      queries.useStyleDetail(project, selectedId);
    const fallbackListRecord =
      styles.find((style) => style.id === selectedId) ?? null;
    const selectedStyle: Style | null =
      detailResponse?.data ?? fallbackListRecord;

    const handleRefresh = async () => {
      const result = await refetch();
      if (!result.isError) return true;
      toast.error(t("common.error"));
      return false;
    };

    return {
      clearSelection: () => setSelectedId(null),
      createOpen,
      detailFetching,
      handleCreated: (styleId: string) => setSelectedId(styleId),
      handleRefresh,
      isLoading,
      isPreset: isPresetStyle,
      isProjectDefault:
        selectedStyle !== null && projectVisualStyle === selectedStyle.id,
      openCreate: () => setCreateOpen(true),
      projectVisualStyle,
      previewUrlForStyle: (style: Style) =>
        isPresetStyle(style)
          ? dependencies.stylePreviewUrl(style.id)
          : style.preview_url,
      refreshing: isRefetching,
      selectedId,
      selectedStyle,
      selectStyle: setSelectedId,
      setCreateOpen,
      styles,
    };
  };
}

export type StylesPageController = ReturnType<
  ReturnType<typeof createUseStylesPageController>
>;
