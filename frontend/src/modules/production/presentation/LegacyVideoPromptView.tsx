// Copyright (c) 2026 AI anime
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, WandSparkles } from "lucide-react";

import { CreditCostInline } from "@/components/credit-cost-inline";
import {
  MEDIA_PRIMARY_ACTION_BUTTON_CLASS,
  VIDEO_PROMPT_TEXTAREA_CLASS,
} from "@/modules/production/presentation/media-styles";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LegacyVideoPromptController } from "@/modules/production/application/use-legacy-video-prompt-controller";
import { Seedance2Field } from "@/modules/production/presentation/VideoPaneParts";

export function LegacyVideoPromptView({
  className,
  controller,
}: {
  className?: string;
  controller: LegacyVideoPromptController;
}) {
  const { t } = useTranslation();
  const promptId = `${useId()}-legacy-video-prompt`;
  const promptLabel =
    controller.field === "keyframe_prompt"
      ? t("episode.workbench.video.keyframePrompt")
      : t("episode.workbench.video.videoPrompt");

  return (
    <div
      className={cn(
        "col-span-2 rounded-[10px] border border-border bg-card p-3",
        className,
      )}
    >
      <Seedance2Field label={promptLabel} htmlFor={promptId}>
        <Textarea
          id={promptId}
          aria-label={promptLabel}
          value={controller.prompt}
          onChange={(event) => controller.setPrompt(event.target.value)}
          onBlur={() => void controller.savePrompt()}
          rows={3}
          className={cn("min-h-[82px]", VIDEO_PROMPT_TEXTAREA_CLASS)}
        />
      </Seedance2Field>
      <div className="mt-2 flex justify-start">
        <Button
          size="xs"
          variant="outline"
          disabled={controller.generationPending}
          onClick={() => void controller.generatePrompt()}
          className={MEDIA_PRIMARY_ACTION_BUTTON_CLASS}
        >
          {controller.generationPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <WandSparkles className="size-3" />
          )}
          {t("episode.workbench.video.generateBeatVideoPrompt")}
          <CreditCostInline display={controller.costDisplay} />
        </Button>
      </div>
    </div>
  );
}
