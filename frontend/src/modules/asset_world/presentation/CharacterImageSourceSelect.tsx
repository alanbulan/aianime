// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssetImageSourceKind } from "@/modules/asset_world/domain/character";
import {
  useAssetImageSourceSelection,
  useUpdateAssetImageSourceSelection,
} from "@/modules/asset_world/imageSourceComposition";
import { useCommercialModelCatalog } from "@/modules/model_usage/public";
import { cn } from "@/lib/utils";

export type CharacterImageSourceSelectProps = {
  project: string;
  kind?: AssetImageSourceKind;
  className?: string;
  disabled?: boolean;
  onSelectionChange?: (selection: string) => void;
};

export function CharacterImageSourceSelect({
  project,
  kind = "character",
  className,
  disabled,
  onSelectionChange,
}: CharacterImageSourceSelectProps) {
  const { t } = useTranslation();
  const selectionQuery = useAssetImageSourceSelection(project, kind);
  const catalogQuery = useCommercialModelCatalog("IMAGE", Boolean(project));
  const updateSelection = useUpdateAssetImageSourceSelection(project, kind);
  const savedSelection = selectionQuery.data?.data.image_source_selection ?? "";
  const optionEntries = (catalogQuery.data?.items ?? []).map((item) => [
    item.code,
    item.displayName,
  ] as const);
  const selectedOption = optionEntries.find(([value]) => value === savedSelection);
  const selection = selectedOption?.[0] ?? "";
  const selectedLabel = selectedOption?.[1] ?? "";
  const loadFailed = Boolean(selectionQuery.error || catalogQuery.error);
  const loading = selectionQuery.isLoading || catalogQuery.isLoading;
  const isDisabled =
    disabled ||
    loading ||
    loadFailed ||
    optionEntries.length === 0 ||
    (selectionQuery.isFetching && !selectionQuery.data) ||
    (catalogQuery.isFetching && !catalogQuery.data) ||
    updateSelection.isPending;

  const handleValueChange = async (value: string | null) => {
    if (!value || value === selection || updateSelection.isPending) return;
    try {
      await updateSelection.mutateAsync(value);
      onSelectionChange?.(value);
    } catch {
      toast.error(t("characters.imageSource.saveFailed"));
    }
  };

  return (
    <Select
      value={selection}
      disabled={isDisabled}
      onValueChange={handleValueChange}
    >
      <SelectTrigger
        aria-label={t("characters.imageSource.label")}
        className={cn(
          "h-8 gap-0 rounded-[8px] border-border bg-transparent px-3 text-xs font-normal shadow-none hover:bg-muted",
          className,
        )}
        disabled={isDisabled}
      >
        <span className="shrink-0 text-muted-foreground">
          {t("characters.imageSource.label")}
        </span>
        <span className="shrink-0 text-muted-foreground">&nbsp;·&nbsp;</span>
        <SelectValue>
          {selectedLabel ||
            (loading
              ? t("characters.imageSource.loading")
              : loadFailed
                ? t("characters.imageSource.loadFailed")
                : optionEntries.length === 0
                  ? t("characters.imageSource.empty")
                  : t("characters.imageSource.selectModel"))}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        alignItemWithTrigger={false}
        className="rounded-md border border-border bg-popover p-1 shadow-xl ring-0"
      >
        {optionEntries.map(([value, label]) => (
          <SelectItem
            key={value}
            value={value}
            className="min-h-8 gap-2 rounded-sm px-2 py-1.5 text-xs focus:bg-muted focus:text-current"
          >
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
