// Copyright (c) 2026 AI anime
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Library,
  Loader2,
  Mic,
  Scissors,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
} from "lucide-react";

import type { CharacterVoiceController } from "@/modules/asset_world/application/use-character-voice-controller";
import { resolveMediaUrl } from "@/lib/media-url";
import { PreciseAudioPlayer } from "@/components/media/PreciseAudioPlayer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VoiceSourceTypeTabs } from "@/components/assets/voice-source-type-tabs";
import { isVoiceSourceType } from "@/shared/voice-source/voice-source";
const SUPPORTED_AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,audio/*";

function VoiceActionButton({
  label,
  icon,
  onClick,
  disabled,
  destructive = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-ui-tooltip={label}
      className={cn(
        "text-muted-foreground hover:text-foreground",
        destructive && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {icon}
    </Button>
  );
}

export function CharacterVoicePanelView({
  controller,
}: {
  controller: CharacterVoiceController;
}) {
  const { t } = useTranslation();
  const {
    applyTrim,
    bindLibraryVoice,
    clearIdentityVoice,
    clearSlot,
    closeRecordDialog,
    designAndBindVoice,
    designLanguage,
    designName,
    designPreviewText,
    designPrompt,
    designVoiceConfig,
    designVoiceModelLabel,
    designVoiceModelSelector,
    designVoiceOptions,
    designing,
    createPresetAndBindVoice,
    creatingPresetVoice,
    fileInputRef,
    isLoading,
    identityRows,
    libraryFailed,
    libraryLoading,
    libraryOptions,
    loadFailed,
    openIdentityVoiceLibrary,
    openRecord,
    openSlotVoiceLibrary,
    openTrim,
    pending,
    presetSampleText,
    presetVoice,
    presetVoiceAcceptsVoice,
    presetVoiceAllowsCustom,
    presetVoiceModelLabel,
    presetVoiceModelSelector,
    presetVoiceModels,
    presetVoiceOptions,
    presetVoiceRequiresVoice,
    recordPending,
    recordSlot,
    recordedDataUrl,
    recordedDuration,
    recording,
    recordStatus,
    requestUpload,
    rows,
    saveRecording,
    setDesignLanguage,
    setDesignName,
    setDesignPreviewText,
    setDesignPrompt,
    setDesignVoiceModelSelector,
    setPresetSampleText,
    setPresetVoice,
    setPresetVoiceModelSelector,
    setTrimDuration,
    setTrimSlot,
    setTrimStart,
    startRecording,
    stopRecording,
    trimDuration,
    trimPending,
    trimSlot,
    trimStart,
    upload,
    voiceBindingTarget,
    voiceSourceType,
    setVoiceSourceType,
    onVoiceLibraryOpenChange,
  } = controller;
  const [slotDurations, setSlotDurations] = useState<Record<string, number>>({});
  const voiceLibraryContent = libraryLoading ? (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {t("characters.voiceSamples.libraryLoading")}
    </div>
  ) : libraryFailed ? (
    <p className="rounded-[8px] border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      {t("characters.voiceSamples.libraryFailed")}
    </p>
  ) : libraryOptions.length === 0 ? (
    <p className="rounded-[8px] border border-border bg-muted p-3 text-sm text-muted-foreground">
      {t("characters.voiceSamples.libraryEmpty")}
    </p>
  ) : (
    <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
      {libraryOptions.map((option) => {
        const previewSrc = resolveMediaUrl(option.previewUrl);
        return (
          <div
            key={option.voiceId}
            className="flex flex-wrap items-center gap-3 rounded-[9px] border border-border bg-muted p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {option.label}
              </p>
              {previewSrc && (
                <PreciseAudioPlayer
                  src={previewSrc}
                  className="mt-2 h-7 w-full max-w-[340px]"
                />
              )}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => void bindLibraryVoice(option.voiceId)}
              className="h-8 rounded-md px-3 text-xs"
            >
              {t("characters.voiceSamples.bind")}
            </Button>
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="rounded-[10px] border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            {t("characters.voiceSamples.title")}
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            {t("characters.voiceSamples.hint")}
          </p>
        </div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("characters.voiceSamples.loading")}
        </p>
      ) : loadFailed ? (
        <p className="mt-4 rounded-[8px] border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {t("characters.voiceSamples.loadFailed")}
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border">
          {rows.map(({ displaySlot, actionSlot, label }) => {
            const hasVoice = Boolean(actionSlot.path);
            const audioSrc = resolveMediaUrl(actionSlot.url);
            const slotId = String(actionSlot.slot);
            const duration = slotDurations[slotId];
            return (
              <div
                key={`${displaySlot}:${slotId}`}
                className="flex flex-wrap items-center gap-3 py-3 first:pt-2 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2 @[860px]:w-52 @[860px]:shrink-0">
                  <span
                    className={cn(
                      "inline-flex size-2 rounded-full",
                      hasVoice
                        ? "bg-success"
                        : actionSlot.required
                          ? "bg-warning"
                          : "bg-muted-foreground/40",
                    )}
                  />
                  <span className="truncate text-xs font-medium text-foreground">
                    {label}
                  </span>
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {hasVoice ? (
                    <>
                      {audioSrc && (
                        <PreciseAudioPlayer
                          src={audioSrc}
                          className="h-7 min-w-[240px] max-w-[300px] shrink-0"
                          onLoadedDuration={(nextDuration) => {
                            setSlotDurations((prev) => ({
                              ...prev,
                              [slotId]: nextDuration,
                            }));
                          }}
                        />
                      )}
                      <span className="truncate text-[11px] text-muted-foreground/70" data-ui-tooltip={actionSlot.path}>
                        {actionSlot.path.split("/").pop()}
                      </span>
                      {Number.isFinite(duration) && (
                        <span className="shrink-0 text-[11px] text-muted-foreground/70">
                          {t("characters.voiceSamples.currentDuration", {
                            seconds: duration.toFixed(duration < 1 ? 3 : 2),
                          })}
                        </span>
                      )}
                    </>
                  ) : actionSlot.required ? (
                    <p className="flex items-center gap-1.5 text-[11px] text-warning">
                      <AlertTriangle className="size-3.5" />
                      {t("characters.voiceSamples.missingDefault")}
                    </p>
                  ) : actionSlot.inherited_from_default ? (
                    <p className="text-[11px] italic text-muted-foreground">
                      {t("characters.voiceSamples.inheritedDefault")}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {t("characters.voiceSamples.missing")}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={pending}
                    onClick={() => openSlotVoiceLibrary(actionSlot, label)}
                    className="h-7 rounded-md px-2 text-[11px] shadow-none"
                  >
                    <Library className="size-3.5" />
                    {t("characters.voiceSamples.selectExisting")}
                  </Button>
                  <VoiceActionButton
                    label={t("characters.voiceSamples.upload")}
                    icon={<Upload className="size-3.5" />}
                    disabled={pending}
                    onClick={() => requestUpload(slotId)}
                  />
                  <VoiceActionButton
                    label={t("characters.voiceSamples.record")}
                    icon={<Mic className="size-3.5" />}
                    disabled={pending}
                    onClick={() => openRecord(actionSlot)}
                  />
                  {hasVoice && (
                    <>
                      <VoiceActionButton
                        label={t("characters.voiceSamples.trim")}
                        icon={<Scissors className="size-3.5" />}
                        disabled={pending}
                        onClick={() => openTrim(actionSlot)}
                      />
                      <VoiceActionButton
                        label={t("characters.voiceSamples.clear")}
                        icon={<Trash2 className="size-3.5" />}
                        disabled={pending}
                        destructive
                        onClick={() => clearSlot(actionSlot)}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {identityRows.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="mb-2">
                <h4 className="text-xs font-semibold text-foreground">
                  {t("characters.voiceSamples.identityTitle")}
                </h4>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {t("characters.voiceSamples.identityHint")}
                </p>
              </div>
              <div className="divide-y divide-border">
                {identityRows.map((identity) => {
                  const audioSrc = resolveMediaUrl(identity.resolved_url);
                  const identityAge =
                    identity.age_group === "child"
                      ? t("characters.ageGroups.child")
                      : identity.age_group === "youth"
                        ? t("characters.ageGroups.young")
                        : identity.age_group === "middle"
                          ? t("characters.ageGroups.middle")
                          : identity.age_group === "elder"
                            ? t("characters.ageGroups.elder")
                            : identity.age_group;
                  const sourceText =
                    identity.resolved_from === "identity"
                      ? t("characters.voiceSamples.identityDirect")
                      : identity.resolved_from === "age_group"
                        ? t("characters.voiceSamples.identityInheritedAge", {
                            age: identityAge,
                          })
                        : identity.resolved_from === "character_default"
                          ? t("characters.voiceSamples.identityInheritedDefault")
                          : t("characters.voiceSamples.identityMissing");
                  return (
                    <div
                      key={identity.identity_id}
                      className="flex flex-wrap items-center gap-3 py-3"
                    >
                      <div className="min-w-0 @[860px]:w-52 @[860px]:shrink-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {identity.identity_name || identity.identity_id}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {sourceText}
                        </p>
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {audioSrc ? (
                          <PreciseAudioPlayer
                            src={audioSrc}
                            className="h-7 min-w-[240px] max-w-[300px] shrink-0"
                          />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {t("characters.voiceSamples.missing")}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="xs"
                          variant="outline"
                          disabled={pending}
                          onClick={() => openIdentityVoiceLibrary(identity)}
                          className="h-7 rounded-md px-2 text-[11px] shadow-none"
                        >
                          <Library className="size-3.5" />
                          {t("characters.voiceSamples.selectExisting")}
                        </Button>
                        {identity.path && (
                          <VoiceActionButton
                            label={t(
                              "characters.voiceSamples.removeIdentityOverride",
                            )}
                            icon={<Trash2 className="size-3.5" />}
                            disabled={pending}
                            destructive
                            onClick={() => clearIdentityVoice(identity)}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={SUPPORTED_AUDIO_ACCEPT}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = "";
        }}
      />

      <Dialog
        open={Boolean(voiceBindingTarget)}
        onOpenChange={onVoiceLibraryOpenChange}
      >
        <DialogContent className="max-h-[calc(100vh-2rem)] gap-4 overflow-y-auto rounded-2xl border border-border bg-popover/95 p-5 shadow-2xl backdrop-blur-2xl sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium tracking-tight text-foreground">
              {t("characters.voiceSamples.voiceLibraryTitle", {
                target: voiceBindingTarget?.label ?? "",
              })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-5 text-muted-foreground/80">
            {t("characters.voiceSamples.voiceLibraryHint")}
          </p>
          <Tabs
            value={voiceSourceType}
            onValueChange={(value) => {
              if (isVoiceSourceType(value)) setVoiceSourceType(value);
            }}
            className="space-y-4"
          >
            <VoiceSourceTypeTabs />
            <TabsContent value="voice_design" className="mt-0 space-y-3">
              {designVoiceConfig ? (
                <>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("characters.voiceSamples.voiceDesignModel")}
                  </Label>
                  <Select
                    value={designVoiceModelSelector}
                    onValueChange={(value) => {
                      if (value) setDesignVoiceModelSelector(value);
                    }}
                  >
                    <SelectTrigger
                      aria-label={t("characters.voiceSamples.voiceDesignModel")}
                      className="h-10 w-full rounded-[8px] border-border bg-muted text-sm"
                    >
                      <SelectValue>{designVoiceModelLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {designVoiceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="character-voice-design-name"
                    className="text-xs text-muted-foreground"
                  >
                    {t("characters.voiceSamples.voiceDesignName")}
                  </Label>
                  <Input
                    id="character-voice-design-name"
                    value={designName}
                    maxLength={80}
                    onChange={(event) => setDesignName(event.target.value)}
                    className="h-10 rounded-[8px] border-border bg-muted text-sm shadow-none focus:border-primary/45"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="character-voice-design-prompt"
                    className="text-xs text-muted-foreground"
                  >
                    {t("characters.voiceSamples.voiceDesignPrompt")}
                  </Label>
                  <Textarea
                    id="character-voice-design-prompt"
                    value={designPrompt}
                    minLength={designVoiceConfig.promptMinLength}
                    maxLength={designVoiceConfig.promptMaxLength}
                    placeholder={t(
                      "characters.voiceSamples.voiceDesignPromptPlaceholder",
                    )}
                    onChange={(event) => setDesignPrompt(event.target.value)}
                    className="min-h-24 resize-none rounded-[8px] border-border bg-muted text-sm shadow-none focus-visible:border-primary/45"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="character-voice-design-preview"
                    className="text-xs text-muted-foreground"
                  >
                    {t("characters.voiceSamples.voiceDesignPreview")}
                  </Label>
                  <Textarea
                    id="character-voice-design-preview"
                    value={designPreviewText}
                    minLength={designVoiceConfig.previewTextMinLength}
                    maxLength={designVoiceConfig.previewTextMaxLength}
                    onChange={(event) =>
                      setDesignPreviewText(event.target.value)
                    }
                    className="min-h-20 resize-none rounded-[8px] border-border bg-muted text-sm shadow-none focus-visible:border-primary/45"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    {t("characters.voiceSamples.voiceDesignLanguage")}
                  </Label>
                  <Select
                    value={designLanguage}
                    onValueChange={(value) => value && setDesignLanguage(value)}
                  >
                    <SelectTrigger className="h-10 w-full rounded-[8px] border-border bg-muted text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {designVoiceConfig.languages.map((language) => (
                        <SelectItem key={language} value={language}>
                          {t(
                            `episode.workbench.video.narratorVoiceDesignLanguages.${language}`,
                            { defaultValue: language },
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  onClick={() => void designAndBindVoice()}
                  disabled={
                    designing ||
                    !designPrompt.trim() ||
                    !designPreviewText.trim() ||
                    !designLanguage
                  }
                  className="h-9 w-full rounded-md"
                >
                  {designing ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Sparkles className="size-4" />
                  )}
                  {t("characters.voiceSamples.voiceDesignAndBind")}
                </Button>
                </>
              ) : (
                <div className="rounded-[10px] border border-border bg-muted p-3 text-sm text-muted-foreground">
                  {t("characters.voiceSamples.voiceDesignUnavailable")}
                </div>
              )}
            </TabsContent>
            <TabsContent value="preset_voice" className="mt-0 space-y-3">
              {presetVoiceModels.length > 0 ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      {t("characters.voiceSamples.presetModel")}
                    </Label>
                    <Select
                      value={presetVoiceModelSelector}
                      onValueChange={(value) => {
                        if (value) setPresetVoiceModelSelector(value);
                      }}
                    >
                      <SelectTrigger
                        aria-label={t("characters.voiceSamples.presetModel")}
                        className="h-10 w-full rounded-[8px] border-border bg-muted text-sm"
                      >
                        <SelectValue>{presetVoiceModelLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {presetVoiceModels.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {presetVoiceAcceptsVoice && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {t(
                          presetVoiceAllowsCustom
                            ? "characters.voiceSamples.customPresetVoice"
                            : "characters.voiceSamples.presetVoice",
                        )}
                      </Label>
                      {presetVoiceAllowsCustom ? (
                        <Input
                          value={presetVoice}
                          maxLength={120}
                          placeholder={t(
                            "characters.voiceSamples.customPresetVoicePlaceholder",
                          )}
                          onChange={(event) => setPresetVoice(event.target.value)}
                          className="h-10 rounded-[8px] border-border bg-muted text-sm shadow-none focus:border-primary/45"
                        />
                      ) : (
                        <Select
                          value={presetVoice}
                          onValueChange={(value) => {
                            if (value) setPresetVoice(value);
                          }}
                        >
                          <SelectTrigger className="h-10 w-full rounded-[8px] border-border bg-muted text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {presetVoiceOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="character-preset-voice-sample"
                      className="text-xs text-muted-foreground"
                    >
                      {t("characters.voiceSamples.presetSampleText")}
                    </Label>
                    <Textarea
                      id="character-preset-voice-sample"
                      value={presetSampleText}
                      maxLength={500}
                      onChange={(event) => setPresetSampleText(event.target.value)}
                      className="min-h-24 resize-none rounded-[8px] border-border bg-muted text-sm shadow-none focus-visible:border-primary/45"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => void createPresetAndBindVoice()}
                    disabled={
                      creatingPresetVoice ||
                      !presetVoiceModelSelector ||
                      (presetVoiceRequiresVoice && !presetVoice.trim()) ||
                      !presetSampleText.trim()
                    }
                    className="h-9 w-full rounded-md"
                  >
                    {creatingPresetVoice ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Sparkles className="size-4" />
                    )}
                    {t("characters.voiceSamples.presetCreateAndBind")}
                  </Button>
                </>
              ) : (
                <div className="rounded-[10px] border border-border bg-muted p-3 text-sm text-muted-foreground">
                  {t("characters.voiceSamples.presetUnavailable")}
                </div>
              )}
            </TabsContent>
            <TabsContent value="account_voice" className="mt-0">
              {voiceLibraryContent}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(recordSlot)} onOpenChange={closeRecordDialog}>
        <DialogContent className="gap-4 rounded-2xl border border-border bg-popover/95 p-5 shadow-2xl backdrop-blur-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium tracking-tight text-foreground">
              {t("characters.voiceSamples.recordTitle", {
                slot: recordSlot?.label ?? "",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-5 text-muted-foreground/80">
              {t("characters.voiceSamples.recordHint")}
            </p>
            <div className="rounded-[10px] border border-border bg-muted p-3 text-sm text-muted-foreground">
              {recordStatus}
            </div>
            {recordedDataUrl && (
              <PreciseAudioPlayer src={recordedDataUrl} className="w-full" />
            )}
            {recordedDuration !== null && (
              <p className="text-xs text-muted-foreground">
                {t("characters.voiceSamples.recordedDuration", {
                  seconds: recordedDuration.toFixed(
                    recordedDuration < 1 ? 3 : 2,
                  ),
                })}
              </p>
            )}
          </div>
          <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void startRecording()}
              disabled={recording || recordPending}
              className="h-9 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
            >
              <Mic className="size-4" />
              {t("characters.voiceSamples.startRecord")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={stopRecording}
              disabled={!recording}
              className="h-9 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
            >
              <Square className="size-4" />
              {t("characters.voiceSamples.stopRecord")}
            </Button>
            <Button
              type="button"
              onClick={() => void saveRecording()}
              disabled={!recordedDataUrl || recordPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
            >
              {recordPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Volume2 className="size-4" />
              )}
              {t("characters.voiceSamples.saveRecording")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(trimSlot)} onOpenChange={(open) => !open && setTrimSlot(null)}>
        <DialogContent className="gap-4 rounded-2xl border border-border bg-popover/95 p-5 shadow-2xl backdrop-blur-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium tracking-tight text-foreground">
              {t("characters.voiceSamples.trimTitle", {
                slot: trimSlot?.label ?? "",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-5 text-muted-foreground/80">
              {t("characters.voiceSamples.trimHint")}
            </p>
            {trimSlot?.url && resolveMediaUrl(trimSlot.url) && (
              <PreciseAudioPlayer
                src={resolveMediaUrl(trimSlot.url) ?? ""}
                className="w-full"
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("characters.voiceSamples.startSeconds")}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={trimStart}
                  onChange={(event) => setTrimStart(event.target.value)}
                  className="h-10 rounded-[8px] border-border bg-muted text-sm shadow-none focus:border-primary/45"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {t("characters.voiceSamples.durationSeconds")}
                </Label>
                <Input
                  type="number"
                  min="0.1"
                  max="15"
                  step="0.1"
                  value={trimDuration}
                  onChange={(event) => setTrimDuration(event.target.value)}
                  className="h-10 rounded-[8px] border-border bg-muted text-sm shadow-none focus:border-primary/45"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTrimSlot(null)}
              className="h-9 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={() => void applyTrim()}
              disabled={trimPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
            >
              {trimPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Scissors className="size-4" />
              )}
              {t("characters.voiceSamples.applyTrim")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
