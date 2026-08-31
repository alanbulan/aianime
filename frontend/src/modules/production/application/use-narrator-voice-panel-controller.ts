// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import { resolveAudioModelSelector } from "@/modules/model_usage/public";
import type { ProductionDataResponse } from "@/modules/production/application/ports";
import type {
  GenerateNarratorVoiceDesignCommand,
  GenerateNarratorVoicePresetCommand,
  NarratorVoiceDesignConfig,
  NarratorVoicePresetModelOption,
  NarratorVoicePresetOption,
  NarratorVoiceStatusData,
} from "@/modules/production/domain/narrator-voice";
import {
  TASK_TYPES,
  useTaskController,
} from "@/modules/task_execution/public";
import type { VoiceRecorder } from "@/shared/voice-recording/voice-recorder";
import {
  resolvePresetVoiceModelSelection,
  resolveVoiceDesignModelSelection,
  type AccountVoiceOption,
  type VoiceSourceType,
} from "@/shared/voice-source/voice-source";

const DEFAULT_PRESET_SAMPLE_TEXT = "你好，我会用这条声线为整部作品讲述故事。";

export type NarratorVoicePresetAvailability =
  | "ready"
  | "loading"
  | "desktopRequired"
  | "routeMissing"
  | "cloudCatalogRequired"
  | "catalogMissing"
  | "voicesMissing"
  | "error";

interface NarratorVoiceQuery<T> {
  data?: ProductionDataResponse<T>;
  isLoading: boolean;
}

interface NarratorVoiceMutation<TInput> {
  isPending: boolean;
  mutateAsync(input: TInput): Promise<unknown>;
}

interface DeleteNarratorVoiceMutation {
  isPending: boolean;
  mutateAsync(): Promise<unknown>;
}

export interface NarratorVoicePanelQueries {
  useNarratorVoiceStatus(
    project: string,
  ): NarratorVoiceQuery<NarratorVoiceStatusData>;
  useUploadNarratorVoice(project: string): NarratorVoiceMutation<File>;
  useRecordNarratorVoice(project: string): NarratorVoiceMutation<string>;
  useGenerateNarratorVoicePreset(
    project: string,
  ): NarratorVoiceMutation<GenerateNarratorVoicePresetCommand>;
  useDesignNarratorVoice(
    project: string,
  ): NarratorVoiceMutation<GenerateNarratorVoiceDesignCommand>;
  useBindNarratorVoice(project: string): NarratorVoiceMutation<string>;
  useTrimNarratorVoice(
    project: string,
  ): NarratorVoiceMutation<{
    startSeconds: number;
    durationSeconds: number;
  }>;
  useDeleteNarratorVoice(project: string): DeleteNarratorVoiceMutation;
}

export interface NarratorVoicePanelControllerDependencies {
  createVoiceRecorder(): VoiceRecorder;
}

export interface NarratorVoicePanelControllerOptions {
  project: string;
  allowFirstPersonProjectVoice?: boolean;
  presetVoiceAvailability?: NarratorVoicePresetAvailability;
  presetVoiceDefaultSelector?: string;
  presetVoiceModels?: readonly NarratorVoicePresetModelOption[];
  designVoiceAvailability?: NarratorVoicePresetAvailability;
  designVoiceDefaultSelector?: string;
  designVoiceOptions?: readonly NarratorVoiceDesignModelOption[];
  loadVoiceOptions(project: string): Promise<AccountVoiceOption[]>;
}

export interface NarratorVoiceDesignModelOption {
  config: NarratorVoiceDesignConfig;
  isDefault?: boolean;
  label: string;
  value: string;
}

