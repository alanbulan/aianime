// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import { TASK_TYPES } from "@/modules/task_execution/public";
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import {
  episodeAudioPlanRevision,
  type AudioGenerationPlan,
  type GenerateAudioCommand,
} from "@/modules/production/domain/audio-generation";
import { resolveAudioRegenerationError } from "@/modules/production/domain/audio-prerequisite";
import type {
  RenderSettingsData,
  SketchAspectRatio,
  SketchSettingsData,
  UpdateRenderSettingsCommand,
  UpdateSketchSettingsCommand,
} from "@/modules/production/domain/image-settings";
import {
  resolveAuthorizedImageModel,
  type ImageModelOption,
} from "@/modules/production/domain/image-model";
import type {
  AssignColorsResult,
  DetectIdentitiesResult,
} from "@/modules/production/domain/sketch-markers";
import {
  resolveVideoModelOption,
  type VideoModelOption,
} from "@/modules/production/domain/video-model";
import { backendErrorToastMessage } from "@/shared/api/errors";

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
  mutateAsync(): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface GenerateAudioMutation {
  isPending: boolean;
  mutateAsync(
    command: GenerateAudioCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface GlobalOptimizeMutation {
  isPending: boolean;
  mutateAsync(): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface ProductionWorkflowMutation {
  isPending: boolean;
  mutateAsync(): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface VideoModelsQuery {
  data: VideoModelOption[];
}

interface ImageModelsQuery {
  data: ImageModelOption[];
  isLoading: boolean;
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

interface AudioGenerationPlanQuery {
  data?: ProductionDataResponse<AudioGenerationPlan>;
}

export interface BatchBarControllerQueries {
  useAssignColors(project: string, episode: number): AssignColorsMutation;
  useAudioGenerationPlan(
    project: string,
    episode: number,
    command: GenerateAudioCommand,
    revision: string,
  ): AudioGenerationPlanQuery;
  useDetectIdentities(
    project: string,
    episode: number,
  ): DetectIdentitiesMutation;
  useGenerateAudio(project: string, episode: number): GenerateAudioMutation;
  useGlobalOptimize(
    project: string,
    episode: number,
  ): GlobalOptimizeMutation;
  useProductionWorkflow(
    project: string,
    episode: number,
  ): ProductionWorkflowMutation;
  useRenderSettings(project: string): RenderSettingsQuery;
  useSketchSettings(project: string): SketchSettingsQuery;
  useUpdateRenderSettings(project: string): UpdateRenderSettingsMutation;
  useUpdateSketchSettings(project: string): UpdateSketchSettingsMutation;
  useImageModels(enabled?: boolean): ImageModelsQuery;
  useVideoModels(enabled?: boolean): VideoModelsQuery;
}

export interface BatchBarControllerOptions {
  beats: readonly Beat[];
  episode: number;
  onSketchAspectRatioChange(aspectRatio: SketchAspectRatio): void;
  project: string;
  sketchAspectRatio: SketchAspectRatio;
  spineTemplate: "drama" | "narrated";
  videoModel: string;
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
  audioPrerequisiteErrors: readonly string[];
  audioUnavailableForVideoModel: boolean;
  detectIdentitiesPending: boolean;
  errorDialog: BatchBarErrorDialog | null;
  globalOptimizePending: boolean;
  productionWorkflowPending: boolean;
  renderModel: BatchBarModelControl;
  sketchAspectRatio: SketchAspectRatio;
  sketchModel: BatchBarModelControl;
  showEpisodeAudio: boolean;
  showGlobalOptimize: boolean;
  onDetectIdentities(): Promise<void>;
  onDismissError(): void;
  onGenerateAudio(): Promise<void>;
  onGlobalOptimize(): Promise<void>;
  onRunProductionWorkflow(): Promise<void>;
  onReassignColors(): Promise<void>;
  onSketchAspectRatioChange(aspectRatio: SketchAspectRatio): void;
}

export function createUseBatchBarController(
  queries: BatchBarControllerQueries,
) {
  return function useBatchBarController({
    beats,
    episode,
    onSketchAspectRatioChange,
    project,
    sketchAspectRatio,
    spineTemplate,
    videoModel,
  }: BatchBarControllerOptions): BatchBarController {
    const { t } = useTranslation();
    const assignColors = queries.useAssignColors(project, episode);
    const detectIdentities = queries.useDetectIdentities(project, episode);
    const generateAudio = queries.useGenerateAudio(project, episode);
    const globalOptimize = queries.useGlobalOptimize(project, episode);
    const productionWorkflow = queries.useProductionWorkflow(project, episode);
    const renderSettings = queries.useRenderSettings(project);
    const sketchSettings = queries.useSketchSettings(project);
    const updateRenderSettings = queries.useUpdateRenderSettings(project);
    const updateSketchSettings = queries.useUpdateSketchSettings(project);
    const imageModels = queries.useImageModels(Boolean(project));
    const videoModels = queries.useVideoModels(Boolean(project));
    const episodeAudioRevision = useMemo(
      () => episodeAudioPlanRevision(beats),
      [beats],
    );
    const episodeAudioPlan = queries.useAudioGenerationPlan(
      project,
      episode,
      { mode: "sync_changed" },
      episodeAudioRevision,
    );
    const [errorDialog, setErrorDialog] =
      useState<BatchBarErrorDialog | null>(null);

    const showError = (title: string, description: string) => {
      setErrorDialog({ title, description });
    };
    const audioTask = useTaskController({
      key: {
        taskType: TASK_TYPES.EPISODE_AUDIO_GENERATION,
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
    const identityDetectionTask = useTaskController({
      key: {
        taskType: TASK_TYPES.AI_IDENTITY_DETECTION,
        project,
        episode,
      },
      invalidateKeys: [
        queryKeys.beats(project, episode),
        queryKeys.grids(project, episode),
        queryKeys.script(project, episode),
        queryKeys.episodeDetail(project, episode),
      ],
      onComplete: (result) => {
        const data = (result ?? {}) as Partial<DetectIdentitiesResult>;
        toast.success(
          t("episode.workbench.batch.aiDetectSuccess", {
            beats: data.total_beats ?? 0,
            ids: data.total_identities ?? 0,
            props: data.total_props ?? 0,
          }),
        );
      },
      onError: (error) =>
        toast.error(error || t("episode.workbench.batch.aiDetectFailed")),
    });
    const productionWorkflowTask = useTaskController({
      key: {
        taskType: TASK_TYPES.PRODUCTION_WORKFLOW,
        project,
        episode: 0,
      },
      invalidateKeys: [
        queryKeys.project(project),
        queryKeys.characters(project),
        queryKeys.episodes(project),
        queryKeys.episode(project, episode),
        queryKeys.episodeDetail(project, episode),
        queryKeys.script(project, episode),
        queryKeys.beats(project, episode),
        queryKeys.grids(project, episode),
        queryKeys.videoPool(project, episode),
        queryKeys.finalVideo(project, episode),
        queryKeys.pipelineStatus(project),
      ],
      onComplete: () =>
        toast.success(t("episode.workbench.batch.productionWorkflowCompleted")),
      onError: (error) =>
        showError(
          t("episode.workbench.batch.productionWorkflowTitle"),
          error || t("common.error"),
        ),
    });
    const selectedVideoModel = resolveVideoModelOption(
      videoModels.data,
      videoModel,
    );
    const audioPrerequisiteErrors =
      episodeAudioPlan.data?.data.prereq_errors ?? [];
    const renderSettingsData = renderSettings.data?.data;
    const sketchSettingsData = sketchSettings.data?.data;
    const renderModelOptions = useMemo(
      () => imageModels.data.map(({ label, value }) => ({ label, value })),
      [imageModels.data],
    );
    const sketchModelOptions = useMemo(
      () => imageModels.data.map(({ label, value }) => ({ label, value })),
      [imageModels.data],
    );
    const renderModelValue = resolveAuthorizedImageModel(
      imageModels.data,
      renderSettingsData?.render_image_selection,
    );
    const sketchModelValue = resolveAuthorizedImageModel(
      imageModels.data,
      sketchSettingsData?.sketch_image_selection,
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
      if (audioPrerequisiteErrors.length > 0) {
        showError(
          t("episode.workbench.batch.genAudioTitle"),
          audioPrerequisiteErrors
            .map((error) => resolveAudioRegenerationError(error).message)
            .join("\n"),
        );
        return;
      }
      try {
        const response = await generateAudio.mutateAsync({});
        if (!response.ok) {
          showError(
            t("episode.workbench.batch.genAudioTitle"),
            response.error || t("common.error"),
          );
          return;
        }
        audioTask.start({ scope: response.scope, taskId: response.task_id });
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
        globalOptimizeTask.start({ scope: response.scope, taskId: response.task_id });
        toast.success(
          t("episode.workbench.batch.globalOptimizeStarted"),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const onRunProductionWorkflow = async () => {
      try {
        const response = await productionWorkflow.mutateAsync();
        if (!response.ok) {
          showError(
            t("episode.workbench.batch.productionWorkflowTitle"),
            response.error || t("common.error"),
          );
          return;
        }
        productionWorkflowTask.start({ scope: response.scope, taskId: response.task_id });
        toast.success(
          response.message ||
            t("episode.workbench.batch.productionWorkflowStarted"),
        );
      } catch (error) {
        showError(
          t("episode.workbench.batch.productionWorkflowTitle"),
          backendErrorToastMessage(error, t),
        );
      }
    };

    const onDetectIdentities = async () => {
      try {
        const response = await detectIdentities.mutateAsync();
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        identityDetectionTask.start({ scope: response.scope, taskId: response.task_id });
        toast.success(
          response.message || t("episode.workbench.batch.aiDetectQueued"),
        );
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
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
      audioPrerequisiteErrors,
      audioUnavailableForVideoModel:
        selectedVideoModel?.supportsNativeAudio === true,
      detectIdentitiesPending:
        detectIdentities.isPending || identityDetectionTask.started,
      errorDialog,
      globalOptimizePending:
        globalOptimize.isPending || globalOptimizeTask.started,
      productionWorkflowPending:
        productionWorkflow.isPending || productionWorkflowTask.started,
      renderModel: {
        isLoading: renderSettings.isLoading || imageModels.isLoading,
        isPending: updateRenderSettings.isPending,
        isVisible: renderSettingsData !== undefined,
        onChange: onRenderModelChange,
        options: renderModelOptions,
        value: renderModelValue,
      },
      sketchAspectRatio,
      sketchModel: {
        isLoading: sketchSettings.isLoading || imageModels.isLoading,
        isPending: updateSketchSettings.isPending,
        isVisible: sketchSettingsData !== undefined,
        onChange: onSketchModelChange,
        options: sketchModelOptions,
        value: sketchModelValue,
      },
      showEpisodeAudio: spineTemplate !== "drama",
      showGlobalOptimize: spineTemplate === "narrated",
      onDetectIdentities,
      onDismissError: () => setErrorDialog(null),
      onGenerateAudio,
      onGlobalOptimize,
      onRunProductionWorkflow,
      onReassignColors,
      onSketchAspectRatioChange,
    };
  };
}
