// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { Style } from "@/modules/asset_world/domain/style";
import { useStyles } from "@/modules/asset_world/styleComposition";
import { useProject } from "@/modules/project_workspace/public";

export type ProjectStyleChipProps = {
  project: string;
  className?: string;
};

const DEFAULT_VISUAL_STYLE = "chinese_period_drama";

const BUILTIN_STYLE_LABEL_KEYS: Record<string, string> = {
  chinese_period_drama: "ingest.visualStyles.chinesePeriodDrama",
  anime: "ingest.visualStyles.anime",
  guoman_fantasy: "ingest.visualStyles.guomanFantasy",
  post_apocalyptic: "ingest.visualStyles.postApocalyptic",
  realistic: "ingest.visualStyles.realistic",
  republican_era_drama: "ingest.visualStyles.republicanEraDrama",
};

function resolveStyleLabel(
  styleId: string,
  styles: Style[],
  t: (key: string) => string,
): string {
  const record = styles.find((style) => style.id === styleId);
  if (record) return record.label || record.name || styleId;

  const fallbackKey = BUILTIN_STYLE_LABEL_KEYS[styleId];
  return fallbackKey ? t(fallbackKey) : styleId;
}

export function ProjectStyleChip({ project, className }: ProjectStyleChipProps) {
  const { t } = useTranslation();
  const projectQuery = useProject(project);
  const stylesQuery = useStyles(project);
  const styleId =
    projectQuery.data?.visual_style?.trim() || DEFAULT_VISUAL_STYLE;
  const styles = stylesQuery.data?.data ?? [];
  const loading =
    projectQuery.isLoading || (stylesQuery.isLoading && !stylesQuery.data);
  const label = useMemo(
    () => resolveStyleLabel(styleId, styles, t),
    [styleId, styles, t],
  );
  const displayLabel = loading ? t("characters.projectStyle.loading") : label;

  return (
    <span
      aria-label={displayLabel}
      title={t("characters.projectStyle.configureHint")}
      className={cn(
        "rounded-md border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {displayLabel}
    </span>
  );
}
