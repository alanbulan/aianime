// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/hooks/use-task-controller";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/lib/task-types";
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import {
  episodeAudioModelCallCount,
  type GenerateAudioCommand,
} from "@/modules/production/domain/audio-generation";
import type {
  RenderSettingsData,
  SketchAspectRatio,
  SketchSettingsData,
  UpdateRenderSettingsCommand,
  UpdateSketchSettingsCommand,
} from "@/modules/production/domain/image-settings";
import type {
  AssignColorsResult,
  DetectIdentitiesResult,
} from "@/modules/production/domain/sketch-markers";
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";
import {
  backendErrorToastMessage,
  BillingRuleNotConfiguredError,
} from "@/shared/api/errors";

interface AssignColorsMutation {
  isPending: boolean;
  mutateAsync(options?: {
    force?: boolean;
  }): Promise<
    ProductionDataResponse<AssignColorsResult> | ProductionErrorResponse
  >;
}

interface DetectIdentitiesMutation {
  isPending: boolean;
  mutateAsync(): Promise<
    ProductionDataResponse<DetectIdentitiesResult> | ProductionErrorResponse
  >;
}

interface GenerateAudioMutation {
  isPending: boolean;
  mutateAsync(
    command?: GenerateAudioCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface GlobalOptimizeMutation {
  isPending: boolean;
  mutateAsync(): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface VideoBackendsQuery {
  data?: ProductionDataResponse<VideoBackendOption[]>;
}

interface RenderSettingsQuery {
  data?: ProductionDataResponse<RenderSettingsData>;
  isLoading: boolean;
}

interface SketchSettingsQuery {
  data?: ProductionDataResponse<SketchSettingsData>;
  isLoading: boolean;
}

interface UpdateRenderSettingsMutation {
  isPending: boolean;
  mutateAsync(
    command: UpdateRenderSettingsCommand,
  ): Promise<
    ProductionDataResponse<RenderSettingsData> | ProductionErrorResponse
  >;
}

interface UpdateSketchSettingsMutation {
  isPending: boolean;
  mutateAsync(
    command: UpdateSketchSettingsCommand,
  ): Promise<
    ProductionDataResponse<SketchSettingsData> | ProductionErrorResponse
  >;
}

interface CreditCostQuery {
  data?: {
    data: {
      cost?: number;
      display?: string | null;
    };
  };
  error?: unknown;
}

export interface BatchBarControllerQueries {
  useAssignColors(project: string, episode: number): AssignColorsMutation;
  useDetectIdentities(
    project: string,
    episode: number,
  ): DetectIdentitiesMutation;
  useGenerateAudio(project: string, episode: number): GenerateAudioMutation;
  useGlobalOptimize(
    project: string,
    episode: number,
  ): GlobalOptimizeMutation;
  useRenderSettings(project: string): RenderSettingsQuery;
  useSketchSettings(project: string): SketchSettingsQuery;
  useUpdateRenderSettings(project: string): UpdateRenderSettingsMutation;
  useUpdateSketchSettings(project: string): UpdateSketchSettingsMutation;
  useVideoBackends(project: string): VideoBackendsQuery;
}

export interface BatchBarControllerDependencies {
  formatCreditCost(cost: number): string;
  useGenerationCreditCost(
    kind: string,
    value?: string | null,
  ): CreditCostQuery;
}

export interface BatchBarControllerOptions {
  beats: readonly Beat[];
  episode: number;
  onSketchAspectRatioChange(aspectRatio: SketchAspectRatio): void;
  project: string;
  sketchAspectRatio: SketchAspectRatio;
  spineTemplate: "drama" | "narrated";
  videoBackend: string;
}

export interface BatchBarErrorDialog {
  description: string;
  title: string;
}

export interface BatchBarModelOption {
  label: string;
  value: string;
}

export interface BatchBarModelControl {
  isLoading: boolean;
  isPending: boolean;
  isVisible: boolean;
  onChange(value: string): Promise<void>;
  options: readonly BatchBarModelOption[];
  value: string;
}

export interface BatchBarController {
  assignColorsPending: boolean;
  audioPending: boolean;
  audioUnavailableForVideoBackend: boolean;
  detectIdentitiesCostDisplay: string | null;
  detectIdentitiesPending: boolean;
  episodeAudioCostDisplay: string;
  errorDialog: BatchBarErrorDialog | null;
  globalOptimizePending: boolean;
  renderModel: BatchBarModelControl;
  sketchAspectRatio: SketchAspectRatio;
  sketchModel: BatchBarModelControl;
  showEpisodeAudio: boolean;
  showGlobalOptimize: boolean;
  onDetectIdentities(): Promise<void>;
  onDismissError(): void;
  onGenerateAudio(): Promise<void>;
  onGlobalOptimize(): Promise<void>;
  onReassignColors(): Promise<void>;
  onSketchAspectRatioChange(aspectRatio: SketchAspectRatio): void;
}

export function createUseBatchBarController(
  queries: BatchBarControllerQueries,
  dependencies: BatchBarControllerDependencies,
) {
  return function useBatchBarController({
    beats,
    episode,
    onSketchAspectRatioChange,
    project,
    sketchAspectRatio,
    spineTemplate,
    videoBackend,
  }: BatchBarControllerOptions): BatchBarController {
    const { t } = useTranslation();
    const assignColors = queries.useAssignColors(project, episode);
    const detectIdentities = queries.useDetectIdentities(project, episode);
    const generateAudio = queries.useGenerateAudio(project, episode);
    const globalOptimize = queries.useGlobalOptimize(project, episode);
    const renderSettings = queries.useRenderSettings(project);
    const sketchSettings = queries.useSketchSettings(project);
    const updateRenderSettings = queries.useUpdateRenderSettings(project);
    const updateSketchSettings = queries.useUpdateSketchSettings(project);
    const videoBackends = queries.useVideoBackends(project);
    const detectIdentitiesCost = dependencies.useGenerationCreditCost(
      "feature",
      "ai_identity_detection",
    );
    const episodeAudioCost =
      dependencies.useGenerationCreditCost("beat_tts");
    const [errorDialog, setErrorDialog] =
      useState<BatchBarErrorDialog | null>(null);

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
      key: {
        taskType: TASK_TYPES.GLOBAL_OPTIMIZE_VIDEO,
        project,
        episode,
      },
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
    const episodeAudioCalls = useMemo(
      () => episodeAudioModelCallCount(beats),
      [beats],
    );
    const episodeAudioCostDisplay = useMemo(() => {
      const unitCost = episodeAudioCost.data?.data.cost;
      if (episodeAudioCalls <= 0 || typeof unitCost !== "number") return "";
      return dependencies.formatCreditCost(unitCost * episodeAudioCalls);
    }, [episodeAudioCost.data?.data.cost, episodeAudioCalls]);
    const detectIdentitiesCostDisplay =
      detectIdentitiesCost.data?.data.display ??
      (detectIdentitiesCost.error instanceof BillingRuleNotConfiguredError
        ? t("common.billingRuleNotConfiguredShort")
        : null);
    const renderSettingsData = renderSettings.data?.data;
    const sketchSettingsData = sketchSettings.data?.data;
    const renderModelOptions = useMemo(
      () =>
        Object.entries(renderSettingsData?.options ?? {}).map(
          ([value, label]) => ({ label, value }),
        ),
      [renderSettingsData?.options],
    );
    const sketchModelOptions = useMemo(
      () =>
        Object.entries(sketchSettingsData?.options ?? {}).map(
          ([value, label]) => ({ label, value }),
        ),
      [sketchSettingsData?.options],
    );

    const onRenderModelChange = async (value: string) => {
      if (!value || value === renderSettingsData?.render_image_selection) {
        return;
      }
      try {
        const response = await updateRenderSettings.mutateAsync({
          renderImageSelection: value,
        });
        if (!response.ok) toast.error(response.error || t("common.error"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const onSketchModelChange = async (value: string) => {
      if (!value || value === sketchSettingsData?.sketch_image_selection) {
        return;
      }
      try {
        const response = await updateSketchSettings.mutateAsync({
          sketchImageSelection: value,
        });
        if (!response.ok) toast.error(response.error || t("common.error"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const onGenerateAudio = async () => {
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

    const onGlobalOptimize = async () => {
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
        toast.success(
          t("episode.workbench.batch.globalOptimizeStarted"),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const onDetectIdentities = async () => {
      const toastId = toast.loading(
        t("episode.workbench.batch.aiDetectRunning"),
      );
      try {
        const response = await detectIdentities.mutateAsync();
        if (!response.ok) {
          toast.error(response.error || t("common.error"), {
            id: toastId,
          });
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
        toast.error(backendErrorToastMessage(error, t), {
          id: toastId,
        });
      }
    };

    const onReassignColors = async () => {
      try {
        const response = await assignColors.mutateAsync({ force: true });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
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

    return {
      assignColorsPending: assignColors.isPending,
      audioPending: audioTask.started || generateAudio.isPending,
      audioUnavailableForVideoBackend:
        selectedVideoBackend?.is_seedance2 === true,
      detectIdentitiesCostDisplay,
      detectIdentitiesPending: detectIdentities.isPending,
      episodeAudioCostDisplay,
      errorDialog,
      globalOptimizePending:
        globalOptimize.isPending || globalOptimizeTask.started,
      renderModel: {
        isLoading: renderSettings.isLoading,
        isPending: updateRenderSettings.isPending,
        isVisible: renderSettingsData !== undefined,
        onChange: onRenderModelChange,
        options: renderModelOptions,
        value: renderSettingsData?.render_image_selection ?? "",
      },
      sketchAspectRatio,
      sketchModel: {
        isLoading: sketchSettings.isLoading,
        isPending: updateSketchSettings.isPending,
        isVisible: sketchSettingsData !== undefined,
        onChange: onSketchModelChange,
        options: sketchModelOptions,
        value: sketchSettingsData?.sketch_image_selection ?? "",
      },
      showEpisodeAudio: spineTemplate !== "drama",
      showGlobalOptimize: spineTemplate === "narrated",
      onDetectIdentities,
      onDismissError: () => setErrorDialog(null),
      onGenerateAudio,
      onGlobalOptimize,
      onReassignColors,
      onSketchAspectRatioChange,
    };
  };
}
