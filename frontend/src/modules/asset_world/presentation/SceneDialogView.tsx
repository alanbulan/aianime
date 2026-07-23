// Copyright (c) 2026 AI anime
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AssetBeatReferences } from "@/components/assets/asset-beat-references";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { sceneTypeLabel, sceneTypeOptions } from "@/lib/scene-type";
import { timeOfDayLabel } from "@/lib/time-of-day";
import type { SceneDialogController } from "@/modules/asset_world/application/use-scene-dialog-controller";
import { SceneEnvironmentPromptFields } from "@/modules/asset_world/presentation/SceneEnvironmentPromptFields";

const INPUT_CLASS =
  "h-11 rounded-[8px] border-border bg-muted px-3 text-sm placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";
const SELECT_TRIGGER_CLASS =
  "!h-11 !w-full min-w-0 overflow-hidden rounded-[8px] border-border bg-muted !px-3 !py-0 text-sm leading-none focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10 *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:truncate *:data-[slot=select-value]:leading-none";
const DISPLAY_CLASS =
  "flex h-11 min-w-0 items-center rounded-[8px] border border-border bg-muted px-3 text-sm";
const TEXTAREA_CLASS =
  "rounded-[8px] border-border bg-muted px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/10";

function CoOccurrenceRow({
  label,
  ids,
  onJump,
}: {
  label: string;
  ids: string[];
  onJump(id: string): void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onJump(id)}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-foreground"
          >
            {id}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SceneDialogView({
  controller,
}: {
  controller: SceneDialogController;
}) {
  const { t } = useTranslation();
  const {
    close,
    coOccurrence,
    draft,
    environment,
    generatedNamePreview,
    hasPlateSuffix,
    initial,
    navigateToIdentity,
    navigateToProp,
    onOpenChange,
    open,
    plate,
    project,
    references,
    saveDisabled,
    saving,
    sceneTimeChoices,
    submit,
    title,
    updateDraft,
    updateEnvironment,
  } = controller;

  const sceneTypeField = (
    <div className="grid min-w-0 gap-2">
      <Label className="text-sm">{t("assets.scenes.fields.type")}</Label>
      <Select
        value={draft.scene_type || "other"}
        onValueChange={(value) =>
          updateDraft({ scene_type: String(value || "other") })
        }
      >
        <SelectTrigger
          size="sm"
          aria-label={t("assets.scenes.fields.type")}
          className={SELECT_TRIGGER_CLASS}
        >
          <SelectValue>{sceneTypeLabel(draft.scene_type)}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {sceneTypeOptions(draft.scene_type).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-4 overflow-hidden rounded-2xl border border-border bg-popover/95 px-7 pb-4 pt-7 shadow-xl backdrop-blur-3xl sm:max-w-4xl">
        <DialogHeader className="gap-2">
          <DialogTitle className="flex items-center gap-2 text-lg font-medium tracking-tight">
            <span>{title}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] min-w-0 gap-4 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
          {plate ? (
            <div className="grid min-w-0 gap-3">
              <div className="grid min-w-0 gap-2">
                <Label className="text-sm">
                  {t("assets.scenes.generatedPlateName", {
                    defaultValue: "资产名",
                  })}
                </Label>
                <div
                  aria-label={t("assets.scenes.generatedPlateName", {
                    defaultValue: "资产名",
                  })}
                  className={DISPLAY_CLASS}
                >
                  <span
                    className={
                      hasPlateSuffix
                        ? "truncate font-medium text-foreground"
                        : "truncate text-muted-foreground/70"
                    }
                  >
                    {generatedNamePreview}
                  </span>
                </div>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,1.25fr)_minmax(7.5rem,0.7fr)]">
                <div className="grid min-w-0 gap-2">
                  <Label className="text-sm">
                    {t("assets.scenes.fields.baseScene", {
                      defaultValue: "基础场景",
                    })}
                  </Label>
                  <Input
                    aria-label={t("assets.scenes.fields.baseScene", {
                      defaultValue: "基础场景",
                    })}
                    value={draft.base_scene_id ?? ""}
                    readOnly
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label className="text-sm">
                    {t("assets.scenes.fields.variant", {
                      defaultValue: "变体",
                    })}
                  </Label>
                  <Input
                    aria-label={t("assets.scenes.fields.variant", {
                      defaultValue: "变体",
                    })}
                    value={draft.variant_id ?? ""}
                    onChange={(event) =>
                      updateDraft({ variant_id: event.target.value })
                    }
                    placeholder="漏水"
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="grid min-w-0 gap-2">
                  <Label className="text-sm">
                    {t("assets.scenes.fields.timeOfDay", {
                      defaultValue: "时间",
                    })}
                  </Label>
                  <Select
                    value={draft.time_of_day || "__NO_SCENE_TIME__"}
                    onValueChange={(value) =>
                      updateDraft({
                        time_of_day:
                          value === "__NO_SCENE_TIME__"
                            ? ""
                            : String(value || ""),
                      })
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t("assets.scenes.fields.timeOfDay", {
                        defaultValue: "时间",
                      })}
                      className={SELECT_TRIGGER_CLASS}
                    >
                      <SelectValue>
                        {timeOfDayLabel(draft.time_of_day)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" alignItemWithTrigger={false}>
                      <SelectItem value="__NO_SCENE_TIME__">
                        {timeOfDayLabel("")}
                      </SelectItem>
                      {sceneTimeChoices.map((option) => (
                        <SelectItem key={option} value={option}>
                          {timeOfDayLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {sceneTypeField}
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label className="text-sm">
                {t("assets.scenes.fields.name")}
              </Label>
              <Input
                aria-label={t("assets.scenes.fields.name")}
                value={draft.name}
                onChange={(event) => updateDraft({ name: event.target.value })}
                className={INPUT_CLASS}
              />
              <p className="text-xs leading-5 text-muted-foreground">
                {t("assets.scenes.fields.nameRule", {
                  defaultValue:
                    "普通独立场景只填名称；不要在这里填写变体或时间。需要状态/时间版时，在场景详情里添加变体。",
                })}
              </p>
            </div>
          )}
          {!plate ? sceneTypeField : null}
          {plate ? (
            <div className="grid gap-2">
              <Label className="text-sm">
                {t("assets.scenes.fields.variantPrompt", {
                  defaultValue: "变体增量提示词",
                })}
              </Label>
              <Textarea
                aria-label={t("assets.scenes.fields.variantPrompt", {
                  defaultValue: "变体增量提示词",
                })}
                rows={4}
                value={draft.variant_prompt ?? ""}
                onChange={(event) =>
                  updateDraft({ variant_prompt: event.target.value })
                }
                placeholder={t("assets.scenes.fields.variantPromptPlaceholder", {
                  defaultValue:
                    "只写和基础场景不同的部分，例如积水反光、焦黑墙面、节日装饰。",
                })}
                className={TEXTAREA_CLASS}
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label className="text-sm">
                {t("assets.scenes.fields.environmentPrompt")}
              </Label>
              <SceneEnvironmentPromptFields
                sections={environment}
                onChange={updateEnvironment}
                textareaClassName={TEXTAREA_CLASS}
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label className="text-sm">
              {t("assets.scenes.fields.description")}
            </Label>
            <Textarea
              rows={3}
              value={draft.description ?? ""}
              onChange={(event) =>
                updateDraft({ description: event.target.value })
              }
              className={TEXTAREA_CLASS}
            />
          </div>
          {initial ? (
            <AssetBeatReferences
              project={project}
              references={references}
              className="border-t border-border pt-4"
            />
          ) : null}
          {initial &&
          (coOccurrence.identities.length > 0 ||
            coOccurrence.props.length > 0) ? (
            <div className="grid gap-3 border-t border-border pt-4">
              {coOccurrence.identities.length > 0 ? (
                <CoOccurrenceRow
                  label={t("assets.common.coIdentities")}
                  ids={coOccurrence.identities}
                  onJump={navigateToIdentity}
                />
              ) : null}
              {coOccurrence.props.length > 0 ? (
                <CoOccurrenceRow
                  label={t("assets.common.coProps")}
                  ids={coOccurrence.props}
                  onJump={navigateToProp}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter className="border-t-0 bg-transparent pt-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={close}
            className="h-10 w-18 rounded-md border-border bg-muted px-0 text-sm font-normal text-foreground/80 hover:border-foreground/30 hover:bg-accent hover:text-foreground"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={submit}
            disabled={saveDisabled}
            className="h-10 w-18 rounded-md bg-primary px-0 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