export interface NarratorVoicePanelController {
  aiSampleText: string;
  aiVoiceOpen: boolean;
  audioSrc: string | null;
  canEdit: boolean;
  accountVoiceFailed: boolean;
  accountVoiceLoading: boolean;
  accountVoiceOptions: readonly AccountVoiceOption[];
  bindPending: boolean;
  explanation?: string | null;
  hasVoice: boolean;
  heading?: string | null;
  pending: boolean;
  voiceSourceType: VoiceSourceType;
  designGenerationPending: boolean;
  designLanguage: string;
  designName: string;
  designPreviewText: string;
  designPrompt: string;
  designVoiceAvailability: NarratorVoicePresetAvailability;
  designVoiceConfig: NarratorVoiceDesignConfig | null;
  designVoiceModelLabel: string;
  designVoiceModelSelector: string;
  designVoiceOptions: readonly NarratorVoiceDesignModelOption[];
  presetGenerationPending: boolean;
  presetVoice: string;
  presetVoiceAcceptsVoice: boolean;
  presetVoiceAllowsCustom: boolean;
  presetVoiceRequiresVoice: boolean;
  presetVoiceAvailability: NarratorVoicePresetAvailability;
  presetVoiceModelLabel: string;
  presetVoiceModelSelector: string;
  presetVoiceModels: readonly NarratorVoicePresetModelOption[];
  presetVoiceOptions: readonly NarratorVoicePresetOption[];
  recordedDataUrl: string;
  recording: boolean;
  recordOpen: boolean;
  recordPending: boolean;
  recordStatus: string;
  trimDuration: string;
  trimOpen: boolean;
  trimPending: boolean;
  trimStart: string;
  onApplyTrim(): Promise<void>;
  onAiSampleTextChange(value: string): void;
  onAiVoiceOpenChange(open: boolean): void;
  onDelete(): Promise<void>;
  onDesignLanguageChange(value: string): void;
  onDesignVoiceModelChange(value: string): void;
  onDesignNameChange(value: string): void;
  onDesignPreviewTextChange(value: string): void;
  onDesignPromptChange(value: string): void;
  onGenerateDesignedVoice(): Promise<void>;
  onVoiceSourceTypeChange(value: VoiceSourceType): void;
  onGeneratePresetVoice(): Promise<void>;
  onOpenVoiceGenerator(): void;
  onOpenRecord(): void;
  onOpenTrim(): void;
  onRecordOpenChange(open: boolean): void;
  onSaveRecording(): Promise<void>;
  onBindAccountVoice(voiceId: string): Promise<void>;
  onPresetVoiceModelChange(selector: string): void;
  onPresetVoiceChange(voice: string): void;
  onStartRecording(): Promise<void>;
  onStopRecording(): void;
  onTrimDurationChange(value: string): void;
  onTrimOpenChange(open: boolean): void;
  onTrimStartChange(value: string): void;
  onUpload(file: File): Promise<void>;
}

function isOkResponse<T>(response: unknown): response is { ok: true; data: T } {
  return Boolean(
    response &&
      typeof response === "object" &&
      (response as { ok?: unknown }).ok === true,
  );
}

function isErrorResponse(
  response: unknown,
): response is { ok: false; error?: string } {
  return Boolean(
    response &&
      typeof response === "object" &&
      (response as { ok?: unknown }).ok === false,
  );
}

function isQueuedVoiceResponse(
  response: unknown,
): response is {
  ok: true;
  message: string;
  scope?: string;
} {
  return Boolean(
    response &&
      typeof response === "object" &&
      (response as { ok?: unknown }).ok === true &&
      typeof (response as { message?: unknown }).message === "string",
  );
}

