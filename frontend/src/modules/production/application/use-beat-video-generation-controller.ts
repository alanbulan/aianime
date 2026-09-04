// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController, type TaskStreamState } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/modules/task_execution/public";
import type {
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import {
  prepareBeatVideoGeneration,
  type BeatVideoGenerationInput,
} from "@/modules/production/domain/beat-video-generation";
import type { RegenerateBeatVideoCommand } from "@/modules/production/domain/video-generation";
import type { BeatVideoConfigDraft } from "@/modules/production/domain/video-config";
import { backendErrorToastMessage } from "@/shared/api/errors";

interface RegenerationMutation {
  isPending: boolean;
  mutateAsync(
    command: RegenerateBeatVideoCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

export interface BeatVideoGenerationQueries {
  useRegenerateBeatVideo(
    project: string,
    episode: number,
  ): RegenerationMutation;
}

export interface BeatVideoGenerationControllerOptions {
  beatNumber: number;
  episode: number;
  generationInput: BeatVideoGenerationInput;
  project: string;
  prompt: string;
  promptKind: "basic" | "configured";
  applyNormalizedDraft(draft: BeatVideoConfigDraft): void;
  saveDraft(draft: BeatVideoConfigDraft): Promise<boolean>;
}

export interface BeatVideoGenerationController {
  beatNumber: number;
  confirmationOpen: boolean;
  generationPending: boolean;
  progress: number;
  stream: TaskStreamState;
  started: boolean;
  stopping: boolean;
  confirmGeneration(): Promise<void>;
  requestGeneration(): void;
  setConfirmationOpen(open: boolean): void;
  stopGeneration(): Promise<void>;
}

export function createUseBeatVideoGenerationController(
  queries: BeatVideoGenerationQueries,
) {
  return function useBeatVideoGenerationController(
    options: BeatVideoGenerationControllerOptions,
  ): BeatVideoGenerationController {
    const { t } = useTranslation();
    const regenerate = queries.useRegenerateBeatVideo(
      options.project,
      options.episode,
    );
    const task = useTaskController({
      key: {
        taskType: TASK_TYPES.SINGLE_VIDEO,
        project: options.project,
        episode: options.episode,
        beatNum: options.beatNumber,
      },
      invalidateKeys: [
        queryKeys.beats(options.project, options.episode),
        queryKeys.videoPool(options.project, options.episode),
        queryKeys.pipelineStatus(options.project),
        queryKeys.videoReferenceBeatStatus(
          options.project,
          options.episode,
          options.beatNumber,
        ),
      ],
    });
    const [confirmationOpen, setConfirmationOpen] = useState(false);
    const validatePrompt = (): boolean => {
      if (options.prompt.trim()) return true;
      toast.error(
        t(
          options.promptKind === "configured"
            ? "episode.workbench.video.videoReferencePromptRequired"
            : "episode.workbench.video.beatVideoPromptRequired",
          { n: options.beatNumber },
        ),
      );
      return false;
    };

    const requestGeneration = () => {
      if (!validatePrompt()) return;
      setConfirmationOpen(true);
    };

    const confirmGeneration = async () => {
      if (!validatePrompt()) return;
      setConfirmationOpen(false);
      try {
        const prepared = prepareBeatVideoGeneration(options.generationInput);
        if (prepared.normalizedDraft && prepared.draftChanged) {
          options.applyNormalizedDraft(prepared.normalizedDraft);
        }
        if (
          prepared.normalizedDraft &&
          prepared.saveDraftBeforeGeneration
        ) {
          const saved = await options.saveDraft(prepared.normalizedDraft);
          if (!saved) return;
        }
        const response = await regenerate.mutateAsync(prepared.command);
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.video.regenFailed"),
          );
          return;
        }
        task.start({ scope: response.scope, taskId: response.task_id });
        toast.success(
          t("episode.workbench.video.started", { n: options.beatNumber }),
        );
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    return {
      beatNumber: options.beatNumber,
      confirmationOpen,
      generationPending: regenerate.isPending,
      progress: task.stream?.progress ?? 0,
      stream: task.stream,
      started: task.started,
      stopping: task.stopping,
      confirmGeneration,
      requestGeneration,
      setConfirmationOpen,
      stopGeneration: async () => {
        await task.stop();
      },
    };
  };
}
