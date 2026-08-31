// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import type { Beat } from "@/modules/narrative_planning/public";
import type { VideoPromptOptimizationResponse } from "@/modules/production/application/ports";
import type { BeatVideoGenerationInput } from "@/modules/production/domain/beat-video-generation";
import type { VideoModelOption } from "@/modules/production/domain/video-model";
import type { GenerateVideoPromptCommand } from "@/modules/production/domain/video-generation";
import {
  TASK_TYPES,
  useTaskController,
} from "@/modules/task_execution/public";
import {
  clampDuration,
  getBeatVideoConfigSaveKey,
  normalizeReferenceVideoDraftForModel,
  normalizeAdvancedVideoDraftForModel,
  parseBeatVideoConfig,
  referenceVideoRatioOptionsForModel,
  referenceVideoResolutionOptionsForModel,
  sameBeatVideoConfig,
  defaultVideoRatioForProjectAspect,
  videoModeOptionsForModel,
  videoRatioOptionsForModel,
  videoResolutionOptionsForModel,
  videoDurationBoundsForModel,
  serializeReferenceVideoConfig,
  serializeBeatVideoConfig,
  type BeatVideoConfigDraft,
  type VideoDurationBounds,
  type VideoReferenceMode,
  type VideoAspectRatio,
  type VideoResolution,
} from "@/modules/production/domain/video-config";
import { backendErrorToastMessage } from "@/shared/api/errors";

const AUTOSAVE_DELAY_MS = 800;

interface PromptMutation {
  isPending: boolean;
  mutateAsync(
    command: GenerateVideoPromptCommand,
  ): Promise<VideoPromptOptimizationResponse>;
}

export interface BeatVideoConfigQueries {
  useGenerateVideoPrompt(
    project: string,
    episode: number,
  ): PromptMutation;
}

export interface BeatVideoConfigUpdateCommand {
  beatNum: number;
  data: { video_config_json: string };
}

export interface BeatVideoConfigControllerOptions {
  model: string;
  beat: Beat;
  episode: number;
  project: string;
  projectAspect: "2:3" | "16:9";
  selectedModel?: VideoModelOption;
  showAdvancedVideoConfig: boolean;
  showReferenceVideoConfig: boolean;
  refetchStatus?(): unknown;
  updateBeat(command: BeatVideoConfigUpdateCommand): Promise<unknown>;
}

export interface SaveBeatVideoDraftOptions {
  silent?: boolean;
  suppressSuccess?: boolean;
}

export interface BeatVideoConfigController {
  config: BeatVideoConfigDraft;
  dirty: boolean;
  draft: BeatVideoConfigDraft;
  generationInput: BeatVideoGenerationInput;
  referenceRatioOptions: readonly VideoAspectRatio[];
  referenceResolutionOptions: readonly VideoResolution[];
  referenceResolutionMaxSeconds: Readonly<Record<string, number>>;
  supportsSceneOptimize: boolean;
  promptPending: boolean;
  ready: boolean;
  videoDurationBounds: VideoDurationBounds;
  videoModeOptions: readonly VideoReferenceMode[];
  videoRatioOptions: readonly VideoAspectRatio[];
  videoResolutionOptions: readonly VideoResolution[];
  applyDraft(draft: BeatVideoConfigDraft): void;
  changeDraft(
    updater: (current: BeatVideoConfigDraft) => BeatVideoConfigDraft,
  ): void;
  generatePrompt(): Promise<void>;
  saveDraft(
    draft: BeatVideoConfigDraft,
    options?: SaveBeatVideoDraftOptions,
  ): Promise<boolean>;
  updateDraft<K extends keyof BeatVideoConfigDraft>(
    key: K,
    value: BeatVideoConfigDraft[K],
  ): void;
  updateMode(mode: BeatVideoConfigDraft["mode"]): void;
}

