// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { Loader2, Play, Sparkles, Square } from "lucide-react";

import {
  EpisodeAssetPlanning,
  type AssetPlanningCategory,
} from "@/components/episode/episode-asset-planning";
import { EpisodeHealthSummary } from "@/components/episode/health-bar";
import { EpisodeSourceEditor } from "@/components/episode/episode-source-editor";
import { ScriptBeatPreview } from "@/components/episode/script-beat-preview";
import { IdentityPickerDialog } from "@/components/identity-picker-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ScriptGenerationMode,
  ScriptPageController,
} from "@/modules/narrative_planning/application/use-script-page-controller";

export function ScriptPageView({
  controller,
}: {
  controller: ScriptPageController;
}) {
  const { t } = useTranslation();
  const {
    assetCategory,
    beats,
    beatsLoading,
    characters,
    generateButtonBusy,
    generateButtonDisabled,
    generateButtonTitle,
    generating,
    estimatedBeatCount,
    handleGenerateButtonClick,
    handleGenerateRewrite,
    handleIdentityChange,
    handlePlanIdentities,
    handlePlanProps,
    handlePlanScenes,
    handleSourceSave,
    identityDefaultMap,
    identityIds,
    identityPlanning,
    isNarratedProject,
    onAssetCategoryChange,
    onRewriteBeatCharsMaxBlur,
    onRewriteBeatCharsMaxChange,
    onRewriteBeatCharsMinBlur,
    onRewriteBeatCharsMinChange,
    onRewriteTargetBeatsBlur,
    onRewriteTargetBeatsChange,
    onScriptModeChange,
    onTargetDurationBlur,
    onTargetDurationChange,
    pickerOpen,
    project,
    propMenu,
    propPlanning,
    rawContent,
    rewriteBeatCharsMax,
    rewriteBeatCharsMin,
    rewriteLimits,
    rewritePending,
    rewriteTargetBeats,
    sceneMenu,
    scenePlanning,
    scriptProgressLabel,
    scriptProgressPercent,
    scriptMode,
    scriptTaskStarted,
    scriptTaskStopping,
    setPickerOpen,
    sourceSaving,
    sourceTextForEditor,
    targetDurationLimits,
    targetDurationTotal,
    rhythmSeconds,
    episodeNumber,
  } = controller;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-5 py-3 text-xs">
        <EpisodeHealthSummary
          project={project}
          episode={episodeNumber}
          className="pr-1"
        />
        <div className="inline-flex items-center gap-2 text-muted-foreground">
          <span className="text-[11px]">{t("episode.script.modeLabel")}</span>
          <Select
            value={scriptMode}
            disabled={generating || rewritePending}
            onValueChange={(value) =>
              onScriptModeChange(value as ScriptGenerationMode)
            }
          >
            <SelectTrigger
              className="h-7 w-28 rounded-[7px] px-2 text-xs"
              aria-label={t("episode.script.modeLabel")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="duration">
                {t("episode.script.rhythmDuration")}
              </SelectItem>
              <SelectItem value="literal">
                {t("episode.script.rhythmLiteral")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scriptMode === "duration" ? (
          <div className="inline-flex h-7 items-center gap-2 text-[11px] text-muted-foreground">
            <label className="inline-flex items-center gap-1.5">
              <span className="shrink-0">
                {t("episode.script.targetDuration")}
              </span>
              <Input
                type="number"
                min={targetDurationLimits.min}
                max={targetDurationLimits.max}
                step={15}
                value={targetDurationTotal}
                disabled={generating || rewritePending}
                onChange={(event) =>
                  onTargetDurationChange(event.target.value)
                }
                onBlur={onTargetDurationBlur}
                className="h-7 w-16 rounded-[7px] px-2 text-xs tabular-nums"
              />
              <span>{t("episode.script.secondsUnit")}</span>
            </label>
            <span className="whitespace-nowrap text-foreground/60">
              {t("episode.script.estimatedBeatCount", {
                count: estimatedBeatCount,
                seconds: rhythmSeconds,
              })}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-foreground/60">
            {t("episode.script.rhythmLiteralHint")}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {isNarratedProject && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-7 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="shrink-0 whitespace-nowrap">
                    {t("episode.script.rewriteTargetBeats")}
                  </span>
                  <Input
                    type="number"
                    min={rewriteLimits.targetBeats.min}
                    max={rewriteLimits.targetBeats.max}
                    step={1}
                    value={rewriteTargetBeats}
                    disabled={generating || rewritePending}
                    onChange={(event) =>
                      onRewriteTargetBeatsChange(event.target.value)
                    }
                    onBlur={onRewriteTargetBeatsBlur}
                    className="h-7 w-14 rounded-[7px] px-2 text-xs tabular-nums"
                  />
                </label>
                <label className="flex h-7 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="shrink-0 whitespace-nowrap">
                    {t("episode.script.rewriteBeatCharsMin")}
                  </span>
                  <Input
                    type="number"
                    min={rewriteLimits.beatCharsMin.min}
                    max={rewriteLimits.beatCharsMin.max}
                    step={1}
                    value={rewriteBeatCharsMin}
                    disabled={generating || rewritePending}
                    onChange={(event) =>
                      onRewriteBeatCharsMinChange(event.target.value)
                    }
                    onBlur={onRewriteBeatCharsMinBlur}
                    className="h-7 w-14 rounded-[7px] px-2 text-xs tabular-nums"
                  />
                </label>
                <label className="flex h-7 items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="shrink-0 whitespace-nowrap">
                    {t("episode.script.rewriteBeatCharsMax")}
                  </span>
                  <Input
                    type="number"
                    min={rewriteLimits.beatCharsMax.min}
                    max={rewriteLimits.beatCharsMax.max}
                    step={1}
                    value={rewriteBeatCharsMax}
                    disabled={generating || rewritePending}
                    onChange={(event) =>
                      onRewriteBeatCharsMaxChange(event.target.value)
                    }
                    onBlur={onRewriteBeatCharsMaxBlur}
                    className="h-7 w-14 rounded-[7px] px-2 text-xs tabular-nums"
                  />
                </label>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateRewrite}
                disabled={generating || rewritePending}
                className="h-7 gap-1.5 rounded-[7px] border-primary/35 bg-primary/[0.08] px-2.5 text-xs font-normal text-primary shadow-none hover:border-primary/55 hover:bg-primary/[0.14] hover:text-primary [&_svg]:size-3.5"
              >
                {rewritePending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {t("episode.script.generateRewrite")}
              </Button>
            </>
          )}
          {scriptTaskStarted && (
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="flex min-w-[260px] max-w-[380px] items-center gap-2 rounded-[7px] border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${scriptProgressPercent}%` }}
                />
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-primary">
                {scriptProgressPercent}%
              </span>
              <span className="min-w-0 truncate text-foreground/80">
                {scriptProgressLabel}
              </span>
            </div>
          )}
          <Button
            size="sm"
            onClick={handleGenerateButtonClick}
            disabled={generateButtonDisabled}
            data-ui-tooltip={generateButtonTitle}
            className="h-7 gap-1.5 rounded-[7px] bg-primary px-2.5 text-xs font-normal text-primary-foreground shadow-none hover:bg-primary/85 active:bg-primary/75 [&_svg]:size-3.5"
          >
            {scriptTaskStarted ? (
              scriptTaskStopping ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5" />
              )
            ) : generateButtonBusy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {scriptTaskStarted
              ? t("common.stop")
              : t("episode.script.generateScript")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid min-h-0 gap-5 px-5 pb-5 pt-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <section>
              <div className="mb-2 flex h-7 items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {t("episode.script.assetPlanningTitle")}
                </h2>
                <Select
                  value={assetCategory}
                  onValueChange={(value) =>
                    onAssetCategoryChange(value as AssetPlanningCategory)
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="inline-flex !h-6 w-[112px] shrink-0 items-center gap-1 !rounded-[6px] !border !border-border !bg-muted px-2 text-[11px] font-normal text-foreground/78 shadow-none hover:!border-foreground/25 hover:!bg-accent hover:text-foreground focus-visible:!border-primary/45 focus-visible:!ring-0 [&_svg]:!size-3"
                  >
                    <SelectValue>
                      {(value) =>
                        value === "scenes"
                          ? t("episode.script.scenes")
                          : value === "props"
                            ? t("episode.script.props")
                            : t("episode.script.identities")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectItem value="identities">
                      {t("episode.script.identities")}
                    </SelectItem>
                    <SelectItem value="scenes">
                      {t("episode.script.scenes")}
                    </SelectItem>
                    <SelectItem value="props">
                      {t("episode.script.props")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <EpisodeAssetPlanning
                project={project}
                selectedCategory={assetCategory}
                characters={characters}
                selectedIdentityIds={identityIds}
                identityDefaultMap={identityDefaultMap}
                sceneMenu={sceneMenu}
                propMenu={propMenu}
                identityPending={identityPlanning}
                scenePending={scenePlanning}
                propPending={propPlanning}
                onPlanIdentities={() => setPickerOpen(true)}
                onIdentityChange={handleIdentityChange}
                onPlanScenes={handlePlanScenes}
                onPlanProps={handlePlanProps}
                labels={{
                  identities: t("episode.script.identities"),
                  scenes: t("episode.script.scenes"),
                  props: t("episode.script.props"),
                  noIdentities: t("episode.script.noIdentities"),
                  noScenes: t("episode.script.noScenes"),
                  noProps: t("episode.script.noProps"),
                  planIdentities: t("episode.script.planIdentities"),
                  replanIdentities: t("episode.script.replanIdentities"),
                  defaultIdentity: t("identityPicker.defaultIdentity"),
                  planScenes: t("episode.script.planScenes"),
                  replanScenes: t("episode.script.replanScenes"),
                  planProps: t("episode.script.planProps"),
                  replanProps: t("episode.script.replanProps"),
                  propInGlobal: t("episode.script.propInGlobal"),
                  propCheckingGlobal: t(
                    "episode.script.propCheckingGlobal",
                  ),
                  promoteProp: t("episode.script.promoteProp"),
                  promotePropTitle: (name) =>
                    t("episode.script.promotePropTitle", { name }),
                  promotePropName: t("episode.script.promotePropName"),
                  promotePropType: t("episode.script.promotePropType"),
                  promoteVisualPrompt: t(
                    "episode.script.promoteVisualPrompt",
                  ),
                  promoteOwner: t("episode.script.promoteOwner"),
                  promoteSubmit: t("episode.script.promoteSubmit"),
                  promoteCancel: t("common.cancel"),
                  propTypeLabel: (value) =>
                    t(`assets.props.types.${value}`, {
                      defaultValue: value,
                    }),
                  promoteSuccess: t("episode.script.promoteSuccess"),
                }}
              />
            </section>

            <EpisodeSourceEditor
              rawContent={rawContent}
              sourceText={sourceTextForEditor}
              saving={sourceSaving}
              onSave={handleSourceSave}
              labels={{
                rawLabel: t("episode.script.rawLabel"),
                rawActionLabel: t("episode.script.rawActionLabel"),
                noRawText: t("episode.script.noRawText"),
                sourceLabel: t(
                  isNarratedProject
                    ? "episode.script.sourceTextLabelNarrated"
                    : "episode.script.sourceTextLabelDrama",
                ),
                sourceMeta: (count) =>
                  t("episode.script.sourceTextMeta", { count }),
                sourcePlaceholder: t(
                  isNarratedProject
                    ? "episode.script.sourceTextPlaceholderNarrated"
                    : "episode.script.sourceTextPlaceholderDrama",
                ),
                linePreviewLabel: t("episode.script.linePreviewLabel"),
                lineCount: (count) =>
                  t("episode.script.lineCount", { count }),
                noLines: t("episode.script.noSourceLines"),
              }}
              className="min-w-0"
            />
          </div>

          <div className="min-w-0">
            <ScriptBeatPreview
              beats={beats}
              loading={beatsLoading}
              className="px-0 pb-0"
              labels={{
                title: t("episode.script.previewTitle"),
                count: (count) =>
                  t("episode.script.previewCount", { count }),
                loading: t("episode.script.previewLoading"),
                emptyTitle: t("episode.script.previewEmptyTitle"),
                empty: t("episode.script.previewEmpty"),
                audioType: (type) =>
                  t(`audioType.${type}`, { defaultValue: type }),
                speaker: t("episode.script.previewSpeaker"),
                noSpeaker: t("episode.script.previewNoSpeaker"),
                dialogueLine: t("episode.script.previewDialogueLine"),
                narrationLine: t("episode.script.previewNarrationLine"),
                noNarration: t("episode.script.previewNoNarration"),
                visualDescription: t(
                  "episode.script.previewVisualDescription",
                ),
                noVisualDescription: t(
                  "episode.script.previewNoVisualDescription",
                ),
              }}
            />
          </div>
        </div>
      </div>

      <IdentityPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        project={project}
        characters={characters}
        selected={identityIds}
        defaultMap={identityDefaultMap}
        onChange={handleIdentityChange}
        onPlan={handlePlanIdentities}
        planPending={identityPlanning}
      />
    </div>
  );
}
