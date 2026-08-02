// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/hooks/use-task-controller";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/modules/task_execution/public";
import type { Beat } from "@/modules/narrative_planning/public";
import type { BeatVideoPromptResponse } from "@/modules/production/application/ports";
import {
  backendErrorToastMessage,
  BillingRuleNotConfiguredError,
} from "@/shared/api/errors";

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
  error?: unknown;
}

interface PromptMutation {
  isPending: boolean;
  mutateAsync(command: { beatNum: number }): Promise<BeatVideoPromptResponse>;
}

export interface LegacyVideoPromptQueries {
  useGenerateBeatVideoPrompt(
    project: string,
    episode: number,
  ): PromptMutation;
}

export interface LegacyVideoPromptControllerDependencies {
  useGenerationCreditCost(
    kind: "feature",
    value: "beat_video_prompt",
  ): CreditCostQuery;
}

export interface LegacyVideoPromptUpdateCommand {
  beatNum: number;
  data: {
    keyframe_prompt?: string;
    video_prompt?: string;
  };
}

export interface LegacyVideoPromptControllerOptions {
  beat: Beat;
  episode: number;
  project: string;
  updateBeat(command: LegacyVideoPromptUpdateCommand): Promise<unknown>;
}

export interface LegacyVideoPromptController {
  costDisplay: string | null;
  field: "keyframe_prompt" | "video_prompt";
  generationPending: boolean;
  prompt: string;
  generatePrompt(): Promise<void>;
  savePrompt(): Promise<void>;
  setPrompt(prompt: string): void;
}

function promptFieldForBeat(
  beat: Beat,
): LegacyVideoPromptController["field"] {
  return beat.video_mode === "keyframe" ? "keyframe_prompt" : "video_prompt";
}

function promptValueForBeat(
  beat: Beat,
  field: LegacyVideoPromptController["field"],
): string {
  return field === "keyframe_prompt"
    ? (beat.keyframe_prompt ?? "")
    : (beat.video_prompt ?? "");
}

export function createUseLegacyVideoPromptController(
  queries: LegacyVideoPromptQueries,
  dependencies: LegacyVideoPromptControllerDependencies,
) {
  return function useLegacyVideoPromptController(
    options: LegacyVideoPromptControllerOptions,
  ): LegacyVideoPromptController {
    const { beat, episode, project, updateBeat } = options;
    const { t } = useTranslation();
    const field = promptFieldForBeat(beat);
    const sourcePrompt = promptValueForBeat(beat, field);
    const [prompt, setPrompt] = useState(sourcePrompt);
    const generate = queries.useGenerateBeatVideoPrompt(project, episode);
    const generationTask = useTaskController({
      key: {
        taskType: TASK_TYPES.BEAT_VIDEO_PROMPT,
        project,
        episode,
        beatNum: beat.beat_number,
      },
      invalidateKeys: [queryKeys.beats(project, episode)],
    });
    const promptCost = dependencies.useGenerationCreditCost(
      "feature",
      "beat_video_prompt",
    );
    const costDisplay =
      promptCost.data?.data.display ??
      (promptCost.error instanceof BillingRuleNotConfiguredError
        ? t("common.billingRuleNotConfiguredShort")
        : null);

    useEffect(() => {
      setPrompt(sourcePrompt);
    }, [beat.beat_number, field, sourcePrompt]);

    const savePrompt = async () => {
      if (prompt === sourcePrompt) return;
      try {
        await updateBeat({
          beatNum: beat.beat_number,
          data: { [field]: prompt },
        });
      } catch {
        toast.error(t("episode.workbench.video.regenFailed"));
      }
    };

    const generatePrompt = async () => {
      try {
        const response = await generate.mutateAsync({
          beatNum: beat.beat_number,
        });
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.video.beatVideoPromptGenerateFailed"),
          );
          return;
        }
        if (!("data" in response)) {
          generationTask.start();
          toast.success(
            t("episode.workbench.video.beatVideoPromptGenerateStarted"),
          );
          return;
        }
        setPrompt(response.data.prompt);
        toast.success(t("episode.workbench.video.beatVideoPromptGenerated"));
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    return {
      costDisplay,
      field,
      generationPending: generate.isPending || generationTask.started,
      prompt,
      generatePrompt,
      savePrompt,
      setPrompt,
    };
  };
}