export function createUseBeatVideoConfigController(
  queries: BeatVideoConfigQueries,
) {
  return function useBeatVideoConfigController(
    options: BeatVideoConfigControllerOptions,
  ): BeatVideoConfigController {
    const { t } = useTranslation();
    const showPromptConfig =
      options.showAdvancedVideoConfig || options.showReferenceVideoConfig;
    const supportsSceneOptimize = Boolean(
      options.showAdvancedVideoConfig &&
        options.selectedModel?.sceneOptimizeOptions?.length,
    );
    const modelResolutionOptions = useMemo(
      () =>
        videoResolutionOptionsForModel(options.model, options.selectedModel),
      [options.model, options.selectedModel],
    );
    const videoModeOptions = useMemo(
      () => videoModeOptionsForModel(options.selectedModel),
      [options.selectedModel],
    );
    const videoRatioOptions = useMemo(
      () => videoRatioOptionsForModel(options.selectedModel),
      [options.selectedModel],
    );
    const videoDurationBounds = useMemo(
      () => videoDurationBoundsForModel(options.selectedModel),
      [options.selectedModel],
    );
    const referenceResolutionOptions = useMemo(
      () => referenceVideoResolutionOptionsForModel(options.selectedModel),
      [options.selectedModel],
    );
    const referenceRatioOptions = useMemo(
      () => referenceVideoRatioOptionsForModel(options.selectedModel),
      [options.selectedModel],
    );
    const config = useMemo(
      () =>
        parseBeatVideoConfig(
          options.beat.video_config_json,
          defaultVideoRatioForProjectAspect(options.projectAspect),
        ),
      [options.beat.video_config_json, options.projectAspect],
    );
    const [draft, setDraft] = useState(config);
    const videoResolutionOptions = modelResolutionOptions;
    const draftRef = useRef(config);
    const lastSavedConfigKeyRef = useRef("");
    const generate = queries.useGenerateVideoPrompt(
      options.project,
      options.episode,
    );
    const generationTask = useTaskController({
      key: {
        taskType: TASK_TYPES.VIDEO_PROMPT_OPTIMIZATION,
        project: options.project,
        episode: options.episode,
        beatNum: options.beat.beat_number,
      },
      invalidateKeys: [
        queryKeys.beats(options.project, options.episode),
        queryKeys.videoReferenceBeatStatus(
          options.project,
          options.episode,
          options.beat.beat_number,
        ),
      ],
      onComplete: () => {
        void options.refetchStatus?.();
        toast.success(t("episode.workbench.video.videoReferencePromptGenerated"));
      },
      onError: (error) => toast.error(error),
    });

    const applyDraft = useCallback((next: BeatVideoConfigDraft) => {
      draftRef.current = next;
      setDraft(next);
    }, []);

    const changeDraft = useCallback(
      (
        updater: (current: BeatVideoConfigDraft) => BeatVideoConfigDraft,
      ) => {
        setDraft((current) => {
          const next = updater(current);
          draftRef.current = next;
          return next;
        });
      },
      [],
    );

    const saveDraft = useCallback(
      async (
        nextDraft: BeatVideoConfigDraft,
        saveOptions: SaveBeatVideoDraftOptions = {},
      ): Promise<boolean> => {
        const nextConfig = options.showReferenceVideoConfig
          ? serializeReferenceVideoConfig(nextDraft, config)
          : serializeBeatVideoConfig(nextDraft, config);
        try {
          await options.updateBeat({
            beatNum: options.beat.beat_number,
            data: { video_config_json: JSON.stringify(nextConfig) },
          });
          lastSavedConfigKeyRef.current = getBeatVideoConfigSaveKey(
            options.beat.beat_number,
            nextConfig,
          );
          void options.refetchStatus?.();
          if (!saveOptions.silent && !saveOptions.suppressSuccess) {
            toast.success(t("episode.workbench.video.videoReferenceSaved"));
          }
          return true;
        } catch {
          if (!saveOptions.silent) {
            toast.error(t("episode.workbench.video.regenFailed"));
          }
          return false;
        }
      },
      [
        config,
        options.beat.beat_number,
        options.refetchStatus,
        options.showReferenceVideoConfig,
        options.updateBeat,
        t,
      ],
    );

    useEffect(() => {
      applyDraft(config);
      lastSavedConfigKeyRef.current = getBeatVideoConfigSaveKey(
        options.beat.beat_number,
        serializeBeatVideoConfig(config, config),
      );
    }, [applyDraft, config, options.beat.beat_number]);

    useEffect(() => {
      if (!showPromptConfig) return;
      const current = draftRef.current;
      const next = options.showReferenceVideoConfig
        ? normalizeReferenceVideoDraftForModel(
            current,
            referenceResolutionOptions,
            referenceRatioOptions,
            options.selectedModel?.resolutionMaxSeconds,
          )
        : normalizeAdvancedVideoDraftForModel(
            current,
            videoResolutionOptions,
            options.model,
            supportsSceneOptimize,
            videoModeOptions,
            videoRatioOptions,
          );
      if (!sameBeatVideoConfig(current, next)) applyDraft(next);
    }, [
      applyDraft,
      options.model,
      options.selectedModel?.resolutionMaxSeconds,
      options.showReferenceVideoConfig,
      referenceRatioOptions,
      referenceResolutionOptions,
      videoModeOptions,
      videoRatioOptions,
      videoResolutionOptions,
      showPromptConfig,
      supportsSceneOptimize,
    ]);

    useEffect(() => {
      if (!showPromptConfig) return;
      const current = draftRef.current;
      const nextDuration = clampDuration(
        current.duration,
        videoDurationBounds,
      );
      if (current.duration !== nextDuration) {
        applyDraft({ ...current, duration: nextDuration });
      }
    }, [
      applyDraft,
      videoDurationBounds.max,
      videoDurationBounds.min,
      showPromptConfig,
    ]);

    const dirty = !sameBeatVideoConfig(draft, config);
    useEffect(() => {
      if (!showPromptConfig || !dirty) return;
      const nextConfig = options.showReferenceVideoConfig
        ? serializeReferenceVideoConfig(draft, config)
        : serializeBeatVideoConfig(draft, config);
      const saveKey = getBeatVideoConfigSaveKey(
        options.beat.beat_number,
        nextConfig,
      );
      if (lastSavedConfigKeyRef.current === saveKey) return;
      const timer = window.setTimeout(() => {
        void saveDraft(draftRef.current, { suppressSuccess: true });
      }, AUTOSAVE_DELAY_MS);
      return () => window.clearTimeout(timer);
    }, [
      config,
      dirty,
      draft,
      options.beat.beat_number,
      options.showReferenceVideoConfig,
      saveDraft,
      showPromptConfig,
    ]);

    const generatePrompt = useCallback(async () => {
      try {
        const currentDraft = draftRef.current;
        const currentPrompt = currentDraft.final_prompt.trim();
        const generatedPrompt = config.final_prompt.trim();
        const manualPromptReference =
          config.prompt_source === "generated" &&
          currentPrompt === generatedPrompt
            ? undefined
            : currentDraft.final_prompt;
        const response = await generate.mutateAsync({
          beatNum: options.beat.beat_number,
          ...(manualPromptReference === undefined
            ? {}
            : { manualPromptReference }),
          promptGuidance: currentDraft.prompt_guidance,
        });
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.video.videoReferencePromptGenerateFailed"),
          );
          return;
        }
        generationTask.start({ scope: response.scope });
        toast.success(response.message);
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    }, [
      config.final_prompt,
      config.prompt_source,
      generate,
      generationTask,
      options.beat.beat_number,
      t,
    ]);

    const updateDraft = useCallback(
      <K extends keyof BeatVideoConfigDraft>(
        key: K,
        value: BeatVideoConfigDraft[K],
      ) => changeDraft((current) => ({ ...current, [key]: value })),
      [changeDraft],
    );

    const updateMode = useCallback(
      (mode: BeatVideoConfigDraft["mode"]) =>
        changeDraft((current) => ({
          ...current,
          mode,
        })),
      [changeDraft],
    );

    const generationInput: BeatVideoGenerationInput = options.showAdvancedVideoConfig
      ? {
          model: options.selectedModel?.apiModel ?? options.model,
          ...(options.selectedModel?.routeSelector
            ? { modelSelector: options.selectedModel.routeSelector }
            : {}),
          beatNumber: options.beat.beat_number,
          kind: "advanced",
          dirty,
          draft,
          supportsSceneOptimize,
          modeOptions: videoModeOptions,
          ratioOptions: videoRatioOptions,
          resolutionOptions: videoResolutionOptions,
          sizeOptions: options.selectedModel?.sizeOptions,
          sourceConfig: config,
        }
      : options.showReferenceVideoConfig
        ? {
            model: options.selectedModel?.apiModel ?? options.model,
            ...(options.selectedModel?.routeSelector
              ? { modelSelector: options.selectedModel.routeSelector }
              : {}),
            beatNumber: options.beat.beat_number,
            kind: "reference",
            draft,
            ratioOptions: referenceRatioOptions,
            resolutionOptions: referenceResolutionOptions,
            resolutionMaxSeconds: options.selectedModel?.resolutionMaxSeconds,
            sourceConfig: config,
          }
        : {
            model: options.selectedModel?.apiModel ?? options.model,
            ...(options.selectedModel?.routeSelector
              ? { modelSelector: options.selectedModel.routeSelector }
              : {}),
            beatNumber: options.beat.beat_number,
            kind: "basic",
          };

    return {
      config,
      dirty,
      draft,
      generationInput,
      referenceRatioOptions,
      referenceResolutionOptions,
      referenceResolutionMaxSeconds:
        options.selectedModel?.resolutionMaxSeconds ?? {},
      supportsSceneOptimize,
      promptPending: generate.isPending || generationTask.started,
      ready: draft.final_prompt.trim().length > 0,
      videoDurationBounds,
      videoModeOptions,
      videoRatioOptions,
      videoResolutionOptions,
      applyDraft,
      changeDraft,
      generatePrompt,
      saveDraft,
      updateDraft,
      updateMode,
    };
  };
}
