// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";

import { MentionTextarea } from "@/features/mention-textarea/public";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { timeOfDayLabel } from "@/lib/time-of-day";
import { cn } from "@/lib/utils";
import type { TextPaneController } from "@/modules/narrative_planning/application/use-text-pane-controller";

const NO_SCENE_MARKER = "__none__";
const NO_SCENE_VARIANT_MARKER = "__NO_SCENE_VARIANT__";
const NO_TIME_OF_DAY_MARKER = "__NO_TIME_OF_DAY__";
const NO_SPEAKER_MARKER = "__NO_SPEAKER__";
const CONTROL_CLASS =
  "rounded-[8px] border-border bg-muted text-[13px] text-foreground/88 shadow-none placeholder:text-muted-foreground hover:bg-accent focus-visible:border-primary/45 focus-visible:bg-muted focus-visible:ring-0";
const COMPACT_CONTROL_CLASS = cn(CONTROL_CLASS, "h-8 px-3");
const SELECT_POPUP_CLASS = "max-h-72 p-1";
const SELECT_ITEM_CLASS = "py-1.5";
const MENTION_TEXTAREA_CLASS = cn(CONTROL_CLASS, "min-h-[72px]");
const MENTION_TEXTAREA_INPUT_CLASS = "px-3 py-2 text-[13px] leading-6";

export interface TextPaneViewProps {
  controller: TextPaneController;
}

function audioTypeLabel(
  t: ReturnType<typeof useTranslation>["t"],
  value: string | undefined | null,
) {
  if (value === "silence") return t("episode.workbench.text.silence");
  if (value === "dialogue") return t("episode.workbench.text.dialogue");
  return t("episode.workbench.text.narrationLabel");
}

