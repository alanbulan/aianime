// Copyright (c) 2026 AI anime
import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw } from "lucide-react";

import { CreditCostInline } from "@/components/credit-cost-inline";
import { PreciseAudioPlayer } from "@/components/media/PreciseAudioPlayer";
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
import { MEDIA_PRIMARY_ACTION_BUTTON_CLASS } from "@/modules/production/presentation/media-styles";
import type { AudioPaneController } from "@/modules/production/application/use-audio-pane-controller";

export function AudioPaneView({
  controller,
}: {
  controller: AudioPaneController;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col items-start gap-3">
      {controller.narrationEmpty ? (
        <p className="px-1 py-0.5 text-xs leading-5 text-muted-foreground/72">
          {t("episode.workbench.audio.narrationEmpty")}
        </p>
      ) : (
        <div className="flex w-full max-w-[420px] flex-col items-start gap-3">
          {controller.audioSource ? (
            <PreciseAudioPlayer
              src={controller.audioSource}
              className="h-7 w-full opacity-85"
            />
          ) : (
            <div className="flex h-7 w-full items-center rounded-[7px] border border-dashed border-border bg-muted px-2.5 text-xs text-muted-foreground">
              {controller.stage === "generating"
                ? t("episode.workbench.audio.generating")
                : controller.stage === "failed"
                  ? `⚠ ${t("episode.workbench.audio.genFailed")}`
                  : t("episode.workbench.audio.notGenerated")}
            </div>
          )}
          <Button
            size="xs"
            variant="outline"
            onClick={controller.beginRegeneration}
            disabled={controller.regenerationDisabled}
            className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
          >
            {controller.regenerationPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {controller.voiceConfigurationRequired
              ? t("episode.workbench.audio.configureVoiceAction")
              : t("common.regenerate")}
            {!controller.voiceConfigurationRequired && (
              <CreditCostInline display={controller.costDisplay} />
            )}
          </Button>
        </div>
      )}

      <AlertDialog
        open={controller.regenerationOpen}
        onOpenChange={controller.setRegenerationOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("episode.workbench.audio.regenTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("episode.workbench.audio.regenDesc", {
                n: controller.beatNumber,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void controller.confirmRegeneration()}
            >
              {t("common.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
