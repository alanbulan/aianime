// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  TASK_TYPES,
  useEpisodeImageTaskInvalidation,
  useTaskController,
} from "@/modules/task_execution/public";
import {
  aspectRatioForOrientation,
  orientationForAspectRatio,
} from "@/shared/aspect-ratio";
import { queryKeys } from "@/lib/query-keys";
import type { NarrativePlanningQueryHooks } from "@/modules/narrative_planning/application/query-hooks";
import {
  resolveAuthorizedVideoModel,
  type BeatStates,
} from "@/modules/production/public";
import type {
  UseBeatSelection,
  UseBeatsViewToggles,
} from "@/modules/narrative_planning/application/episode-workbench-state";
import type {
  BeatsSketchPlanController,
  BeatsSketchPlanControllerOptions,
  SketchAspectRatio,
} from "@/modules/narrative_planning/application/use-beats-sketch-plan-controller";
import type {
  SketchStudioController,
  SketchStudioControllerOptions,
} from "@/modules/narrative_planning/application/use-sketch-studio-controller";
import { backendErrorToastMessage } from "@/shared/api/errors";
import { useProjectAspectRatio } from "@/shared/stores/aspect-ratio-store";

export type BeatsTargetSection = "sketch" | "render" | "audio" | "video";

interface SketchSettingsQuery {
  data?: { data: { sketch_image_selection?: string } };
}

interface ProjectConfigQuery {
  data?: {
    aspect_ratio?: "2:3" | "9:16" | "16:9";
    spine_template?: string | null;
    video_model?: string | null;
  };
}

interface ProjectPreferencesMutation {
  mutateAsync(data: {
    aspect_ratio?: "2:3" | "9:16" | "16:9";
    video_model?: string;
  }): Promise<unknown>;
}

interface RebuildPoolIndexMutation {
  isPending: boolean;
  mutateAsync(): Promise<{ data: { image_count: number } }>;
}

interface VideoModelsQuery {
  data: Array<{ value: string }>;
}

export interface BeatsPageControllerDependencies {
  openEpisodeFreezone(
    project: string,
    options: { scope: "episode"; episode: number },
  ): Promise<unknown>;
  useBeatSelection: UseBeatSelection;
  useBeatStates(
    project: string,
    episode: number,
  ): { states: BeatStates };
  useViewToggles: UseBeatsViewToggles;
  useProject(project: string): ProjectConfigQuery;
  useRebuildPoolIndex(
    project: string,
    episode: number,
  ): RebuildPoolIndexMutation;
  useSketchSettings(project: string): SketchSettingsQuery;
  useUpdateProject(project: string): ProjectPreferencesMutation;
  useVideoModels(enabled?: boolean): VideoModelsQuery;
}

export interface BeatsPageControllerOptions {
  clearFocusBeat(): void;
  deepLinkBeat: number | null;
  episodeNumber: number;
  focusBeat: number | null;
  project: string;
  setBeat(beatNumber: number | null): void;
  targetSection: BeatsTargetSection | null;
}

type UseBeatsSketchPlanController = (
  options: BeatsSketchPlanControllerOptions,
) => BeatsSketchPlanController;

type UseSketchStudioController = (
  options: SketchStudioControllerOptions,
) => SketchStudioController;

