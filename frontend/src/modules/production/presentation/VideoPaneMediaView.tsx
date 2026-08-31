// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { VideoPaneMediaController } from "@/modules/production/application/use-video-pane-media-controller";
import {
  BeatVideoPlayer,
  VideoReferenceMediaPreview,
} from "@/modules/production/presentation/VideoPaneParts";
import {
  MEDIA_THUMB_ACTIVE_CLASS,
  MEDIA_THUMB_ACTIVE_MARK_CLASS,
  MEDIA_THUMB_CLASS,
  MEDIA_THUMB_DELETE_CLASS,
  MEDIA_THUMB_IDLE_CLASS,
  MEDIA_THUMB_MODEL_CLASS,
  MEDIA_THUMB_TIME_CLASS,
} from "@/modules/production/presentation/media-styles";

const VIDEO_PREVIEW_CLASS =
  "relative flex h-[220px] w-auto max-w-full justify-self-start items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted";
const VIDEO_CANDIDATES_CLASS =
  "flex max-h-[220px] flex-wrap content-start gap-2 overflow-y-auto pr-1";

export function VideoPaneMediaView({
  controller,
  frameAspectCss,
}: {
  controller: VideoPaneMediaController;
  frameAspectCss: string;
}) {
  const { t } = useTranslation();
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );

  return (
    <>
      <div className={VIDEO_PREVIEW_CLASS} style={{ aspectRatio: "16 / 9" }}>
        {controller.useVideoReferencePreview ? (
          <VideoReferenceMediaPreview
            src={controller.previewSource}
            state={controller.state}
          />
        ) : controller.previewSource ? (
          <BeatVideoPlayer
            src={controller.previewSource}
            beatNum={controller.beatNumber}
          />
        ) : (
          <span className="text-xs text-muted-foreground">
            {controller.state === "generating"
              ? t("episode.workbench.video.generating")
              : controller.state === "failed"
                ? `⚠ ${t("episode.workbench.video.genFailed")}`
                : t("episode.workbench.video.notGenerated")}
          </span>
        )}
        {controller.downloadUrl && (
          <a
            href={controller.downloadUrl}
            download={`beat_${controller.beatNumber}_video.mp4`}
            onClick={(event) => event.stopPropagation()}
            aria-label={t("common.download")}
            data-ui-tooltip={t("common.download")}
            className="absolute right-2 top-2 z-10 inline-flex size-7 items-center justify-center rounded-[7px] border border-media-foreground/20 bg-media/65 text-media-foreground/90 backdrop-blur-sm transition hover:border-media-foreground/30 hover:bg-media/80 hover:text-media-foreground"
          >
            <Download className="size-3.5" />
          </a>
        )}
        {controller.videoActive && (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[10px] bg-media/55 backdrop-blur-[1px]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={controller.videoPercent}
          >
            <Loader2
              aria-hidden
              className="size-5 animate-spin text-media-foreground/90"
            />
            <div className="flex items-baseline leading-none text-media-foreground">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">
                {controller.videoPercent}
              </span>
              <span className="ml-0.5 text-xs font-medium text-media-foreground/70">
                %
              </span>
            </div>
            <div className="h-1 w-24 overflow-hidden rounded-full bg-media-foreground/20">
              <div
                className="h-full rounded-full bg-media-foreground/85 transition-[width] duration-300 ease-out"
                style={{ width: `${controller.videoPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-col gap-2.5">
        {controller.candidates.length > 0 && (
          <div className={VIDEO_CANDIDATES_CLASS}>
            {controller.candidates.map((candidate) => (
              <div key={candidate.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => void controller.selectCandidate(candidate.id)}
                  disabled={
                    controller.selectionPending || controller.deletePending
                  }
                  className={cn(
                    MEDIA_THUMB_CLASS,
                    candidate.active
                      ? MEDIA_THUMB_ACTIVE_CLASS
                      : MEDIA_THUMB_IDLE_CLASS,
                    controller.selectionPending && "cursor-wait",
                  )}
                >
                  <div
                    className="h-[76px] bg-media"
                    style={{ aspectRatio: frameAspectCss }}
                  >
                    {candidate.previewSource && (
                      <video
                        src={candidate.previewSource}
                        muted
                        playsInline
                        preload="metadata"
                        disableRemotePlayback
                        disablePictureInPicture
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <span
                    className={MEDIA_THUMB_MODEL_CLASS}
                    data-ui-tooltip={candidate.modelTooltip}
                  >
                    {candidate.modelLabel}
                  </span>
                  {candidate.timeLabel && (
                    <span
                      className={MEDIA_THUMB_TIME_CLASS}
                      data-ui-tooltip={candidate.timeTooltip ?? undefined}
                    >
                      {candidate.timeLabel}
                    </span>
                  )}
                  {candidate.active && (
                    <span className={MEDIA_THUMB_ACTIVE_MARK_CLASS}>✓</span>
                  )}
                </button>
                {!candidate.active && (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    disabled={controller.deletePending}
                    onClick={() => setDeleteCandidateId(candidate.id)}
                    aria-label={t("episode.workbench.media.deleteCandidate")}
                    data-ui-tooltip={t(
                      "episode.workbench.media.deleteCandidate",
                    )}
                    className={MEDIA_THUMB_DELETE_CLASS}
                  >
                    <Trash2 className="size-2.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={deleteCandidateId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidateId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("episode.workbench.media.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.workbench.media.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={controller.deletePending}
              onClick={() => {
                const poolId = deleteCandidateId;
                setDeleteCandidateId(null);
                if (poolId) void controller.deleteCandidate(poolId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
