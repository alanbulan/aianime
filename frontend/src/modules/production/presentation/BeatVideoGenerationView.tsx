// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { Film, Loader2, RefreshCw, Square } from "lucide-react";

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
import type { BeatVideoGenerationController } from "@/modules/production/application/use-beat-video-generation-controller";

export function BeatVideoGenerationAction({
  className,
  controller,
  hasGeneratedVideo,
}: {
  className: string;
  controller: BeatVideoGenerationController;
  hasGeneratedVideo: boolean;
}) {
  const { t } = useTranslation();

  if (controller.started) {
    return (
      <Button
        size="xs"
        variant="outline"
        onClick={() => void controller.stopGeneration()}
        disabled={controller.stopping}
        className={className}
      >
        {controller.stopping ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Square className="size-3" />
        )}
        {t("common.stop")}
      </Button>
    );
  }

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={controller.requestGeneration}
      disabled={controller.generationPending}
      className={className}
    >
      {controller.generationPending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : hasGeneratedVideo ? (
        <RefreshCw className="size-3" />
      ) : (
        <Film className="size-3" />
      )}
      {hasGeneratedVideo
        ? t("common.regenerate")
        : t("episode.workbench.video.generateVideo")}
    </Button>
  );
}

export function BeatVideoGenerationConfirmDialog({
  controller,
  hasGeneratedVideo,
}: {
  controller: BeatVideoGenerationController;
  hasGeneratedVideo: boolean;
}) {
  const { t } = useTranslation();

  return (
    <AlertDialog
      open={controller.confirmationOpen}
      onOpenChange={controller.setConfirmationOpen}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasGeneratedVideo
              ? t("episode.workbench.video.regenTitle")
              : t("episode.workbench.video.genTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasGeneratedVideo
              ? t("episode.workbench.video.regenDesc", {
                  n: controller.beatNumber,
                })
              : t("episode.workbench.video.genDesc", {
                  n: controller.beatNumber,
                })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void controller.confirmGeneration()}
          >
            {t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
