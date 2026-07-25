// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { MentionTextarea } from "@/components/episode/beat-workbench/mention-textarea";
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
import {
  GLASS_DIALOG_CONTENT_CLASS,
  TRANSPARENT_DIALOG_FOOTER_CLASS,
} from "@/lib/dialog-styles";
import { timeOfDayLabel } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";
import type {
  InsertManualShotDialogController,
  ManualShotAudioType,
} from "@/modules/narrative_planning/application/use-insert-manual-shot-dialog-controller";

const NONE_SENTINEL = "__none__";
const NO_VARIANT_SENTINEL = "__NO_SCENE_VARIANT__";
const NO_SPEAKER_MARKER = "__NO_SPEAKER__";
const FIELD_SURFACE_CLASS =
  "!rounded-[8px] !border-border bg-muted focus-within:!border-primary/45 focus-within:!ring-0 focus-visible:!border-primary/45 focus-visible:!ring-0";
const INPUT_CLASS = `h-8 text-xs ${FIELD_SURFACE_CLASS}`;
const TEXTAREA_CLASS = `!block !w-full !resize-none ${FIELD_SURFACE_CLASS}`;
const TEXTAREA_INPUT_CLASS = "px-2.5 py-2 text-xs placeholder:!text-xs";
const SELECT_POPUP_CLASS = "max-h-72 p-1";
const SELECT_ITEM_CLASS = "py-1.5";
const AUDIO_TYPES: readonly ManualShotAudioType[] = [
  "silence",
  "narration",
  "dialogue",
];

export interface InsertManualShotDialogViewProps {
  controller: InsertManualShotDialogController;
}

