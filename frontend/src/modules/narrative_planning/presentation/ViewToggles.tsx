// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { BeatsViewToggleId } from "@/modules/narrative_planning/application/episode-workbench-state";

const TOGGLES: { id: BeatsViewToggleId; labelKey: string }[] = [
  { id: "sketch", labelKey: "episode.beat.sectionSketch" },
  { id: "render", labelKey: "episode.beat.sectionRender" },
];

export interface ViewTogglesProps {
  checkedCount: number;
  legendSlot?: ReactNode;
  onBatchRegenRender(): void;
  onBatchRegenSketch(): void;
  onClearSelection(): void;
  onToggle(id: BeatsViewToggleId): void;
  toggles: ReadonlySet<BeatsViewToggleId>;
  totalBeats: number;
}

export function ViewToggles({
  checkedCount,
  legendSlot,
  onBatchRegenRender,
  onBatchRegenSketch,
  onClearSelection,
  onToggle,
  toggles,
  totalBeats,
}: ViewTogglesProps) {
  const { t } = useTranslation();
  const hasSelection = checkedCount > 0;

  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex min-h-10 items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-y-1.5">
          <div className="flex items-center gap-1.5">
            {TOGGLES.map(({ id, labelKey }) => {
              const active = toggles.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id)}
                  className={cn(
                    "inline-flex h-[22px] items-center gap-1.5 rounded-[5px] px-1.5 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-3 items-center justify-center rounded-[3px] border transition-colors",
                      active
                        ? "border-primary/70 bg-primary/15 text-primary"
                        : "border-border bg-muted text-transparent",
                    )}
                    aria-hidden
                  >
                    <Check className="size-2" />
                  </span>
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
          {hasSelection ? (
            <div className="ml-5 flex items-center gap-2">
              <span className="tabular-nums text-[11px] text-foreground/70">
                {t("episode.workbench.view.selectedCount", {
                  count: checkedCount,
                })}
              </span>
              <button
                type="button"
                onClick={onBatchRegenSketch}
                className="inline-flex h-[22px] items-center rounded-[5px] border border-primary/35 bg-primary/[0.07] px-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/55 hover:bg-primary/[0.12] hover:text-primary"
              >
                {t("episode.workbench.view.batchRegenSketch")}
              </button>
              <button
                type="button"
                onClick={onBatchRegenRender}
                className="inline-flex h-[22px] items-center rounded-[5px] border border-primary/35 bg-primary/[0.07] px-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/55 hover:bg-primary/[0.12] hover:text-primary"
              >
                {t("episode.workbench.view.batchRegenRender")}
              </button>
              <button
                type="button"
                onClick={onClearSelection}
                className="inline-flex h-[22px] items-center rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                {t("episode.workbench.view.clear")}
              </button>
            </div>
          ) : (
            <span className="ml-5 text-[11px] text-muted-foreground">
              {t("episode.workbench.view.selectionHint")}
            </span>
          )}
        </div>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/75">
          {t("episode.workbench.view.totalShots", { count: totalBeats })}
        </span>
      </div>
      {legendSlot}
    </div>
  );
}
