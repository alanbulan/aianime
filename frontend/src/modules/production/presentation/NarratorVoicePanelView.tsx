// Copyright (c) 2026 AI anime
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen,
  Loader2,
  Mic,
  Scissors,
  Square,
  Trash2,
  Upload,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import type { NarratorVoicePanelController } from "@/modules/production/application/use-narrator-voice-panel-controller";
import type { NarratorVoiceSourceOption } from "@/modules/production/domain/narrator-voice";

const SUPPORTED_AUDIO_ACCEPT = ".mp3,.wav,.m4a,.aac,.ogg,audio/*";
const SECONDARY_ACTION_CLASS =
  "h-7 gap-1 rounded-[7px] border-border bg-muted px-2.5 text-[12px] font-normal text-foreground/76 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground disabled:border-border disabled:bg-muted disabled:text-muted-foreground/45";

export interface NarratorVoicePanelViewProps {
  controller: NarratorVoicePanelController;
}

export function NarratorVoicePanelView({
  controller,
}: NarratorVoicePanelViewProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    audioSrc,
    canEdit,
    copyPending,
    explanation,
    hasVoice,
    heading,
    pending,
    projectAudioOpen,
    recordedDataUrl,
    recording,
    recordOpen,
    recordPending,
    recordStatus,
    selectedSourcePath,
    sourceOptions,
    sourcesLoading,
    trimDuration,
    trimOpen,
    trimPending,
    trimStart,
    onApplyTrim,
    onDelete,
    onOpenProjectAudio,
    onOpenRecord,
    onOpenTrim,
    onProjectAudioOpenChange,
    onRecordOpenChange,
    onSaveRecording,
    onSelectedSourcePathChange,
    onStartRecording,
    onStopRecording,
    onTrimDurationChange,
    onTrimOpenChange,
    onTrimStartChange,
    onUpload,
    onUseProjectAudio,
  } = controller;

  return (
    <section className="w-full max-w-[640px] rounded-[10px] border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          {heading || t("episode.workbench.video.narratorVoice")}
        </h3>
        <div className="flex items-center gap-3">
          {pending && (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          )}
          <span
            className={cn(
              "inline-flex h-4 items-center rounded-full border px-1.5 text-[10px] leading-none",
              hasVoice
                ? "border-primary/35 bg-primary/[0.07] text-primary"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "mr-1 size-1 rounded-full",
                hasVoice ? "bg-primary" : "bg-muted-foreground/35",
              )}
            />
            {hasVoice
              ? t("episode.workbench.video.seedance2Ready")
              : t("episode.workbench.video.narratorVoiceMissing")}
          </span>
        </div>
      </div>

      {explanation && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground/78">
          {explanation}
        </p>
      )}

      {audioSrc && (
        <audio
          src={audioSrc}
          controls
          className="mt-8 h-7 w-full max-w-[608px]"
        />
      )}

      {canEdit && (
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-3">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
            className={SECONDARY_ACTION_CLASS}
          >
            <Upload className="size-3" />
            {t("episode.workbench.video.narratorVoiceUpload")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={onOpenRecord}
            className={SECONDARY_ACTION_CLASS}
          >
            <Mic className="size-3" />
            {t("episode.workbench.video.narratorVoiceRecord")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={onOpenProjectAudio}
            className={SECONDARY_ACTION_CLASS}
          >
            <FolderOpen className="size-3" />
            {t("episode.workbench.video.narratorVoiceProjectAudio")}
          </Button>
          {hasVoice && (
            <>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={onOpenTrim}
                className={SECONDARY_ACTION_CLASS}
              >
                <Scissors className="size-3" />
                {t("episode.workbench.video.narratorVoiceTrim")}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={pending}
                onClick={() => void onDelete()}
                className={cn(
                  SECONDARY_ACTION_CLASS,
                  "border-destructive/20 bg-destructive/[0.06] text-destructive hover:border-destructive/30 hover:bg-destructive/[0.10] hover:text-destructive disabled:border-destructive/10 disabled:bg-destructive/[0.03] disabled:text-destructive/40 dark:border-destructive/20 dark:bg-destructive/[0.06] dark:hover:border-destructive/30 dark:hover:bg-destructive/[0.10] dark:hover:text-destructive",
                )}
              >
                <Trash2 className="size-3" />
                {t("episode.workbench.video.narratorVoiceDelete")}
              </Button>
            </>
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
          if (file) void onUpload(file);
          event.target.value = "";
        }}
      />

      <Dialog open={recordOpen} onOpenChange={onRecordOpenChange}>
        <DialogContent className="gap-4 rounded-2xl border border-border bg-popover/95 p-5 shadow-2xl backdrop-blur-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium tracking-tight text-foreground">
              {t("episode.workbench.video.narratorVoiceRecordTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-5 text-muted-foreground/80">
              {t("episode.workbench.video.narratorVoiceRecordHint")}
            </p>
            <div className="rounded-[10px] border border-border bg-muted p-3 text-sm text-muted-foreground">
              {recordStatus}
            </div>
            {recordedDataUrl && (
              <audio
                src={recordedDataUrl}
                controls
                className="h-9 w-full"
              />
            )}
          </div>
          <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              variant="outline"
              onClick={() => onRecordOpenChange(false)}
              className="h-9 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            {recording ? (
              <Button
                type="button"
                variant="outline"
                onClick={onStopRecording}
                className="h-9 gap-1 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
              >
                <Square className="size-4" />
                {t("common.stop")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => void onStartRecording()}
                className="h-9 gap-1 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
              >
                <Mic className="size-4" />
                {t("episode.workbench.video.narratorVoiceRecordStart")}
              </Button>
            )}
            <Button
              type="button"
              onClick={() => void onSaveRecording()}
              disabled={!recordedDataUrl || recordPending}
              className="h-9 rounded-md bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
            >
              {recordPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("episode.workbench.video.narratorVoiceSaveRecording")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={projectAudioOpen}
        onOpenChange={onProjectAudioOpenChange}
      >
        <DialogContent className="gap-4 rounded-2xl border border-border bg-popover/95 p-5 shadow-2xl backdrop-blur-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium tracking-tight text-foreground">
              {t("episode.workbench.video.narratorVoiceProjectAudioTitle")}
            </DialogTitle>
          </DialogHeader>
          {sourcesLoading ? (
            <p className="text-sm text-muted-foreground/80">
              {t("episode.workbench.video.narratorVoiceSourcesLoading")}
            </p>
          ) : sourceOptions.length > 0 ? (
            <ProjectAudioSourceSelect
              options={sourceOptions}
              value={selectedSourcePath}
              onChange={onSelectedSourcePathChange}
            />
          ) : (
            <div className="rounded-[10px] border border-border bg-muted p-3 text-sm text-muted-foreground">
              {t("episode.workbench.video.narratorVoiceNoSources")}
            </div>
          )}
          <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              variant="outline"
              onClick={() => onProjectAudioOpenChange(false)}
              className="h-9 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={!selectedSourcePath || copyPending}
              onClick={() => void onUseProjectAudio()}
              className="h-9 rounded-md bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
            >
              {copyPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("episode.workbench.video.narratorVoiceUse")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trimOpen} onOpenChange={onTrimOpenChange}>
        <DialogContent className="gap-4 rounded-2xl border border-border bg-popover/95 p-5 shadow-2xl backdrop-blur-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-medium tracking-tight text-foreground">
              {t("episode.workbench.video.narratorVoiceTrimTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm leading-5 text-muted-foreground/80">
              {t("episode.workbench.video.narratorVoiceTrimHint")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="narrator-voice-trim-start"
                  className="text-xs text-muted-foreground"
                >
                  {t("episode.workbench.video.narratorVoiceTrimStart")}
                </Label>
                <Input
                  id="narrator-voice-trim-start"
                  type="number"
                  min="0"
                  step="0.1"
                  value={trimStart}
                  onChange={(event) =>
                    onTrimStartChange(event.target.value)
                  }
                  className="h-10 rounded-[8px] border-border bg-muted text-sm shadow-none focus:border-primary/45"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="narrator-voice-trim-duration"
                  className="text-xs text-muted-foreground"
                >
                  {t("episode.workbench.video.narratorVoiceTrimDuration")}
                </Label>
                <Input
                  id="narrator-voice-trim-duration"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={trimDuration}
                  onChange={(event) =>
                    onTrimDurationChange(event.target.value)
                  }
                  className="h-10 rounded-[8px] border-border bg-muted text-sm shadow-none focus:border-primary/45"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-2">
            <Button
              variant="outline"
              onClick={() => onTrimOpenChange(false)}
              className="h-9 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 shadow-none hover:border-foreground/25 hover:bg-accent hover:text-foreground"
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              disabled={trimPending}
              onClick={() => void onApplyTrim()}
              className="h-9 rounded-md bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
            >
              {trimPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {t("episode.workbench.video.narratorVoiceTrimApply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ProjectAudioSourceSelect({
  options,
  value,
  onChange,
}: {
  options: NarratorVoiceSourceOption[];
  value: string;
  onChange(value: string): void;
}) {
  return (
    <Select
      value={value || options[0]?.path || ""}
      onValueChange={(next) => {
        if (next) onChange(next);
      }}
    >
      <SelectTrigger className="h-8 w-full min-w-0 rounded-md text-xs">
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent className="max-h-[200px]">
        {options.map((option) => (
          <SelectItem key={option.path} value={option.path}>
            <span className="min-w-0 truncate">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
