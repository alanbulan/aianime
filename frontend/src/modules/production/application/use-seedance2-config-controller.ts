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

import type { Beat } from "@/modules/narrative_planning/public";
import type { Seedance2PromptResponse } from "@/modules/production/application/ports";
import type { BeatVideoGenerationInput } from "@/modules/production/domain/beat-video-generation";
import type { VideoBackendOption } from "@/modules/production/domain/video-backend";
import type { GenerateSeedance2PromptCommand } from "@/modules/production/domain/video-generation";
import {
  clampDuration,
  getSeedance2ConfigSaveKey,
  grokVideoRatioOptionsForBackend,
  grokVideoResolutionOptionsForBackend,
  happyHorseRatioOptionsForBackend,
  happyHorseResolutionOptionsForBackend,
  isSeedance15ProBackend,
  isSeedance2ValueBackend,
  normalizeGrokVideoDraftForBackend,
  normalizeHappyHorseDraftForBackend,
  normalizeSeedance2DraftForBackend,
  normalizeSeedance2Resolution,
  parseSeedance2Config,
  sameSeedance2Config,
  seedance2DefaultRatioForProjectAspect,
  seedance2DurationBoundsForBackend,
  seedance2ResolutionOptionsForBackend,
  serializeGrokVideoConfig,
  serializeHappyHorseConfig,
  serializeSeedance2Config,
  type GrokVideoRatio,
  type HappyHorseRatio,
  type Seedance2ConfigDraft,
  type Seedance2DurationBounds,
  type Seedance2Resolution,
} from "@/modules/production/domain/video-config";
import {
  backendErrorToastMessage,
  BillingRuleNotConfiguredError,
} from "@/shared/api/errors";

const AUTOSAVE_DELAY_MS = 800;

interface PromptMutation {
  isPending: boolean;
  mutateAsync(
    command: GenerateSeedance2PromptCommand,
  ): Promise<Seedance2PromptResponse>;
}

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
  error?: unknown;
}

export interface Seedance2ConfigQueries {
  useGenerateSeedance2Prompt(
    project: string,
    episode: number,
  ): PromptMutation;
}

export interface Seedance2ConfigControllerDependencies {
  useGenerationCreditCost(
    kind: "feature",
    value: "seedance2_prompt",
  ): CreditCostQuery;
}

export interface Seedance2ConfigUpdateCommand {
  beatNum: number;
  data: { seedance2_config_json: string };
}

export interface Seedance2ConfigControllerOptions {
  backend: string;
  beat: Beat;
  episode: number;
  project: string;
  projectAspect: "2:3" | "16:9";
  selectedBackend?: VideoBackendOption;
  showGrokVideoConfig: boolean;
  showHappyHorseConfig: boolean;
  showSeedance2Config: boolean;
  refetchStatus?(): unknown;
  updateBeat(command: Seedance2ConfigUpdateCommand): Promise<unknown>;
}

export interface SaveSeedance2DraftOptions {
  silent?: boolean;
  suppressSuccess?: boolean;
}

export interface Seedance2ConfigController {
  config: Seedance2ConfigDraft;
  dirty: boolean;
  draft: Seedance2ConfigDraft;
  generationInput: BeatVideoGenerationInput;
  grokRatioOptions: readonly GrokVideoRatio[];
  grokResolutionOptions: readonly Seedance2Resolution[];
  happyHorseRatioOptions: readonly HappyHorseRatio[];
  happyHorseResolutionOptions: readonly Seedance2Resolution[];
  isSeedance15ProConfig: boolean;
  isValueStyle: boolean;
  promptCostDisplay: string | null;
  promptPending: boolean;
  ready: boolean;
  seedance2DurationBounds: Seedance2DurationBounds;
  seedance2ResolutionOptions: readonly Seedance2Resolution[];
  seedance15Duration: number;
  seedance15DurationBounds: Seedance2DurationBounds;
  seedance15Resolution: Seedance2Resolution;
  applyDraft(draft: Seedance2ConfigDraft): void;
  changeDraft(
    updater: (current: Seedance2ConfigDraft) => Seedance2ConfigDraft,
  ): void;
  generatePrompt(): Promise<void>;
  saveDraft(
    draft: Seedance2ConfigDraft,
    options?: SaveSeedance2DraftOptions,
  ): Promise<boolean>;
  setSeedance15Duration(duration: number): void;
  setSeedance15Resolution(resolution: Seedance2Resolution): void;
  updateDraft<K extends keyof Seedance2ConfigDraft>(
    key: K,
    value: Seedance2ConfigDraft[K],
  ): void;
  updateMode(mode: Seedance2ConfigDraft["mode"]): void;
}