export function TextPaneView({ controller }: TextPaneViewProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3.5">
      <Field label={t("episode.workbench.text.narration")}>
        <MentionTextarea
          value={controller.narration}
          onChange={(event) => controller.onNarrationChange(event.target.value)}
          onBlur={controller.onNarrationBlur}
          rows={2}
          mentionLabels={controller.mentionLabels}
          placeholder={t("episode.workbench.text.narrationPlaceholder")}
          className={MENTION_TEXTAREA_CLASS}
          inputClassName={MENTION_TEXTAREA_INPUT_CLASS}
        />
      </Field>

      <MetadataSection>
        <div className="col-span-full grid grid-cols-[auto_minmax(0,1fr)_minmax(7rem,12rem)_auto] gap-x-3 gap-y-3">
          <Field label={t("episode.workbench.text.type")}>
            <Select
              value={controller.audioType}
              onValueChange={(value) =>
                controller.onAudioTypeChange(String(value ?? "narration"))
              }
            >
              <SelectTrigger
                aria-label={t("episode.workbench.text.type")}
                className={cn(COMPACT_CONTROL_CLASS, "w-full")}
              >
                <SelectValue>
                  {audioTypeLabel(t, controller.audioType)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className={SELECT_POPUP_CLASS}
              >
                {controller.audioTypeOptions.map((value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    className={SELECT_ITEM_CLASS}
                  >
                    {audioTypeLabel(t, value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label={t("episode.workbench.text.location")}
            action={
              controller.sceneId.trim() ? (
                <button
                  type="button"
                  onClick={() =>
                    controller.onJumpToAsset("scene", controller.sceneId.trim())
                  }
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-primary"
                  title={t("assets.common.jumpToAsset", {
                    name: controller.sceneId.trim(),
                  })}
                >
                  <ArrowUpRight className="size-3" />
                </button>
              ) : undefined
            }
          >
            <Select
              value={controller.currentSceneRef.scene_id || NO_SCENE_MARKER}
              onValueChange={(value) =>
                controller.onSceneChange(
                  value === NO_SCENE_MARKER ? "" : String(value ?? ""),
                )
              }
            >
              <SelectTrigger
                aria-label={t("episode.workbench.text.location")}
                className={cn(COMPACT_CONTROL_CLASS, "w-full")}
              >
                <SelectValue
                  placeholder={t(
                    "episode.workbench.text.locationPlaceholder",
                  )}
                >
                  {controller.sceneId ||
                    t("episode.workbench.text.locationPlaceholder")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className={SELECT_POPUP_CLASS}
              >
                <SelectItem
                  value={NO_SCENE_MARKER}
                  className={SELECT_ITEM_CLASS}
                >
                  {t("episode.workbench.text.locationNone")}
                </SelectItem>
                {controller.baseSceneChoices.map((id) => (
                  <SelectItem
                    key={id}
                    value={id}
                    className={SELECT_ITEM_CLASS}
                  >
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label={t("episode.workbench.text.sceneVariant", {
              defaultValue: "变体",
            })}
          >
            <Select
              value={
                controller.currentSceneRef.variant_id ||
                NO_SCENE_VARIANT_MARKER
              }
              onValueChange={(value) =>
                controller.onSceneVariantChange(
                  value === NO_SCENE_VARIANT_MARKER
                    ? ""
                    : String(value ?? ""),
                )
              }
              disabled={!controller.currentSceneRef.scene_id}
            >
              <SelectTrigger
                aria-label={t("episode.workbench.text.sceneVariant", {
                  defaultValue: "变体",
                })}
                className={cn(COMPACT_CONTROL_CLASS, "w-full")}
              >
                <SelectValue>
                  {controller.currentSceneRef.variant_id ||
                    t("episode.workbench.text.noSceneVariant", {
                      defaultValue: "无变体",
                    })}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className={SELECT_POPUP_CLASS}
              >
                <SelectItem
                  value={NO_SCENE_VARIANT_MARKER}
                  className={SELECT_ITEM_CLASS}
                >
                  {t("episode.workbench.text.noSceneVariant", {
                    defaultValue: "无变体",
                  })}
                </SelectItem>
                {controller.sceneVariantChoices.map((variant) => (
                  <SelectItem
                    key={variant}
                    value={variant}
                    className={SELECT_ITEM_CLASS}
                  >
                    {variant}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={t("episode.workbench.text.timeOfDay")}>
            <Select
              value={controller.timeOfDay || NO_TIME_OF_DAY_MARKER}
              onValueChange={(value) =>
                controller.onTimeOfDayChange(
                  value === NO_TIME_OF_DAY_MARKER
                    ? ""
                    : String(value ?? ""),
                )
              }
            >
              <SelectTrigger
                aria-label={t("episode.workbench.text.timeOfDay")}
                className={cn(COMPACT_CONTROL_CLASS, "w-full")}
              >
                <SelectValue
                  placeholder={t(
                    "episode.workbench.text.timeOfDayPlaceholder",
                  )}
                >
                  {timeOfDayLabel(controller.timeOfDay)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className={SELECT_POPUP_CLASS}
              >
                <SelectItem
                  value={NO_TIME_OF_DAY_MARKER}
                  className={SELECT_ITEM_CLASS}
                >
                  {timeOfDayLabel("")}
                </SelectItem>
                {controller.timeOfDayChoices.map((value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    className={SELECT_ITEM_CLASS}
                  >
                    {timeOfDayLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {controller.scenePlateLabel ? (
          <p className="col-span-full rounded-[8px] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            {controller.scenePlateLabel}
          </p>
        ) : null}

        <div className="col-span-full">
          <Field label={t("episode.workbench.text.visualDescription")}>
            <MentionTextarea
              value={controller.visual}
              onChange={(event) =>
                controller.onVisualChange(event.target.value)
              }
              onBlur={controller.onVisualBlur}
              rows={2}
              mentionLabels={controller.mentionLabels}
              className={MENTION_TEXTAREA_CLASS}
              inputClassName={MENTION_TEXTAREA_INPUT_CLASS}
            />
          </Field>
        </div>

        <div className="col-span-full">
          <Field label={t("episode.workbench.text.identities")}>
            <IdentityBadgeGroup
              options={controller.identityOptions}
              selected={controller.identities}
              onToggle={controller.onIdentityToggle}
              onJump={(id) => controller.onJumpToAsset("identity", id)}
              noJumpIds={[controller.noCharacterMarker]}
              labels={{
                [controller.noCharacterMarker]: t(
                  "episode.workbench.text.noCharacter",
                ),
              }}
              jumpLabel={t("assets.common.jumpToAsset", {
                name: "",
              }).trim()}
              emptyMessage={t(
                "episode.workbench.text.identitiesNotPlanned",
              )}
              ariaLabel={t("episode.workbench.text.identities")}
              removedLabel={t("common.removed")}
            />
            {!controller.hasIdentityDetectionState ? (
              <p className="mt-1 text-xs text-warning">
                {t("episode.workbench.text.identityDetectionRequired")}
              </p>
            ) : null}
          </Field>
        </div>

        <div className="col-span-full">
          <Field label={t("episode.workbench.text.props")}>
            <IdentityBadgeGroup
              options={controller.propOptions}
              selected={controller.props}
              onToggle={controller.onPropToggle}
              onJump={(id) => controller.onJumpToAsset("prop", id)}
              noJumpIds={[controller.noPropMarker]}
              labels={{
                [controller.noPropMarker]: t(
                  "episode.workbench.text.noProp",
                ),
              }}
              jumpLabel={t("assets.common.jumpToAsset", {
                name: "",
              }).trim()}
              emptyMessage={t("episode.workbench.text.propsNotPlanned")}
              ariaLabel={t("episode.workbench.text.props")}
              removedLabel={t("common.removed")}
            />
          </Field>
        </div>

        {controller.audioType === "dialogue" &&
        controller.spineTemplate === "narrated" ? (
          <Field label={t("episode.workbench.text.speaker")}>
            <Select
              value={
                controller.episodeIdentityIds.includes(controller.speaker)
                  ? controller.speaker
                  : NO_SPEAKER_MARKER
              }
              onValueChange={(value) =>
                controller.onSpeakerChange(
                  value === NO_SPEAKER_MARKER
                    ? ""
                    : String(value ?? ""),
                )
              }
            >
              <SelectTrigger
                aria-label={t("episode.workbench.text.speaker")}
                className={cn(COMPACT_CONTROL_CLASS, "w-full")}
              >
                <SelectValue
                  placeholder={t(
                    "episode.workbench.text.speakerRequired",
                  )}
                >
                  {controller.episodeIdentityIds.includes(controller.speaker)
                    ? controller.speaker
                    : t("episode.workbench.text.speakerRequired")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className={SELECT_POPUP_CLASS}
              >
                {controller.episodeIdentityIds.length === 0 ? (
                  <SelectItem
                    value={NO_SPEAKER_MARKER}
                    className={SELECT_ITEM_CLASS}
                  >
                    {t("episode.workbench.text.speakerRequired")}
                  </SelectItem>
                ) : null}
                {controller.episodeIdentityIds.map((id) => (
                  <SelectItem
                    key={id}
                    value={id}
                    className={SELECT_ITEM_CLASS}
                  >
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : controller.audioType === "narration" &&
          controller.spineTemplate === "narrated" ? (
          <Field label={t("episode.workbench.text.narrator")}>
            <div
              className={cn(
                COMPACT_CONTROL_CLASS,
                "flex items-center text-muted-foreground/90",
              )}
            >
              {t("episode.workbench.text.projectNarrator")}
            </div>
          </Field>
        ) : null}
      </MetadataSection>
    </div>
  );
}

function Field({
  action,
  children,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="truncate text-[12px] font-medium leading-none text-muted-foreground/82">
          {label}
        </Label>
        {action}
      </div>
      {children}
    </div>
  );
}

function IdentityBadgeGroup({
  ariaLabel,
  emptyMessage,
  jumpLabel,
  labels,
  noJumpIds,
  onJump,
  onToggle,
  options,
  removedLabel,
  selected,
}: {
  ariaLabel: string;
  emptyMessage: string;
  jumpLabel?: string;
  labels?: Record<string, string>;
  noJumpIds?: readonly string[];
  onJump?(id: string): void;
  onToggle(id: string): void;
  options: readonly string[];
  removedLabel: string;
  selected: readonly string[];
}) {
  if (options.length === 0) {
    return (
      <p
        role="status"
        className="rounded-[8px] border border-dashed border-border bg-muted px-3 py-2.5 text-[13px] text-muted-foreground"
      >
        {emptyMessage}
      </p>
    );
  }

  const seen = new Set<string>();
  const noJump = new Set(noJumpIds ?? []);
  const ordered: { id: string; stale: boolean }[] = [];
  for (const id of options) {
    if (!seen.has(id)) {
      ordered.push({ id, stale: false });
      seen.add(id);
    }
  }
  for (const id of selected) {
    if (!seen.has(id)) {
      ordered.push({ id, stale: true });
      seen.add(id);
    }
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1.5"
    >
      {ordered.map(({ id, stale }) => {
        const isSelected = selected.includes(id);
        const label = labels?.[id] ?? id;
        return (
          <span
            key={id}
            className={cn(
              "flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[12px] transition-colors",
              isSelected
                ? stale
                  ? "border-destructive/45 bg-destructive/[0.07] text-foreground/82"
                  : "border-primary/65 bg-primary/[0.07] text-foreground/86"
                : "border-border bg-muted text-muted-foreground hover:border-foreground/25 hover:bg-accent hover:text-foreground",
            )}
          >
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(id)}
              className="flex items-center gap-1.5 hover:opacity-80"
            >
              {label}
              {stale && isSelected ? (
                <span className="text-xs text-destructive">
                  {removedLabel}
                </span>
              ) : null}
            </button>
            {onJump && !noJump.has(id) ? (
              <button
                type="button"
                aria-label={jumpLabel}
                title={jumpLabel}
                onClick={() => onJump(id)}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                <ArrowUpRight className="size-3" />
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function MetadataSection({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-4">
      {children}
    </div>
  );
}
