// Copyright (c) 2026 AI anime
import { ArrowUpDown, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AssetSortKey } from "@/modules/asset_world/public";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

export function AssetSortSelect({
  value,
  onValueChange,
}: {
  value: AssetSortKey;
  onValueChange: (value: AssetSortKey) => void;
}) {
  const { t } = useTranslation();
  const label =
    value === "usage"
      ? t("assets.common.sortByUsage")
      : t("assets.common.sortByName");
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as AssetSortKey)}
    >
      <SelectTrigger
        aria-label={t("assets.common.sortLabel")}
        className="h-8 min-w-[104px] gap-1.5 rounded-[8px] border-border bg-muted px-2.5 text-xs shadow-none hover:border-foreground/25 hover:bg-accent"
      >
        <ArrowUpDown className="size-3.5 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="name">{t("assets.common.sortByName")}</SelectItem>
        <SelectItem value="usage">{t("assets.common.sortByUsage")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function AssetResultCount({
  resultCount,
  totalCount,
}: {
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div
      aria-live="polite"
      className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground"
    >
      {resultCount} / {totalCount}
    </div>
  );
}

export function AssetSearchBox({
  value,
  onValueChange,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative w-full min-w-[220px] max-w-[360px]", className)}
    >
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        aria-label={ariaLabel}
        className="h-8 rounded-[8px] border-border bg-muted pl-8 pr-8 text-sm shadow-none placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10"
        placeholder={placeholder}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value ? (
        <Button
          aria-label={ariaLabel}
          className="absolute right-1 top-1/2 size-6 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          size="icon-xs"
          type="button"
          variant="ghost"
          onClick={() => onValueChange("")}
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}