export function createUseSeedance2ConfigController(
  queries: Seedance2ConfigQueries,
  dependencies: Seedance2ConfigControllerDependencies,
) {
  return function useSeedance2ConfigController(
    options: Seedance2ConfigControllerOptions,
  ): Seedance2ConfigController {
    const { t } = useTranslation();
    const showPromptConfig =
      options.showSeedance2Config ||
      options.showHappyHorseConfig ||
      options.showGrokVideoConfig;
    const isValueStyle =
      options.showSeedance2Config && isSeedance2ValueBackend(options.backend);
    const seedance2ResolutionOptions = useMemo(
      () => seedance2ResolutionOptionsForBackend(options.backend),
      [options.backend],
    );
    const seedance2DurationBounds = useMemo(
      () => seedance2DurationBoundsForBackend(options.selectedBackend),
      [options.selectedBackend],
    );
    const happyHorseResolutionOptions = useMemo(
      () => happyHorseResolutionOptionsForBackend(options.selectedBackend),
      [options.selectedBackend],
    );
    const happyHorseRatioOptions = useMemo(
      () => happyHorseRatioOptionsForBackend(options.selectedBackend),
      [options.selectedBackend],
    );
    const grokResolutionOptions = useMemo(
      () => grokVideoResolutionOptionsForBackend(options.selectedBackend),
      [options.selectedBackend],
    );
    const grokRatioOptions = useMemo(
      () => grokVideoRatioOptionsForBackend(options.selectedBackend),
      [options.selectedBackend],
    );
    const isSeedance15ProConfig =
      !options.showSeedance2Config && isSeedance15ProBackend(options.backend);
    const audioFloorSeconds =
      typeof options.beat.audio_duration_seconds === "number" &&
      options.beat.audio_duration_seconds > 0
        ? Math.ceil(options.beat.audio_duration_seconds)
        : null;
    const seedance15DurationBounds = useMemo<Seedance2DurationBounds>(
      () => ({
        min: Math.max(
          seedance2DurationBounds.min,
          audioFloorSeconds ?? 0,
        ),
        max: seedance2DurationBounds.max,
      }),
      [
        audioFloorSeconds,
        seedance2DurationBounds.max,
        seedance2DurationBounds.min,
      ],
    );
    const config = useMemo(
      () =>
        parseSeedance2Config(
          options.beat.seedance2_config_json,
          seedance2DefaultRatioForProjectAspect(options.projectAspect),
        ),
      [options.beat.seedance2_config_json, options.projectAspect],
    );
    const [draft, setDraft] = useState(config);
    const [seedance15Resolution, setSeedance15Resolution] =
      useState<Seedance2Resolution>("720p");
    const [seedance15Duration, setSeedance15Duration] = useState(
      seedance2DurationBounds.min,
    );
    const draftRef = useRef(config);
    const normalizedLegacyConfigRef = useRef("");
    const lastSavedConfigKeyRef = useRef("");
    const currentBeatNumberRef = useRef(options.beat.beat_number);
    currentBeatNumberRef.current = options.beat.beat_number;
    const generate = queries.useGenerateSeedance2Prompt(
      options.project,
      options.episode,
    );
    const promptCost = dependencies.useGenerationCreditCost(
      "feature",
      "seedance2_prompt",
    );
    const promptCostDisplay =
      promptCost.data?.data.display ??
      (promptCost.error instanceof BillingRuleNotConfiguredError
        ? t("common.billingRuleNotConfiguredShort")
        : null);

    const applyDraft = useCallback((next: Seedance2ConfigDraft) => {
      draftRef.current = next;
      setDraft(next);
    }, []);

    const changeDraft = useCallback(
      (
        updater: (current: Seedance2ConfigDraft) => Seedance2ConfigDraft,
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
        nextDraft: Seedance2ConfigDraft,
        saveOptions: SaveSeedance2DraftOptions = {},
      ): Promise<boolean> => {
        const nextConfig = options.showGrokVideoConfig
          ? serializeGrokVideoConfig(nextDraft, config)
          : options.showHappyHorseConfig
            ? serializeHappyHorseConfig(nextDraft, config)
            : serializeSeedance2Config(nextDraft, config);
        try {
          await options.updateBeat({
            beatNum: options.beat.beat_number,
            data: { seedance2_config_json: JSON.stringify(nextConfig) },
          });
          lastSavedConfigKeyRef.current = getSeedance2ConfigSaveKey(
            options.beat.beat_number,
            nextConfig,
          );
          void options.refetchStatus?.();
          if (!saveOptions.silent && !saveOptions.suppressSuccess) {
            toast.success(t("episode.workbench.video.seedance2Saved"));
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
        options.showGrokVideoConfig,
        options.showHappyHorseConfig,
        options.updateBeat,
        t,
      ],
    );

    useEffect(() => {
      if (!isSeedance15ProConfig) return;
      const fallbackResolution = seedance2ResolutionOptions.includes("720p")
        ? "720p"
        : seedance2ResolutionOptions[0];
      setSeedance15Resolution((current) =>
        seedance2ResolutionOptions.includes(current)
          ? current
          : normalizeSeedance2Resolution(fallbackResolution),
      );
      setSeedance15Duration(
        clampDuration(
          audioFloorSeconds ?? seedance15DurationBounds.min,
          seedance15DurationBounds,
        ),
      );
    }, [
      audioFloorSeconds,
      isSeedance15ProConfig,
      options.beat.beat_number,
      seedance15DurationBounds.max,
      seedance15DurationBounds.min,
      seedance2ResolutionOptions,
    ]);

    useEffect(() => {
      applyDraft(config);
      lastSavedConfigKeyRef.current = getSeedance2ConfigSaveKey(
        options.beat.beat_number,
        serializeSeedance2Config(config, config),
      );
    }, [applyDraft, config, options.beat.beat_number]);

    useEffect(() => {
      if (!showPromptConfig) return;
      const current = draftRef.current;
      const next = options.showGrokVideoConfig
        ? normalizeGrokVideoDraftForBackend(
            current,
            grokResolutionOptions,
            grokRatioOptions,
          )
        : options.showHappyHorseConfig
          ? normalizeHappyHorseDraftForBackend(
              current,
              happyHorseResolutionOptions,
              happyHorseRatioOptions,
            )
          : normalizeSeedance2DraftForBackend(
              current,
              seedance2ResolutionOptions,
              options.backend,
              isValueStyle,
            );
      if (!sameSeedance2Config(current, next)) applyDraft(next);
    }, [
      applyDraft,
      grokRatioOptions,
      grokResolutionOptions,
      happyHorseRatioOptions,
      happyHorseResolutionOptions,
      isValueStyle,
      options.backend,
      options.showGrokVideoConfig,
      options.showHappyHorseConfig,
      seedance2ResolutionOptions,
      showPromptConfig,
    ]);

    useEffect(() => {
      if (!showPromptConfig) return;
      const current = draftRef.current;
      const nextDuration = clampDuration(
        current.duration,
        seedance2DurationBounds,
      );
      if (current.duration !== nextDuration) {
        applyDraft({ ...current, duration: nextDuration });
      }
    }, [
      applyDraft,
      seedance2DurationBounds.max,
      seedance2DurationBounds.min,
      showPromptConfig,
    ]);

    useEffect(() => {
      if (!options.showSeedance2Config) return;
      const raw = config.raw;
      const shouldNormalizeMode =
        raw.mode === "first_frame" &&
        raw.mode_user_set !== true &&
        config.mode === "multimodal_reference";
      const shouldNormalizeAudio =
        raw.generate_audio === false && raw.generate_audio_user_set === true;
      if (!shouldNormalizeMode && !shouldNormalizeAudio) return;
      const key = `${options.beat.beat_number}:${String(
        options.beat.seedance2_config_json ?? "",
      )}`;
      if (normalizedLegacyConfigRef.current === key) return;
      normalizedLegacyConfigRef.current = key;
      void saveDraft(config, { silent: true });
    }, [
      config,
      options.beat.beat_number,
      options.beat.seedance2_config_json,
      options.showSeedance2Config,
      saveDraft,
    ]);

    const dirty = !sameSeedance2Config(draft, config);
    useEffect(() => {
      if (!showPromptConfig || !dirty) return;
      const nextConfig = options.showGrokVideoConfig
        ? serializeGrokVideoConfig(draft, config)
        : options.showHappyHorseConfig
          ? serializeHappyHorseConfig(draft, config)
          : serializeSeedance2Config(draft, config);
      const saveKey = getSeedance2ConfigSaveKey(
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
      options.showGrokVideoConfig,
      options.showHappyHorseConfig,
      saveDraft,
      showPromptConfig,
    ]);

    const generatePrompt = useCallback(async () => {
      const triggeredBeatNumber = options.beat.beat_number;
      try {
        const response = await generate.mutateAsync({
          beatNum: triggeredBeatNumber,
          manualPromptReference: draftRef.current.final_prompt,
          promptGuidance: draftRef.current.prompt_guidance,
        });
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.video.seedance2PromptGenerateFailed"),
          );
          return;
        }
        if (currentBeatNumberRef.current !== triggeredBeatNumber) {
          toast.success(
            t("episode.workbench.video.seedance2PromptGeneratedOtherBeat", {
              n: triggeredBeatNumber,
            }),
          );
          return;
        }
        const parsedDraft = parseSeedance2Config(
          response.data.seedance2_config_json,
          seedance2DefaultRatioForProjectAspect(options.projectAspect),
        );
        const nextDraft = options.showGrokVideoConfig
          ? normalizeGrokVideoDraftForBackend(
              parsedDraft,
              grokResolutionOptions,
              grokRatioOptions,
            )
          : options.showHappyHorseConfig
            ? normalizeHappyHorseDraftForBackend(
                parsedDraft,
                happyHorseResolutionOptions,
                happyHorseRatioOptions,
              )
            : parsedDraft;
        applyDraft(nextDraft);
        void options.refetchStatus?.();
        toast.success(
          options.showHappyHorseConfig || options.showGrokVideoConfig
            ? "主体提示词已优化"
            : t("episode.workbench.video.seedance2PromptGenerated"),
        );
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    }, [
      applyDraft,
      generate,
      grokRatioOptions,
      grokResolutionOptions,
      happyHorseRatioOptions,
      happyHorseResolutionOptions,
      options.beat.beat_number,
      options.projectAspect,
      options.refetchStatus,
      options.showGrokVideoConfig,
      options.showHappyHorseConfig,
      t,
    ]);

    const updateDraft = useCallback(
      <K extends keyof Seedance2ConfigDraft>(
        key: K,
        value: Seedance2ConfigDraft[K],
      ) => changeDraft((current) => ({ ...current, [key]: value })),
      [changeDraft],
    );

    const updateMode = useCallback(
      (mode: Seedance2ConfigDraft["mode"]) =>
        changeDraft((current) => ({
          ...current,
          mode,
          mode_user_set: true,
        })),
      [changeDraft],
    );

    const generationInput: BeatVideoGenerationInput = options.showSeedance2Config
      ? {
          backend: options.backend,
          beatNumber: options.beat.beat_number,
          kind: "seedance2",
          dirty,
          draft,
          isValueStyle,
          resolutionOptions: seedance2ResolutionOptions,
          sourceConfig: config,
        }
      : options.showHappyHorseConfig
        ? {
            backend: options.backend,
            beatNumber: options.beat.beat_number,
            kind: "happyhorse",
            draft,
            ratioOptions: happyHorseRatioOptions,
            resolutionOptions: happyHorseResolutionOptions,
            sourceConfig: config,
          }
        : options.showGrokVideoConfig
          ? {
              backend: options.backend,
              beatNumber: options.beat.beat_number,
              kind: "grok",
              draft,
              ratioOptions: grokRatioOptions,
              resolutionOptions: grokResolutionOptions,
              sourceConfig: config,
            }
          : {
              backend: options.backend,
              beatNumber: options.beat.beat_number,
              kind: "legacy",
              ...(isSeedance15ProConfig
                ? {
                    seedance15: {
                      duration: seedance15Duration,
                      resolution: seedance15Resolution,
                    },
                  }
                : {}),
            };

    return {
      config,
      dirty,
      draft,
      generationInput,
      grokRatioOptions,
      grokResolutionOptions,
      happyHorseRatioOptions,
      happyHorseResolutionOptions,
      isSeedance15ProConfig,
      isValueStyle,
      promptCostDisplay,
      promptPending: generate.isPending,
      ready: draft.final_prompt.trim().length > 0,
      seedance2DurationBounds,
      seedance2ResolutionOptions,
      seedance15Duration,
      seedance15DurationBounds,
      seedance15Resolution,
      applyDraft,
      changeDraft,
      generatePrompt,
      saveDraft,
      setSeedance15Duration,
      setSeedance15Resolution,
      updateDraft,
      updateMode,
    };
  };
}