export function createUseBeatsPageController(
  queries: NarrativePlanningQueryHooks,
  dependencies: BeatsPageControllerDependencies,
  useSketchPlanController: UseBeatsSketchPlanController,
  useSketchStudioController: UseSketchStudioController,
) {
  return function useBeatsPageController(options: BeatsPageControllerOptions) {
    const {
      clearFocusBeat,
      deepLinkBeat,
      episodeNumber,
      focusBeat,
      project,
      setBeat,
      targetSection,
    } = options;
    const { t } = useTranslation();
    useEpisodeImageTaskInvalidation(project, episodeNumber);

    const { data: beatsResponse, isLoading } = queries.useEpisodeBeats(
      project,
      episodeNumber,
    );
    const { data: episodeResponse } = queries.useEpisodeDetail(
      project,
      episodeNumber,
    );
    const { data: sketchSettingsResponse } =
      dependencies.useSketchSettings(project);
    const projectConfig = dependencies.useProject(project);
    const updateProject = dependencies.useUpdateProject(project);
    const rebuildPoolIndex = dependencies.useRebuildPoolIndex(
      project,
      episodeNumber,
    );
    const { states } = dependencies.useBeatStates(project, episodeNumber);
    const beats = beatsResponse?.data ?? [];
    const sketchStudio = useSketchStudioController({
      beats,
      episode: episodeNumber,
      project,
      propMenu: episodeResponse?.data.prop_menu ?? [],
    });
    const identityIds = episodeResponse?.data?.identity_ids ?? [];
    const identityPlanReady = identityIds.length > 0;
    const scenePlanReady = (episodeResponse?.data?.scene_menu?.length ?? 0) > 0;
    const isNarratedProject =
      projectConfig.data?.spine_template === "narrated";

    const appliedDeepLinkRef = useRef<string | null>(null);
    const focusAppliedRef = useRef<number | null>(null);
    const {
      state: selection,
      handleCardClick,
      toggleCheck,
      selectSingle,
      clearSelection,
    } = dependencies.useBeatSelection({ project, episode: episodeNumber });
    const { toggles, toggle: toggleView } = dependencies.useViewToggles(
      project,
      episodeNumber,
    );

    const [videoModel, setVideoModelState] = useState("");
    const { data: videoModels } = dependencies.useVideoModels(Boolean(project));
    const { orientation, spec: aspectSpecValue, setOrientation } =
      useProjectAspectRatio(project);
    const sketchAspectRatio: SketchAspectRatio = aspectSpecValue.sketchAspect;
    const [pendingAspect, setPendingAspect] =
      useState<SketchAspectRatio | null>(null);
    const hasGeneratedAssets = useMemo(
      () =>
        beats.some(
          (beat) => beat.sketch_url || beat.frame_url || beat.video_url,
        ),
      [beats],
    );

    const applyAspect = useCallback(
      (next: SketchAspectRatio) => {
        const nextOrientation = next === "16:9" ? "landscape" : "portrait";
        setOrientation(nextOrientation);
        void updateProject
          .mutateAsync({
            aspect_ratio: aspectRatioForOrientation(nextOrientation),
          })
          .catch(() => toast.error(t("common.error")));
      },
      [setOrientation, t, updateProject],
    );
    const setSketchAspectRatio = useCallback(
      (next: SketchAspectRatio) => {
        const nextOrientation = next === "16:9" ? "landscape" : "portrait";
        if (nextOrientation === orientation) return;
        if (hasGeneratedAssets) {
          setPendingAspect(next);
          return;
        }
        applyAspect(next);
      },
      [applyAspect, hasGeneratedAssets, orientation],
    );

    useEffect(() => {
      setVideoModelState(
        resolveAuthorizedVideoModel(
          videoModels,
          projectConfig.data?.video_model,
        ),
      );
    }, [projectConfig.data?.video_model, videoModels]);
    useEffect(() => {
      const persistedOrientation = orientationForAspectRatio(
        projectConfig.data?.aspect_ratio,
      );
      if (persistedOrientation && persistedOrientation !== orientation) {
        setOrientation(persistedOrientation);
      }
    }, [orientation, projectConfig.data?.aspect_ratio, setOrientation]);

    const handleVideoModelChange = useCallback(
      (model: string) => {
        if (
          !model ||
          resolveAuthorizedVideoModel(videoModels, model) !== model
        ) {
          return;
        }
        setVideoModelState(model);
        void updateProject
          .mutateAsync({ video_model: model })
          .catch(() => toast.error(t("common.error")));
      },
      [t, updateProject, videoModels],
    );

    const imageGenerationSelection =
      sketchSettingsResponse?.data.sketch_image_selection;
    const checkedBeatNumbers = useMemo(
      () =>
        selection.mode === "multi"
          ? [...selection.checked].sort((left, right) => left - right)
          : [],
      [selection],
    );
    const sketchPlan = useSketchPlanController({
      beats,
      checkedBeatNumbers,
      clearSelection,
      episodeNumber,
      project,
      sketchAspectRatio,
    });

    const firstBeatNumber = beats[0]?.beat_number ?? null;

    // Apply URL-backed selection only when no restored workbench state exists.
    useEffect(() => {
      const deepLinkKey =
        deepLinkBeat !== null && beats.length > 0
          ? `beat:${deepLinkBeat}`
          : targetSection !== null && firstBeatNumber !== null
            ? `sub:${targetSection}:${firstBeatNumber}`
            : null;

      if (deepLinkKey === null) {
        appliedDeepLinkRef.current = null;
        return;
      }
      if (appliedDeepLinkRef.current === deepLinkKey) return;
      appliedDeepLinkRef.current = deepLinkKey;
      if (selection.mode !== "none") return;

      if (deepLinkBeat !== null) selectSingle(deepLinkBeat);
      else if (firstBeatNumber !== null) selectSingle(firstBeatNumber);
    }, [
      beats.length,
      deepLinkBeat,
      firstBeatNumber,
      selectSingle,
      selection.mode,
      targetSection,
    ]);

    useEffect(() => {
      if (focusBeat === null) {
        focusAppliedRef.current = null;
        return;
      }
      if (beats.length === 0 || focusAppliedRef.current === focusBeat) return;
      focusAppliedRef.current = focusBeat;
      selectSingle(focusBeat);
      clearFocusBeat();
    }, [beats.length, clearFocusBeat, focusBeat, selectSingle]);

    useEffect(() => {
      if (selection.mode === "single") setBeat(selection.beatNum);
      else if (selection.mode === "none") setBeat(null);
    }, [selection, setBeat]);

    useEffect(() => {
      if (isLoading || selection.mode !== "single") return;
      if (
        beats.some((beat) => beat.beat_number === selection.beatNum)
      ) {
        return;
      }
      clearSelection();
    }, [beats, clearSelection, isLoading, selection]);

    const generateScript = queries.useGenerateScript(project, episodeNumber);
    const scriptTask = useTaskController({
      key: { taskType: TASK_TYPES.SCRIPT_WRITER, project, episode: episodeNumber },
      alsoReconcile: [TASK_TYPES.LITERAL_SCRIPT_WRITER],
      invalidateKeys: [
        queryKeys.script(project, episodeNumber),
        queryKeys.beats(project, episodeNumber),
        queryKeys.pipelineStatus(project),
      ],
    });

    const handleGenerate = async () => {
      if (!identityPlanReady) {
        toast.error(t("episode.script.identityRequired"));
        return;
      }
      if (!scenePlanReady) {
        toast.error(t("episode.script.sceneRequired"));
        return;
      }
      try {
        const response = await generateScript.mutateAsync({});
        if (response.ok === false) {
          toast.error(backendErrorToastMessage(response.error, t));
          return;
        }
        scriptTask.start({ scope: response.scope, taskId: response.task_id });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const [openingEpisodeFreezone, setOpeningEpisodeFreezone] = useState(false);
    const handleOpenEpisodeFreezone = useCallback(async () => {
      setOpeningEpisodeFreezone(true);
      try {
        await dependencies.openEpisodeFreezone(project, {
          scope: "episode",
          episode: episodeNumber,
        });
        toast.success(t("episode.workbench.actionPanel.episodeFreezoneOpened"));
      } catch {
        toast.error(
          t("episode.workbench.actionPanel.episodeFreezoneOpenFailed"),
        );
      } finally {
        setOpeningEpisodeFreezone(false);
      }
    }, [episodeNumber, project, t]);

    const handleRebuildPoolIndex = useCallback(async () => {
      try {
        const response = await rebuildPoolIndex.mutateAsync();
        toast.success(
          t("episode.workbench.pool.rebuildSuccess", {
            count: response.data.image_count,
          }),
        );
      } catch {
        toast.error(t("episode.workbench.pool.rebuildFailed"));
      }
    }, [rebuildPoolIndex, t]);

    const detailBeatDisplayNumber = useMemo(() => {
      if (selection.mode !== "single") return null;
      const index = beats.findIndex(
        (beat) => beat.beat_number === selection.beatNum,
      );
      return index >= 0 ? index + 1 : null;
    }, [beats, selection]);
    const spineTemplate: "narrated" | "drama" = isNarratedProject
      ? "narrated"
      : "drama";

    return {
      aspectRatio: orientation,
      beats,
      checkedBeatNumbers,
      clearSelection,
      detailBeatDisplayNumber,
      episodeNumber,
      generateDisabled:
        !identityPlanReady ||
        !scenePlanReady ||
        generateScript.isPending ||
        scriptTask.started,
      generatePending: generateScript.isPending || scriptTask.started,
      generateTitle: !identityPlanReady
        ? t("episode.script.identityRequired")
        : !scenePlanReady
          ? t("episode.script.sceneRequired")
          : undefined,
      handleCardClick,
      handleGenerate,
      handleOpenEpisodeFreezone,
      handleRebuildPoolIndex,
      handleVideoModelChange,
      imageGenerationSelection,
      isLoading,
      isNarratedProject,
      onCancelPendingAspect: () => setPendingAspect(null),
      onConfirmPendingAspect: () => {
        if (pendingAspect) applyAspect(pendingAspect);
        setPendingAspect(null);
      },
      openingEpisodeFreezone,
      pendingAspect,
      project,
      rebuildPoolIndexPending: rebuildPoolIndex.isPending,
      renderAspectMode: aspectSpecValue.renderAspect,
      selection,
      setSketchAspectRatio,
      sketchAspectRatio,
      sketchPlan,
      sketchStudio,
      spineTemplate,
      states,
      targetSection,
      toggleCheck,
      toggleView,
      toggles,
      videoModel,
    };
  };
}

export type BeatsPageController = ReturnType<
  ReturnType<typeof createUseBeatsPageController>
>;
