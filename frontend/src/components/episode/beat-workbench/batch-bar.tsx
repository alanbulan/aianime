// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { formatCreditCost } from "@/components/credits/credit-visual";
import { useTaskController } from "@/hooks/use-task-controller";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/lib/task-types";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  BatchBarView,
  episodeAudioModelCallCount,
  type SketchAspectRatio,
  useAssignColors,
  useDetectIdentities,
  useGenerateAudio,
  useGlobalOptimize,
  useVideoBackends,
} from "@/modules/production/public";
import {
  backendErrorToastMessage,
  BillingRuleNotConfiguredError,
} from "@/shared/api/errors";

import { RenderModelSelect } from "./render-settings-controls";
import {
  SketchAspectCheckbox,
  SketchModelSelect,
} from "./sketch-settings-controls";

interface BatchBarProps {
  project: string;
  episode: number;
  beats: Beat[];
  videoBackend: string;
  spineTemplate?: "drama" | "narrated";
  sketchAspectRatio: SketchAspectRatio;
  onSketchAspectRatioChange: (aspectRatio: SketchAspectRatio) => void;
}

export function BatchBar({
  project,
  episode,
  beats,
  videoBackend,
  spineTemplate = "drama",
  sketchAspectRatio,
  onSketchAspectRatioChange,
}: BatchBarProps) {
  const { t } = useTranslation();
  const assignColors = useAssignColors(project, episode);
  const detectIdentities = useDetectIdentities(project, episode);
  const generateAudio = useGenerateAudio(project, episode);
  const globalOptimize = useGlobalOptimize(project, episode);
  const videoBackends = useVideoBackends(project);
  const detectIdentitiesCost = useGenerationCreditCost(
    "feature",
    "ai_identity_detection",
  );
  const episodeAudioCost = useGenerationCreditCost("beat_tts");
  const [errorDialog, setErrorDialog] = useState<{
    title: string;
    description: string;
  } | null>(null);

  const showError = (title: string, description: string) => {
    setErrorDialog({ title, description });
  };
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
  const globalOptimizeTask = useTaskController({
    key: { taskType: "global_optimize_video", project, episode },
    invalidateKeys: [
      queryKeys.beats(project, episode),
      queryKeys.pipelineStatus(project),
    ],
    onError: (error) =>
      showError(
        t("episode.workbench.batch.aiOptimizeTitle"),
        error || t("common.error"),
      ),
  });
  const selectedVideoBackend = videoBackends.data?.data.find(
    (option) => option.value === videoBackend,
  );
  const audioUnavailableForVideoBackend =
    selectedVideoBackend?.is_seedance2 === true;
  const episodeAudioCalls = useMemo(
    () => episodeAudioModelCallCount(beats),
    [beats],
  );
  const episodeAudioCostDisplay = useMemo(() => {
    const unitCost = episodeAudioCost.data?.data.cost;
    if (episodeAudioCalls <= 0 || typeof unitCost !== "number") return "";
    return formatCreditCost(unitCost * episodeAudioCalls);
  }, [episodeAudioCost.data?.data.cost, episodeAudioCalls]);
  const detectIdentitiesCostDisplay =
    detectIdentitiesCost.data?.data.display ??
    (detectIdentitiesCost.error instanceof BillingRuleNotConfiguredError
      ? t("common.billingRuleNotConfiguredShort")
      : null);

  const handleGenerateAudio = async () => {
    try {
      const response = await generateAudio.mutateAsync(undefined);
      if (!response.ok) {
        showError(
          t("episode.workbench.batch.genAudioTitle"),
          response.error || t("common.error"),
        );
        return;
      }
      audioTask.start({ scope: response.scope });
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleGlobalOptimize = async () => {
    try {
      const response = await globalOptimize.mutateAsync();
      if (!response.ok) {
        showError(
          t("episode.workbench.batch.aiOptimizeTitle"),
          response.error || t("common.error"),
        );
        return;
      }
      globalOptimizeTask.start();
      toast.success(t("episode.workbench.batch.globalOptimizeStarted"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleDetectIdentities = async () => {
    const toastId = toast.loading(
      t("episode.workbench.batch.aiDetectRunning"),
    );
    try {
      const response = await detectIdentities.mutateAsync();
      if (!response.ok) {
        toast.error(response.error ?? t("common.error"), { id: toastId });
        return;
      }
      const {
        total_beats,
        total_identities,
        total_props = 0,
        review_message,
      } = response.data;
      const reviewMessage =
        review_message || t("episode.workbench.batch.aiDetectReview");
      if (total_identities === 0 && total_props === 0) {
        toast.info(
          `${t("episode.workbench.batch.aiDetectEmpty")}\n${reviewMessage}`,
          { id: toastId },
        );
        return;
      }
      toast.success(
        `${t("episode.workbench.batch.aiDetectSuccess", {
          beats: total_beats,
          ids: total_identities,
          props: total_props,
        })}\n${reviewMessage}`,
        { id: toastId },
      );
    } catch (error) {
      toast.error(backendErrorToastMessage(error, t), { id: toastId });
    }
  };

  const handleReassignColors = async () => {
    try {
      const response = await assignColors.mutateAsync({ force: true });
      if (!response.ok) {
        toast.error(response.error ?? t("common.error"));
        return;
      }
      toast.success(
        t("episode.workbench.batch.reassignColorsSuccess", {
          count: response.data.count,
          propCount: response.data.prop_count ?? 0,
        }),
      );
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <BatchBarView
      assignColorsPending={assignColors.isPending}
      audioPending={audioTask.started || generateAudio.isPending}
      audioUnavailableForVideoBackend={audioUnavailableForVideoBackend}
      detectIdentitiesCostDisplay={detectIdentitiesCostDisplay}
      detectIdentitiesPending={detectIdentities.isPending}
      episodeAudioCostDisplay={episodeAudioCostDisplay}
      errorDialog={errorDialog}
      globalOptimizePending={
        globalOptimize.isPending || globalOptimizeTask.started
      }
      renderModelControl={<RenderModelSelect project={project} />}
      showEpisodeAudio={spineTemplate !== "drama"}
      showGlobalOptimize={spineTemplate === "narrated"}
      sketchAspectControl={
        <SketchAspectCheckbox
          aspectRatio={sketchAspectRatio}
          onAspectRatioChange={onSketchAspectRatioChange}
          flat
        />
      }
      sketchModelControl={<SketchModelSelect project={project} />}
      onDetectIdentities={() => void handleDetectIdentities()}
      onDismissError={() => setErrorDialog(null)}
      onGenerateAudio={() => void handleGenerateAudio()}
      onGlobalOptimize={() => void handleGlobalOptimize()}
      onReassignColors={() => void handleReassignColors()}
    />
  );
}
