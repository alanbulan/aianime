// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Mic2, Palette, Sparkles, Wand2 } from "lucide-react";

import { CreditCostInline } from "@/components/credit-cost-inline";
import { CreditCostPill } from "@/components/credit-visual";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  WORKBENCH_SELECT_CONTENT_CLASS,
  WORKBENCH_SELECT_ITEM_CLASS,
  WORKBENCH_SELECT_TRIGGER_CLASS,
} from "@/lib/workbench-select-styles";
import type {
  BatchBarController,
  BatchBarModelControl,
} from "@/modules/production/application/use-batch-bar-controller";
import type { SketchAspectRatio } from "@/modules/production/domain/image-settings";

const TOOLBAR_CONTROL_CLASS =
  "h-[26px] gap-1.5 rounded-[6px] border border-border bg-muted px-2 py-0 text-[11px] font-medium text-foreground/85 transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:text-muted-foreground/50";

interface BatchBarConfirmation {
  costDisplay: string;
  description: string;
  onConfirm(): void;
  title: string;
}

export interface BatchBarViewProps {
  controller: BatchBarController;
}

function BatchBarModelSelect({
  control,
  label,
  placeholder,
}: {
  control: BatchBarModelControl;
  label: string;
  placeholder: string;
}) {
  if (control.isLoading) {
    return (
      <div className="flex h-[26px] min-w-40 items-center justify-center text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
      </div>
    );
  }
  if (!control.isVisible) return null;

  const selectedLabel =
    control.options.find((option) => option.value === control.value)?.label ??
    control.value;

  return (
    <div className="flex items-center gap-2">
      <Label className="whitespace-nowrap text-[11px] text-muted-foreground">
        {label}
      </Label>
      <Select
        value={control.value}
        onValueChange={(value) => {
          if (value) void control.onChange(value);
        }}
        disabled={control.isPending || control.options.length === 0}
      >
        <SelectTrigger
          aria-label={label}
          className={cn(WORKBENCH_SELECT_TRIGGER_CLASS, "w-28")}
        >
          <SelectValue>{() => selectedLabel || placeholder}</SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          sideOffset={8}
          alignItemWithTrigger={false}
          className={WORKBENCH_SELECT_CONTENT_CLASS}
        >
          {control.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className={WORKBENCH_SELECT_ITEM_CLASS}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SketchAspectSelect({
  aspectRatio,
  disabled = false,
  onAspectRatioChange,
}: {
  aspectRatio: SketchAspectRatio;
  disabled?: boolean;
  onAspectRatioChange(aspectRatio: SketchAspectRatio): void;
}) {
  const { t } = useTranslation();
  const selectedValue = aspectRatio === "16:9" ? "16:9" : "2:3";

  return (
    <div className="flex items-center gap-2.5 text-[11px]">
      <Label className="whitespace-nowrap text-[11px] text-muted-foreground">
        {t("episode.sketchSettings.aspectRatio")}
      </Label>
      <Select
        value={selectedValue}
        disabled={disabled}
        onValueChange={(value) => {
          if (!value) return;
          onAspectRatioChange(value === "16:9" ? "16:9" : "2:3");
        }}
      >
        <SelectTrigger
          aria-label={t("episode.sketchSettings.aspectRatio")}
          className={cn(WORKBENCH_SELECT_TRIGGER_CLASS, "w-[70px]")}
        >
          <SelectValue>{() => selectedValue}</SelectValue>
        </SelectTrigger>
        <SelectContent
          align="start"
          sideOffset={8}
          alignItemWithTrigger={false}
          className={WORKBENCH_SELECT_CONTENT_CLASS}
        >
          <SelectItem value="2:3" className={WORKBENCH_SELECT_ITEM_CLASS}>
            2:3
          </SelectItem>
          <SelectItem value="16:9" className={WORKBENCH_SELECT_ITEM_CLASS}>
            16:9
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function BatchBarView({ controller }: BatchBarViewProps) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState<BatchBarConfirmation | null>(null);
  const {
    assignColorsPending,
    audioPending,
    audioModelUnavailable,
    audioUnavailableForVideoModel,
    detectIdentitiesCostDisplay,
    detectIdentitiesPending,
    episodeAudioCostDisplay,
    errorDialog,
    globalOptimizePending,
    renderModel,
    sketchAspectRatio,
    sketchModel,
    showEpisodeAudio,
    showGlobalOptimize,
    onDetectIdentities,
    onDismissError,
    onGenerateAudio,
    onGlobalOptimize,
    onReassignColors,
    onSketchAspectRatioChange,
  } = controller;

  const askConfirm = (
    title: string,
    description: string,
    onConfirm: () => void,
    costDisplay = "",
  ) => {
    setConfirm({ title, description, onConfirm, costDisplay });
  };

  return (
    <div className="flex h-full w-full items-center px-3">
      <div
        role="toolbar"
        aria-label={t("episode.workbench.batch.toolbar", "生成工具栏")}
        className="flex w-full min-w-0 flex-wrap items-center justify-center gap-x-7 gap-y-1.5"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-5">
          <BatchBarModelSelect
            control={sketchModel}
            label={t("episode.sketchSettings.model")}
            placeholder={t("episode.sketchSettings.modelPlaceholder")}
          />
          <BatchBarModelSelect
            control={renderModel}
            label={t("episode.renderSettings.model")}
            placeholder={t("episode.renderSettings.modelPlaceholder")}
          />
          <SketchAspectSelect
            aspectRatio={sketchAspectRatio}
            onAspectRatioChange={onSketchAspectRatioChange}
          />
        </div>

        <span
          className="hidden h-5 w-px shrink-0 bg-border/75 lg:block"
          aria-hidden
        />

        <div className="flex min-w-0 flex-wrap items-center gap-4">
          {showGlobalOptimize && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                askConfirm(
                  t("episode.workbench.batch.aiOptimizeTitle"),
                  t("episode.workbench.batch.aiOptimizeDesc"),
                  onGlobalOptimize,
                )
              }
              disabled={globalOptimizePending}
              className={TOOLBAR_CONTROL_CLASS}
            >
              {globalOptimizePending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {t("episode.workbench.batch.aiOptimize")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onDetectIdentities}
            disabled={detectIdentitiesPending}
            className={TOOLBAR_CONTROL_CLASS}
            title={t("episode.workbench.batch.aiDetectTooltip")}
          >
            {detectIdentitiesPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Wand2 className="size-3.5" />
            )}
            {t("episode.workbench.batch.aiDetect")}
            <CreditCostInline display={detectIdentitiesCostDisplay} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              askConfirm(
                t("episode.workbench.batch.reassignColorsTitle"),
                t("episode.workbench.batch.reassignColorsDesc"),
                onReassignColors,
              )
            }
            disabled={assignColorsPending}
            className={TOOLBAR_CONTROL_CLASS}
            title={t("episode.workbench.batch.reassignColorsTooltip")}
          >
            {assignColorsPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Palette className="size-3.5" />
            )}
            {t("episode.workbench.batch.reassignColors")}
          </Button>
          {showEpisodeAudio && (
            <Tooltip>
              <TooltipTrigger
                delay={150}
                closeDelay={150}
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (audioUnavailableForVideoModel || audioModelUnavailable) return;
                      askConfirm(
                        t("episode.workbench.batch.genAudioTitle"),
                        t("episode.workbench.batch.genAudioDesc"),
                        onGenerateAudio,
                        episodeAudioCostDisplay,
                      );
                    }}
                    disabled={
                      !audioUnavailableForVideoModel && !audioModelUnavailable && audioPending
                    }
                    aria-disabled={audioUnavailableForVideoModel || audioModelUnavailable}
                    className={cn(
                      TOOLBAR_CONTROL_CLASS,
                      (audioUnavailableForVideoModel || audioModelUnavailable) &&
                        "cursor-not-allowed border-border text-muted-foreground/45 hover:border-border hover:bg-muted hover:text-muted-foreground/45",
                    )}
                  />
                }
              >
                {audioPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Mic2 className="size-3.5" />
                )}
                {t("episode.workbench.batch.genAudio")}
                <span
                  aria-hidden="true"
                  className="inline-flex min-w-7 justify-start"
                >
                  <CreditCostPill
                    display={episodeAudioCostDisplay}
                    disabled={audioUnavailableForVideoModel || audioModelUnavailable}
                    className="h-4 bg-transparent px-0 text-[11px]"
                  />
                </span>
              </TooltipTrigger>
              {(audioUnavailableForVideoModel || audioModelUnavailable) && (
                <TooltipContent
                  side="bottom"
                  sideOffset={8}
                  showArrow={false}
                  className="border border-border bg-popover text-popover-foreground shadow-lg"
                >
                  {audioModelUnavailable
                    ? t("episode.workbench.audio.modelUnavailable")
                    : t(
                        "episode.workbench.batch.genAudioUnavailableForVideoModel",
                      )}
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </div>
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
              variant={confirm?.costDisplay ? "outline" : undefined}
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
              className={cn(
                confirm?.costDisplay &&
                  "relative border-[3px] border-primary bg-transparent pr-9 transition-transform hover:border-primary hover:bg-transparent active:scale-95",
              )}
            >
              {t("common.confirmExecute")}
              <CreditCostInline display={confirm?.costDisplay ?? ""} />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={errorDialog !== null}
        onOpenChange={(open) => !open && onDismissError()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{errorDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {errorDialog?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onDismissError}>
              {t("common.ok", "OK")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
