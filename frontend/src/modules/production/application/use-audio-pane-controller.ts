// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/modules/task_execution/public";
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import {
  resolveAudioRegenerationError,
  type VoiceConfigurationTarget,
} from "@/modules/production/domain/audio-prerequisite";
import type { BeatStageState } from "@/modules/production/domain/beat-state";
import type { AudioBillingQuote } from "@/modules/production/domain/audio-generation";
import { BillingRuleNotConfiguredError } from "@/shared/api/errors";

interface AudioBillingQuoteQuery {
  data?: ProductionDataResponse<AudioBillingQuote>;
  error?: unknown;
}

export interface AudioPaneQueries {
  useAudioBillingQuote(
    project: string,
    episode: number,
    command: { beatNumbers: number[]; mode: string },
    revision: string,
  ): AudioBillingQuoteQuery;
  useRegenerateBeatAudio(
    project: string,
    episode: number,
  ): {
    isPending: boolean;
    mutateAsync(
      command: { beatNumber: number },
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
  regenerationDisabled: boolean;
  regenerationPending: boolean;
  voiceConfigurationRequired: boolean;
  beginRegeneration(): void;
  setRegenerationOpen(open: boolean): void;
  stage: BeatStageState;
  confirmRegeneration(): Promise<void>;
}

export function createUseAudioPaneController(
  queries: AudioPaneQueries,
) {
  return function useAudioPaneController(
    options: AudioPaneControllerOptions,
  ): AudioPaneController {
    const { beat, episode, onConfigureVoice, project, state } = options;
    const { t } = useTranslation();
    const regenerate = queries.useRegenerateBeatAudio(project, episode);
    const audioQuote = queries.useAudioBillingQuote(
      project,
      episode,
      { beatNumbers: [beat.beat_number], mode: "redo_selected" },
      [
        beat.audio_type,
        beat.speaker,
        beat.audio_url,
        beat.narration_segment,
      ].join(":"),
    );
    const prerequisiteError =
      audioQuote.data?.data.prereq_errors?.[0] ?? "";
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
        const response = await regenerate.mutateAsync({
          beatNumber: beat.beat_number,
        });
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

    const beginRegeneration = () => {
      if (prerequisiteError) {
        showAudioError(prerequisiteError);
        return;
      }
      setRegenerationOpen(true);
    };

    const costDisplay = prerequisiteError
      ? null
      : audioQuote.data?.data.display ??
        (audioQuote.error instanceof BillingRuleNotConfiguredError
          ? t("common.billingRuleNotConfiguredShort")
          : null);

    return {
      audioSource: beat.audio_url ? resolveMediaUrl(beat.audio_url) : null,
      beatNumber: beat.beat_number,
      costDisplay,
      narrationEmpty: (beat.narration_segment ?? "").trim() === "",
      regenerationOpen,
      regenerationDisabled:
        regenerate.isPending || audioTask.started,
      regenerationPending: regenerate.isPending || audioTask.started,
      voiceConfigurationRequired: Boolean(prerequisiteError),
      beginRegeneration,
      setRegenerationOpen,
      stage: state,
      confirmRegeneration,
    };
  };
}