export function createUseNarratorVoicePanelController(
  queries: NarratorVoicePanelQueries,
  dependencies: NarratorVoicePanelControllerDependencies,
) {
  return function useNarratorVoicePanelController(
    options: NarratorVoicePanelControllerOptions,
  ): NarratorVoicePanelController {
    const { t } = useTranslation();
    const statusQuery = queries.useNarratorVoiceStatus(options.project);
    const uploadVoice = queries.useUploadNarratorVoice(options.project);
    const recordVoice = queries.useRecordNarratorVoice(options.project);
    const generatePresetVoice = queries.useGenerateNarratorVoicePreset(
      options.project,
    );
    const designNarratorVoice = queries.useDesignNarratorVoice(options.project);
    const bindNarratorVoice = queries.useBindNarratorVoice(options.project);
    const trimVoice = queries.useTrimNarratorVoice(options.project);
    const deleteVoice = queries.useDeleteNarratorVoice(options.project);
    const recorderRef = useRef<VoiceRecorder | null>(null);
    if (recorderRef.current === null) {
      recorderRef.current = dependencies.createVoiceRecorder();
    }
    const recorder = recorderRef.current;

    const [recordOpen, setRecordOpen] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recordedDataUrl, setRecordedDataUrl] = useState("");
    const [recordStatus, setRecordStatus] = useState("");
    const [trimOpen, setTrimOpen] = useState(false);
    const [trimStart, setTrimStart] = useState("0");
    const [trimDuration, setTrimDuration] = useState("4");
    const [aiVoiceOpen, setAiVoiceOpen] = useState(false);
    const [voiceSourceType, setVoiceSourceType] =
      useState<VoiceSourceType>("voice_design");
    const [presetVoiceModelSelector, setPresetVoiceModelSelector] = useState("");
    const [presetVoice, setPresetVoice] = useState("");
    const [aiSampleText, setAiSampleText] = useState(
      DEFAULT_PRESET_SAMPLE_TEXT,
    );
    const [designName, setDesignName] = useState("");
    const [designPrompt, setDesignPrompt] = useState("");
    const [designPreviewText, setDesignPreviewText] = useState(
      DEFAULT_PRESET_SAMPLE_TEXT,
    );
    const [designLanguage, setDesignLanguage] = useState("");
    const [designVoiceModelSelector, setDesignVoiceModelSelector] = useState("");

    useEffect(() => () => recorder.dispose(), [recorder]);

    const status = statusQuery.data?.data;
    const canEdit = Boolean(
      status &&
        (options.allowFirstPersonProjectVoice || !status.is_first_person),
    );
    const hasVoice = Boolean(status?.reference_path);
    const accountVoices = useQuery({
      queryKey: queryKeys.characterVoiceLibrary(options.project),
      queryFn: () => options.loadVoiceOptions(options.project),
      enabled: Boolean(options.project && aiVoiceOpen && canEdit),
      staleTime: 30_000,
    });
    const presetVoiceTask = useTaskController({
      key: {
        taskType: TASK_TYPES.FREEZONE_VOICE_PRESET,
        project: options.project,
        episode: 0,
        scope: "project_narrator",
      },
      invalidateKeys: [
        queryKeys.narratorVoice(options.project),
        queryKeys.videoReferenceBeatStatusProject(options.project),
        queryKeys.audioGenerationPlans(options.project),
        queryKeys.characterVoiceLibrary(options.project),
      ],
      showCompleteToast: false,
      onComplete: () => {
        setAiVoiceOpen(false);
        toast.success(
          t("episode.workbench.video.narratorVoicePresetGenerated"),
        );
      },
      onError: (error) => toast.error(error),
    });
    const designVoiceTask = useTaskController({
      key: {
        taskType: TASK_TYPES.FREEZONE_VOICE_DESIGN,
        project: options.project,
        episode: 0,
        scope: "project_narrator",
      },
      invalidateKeys: [
        queryKeys.narratorVoice(options.project),
        queryKeys.videoReferenceBeatStatusProject(options.project),
        queryKeys.audioGenerationPlans(options.project),
        queryKeys.characterVoiceLibrary(options.project),
      ],
      showCompleteToast: false,
      onComplete: () => {
        setAiVoiceOpen(false);
        toast.success(t("episode.workbench.video.narratorVoiceDesigned"));
      },
      onError: (error) => toast.error(error),
    });
    const pending =
      uploadVoice.isPending ||
      recordVoice.isPending ||
      generatePresetVoice.isPending ||
      designNarratorVoice.isPending ||
      presetVoiceTask.started ||
      designVoiceTask.started ||
      bindNarratorVoice.isPending ||
      trimVoice.isPending ||
      deleteVoice.isPending;
    const presetVoiceModels = options.presetVoiceModels ?? [];
    const defaultPresetVoiceSelector = resolveAudioModelSelector(
      presetVoiceModels,
      options.presetVoiceDefaultSelector,
    );
    const presetVoiceModel =
      presetVoiceModels.find(
        (option) => option.value === presetVoiceModelSelector,
      ) ?? null;
    const presetVoiceOptions = presetVoiceModel?.voices ?? [];
    const presetVoiceAcceptsVoice =
      presetVoiceModel?.acceptsVoice !== false;
    const presetVoiceAllowsCustom =
      presetVoiceModel?.allowsCustomVoice === true;
    const presetVoiceRequiresVoice =
      presetVoiceModel?.requiresVoice === true;
    const designVoiceOptions = options.designVoiceOptions ?? [];
    const defaultDesignVoiceSelector = resolveAudioModelSelector(
      designVoiceOptions,
      options.designVoiceDefaultSelector,
    );
    const designVoiceModel =
      designVoiceOptions.find(
        (option) => option.value === designVoiceModelSelector,
      ) ?? null;
    const designVoiceConfig = designVoiceModel?.config ?? null;

    useEffect(() => {
      if (
        !aiVoiceOpen ||
        presetVoiceModels.some(
          (option) => option.value === presetVoiceModelSelector,
        ) ||
        !defaultPresetVoiceSelector
      ) {
        return;
      }
      setPresetVoiceModelSelector(defaultPresetVoiceSelector);
    }, [
      aiVoiceOpen,
      defaultPresetVoiceSelector,
      presetVoiceModelSelector,
      presetVoiceModels,
    ]);

    useEffect(() => {
      if (!aiVoiceOpen || presetVoice || presetVoiceOptions.length === 0) {
        return;
      }
      const defaultVoice =
        presetVoiceOptions.find((option) => option.isDefault) ??
        presetVoiceOptions[0];
      setPresetVoice(defaultVoice?.value ?? "");
    }, [aiVoiceOpen, presetVoice, presetVoiceOptions]);

    const finishMutation = <T,>(
      response: unknown,
      successMessage: string,
    ): boolean => {
      if (isErrorResponse(response)) {
        toast.error(response.error || t("common.error"));
        return false;
      }
      if (isOkResponse<T>(response)) {
        toast.success(successMessage);
        return true;
      }
      toast.error(t("common.error"));
      return false;
    };

    const upload = async (file: File) => {
      try {
        const response = await uploadVoice.mutateAsync(file);
        finishMutation(
          response,
          t("episode.workbench.video.narratorVoiceUploaded"),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const openVoiceGenerator = () => {
      const defaultPresetModel = presetVoiceModels.find(
        (option) => option.value === defaultPresetVoiceSelector,
      );
      const defaultVoice =
        defaultPresetModel?.voices.find((option) => option.isDefault) ??
        defaultPresetModel?.voices[0];
      setPresetVoiceModelSelector(defaultPresetVoiceSelector);
      setPresetVoice(defaultVoice?.value ?? "");
      setAiSampleText(DEFAULT_PRESET_SAMPLE_TEXT);
      setVoiceSourceType(
        options.designVoiceAvailability === "ready"
          ? "voice_design"
          : options.presetVoiceAvailability === "ready"
            ? "preset_voice"
            : "account_voice",
      );
      setDesignName(
        t("episode.workbench.video.narratorVoiceDesignDefaultName"),
      );
      setDesignPrompt("");
      setDesignPreviewText(DEFAULT_PRESET_SAMPLE_TEXT);
      setDesignVoiceModelSelector(defaultDesignVoiceSelector);
      const defaultDesignVoice = designVoiceOptions.find(
        (option) => option.value === defaultDesignVoiceSelector,
      );
      setDesignLanguage(defaultDesignVoice?.config.defaultLanguage ?? "");
      setAiVoiceOpen(true);
    };

    const changeDesignVoiceModel = (selector: string) => {
      const selection = resolveVoiceDesignModelSelection(
        designVoiceOptions,
        selector,
      );
      if (!selection) return;
      setDesignVoiceModelSelector(selection.selector);
      setDesignLanguage(selection.language);
    };

    const changePresetVoiceModel = (selector: string) => {
      const selection = resolvePresetVoiceModelSelection(
        presetVoiceModels,
        selector,
      );
      if (!selection) return;
      setPresetVoiceModelSelector(selection.selector);
      setPresetVoice(selection.voice);
    };

    const generatePreset = async () => {
      if (
        !presetVoiceModel ||
        !presetVoiceModelSelector.trim() ||
        (presetVoiceRequiresVoice && !presetVoice) ||
        !aiSampleText.trim()
      ) {
        toast.error(
          t("episode.workbench.video.narratorVoicePresetInputRequired"),
        );
        return;
      }
      try {
        const selectedOption = presetVoiceOptions.find(
          (option) => option.value === presetVoice,
        );
        const response = await generatePresetVoice.mutateAsync({
          name:
            selectedOption?.label ||
            presetVoice.trim() ||
            presetVoiceModel.label,
          model_selector: presetVoiceModelSelector.trim(),
          text: aiSampleText.trim(),
          voice: presetVoice.trim(),
        });
        if (isErrorResponse(response)) {
          toast.error(response.error || t("common.error"));
          return;
        }
        if (!isQueuedVoiceResponse(response)) {
          toast.error(t("common.error"));
          return;
        }
        presetVoiceTask.start({ scope: response.scope });
        toast.success(response.message);
      } catch {
        toast.error(t("common.error"));
      }
    };

    const generateDesignedVoice = async () => {
      const prompt = designPrompt.trim();
      const previewText = designPreviewText.trim();
      const modelSelector = designVoiceModelSelector.trim();
      if (
        options.designVoiceAvailability !== "ready" ||
        !designVoiceConfig ||
        !modelSelector ||
        !prompt ||
        !previewText ||
        !designLanguage
      ) {
        toast.error(
          t("episode.workbench.video.narratorVoiceDesignInputRequired"),
        );
        return;
      }
      if (
        prompt.length < designVoiceConfig.promptMinLength ||
        prompt.length > designVoiceConfig.promptMaxLength ||
        previewText.length < designVoiceConfig.previewTextMinLength ||
        previewText.length > designVoiceConfig.previewTextMaxLength
      ) {
        toast.error(
          t("episode.workbench.video.narratorVoiceDesignInputTooLong"),
        );
        return;
      }
      const responseFormat = designVoiceConfig.defaultResponseFormat;
      const sampleRate = designVoiceConfig.defaultSampleRate;
      if (
        sampleRate === null ||
        !designVoiceConfig.languages.includes(designLanguage) ||
        responseFormat !== "wav" &&
        responseFormat !== "mp3"
      ) {
        toast.error(t("common.error"));
        return;
      }
      try {
        const response = await designNarratorVoice.mutateAsync({
          name: designName.trim(),
          model_selector: modelSelector,
          voice_prompt: prompt,
          preview_text: previewText,
          preferred_name: designVoiceConfig.preferredName,
          language: designLanguage,
          sample_rate: sampleRate,
          response_format: responseFormat,
        });
        if (isErrorResponse(response)) {
          toast.error(response.error || t("common.error"));
          return;
        }
        if (!isQueuedVoiceResponse(response)) {
          toast.error(t("common.error"));
          return;
        }
        designVoiceTask.start({ scope: response.scope });
        toast.success(response.message);
      } catch {
        toast.error(t("common.error"));
      }
    };

    const openRecord = () => {
      setRecordedDataUrl("");
      setRecordStatus(
        t("episode.workbench.video.narratorVoiceRecordReady"),
      );
      setRecordOpen(true);
    };

    const startRecording = async () => {
      if (recorder.availability() === "unavailable") {
        toast.error(
          t("episode.workbench.video.narratorVoiceRecordUnavailable"),
        );
        return;
      }

      try {
        setRecordedDataUrl("");
        setRecordStatus(
          t("episode.workbench.video.narratorVoiceRequestingMic"),
        );
        await recorder.start({
          onComplete: ({ dataUrl, durationSeconds }) => {
            setRecordedDataUrl(dataUrl);
            setRecordStatus(
              t("episode.workbench.video.narratorVoiceRecorded", {
                seconds: durationSeconds.toFixed(1),
              }),
            );
            setRecording(false);
          },
          onFailure: () => {
            setRecordStatus(
              t("episode.workbench.video.narratorVoiceRecordFailed"),
            );
            setRecording(false);
          },
        });
        setRecording(true);
        setRecordStatus(
          t("episode.workbench.video.narratorVoiceRecording"),
        );
      } catch {
        setRecording(false);
        setRecordStatus(
          t("episode.workbench.video.narratorVoiceRecordFailed"),
        );
        toast.error(
          t("episode.workbench.video.narratorVoiceRecordFailed"),
        );
      }
    };

    const saveRecording = async () => {
      if (!recordedDataUrl) return;
      try {
        const response = await recordVoice.mutateAsync(recordedDataUrl);
        if (
          finishMutation(
            response,
            t("episode.workbench.video.narratorVoiceSaved"),
          )
        ) {
          setRecordOpen(false);
        }
      } catch {
        toast.error(t("common.error"));
      }
    };

    const closeRecordDialog = (open: boolean) => {
      if (open) return;
      if (recording) recorder.stop();
      else recorder.release();
      setRecordOpen(false);
    };

    const bindAccountVoice = async (voiceId: string) => {
      if (!voiceId) return;
      try {
        const response = await bindNarratorVoice.mutateAsync(voiceId);
        if (
          finishMutation(
            response,
            t("episode.workbench.video.narratorVoiceAccountBound"),
          )
        ) {
          setAiVoiceOpen(false);
        }
      } catch {
        toast.error(t("common.error"));
      }
    };

    const clearNarratorVoice = async () => {
      try {
        const response = await deleteVoice.mutateAsync();
        finishMutation(
          response,
          t("episode.workbench.video.narratorVoiceDeleted"),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const openTrim = () => {
      setTrimStart("0");
      setTrimDuration("4");
      setTrimOpen(true);
    };

    const applyTrim = async () => {
      const startSeconds = Number(trimStart);
      const durationSeconds = Number(trimDuration);
      if (
        !Number.isFinite(startSeconds) ||
        startSeconds < 0 ||
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0
      ) {
        toast.error(
          t("episode.workbench.video.narratorVoiceTrimInvalid"),
        );
        return;
      }
      try {
        const response = await trimVoice.mutateAsync({
          startSeconds,
          durationSeconds,
        });
        if (
          finishMutation(
            response,
            t("episode.workbench.video.narratorVoiceTrimmed"),
          )
        ) {
          setTrimOpen(false);
        }
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      aiSampleText,
      aiVoiceOpen,
      accountVoiceFailed: accountVoices.isError,
      accountVoiceLoading: accountVoices.isLoading,
      accountVoiceOptions: accountVoices.data ?? [],
      audioSrc: resolveMediaUrl(status?.reference_url),
      bindPending: bindNarratorVoice.isPending,
      canEdit,
      explanation: status?.explanation,
      voiceSourceType,
      hasVoice,
      heading: status?.heading,
      pending,
      designGenerationPending:
        designNarratorVoice.isPending || designVoiceTask.started,
      designLanguage,
      designName,
      designPreviewText,
      designPrompt,
      designVoiceAvailability:
        options.designVoiceAvailability ?? "catalogMissing",
      designVoiceConfig,
      designVoiceModelLabel: designVoiceModel?.label ?? "",
      designVoiceModelSelector,
      designVoiceOptions,
      presetGenerationPending:
        generatePresetVoice.isPending || presetVoiceTask.started,
      presetVoice,
      presetVoiceAcceptsVoice,
      presetVoiceAllowsCustom,
      presetVoiceRequiresVoice,
      presetVoiceAvailability:
        options.presetVoiceAvailability ?? "catalogMissing",
      presetVoiceModelLabel: presetVoiceModel?.label ?? "",
      presetVoiceModelSelector,
      presetVoiceModels,
      presetVoiceOptions,
      recordedDataUrl,
      recording,
      recordOpen,
      recordPending: recordVoice.isPending,
      recordStatus,
      trimDuration,
      trimOpen,
      trimPending: trimVoice.isPending,
      trimStart,
      onApplyTrim: applyTrim,
      onAiSampleTextChange: setAiSampleText,
      onAiVoiceOpenChange: setAiVoiceOpen,
      onDelete: clearNarratorVoice,
      onDesignLanguageChange: setDesignLanguage,
      onDesignVoiceModelChange: changeDesignVoiceModel,
      onDesignNameChange: setDesignName,
      onDesignPreviewTextChange: setDesignPreviewText,
      onDesignPromptChange: setDesignPrompt,
      onGenerateDesignedVoice: generateDesignedVoice,
      onGeneratePresetVoice: generatePreset,
      onVoiceSourceTypeChange: setVoiceSourceType,
      onOpenVoiceGenerator: openVoiceGenerator,
      onOpenRecord: openRecord,
      onOpenTrim: openTrim,
      onRecordOpenChange: closeRecordDialog,
      onSaveRecording: saveRecording,
      onBindAccountVoice: bindAccountVoice,
      onPresetVoiceModelChange: changePresetVoiceModel,
      onPresetVoiceChange: setPresetVoice,
      onStartRecording: startRecording,
      onStopRecording: () => recorder.stop(),
      onTrimDurationChange: setTrimDuration,
      onTrimOpenChange: setTrimOpen,
      onTrimStartChange: setTrimStart,
      onUpload: upload,
    };
  };
}
