// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";

import { CreditCostInline } from "@/components/credit-cost-inline";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GLASS_ALERT_DIALOG_CONTENT_CLASS } from "@/lib/dialog-styles";
import { cn } from "@/lib/utils";
import type { PlanEntry } from "@/modules/production/domain/render-plan";
import type {
  RenderPlanDialogController,
} from "@/modules/production/application/use-render-plan-dialog-controller";

export type RenderPlanDialogViewProps = RenderPlanDialogController;

export function RenderPlanDialogView({
  beatCount,
  executePending,
  open,
  plan,
  planPending,
  renderPlanCostDisplay,
  staleBanner,
  onConfirm,
  onOpenChange,
}: RenderPlanDialogViewProps) {
  const { t } = useTranslation();
  const loading = planPending || executePending;
  const confirmLabel = plan
    ? t("episode.renderPlan.confirm", { grids: plan.total_grids })
    : planPending
      ? t("episode.renderPlan.planning")
      : t("episode.renderPlan.unavailable");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className={cn("max-w-3xl", GLASS_ALERT_DIALOG_CONTENT_CLASS)}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("episode.renderPlan.title", {
              beats: plan?.total_beats ?? beatCount,
              grids: plan?.total_grids ?? "…",
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("episode.renderPlan.subtitle")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {staleBanner && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertTriangle className="mr-1 inline size-3" />
            {t(`episode.renderPlan.stale.${staleBanner}`)}
          </div>
        )}

        <div className="mt-4 max-h-[45vh] overflow-y-auto">
          {loading && !plan ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !plan ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              {t("episode.renderPlan.unavailable")}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {plan.plan.map((entry, index) => (
                <PlanCard
                  key={`${entry.mode_key}:${entry.beat_numbers.join("-")}:${index}`}
                  entry={entry}
                />
              ))}
            </div>
          )}
        </div>

        <AlertDialogFooter className="px-4">
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            onClick={onConfirm}
            disabled={loading || !plan}
            className="relative pr-11 transition-transform active:scale-95"
          >
            {executePending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              confirmLabel
            )}
            <CreditCostInline display={renderPlanCostDisplay} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PlanCard({ entry }: { entry: PlanEntry }) {
  const { t } = useTranslation();
  const beatsLabel =
    entry.beat_numbers.length > 1
      ? `B${entry.beat_numbers[0]}-${
          entry.beat_numbers[entry.beat_numbers.length - 1]
        }`
      : `B${entry.beat_numbers[0]}`;
  const ironLaw = entry.reasons.includes("iron-law-3-chars");
  const multiScene =
    entry.location.includes("·") || entry.location.includes(" / ");

  return (
    <div
      className={cn(
        "flex w-[170px] shrink-0 flex-col gap-1 rounded-[6px] border border-border bg-popover/95 p-2 text-xs backdrop-blur-sm",
        ironLaw && "border-warning/50",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{`${entry.rows}×${entry.cols}`}</span>
        <span className="text-muted-foreground">{beatsLabel}</span>
      </div>
      <div
        className={cn(
          "truncate",
          multiScene ? "text-warning" : "text-success",
        )}
        title={entry.location}
      >
        {entry.location || t("episode.renderPlan.unknownLocation")}
        {entry.padding_count > 0 && ` +${entry.padding_count}空`}
      </div>
      {entry.warnings.length > 0 && (
        <div className="text-warning">
          <AlertTriangle className="mr-0.5 inline size-2.5" />
          {entry.warnings[0]}
        </div>
      )}
    </div>
  );
}