export function InsertManualShotDialogView({
  controller,
}: InsertManualShotDialogViewProps) {
  const { t } = useTranslation();
  const {
    audioType,
    duration,
    episodeIdentityIds,
    identitiesText,
    isNarratedProject,
    location,
    locationChoices,
    locationVariant,
    locationVariantChoices,
    mentionLabels,
    narrationText,
    onAudioTypeChange,
    onDurationChange,
    onIdentitiesTextChange,
    onLocationChange,
    onLocationVariantChange,
    onNarrationTextChange,
    onOpenChange,
    onPropsTextChange,
    onSpeakerChange,
    onSubmit,
    onTimeOfDayChange,
    onVisualChange,
    open,
    placeholderIdentities,
    placeholderProps,
    propsText,
    speaker,
    submitting,
    timeChoices,
    timeOfDay,
    titleText,
    visual,
  } = controller;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          GLASS_DIALOG_CONTENT_CLASS,
          "ring-border sm:max-w-2xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
        </DialogHeader>

        <div className="grid max-h-[75vh] gap-5 overflow-y-auto pr-1">
          <Field
            label={t("episode.workbench.insertManual.visualDescription")}
          >
            <MentionTextarea
              value={visual}
              onChange={(event) => onVisualChange(event.target.value)}
              rows={4}
              placeholder={t(
                "episode.workbench.insertManual.visualPlaceholder",
              )}
              mentionLabels={mentionLabels}
              className={TEXTAREA_CLASS}
              inputClassName={TEXTAREA_INPUT_CLASS}
              autoFocus
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr]">
            <Field label={t("episode.workbench.insertManual.audioType")}>
              <div className="grid grid-cols-3 gap-1 rounded-[8px] border border-border bg-muted p-1">
                {AUDIO_TYPES.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={audioType === value ? "secondary" : "ghost"}
                    size="sm"
                    className="h-7 rounded-[6px] px-2 text-xs"
                    onClick={() => onAudioTypeChange(value)}
                  >
                    {t(
                      `episode.workbench.insertManual.audioType${value[0].toUpperCase()}${value.slice(1)}`,
                    )}
                  </Button>
                ))}
              </div>
            </Field>

            {audioType !== "silence" ? (
              <Field
                label={t("episode.workbench.insertManual.narration")}
                required
              >
                <Textarea
                  value={narrationText}
                  onChange={(event) =>
                    onNarrationTextChange(event.target.value)
                  }
                  rows={2}
                  placeholder={t(
                    "episode.workbench.insertManual.narrationPlaceholder",
                  )}
                  className={`min-h-[64px] resize-none ${TEXTAREA_CLASS} ${TEXTAREA_INPUT_CLASS}`}
                />
              </Field>
            ) : (
              <InfoBlock
                label={t("episode.workbench.insertManual.narration")}
                value={t("episode.workbench.insertManual.silentHint")}
              />
            )}
          </div>

          {audioType === "dialogue" && isNarratedProject ? (
            <Field
              label={t("episode.workbench.insertManual.speaker")}
              required
            >
              <Select
                value={speaker || NO_SPEAKER_MARKER}
                onValueChange={(value) =>
                  onSpeakerChange(
                    value === NO_SPEAKER_MARKER ? "" : String(value ?? ""),
                  )
                }
              >
                <SelectTrigger
                  aria-label={t("episode.workbench.insertManual.speaker")}
                  className={`h-8 w-full text-xs ${FIELD_SURFACE_CLASS}`}
                >
                  <SelectValue
                    placeholder={t(
                      "episode.workbench.insertManual.speakerRequired",
                    )}
                  >
                    {speaker ||
                      t("episode.workbench.insertManual.speakerRequired")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  align="start"
                  alignItemWithTrigger={false}
                  className={SELECT_POPUP_CLASS}
                >
                  <SelectItem
                    value={NO_SPEAKER_MARKER}
                    className={SELECT_ITEM_CLASS}
                    disabled={episodeIdentityIds.length > 0}
                  >
                    {t("episode.workbench.insertManual.speakerRequired")}
                  </SelectItem>
                  {episodeIdentityIds.map((identityId) => (
                    <SelectItem
                      key={identityId}
                      value={identityId}
                      className={SELECT_ITEM_CLASS}
                    >
                      {identityId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : audioType === "narration" && isNarratedProject ? (
            <InfoBlock
              label={t("episode.workbench.insertManual.narrator")}
              value={t("episode.workbench.insertManual.projectNarrator")}
            />
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <Field label={t("episode.workbench.insertManual.duration")}>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={Number.isFinite(duration) ? duration : ""}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  onDurationChange(
                    Number.isFinite(value) && value > 0 ? value : 0,
                  );
                }}
                className={INPUT_CLASS}
              />
            </Field>

            <Field label={t("episode.workbench.insertManual.location")}>
              <Select
                value={location || NONE_SENTINEL}
                onValueChange={(value) =>
                  onLocationChange(
                    value === NONE_SENTINEL ? "" : String(value ?? ""),
                  )
                }
              >
                <SelectTrigger
                  aria-label={t("episode.workbench.insertManual.location")}
                  className={`h-8 w-full text-xs ${FIELD_SURFACE_CLASS}`}
                >
                  <SelectValue
                    placeholder={t(
                      "episode.workbench.insertManual.locationPlaceholder",
                    )}
                  >
                    {location ||
                      t("episode.workbench.insertManual.locationPlaceholder")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>
                    {t("episode.workbench.insertManual.locationNone")}
                  </SelectItem>
                  {locationChoices.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {choice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={t("episode.workbench.insertManual.sceneVariant", {
                defaultValue: "变体",
              })}
            >
              <Select
                value={locationVariant || NO_VARIANT_SENTINEL}
                onValueChange={(value) =>
                  onLocationVariantChange(
                    value === NO_VARIANT_SENTINEL
                      ? ""
                      : String(value ?? ""),
                  )
                }
                disabled={!location}
              >
                <SelectTrigger
                  aria-label={t(
                    "episode.workbench.insertManual.sceneVariant",
                    { defaultValue: "变体" },
                  )}
                  className={`h-8 w-full text-xs ${FIELD_SURFACE_CLASS}`}
                >
                  <SelectValue>
                    {locationVariant ||
                      t("episode.workbench.insertManual.noSceneVariant", {
                        defaultValue: "无变体",
                      })}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_VARIANT_SENTINEL}>
                    {t("episode.workbench.insertManual.noSceneVariant", {
                      defaultValue: "无变体",
                    })}
                  </SelectItem>
                  {locationVariantChoices.map((variant) => (
                    <SelectItem key={variant} value={variant}>
                      {variant}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label={t("episode.workbench.insertManual.timeOfDay")}>
              <Select
                value={timeOfDay || NONE_SENTINEL}
                onValueChange={(value) =>
                  onTimeOfDayChange(
                    value === NONE_SENTINEL ? "" : String(value ?? ""),
                  )
                }
              >
                <SelectTrigger
                  aria-label={t("episode.workbench.insertManual.timeOfDay")}
                  className={`h-8 w-full text-xs ${FIELD_SURFACE_CLASS}`}
                >
                  <SelectValue
                    placeholder={t(
                      "episode.workbench.insertManual.timeOfDayPlaceholder",
                    )}
                  >
                    {timeOfDayLabel(timeOfDay)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>
                    {timeOfDayLabel("")}
                  </SelectItem>
                  {timeChoices.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {timeOfDayLabel(choice)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <InfoBlock
              label={t("episode.workbench.insertManual.type")}
              value={t("episode.workbench.insertManual.typeManual")}
            />

            <Field label={t("episode.workbench.insertManual.identities")}>
              <Input
                value={identitiesText}
                onChange={(event) =>
                  onIdentitiesTextChange(event.target.value)
                }
                placeholder={
                  placeholderIdentities
                    ? t(
                        "episode.workbench.insertManual.identitiesPlaceholder",
                        { example: placeholderIdentities },
                      )
                    : t(
                        "episode.workbench.insertManual.identitiesPlaceholderEmpty",
                      )
                }
                className={INPUT_CLASS}
              />
            </Field>

            <Field
              label={t("episode.workbench.insertManual.props", {
                defaultValue: "出场道具",
              })}
            >
              <Input
                value={propsText}
                onChange={(event) => onPropsTextChange(event.target.value)}
                placeholder={
                  placeholderProps
                    ? t("episode.workbench.insertManual.propsPlaceholder", {
                        example: placeholderProps,
                        defaultValue:
                          "逗号分隔，如 {{example}}；留空自动从画面描述提取",
                      })
                    : t(
                        "episode.workbench.insertManual.propsPlaceholderEmpty",
                        {
                          defaultValue:
                            "逗号分隔道具ID；留空自动从画面描述提取",
                        },
                      )
                }
                className={INPUT_CLASS}
              />
            </Field>
          </div>
        </div>

        <DialogFooter className={TRANSPARENT_DIALOG_FOOTER_CLASS}>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void onSubmit()} disabled={submitting}>
            {submitting && (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            )}
            {t("episode.workbench.insertManual.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  children,
  label,
  required,
}: {
  children: ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="flex min-h-8 items-center rounded-[8px] border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        {value}
      </div>
    </div>
  );
}
