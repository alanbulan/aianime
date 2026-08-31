// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { Loader2, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PreciseAudioPlayer } from "@/components/media/PreciseAudioPlayer";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveMediaUrl } from "@/lib/media-url";
import type { VideoReferenceAssetItem } from "@/modules/production/domain/video-reference-panel";

export function VideoReferenceAudioTrimDialog({
  asset,
  start,
  duration,
  pending,
  onStartChange,
  onDurationChange,
  onOpenChange,
  onSave,
}: {
  asset: VideoReferenceAssetItem | null;
  start: string;
  duration: string;
  pending: boolean;
  onStartChange(value: string): void;
  onDurationChange(value: string): void;
  onOpenChange(open: boolean): void;
  onSave(): void;
}) {
  const { t } = useTranslation();
  const audioSrc = resolveMediaUrl(asset?.url || asset?.path);

  return (
    <Dialog open={asset !== null} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 overflow-hidden rounded-2xl border border-border bg-popover p-7 text-popover-foreground shadow-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("episode.workbench.video.videoReferenceAssetAudioTrimTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">
            {t("episode.workbench.video.videoReferenceAssetAudioTrimHint")}
          </p>
          {audioSrc && <PreciseAudioPlayer src={audioSrc} className="w-full" />}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("episode.workbench.video.videoReferenceAssetAudioTrimStart")}
              </Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={start}
                onChange={(event) => onStartChange(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {t("episode.workbench.video.videoReferenceAssetAudioTrimDuration")}
              </Label>
              <Input
                type="number"
                min="0.1"
                max="15"
                step="0.1"
                value={duration}
                onChange={(event) => onDurationChange(event.target.value)}
                className="h-9"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="-mx-7 -mb-7 border-t-0 bg-transparent p-7 pt-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-md border-border bg-muted px-4 text-sm font-normal text-foreground/80 hover:border-foreground/25 hover:bg-accent hover:text-foreground"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={onSave}
            className="h-10 rounded-md bg-primary px-4 text-sm font-normal text-primary-foreground shadow-lg shadow-primary/15 hover:bg-primary/90"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Scissors className="size-3.5" />
            )}
            {t("episode.workbench.video.videoReferenceAssetAudioTrimApply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
