// Copyright (c) 2026 AI anime
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Grid2X2,
  Image as ImageIcon,
  Loader2,
  Mic2,
  Pencil,
  Square,
  X,
} from "lucide-react";

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
import { Button } from "@/components/ui/button";
import type { BatchPanelController } from "@/modules/production/application/use-batch-panel-controller";
import { sketchPlanGridLabel } from "@/modules/production/domain/sketch-regen-queue";

interface BatchPanelConfirmation {
  title: string;
  description: string;
  onConfirm: () => void;
}

export interface BatchPanelViewProps {
  controller: BatchPanelController;
  renderPlanDialog: ReactNode;
}

export function BatchPanelView({
  controller,
  renderPlanDialog,
}: BatchPanelViewProps) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<BatchPanelConfirmation | null>(null);
  const {
    actionDisabled,
    audioPending,
    beatNumbers,
    isSeedance2Backend,
    lockedSketchItemIds,
    onBatchAudio,
    onClearSelection,
    onConfirmSketchPlan,
    onDispatchSingleSketches,
    onOpenRenderPlan,
    onOpenSketchPlan,
    onSketchPlanOpenChange,
    singleSketchUnlockedCount,
    sketchPlanCostDisplay,
    sketchPlanItems,
    sketchPlanOpen,
    sketchPlanUnlockedCount,
  } = controller;
  const count = beatNumbers.length;

  const askConfirm = (
    title: string,
    description: string,
    onConfirm: () => void,
  ) => {
    setConfirm({ title, description, onConfirm });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">
            {t("episode.workbench.batch.selectedCount", { count })}
          </span>
          <span className="text-[10px] text-muted-foreground">
            #{beatNumbers.join(", #")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClearSelection}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t("episode.workbench.batch.clearSelection")}
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("episode.workbench.batch.batchRegen")}
          </h4>

          {/* Sketch modes */}
          <div className="flex flex-col rounded-lg border border-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Pencil className="size-3" />
              <span>{t("episode.workbench.batch.sketch")}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  actionDisabled.sketch || singleSketchUnlockedCount === 0
                }
                onClick={() => {
                  askConfirm(
                    t("episode.workbench.batch.regenSketchSingleTitle", {
                      count,
                      defaultValue: "单张重抽草图",
                    }),
                    t("episode.workbench.batch.regenSketchSingleDesc", {
                      beats: beatNumbers.join(", #"),
                      defaultValue: "按当前画幅把选中 beats 拆成 1x1 草图任务。",
                    }),
                    onDispatchSingleSketches,
                  );
                }}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Square className="size-3" />
                {t("episode.workbench.batch.singleRegen", {
                  defaultValue: "单张重抽",
                })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  actionDisabled.sketch || sketchPlanUnlockedCount === 0
                }
                onClick={onOpenSketchPlan}
                className="relative h-7 gap-1 rounded-[8px] border-[3px] border-primary px-2 pr-9 text-[11px] transition-transform hover:border-primary hover:bg-transparent active:scale-95"
              >
                <Grid2X2 className="size-3" />
                {t("episode.workbench.batch.autoCombine", {
                  defaultValue: "批量重抽",
                })}
                <CreditCostInline display={sketchPlanCostDisplay} />
              </Button>
            </div>
          </div>

          <AlertDialog
            open={sketchPlanOpen}
            onOpenChange={onSketchPlanOpenChange}
          >
            <AlertDialogContent className="max-w-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("episode.sketchPlan.title", {
                    beats: count,
                    grids: sketchPlanItems.length,
                    defaultValue: `草图计划（${count} beats → ${sketchPlanItems.length} 个网格）`,
                  })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("episode.sketchPlan.subtitle", {
                    defaultValue: "系统已根据场景自动分组。确认后会直接发配草图任务。",
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="max-h-[45vh] overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {sketchPlanItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex w-[170px] shrink-0 flex-col gap-1 rounded-[6px] border border-border bg-muted p-2 text-xs ${
                        lockedSketchItemIds.has(item.id) ? "opacity-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {sketchPlanGridLabel(item.modeKey)}
                        </span>
                        <span className="text-muted-foreground">
                          {item.beatNumbers.length > 1
                            ? `B${item.beatNumbers[0]}-${
                                item.beatNumbers[item.beatNumbers.length - 1]
                              }`
                            : `B${item.beatNumbers[0]}`}
                        </span>
                      </div>
                      <div
                        className="truncate text-success"
                        title={item.sceneIds.join(" / ")}
                      >
                        {item.sceneIds.join(" / ") ||
                          t("episode.renderPlan.unknownLocation")}
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {lockedSketchItemIds.has(item.id)
                          ? t("episode.workbench.batch.sketchGroupRunning", {
                              defaultValue: "相同草图组正在运行中",
                            })
                          : item.modeLabel}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="outline"
                  disabled={
                    actionDisabled.sketch ||
                    sketchPlanItems.length === 0 ||
                    sketchPlanUnlockedCount === 0
                  }
                  onClick={onConfirmSketchPlan}
                  className="relative pr-11 transition-transform active:scale-95"
                >
                  {t("episode.sketchPlan.confirm", {
                    grids: sketchPlanItems.length,
                    defaultValue: `确认草图 ${sketchPlanItems.length} 个网格`,
                  })}
                  <CreditCostInline display={sketchPlanCostDisplay} />
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Render modes */}
          <div className="rounded-lg border border-border p-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="size-3" />
              <span>{t("episode.workbench.batch.render")}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.render}
                onClick={() => onOpenRenderPlan(true)}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Square className="size-3" />
                {t("episode.workbench.batch.singleRegen", {
                  defaultValue: "单张重抽",
                })}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.render}
                onClick={() => onOpenRenderPlan(false)}
                className="h-7 gap-1 px-2 text-[11px]"
              >
                <Grid2X2 className="size-3" />
                {t("episode.workbench.batch.autoCombine", {
                  defaultValue: "自动组合",
                })}
              </Button>
            </div>
          </div>

          {renderPlanDialog}

          {!isSeedance2Backend && (
            <div className="rounded-lg border border-border p-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Mic2 className="size-3" />
                <span>{t("episode.workbench.batch.audio")}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={actionDisabled.audio}
                onClick={() =>
                  askConfirm(
                    t("episode.workbench.batch.genBatchAudioTitle", { count }),
                    t("episode.workbench.batch.genBatchAudioDesc", {
                      beats: beatNumbers.join(", #"),
                    }),
                    onBatchAudio,
                  )
                }
                className="h-7 gap-1 px-2 text-[11px]"
              >
                {audioPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
                {t("episode.workbench.batch.genBatchAudio", { count })}
              </Button>
            </div>
          )}
        </div>

        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          {t("episode.workbench.batch.batchHint")}
        </p>
      </div>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {t("common.confirmExecute")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
