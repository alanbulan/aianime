// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/hooks/use-task-controller";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/lib/task-types";
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import {
  resolveAudioRegenerationError,
  type VoiceConfigurationTarget,
} from "@/modules/production/domain/audio-prerequisite";
import type { BeatStageState } from "@/modules/production/domain/beat-state";

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
}

export interface AudioPaneControllerDependencies {
  useGenerationCreditCost(kind: string): CreditCostQuery;
}

export interface AudioPaneQueries {
  useRegenerateBeatAudio(
    project: string,
    episode: number,
  ): {
    isPending: boolean;
    mutateAsync(
      beatNumber: number,
    ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
  };
}

export interface AudioPaneControllerOptions {
  beat: Beat;
  project: string;
  episode: number;
  state: BeatStageState;
  onConfigureVoice(target: VoiceConfigurationTarget): void;
}

export interface AudioPaneController {
  audioSource: string | null;
  beatNumber: number;
  costDisplay?: string | null;
  narrationEmpty: boolean;
  regenerationOpen: boolean;
  regenerationPending: boolean;
  setRegenerationOpen(open: boolean): void;
  stage: BeatStageState;
  confirmRegeneration(): Promise<void>;
}

export function createUseAudioPaneController(
  queries: AudioPaneQueries,
  dependencies: AudioPaneControllerDependencies,
) {
  return function useAudioPaneController(
    options: AudioPaneControllerOptions,
  ): AudioPaneController {
    const { beat, episode, onConfigureVoice, project, state } = options;
    const { t } = useTranslation();
    const regenerate = queries.useRegenerateBeatAudio(project, episode);
    const audioCost = dependencies.useGenerationCreditCost("beat_tts");
    const audioTask = useTaskController({
      key: {
        taskType: TASK_TYPES.AUDIO_GENERATION_INDEXTTS2,
        project,
        episode,
      },
      alsoReconcile: [TASK_TYPES.AUDIO_GENERATION],
      invalidateKeys: [
        queryKeys.beats(project, episode),
        queryKeys.pipelineStatus(project),
      ],
    });
    const [regenerationOpen, setRegenerationOpen] = useState(false);

    const showAudioError = (error: string) => {
      const resolved = resolveAudioRegenerationError(error);
      if (!resolved.target) {
        toast.error(resolved.message);
        return;
      }
      const target = resolved.target;
      toast.error(resolved.message, {
        action: {
          label: t("episode.workbench.audio.configureVoiceAction"),
          onClick: () => onConfigureVoice(target),
        },
      });
    };

    const confirmRegeneration = async () => {
      setRegenerationOpen(false);
      try {
        const response = await regenerate.mutateAsync(beat.beat_number);
        if (!response.ok) {
          showAudioError(
            response.error || t("episode.workbench.audio.regenFailed"),
          );
          return;
        }
        audioTask.start({ scope: response.scope });
        toast.success(
          t("episode.workbench.audio.regenerated", {
            n: beat.beat_number,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.audio.regenFailed"));
      }
    };

    return {
      audioSource: beat.audio_url ? resolveMediaUrl(beat.audio_url) : null,
      beatNumber: beat.beat_number,
      costDisplay: audioCost.data?.data.display,
      narrationEmpty: (beat.narration_segment ?? "").trim() === "",
      regenerationOpen,
      regenerationPending: regenerate.isPending || audioTask.started,
      setRegenerationOpen,
      stage: state,
      confirmRegeneration,
    };
  };
}
