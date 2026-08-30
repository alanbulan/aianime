// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import type { CharacterQueryHooks } from "@/modules/asset_world/application/character-query-hooks";
import {
  isErrorDataResponse,
  isOkDataResponse,
} from "@/modules/asset_world/application/response";
import {
  VoiceRecorderStartError,
  type VoiceRecorder,
} from "@/shared/voice-recording/voice-recorder";
import type {
  Character,
  CharacterIdentityVoiceSample,
  CharacterVoiceSlot,
  CharacterVoiceSlotId,
} from "@/modules/asset_world/domain/character";
import {
  resolveAudioModelSelector,
  type AudioSpeechModelOption,
  type AudioVoiceDesignModelOption,
} from "@/modules/model_usage/public";
import {
  resolvePresetVoiceModelSelection,
  resolveVoiceDesignModelSelection,
  type AccountVoiceOption,
  type CreatePresetVoiceInput,
  type CreateVoiceDesignInput,
  type GeneratedVoiceTaskReceipt,
  type VoiceSourceType,
} from "@/shared/voice-source/voice-source";
import {
  TASK_TYPES,
  useTaskController,
} from "@/modules/task_execution/public";

const AGE_SLOT_ORDER: CharacterVoiceSlotId[] = [
  "child",
  "youth",
  "middle",
  "elder",
];
const EMPTY_VOICE_SLOTS: CharacterVoiceSlot[] = [];
const EMPTY_IDENTITY_VOICES: CharacterIdentityVoiceSample[] = [];

export interface CharacterVoiceRow {
  actionSlot: CharacterVoiceSlot;
  displaySlot: CharacterVoiceSlotId;
  label: string;
}

export type CharacterVoiceLibraryOption = AccountVoiceOption;

export type CharacterVoiceBindingTarget =
  | { kind: "slot"; slot: string; label: string }
  | { kind: "identity"; identityId: string; label: string };

export interface CharacterVoiceControllerDependencies {
  createVoiceRecorder(): VoiceRecorder;
}

export interface CharacterVoiceControllerOptions {
  character: Character;
  createPresetVoice?(
    project: string,
    input: CreatePresetVoiceInput,
  ): Promise<GeneratedVoiceTaskReceipt>;
  designVoice?(
    project: string,
    input: CreateVoiceDesignInput,
  ): Promise<GeneratedVoiceTaskReceipt>;
  loadVoiceOptions(project: string): Promise<CharacterVoiceLibraryOption[]>;
  presetVoiceDefaultSelector?: string;
  presetVoiceModels?: readonly AudioSpeechModelOption[];
  project: string;
  voiceDesignDefaultSelector?: string;
  voiceDesignOptions?: readonly AudioVoiceDesignModelOption[];
}

function emptySlot(
  slot: CharacterVoiceSlotId,
  label: string,
): CharacterVoiceSlot {
  return {
    slot,
    label,
    path: "",
    url: "",
    sha256: "",
    updated_at: "",
    inherited_from_default: false,
    required: slot === "default",
  };
}

const RECORD_FAILURE_MESSAGE: Record<string, string> = {
  permission_denied: "characters.voiceSamples.recordPermissionDenied",
  device_missing: "characters.voiceSamples.recordNoDevice",
  device_busy: "characters.voiceSamples.recordDeviceBusy",
  unknown: "characters.voiceSamples.recordFailed",
};
const DEFAULT_PRESET_SAMPLE_TEXT = "你好，我会用这条声线讲述这个角色的故事。";

export function createUseCharacterVoiceController(
  queries: CharacterQueryHooks,
  dependencies: CharacterVoiceControllerDependencies,
) {
  return function useCharacterVoiceController(
    options: CharacterVoiceControllerOptions,
  ) {
    const { character, project } = options;
    const { t } = useTranslation();
    const samples = queries.useCharacterVoiceSamples(project, character.name);
    const uploadVoice = queries.useUploadCharacterVoiceSample(
      project,
      character.name,
    );
    const recordVoice = queries.useRecordCharacterVoiceSample(
      project,
      character.name,
    );
    const trimVoice = queries.useTrimCharacterVoiceSample(
      project,
      character.name,
    );
    const deleteVoice = queries.useDeleteCharacterVoiceSample(
      project,
      character.name,
    );
    const bindVoice = queries.useBindCharacterVoiceSample(
      project,
      character.name,
    );
    const bindIdentityVoice = queries.useBindIdentityVoiceSample(
      project,
      character.name,
    );
    const deleteIdentityVoice = queries.useDeleteIdentityVoiceSample(
      project,
      character.name,
    );
    const recorderRef = useRef<VoiceRecorder | null>(null);
    if (recorderRef.current === null) {
      recorderRef.current = dependencies.createVoiceRecorder();
    }
    const recorder = recorderRef.current;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadSlotRef = useRef<string>("default");
    const awaitingInitialVoiceSourceRef = useRef(false);
    const [recordSlot, setRecordSlot] =
      useState<CharacterVoiceSlot | null>(null);
    const [recording, setRecording] = useState(false);
    const [recordedDataUrl, setRecordedDataUrl] = useState("");
    const [recordedDuration, setRecordedDuration] = useState<number | null>(
      null,
    );
    const [recordStatus, setRecordStatus] = useState("");
    const [trimSlot, setTrimSlot] = useState<CharacterVoiceSlot | null>(null);
    const [trimStart, setTrimStart] = useState("0");
    const [trimDuration, setTrimDuration] = useState("4");
    const [voiceBindingTarget, setVoiceBindingTarget] =
      useState<CharacterVoiceBindingTarget | null>(null);
    const [voiceSourceType, setVoiceSourceType] =
      useState<VoiceSourceType>("voice_design");
    const [designName, setDesignName] = useState("");
    const [designPrompt, setDesignPrompt] = useState("");
    const [designPreviewText, setDesignPreviewText] = useState("");
    const [designLanguage, setDesignLanguage] = useState("");
    const [designVoiceModelSelector, setDesignVoiceModelSelector] = useState("");
    const [designing, setDesigning] = useState(false);
    const [presetVoiceModelSelector, setPresetVoiceModelSelector] = useState("");
    const [presetVoice, setPresetVoice] = useState("");
    const [presetSampleText, setPresetSampleText] = useState(
      DEFAULT_PRESET_SAMPLE_TEXT,
    );
    const [creatingPresetVoice, setCreatingPresetVoice] = useState(false);
    const voiceDesignOptions = options.voiceDesignOptions ?? [];
    const defaultVoiceDesignSelector = resolveAudioModelSelector(
      voiceDesignOptions,
      options.voiceDesignDefaultSelector,
    );
    const voiceDesign =
      voiceDesignOptions.find(
        (option) => option.value === designVoiceModelSelector,
      ) ?? null;
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
    const presetVoiceAcceptsVoice = presetVoiceModel?.acceptsVoice !== false;
    const presetVoiceAllowsCustom = presetVoiceModel?.allowsCustomVoice === true;
    const presetVoiceRequiresVoice = presetVoiceModel?.requiresVoice === true;

    const voiceLibrary = useQuery({
      queryKey: queryKeys.characterVoiceLibrary(project),
      queryFn: () => options.loadVoiceOptions(project),
      enabled: Boolean(project && voiceBindingTarget),
      staleTime: 30_000,
    });
    const voiceDesignTask = useTaskController({
      key: {
        taskType: TASK_TYPES.FREEZONE_VOICE_DESIGN,
        project,
        episode: 0,
        scope: "character_voice",
      },
      invalidateKeys: [
        queryKeys.characterVoiceSamples(project, character.name),
        queryKeys.characterVoiceLibrary(project),
      ],
      showCompleteToast: false,
      onComplete: () => {
        void samples.refetch();
        void voiceLibrary.refetch();
        setVoiceBindingTarget(null);
        toast.success(t("characters.voiceSamples.voiceDesignedAndBound"));
      },
      onError: (error) => toast.error(error),
    });
    const presetVoiceTask = useTaskController({
      key: {
        taskType: TASK_TYPES.FREEZONE_VOICE_PRESET,
        project,
        episode: 0,
        scope: "character_voice",
      },
      invalidateKeys: [
        queryKeys.characterVoiceSamples(project, character.name),
        queryKeys.characterVoiceLibrary(project),
      ],
      showCompleteToast: false,
      onComplete: () => {
        void samples.refetch();
        void voiceLibrary.refetch();
        setVoiceBindingTarget(null);
        toast.success(t("characters.voiceSamples.presetCreatedAndBound"));
      },
      onError: (error) => toast.error(error),
    });

    useEffect(() => () => recorder.dispose(), [recorder]);
    useEffect(() => {
      const config = voiceDesign?.config;
      if (!config) {
        setDesignLanguage("");
        return;
      }
      setDesignLanguage((current) =>
        config.languages.includes(current)
          ? current
          : config.defaultLanguage,
      );
    }, [voiceDesign]);
    useEffect(() => {
      if (!voiceBindingTarget) {
        awaitingInitialVoiceSourceRef.current = false;
        return;
      }
      if (
        defaultVoiceDesignSelector &&
        !voiceDesignOptions.some(
          (option) => option.value === designVoiceModelSelector,
        )
      ) {
        setDesignVoiceModelSelector(defaultVoiceDesignSelector);
      }
      if (
        defaultPresetVoiceSelector &&
        !presetVoiceModels.some(
          (option) => option.value === presetVoiceModelSelector,
        )
      ) {
        const selected = presetVoiceModels.find(
          (option) => option.value === defaultPresetVoiceSelector,
        );
        const defaultVoice =
          selected?.voices.find((option) => option.isDefault) ??
          selected?.voices[0];
        setPresetVoiceModelSelector(defaultPresetVoiceSelector);
        setPresetVoice(defaultVoice?.value ?? "");
      }
      if (
        awaitingInitialVoiceSourceRef.current &&
        (voiceDesignOptions.length > 0 || presetVoiceModels.length > 0)
      ) {
        awaitingInitialVoiceSourceRef.current = false;
        setVoiceSourceType(
          voiceDesignOptions.length > 0 ? "voice_design" : "preset_voice",
        );
      }
    }, [
      defaultPresetVoiceSelector,
      defaultVoiceDesignSelector,
      designVoiceModelSelector,
      presetVoiceModelSelector,
      presetVoiceModels,
      voiceBindingTarget,
      voiceDesignOptions,
    ]);

    const voiceSamples = isOkDataResponse(samples.data)
      ? samples.data.data
      : undefined;
    const sampleSlots = voiceSamples?.slots ?? EMPTY_VOICE_SLOTS;
    const identityRows = voiceSamples?.identities ?? EMPTY_IDENTITY_VOICES;
    const loadFailed =
      samples.isError || isErrorDataResponse(samples.data);
    const ageLabel = (slot: CharacterVoiceSlotId) =>
      t(
        slot === "child"
          ? "characters.ageGroups.child"
          : slot === "youth"
            ? "characters.ageGroups.young"
            : slot === "middle"
              ? "characters.ageGroups.middle"
              : "characters.ageGroups.elder",
      );
    const rows = useMemo<CharacterVoiceRow[]>(() => {
      const bySlot = new Map(sampleSlots.map((slot) => [slot.slot, slot]));
      const getSlot = (slot: CharacterVoiceSlotId) =>
        bySlot.get(slot) ??
        emptySlot(
          slot,
          slot === "default"
            ? t("characters.voiceSamples.defaultRequired")
            : ageLabel(slot),
        );
      const primaryAge = AGE_SLOT_ORDER.includes(
        character.age_group as CharacterVoiceSlotId,
      )
        ? (character.age_group as CharacterVoiceSlotId)
        : "";
      if (primaryAge) {
        return AGE_SLOT_ORDER.map((slot) => ({
          actionSlot:
            slot === primaryAge ? getSlot("default") : getSlot(slot),
          displaySlot: slot,
          label:
            slot === primaryAge
              ? t("characters.voiceSamples.ageDefaultRequired", {
                  age: ageLabel(slot),
                })
              : t("characters.voiceSamples.optionalOverride", {
                  age: ageLabel(slot),
                }),
        }));
      }
      return [
        {
          actionSlot: getSlot("default"),
          displaySlot: "default" as const,
          label: t("characters.voiceSamples.defaultRequired"),
        },
        ...AGE_SLOT_ORDER.map((slot) => ({
          actionSlot: getSlot(slot),
          displaySlot: slot,
          label: t("characters.voiceSamples.optionalOverride", {
            age: ageLabel(slot),
          }),
        })),
      ];
    }, [character.age_group, sampleSlots, t]);

    const pending =
      uploadVoice.isPending ||
      recordVoice.isPending ||
      trimVoice.isPending ||
      deleteVoice.isPending ||
      bindVoice.isPending ||
      bindIdentityVoice.isPending ||
      deleteIdentityVoice.isPending ||
      designing ||
      creatingPresetVoice ||
      voiceDesignTask.started ||
      presetVoiceTask.started;

    const finishMutation = <T,>(
      response: unknown,
      successMessage: string,
    ): boolean => {
      if (isErrorDataResponse(response)) {
        toast.error(response.error || t("common.error"));
        return false;
      }
      if (isOkDataResponse<T>(response)) {
        toast.success(successMessage);
        return true;
      }
      toast.error(t("common.error"));
      return false;
    };

    const upload = async (file: File) => {
      try {
        const response = await uploadVoice.mutateAsync({
          slot: uploadSlotRef.current,
          file,
        });
        finishMutation<CharacterVoiceSlot>(
          response,
          t("characters.voiceSamples.uploaded"),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const requestUpload = (slot: string) => {
      uploadSlotRef.current = slot;
      fileInputRef.current?.click();
    };

    const openRecord = (slot: CharacterVoiceSlot) => {
      setRecordSlot(slot);
      setRecordedDataUrl("");
      setRecordedDuration(null);
      setRecordStatus(t("characters.voiceSamples.recordReady"));
    };

    const startRecording = async () => {
      if (!recordSlot) return;
      const availability = recorder.availability();
      if (availability === "insecure_context") {
        const message = t("characters.voiceSamples.recordInsecureContext");
        toast.error(message);
        setRecordStatus(message);
        return;
      }
      if (availability === "unavailable") {
        toast.error(t("characters.voiceSamples.recordUnavailable"));
        return;
      }
      try {
        setRecordedDataUrl("");
        setRecordedDuration(null);
        setRecordStatus(t("characters.voiceSamples.requestingMic"));
        await recorder.start({
          onComplete: ({ dataUrl, durationSeconds }) => {
            setRecordedDataUrl(dataUrl);
            setRecordedDuration(durationSeconds);
            setRecordStatus(
              t("characters.voiceSamples.recordedDuration", {
                seconds: durationSeconds.toFixed(1),
              }),
            );
            setRecording(false);
          },
          onFailure: () => {
            setRecordStatus(t("characters.voiceSamples.recordFailed"));
            setRecording(false);
          },
        });
        setRecording(true);
        setRecordStatus(t("characters.voiceSamples.recording"));
      } catch (error) {
        setRecording(false);
        const reason =
          error instanceof VoiceRecorderStartError ? error.reason : "unknown";
        const message = t(RECORD_FAILURE_MESSAGE[reason]);
        toast.error(message);
        setRecordStatus(message);
      }
    };

    const saveRecording = async () => {
      if (!recordSlot || !recordedDataUrl) return;
      try {
        const response = await recordVoice.mutateAsync({
          slot: String(recordSlot.slot),
          dataUrl: recordedDataUrl,
        });
        if (
          finishMutation<CharacterVoiceSlot>(
            response,
            t("characters.voiceSamples.recorded"),
          )
        ) {
          setRecordSlot(null);
        }
      } catch {
        toast.error(t("common.error"));
      }
    };

    const closeRecordDialog = (open: boolean) => {
      if (open) return;
      if (recording) recorder.stop();
      else recorder.release();
      setRecordSlot(null);
    };

    const openTrim = (slot: CharacterVoiceSlot) => {
      setTrimSlot(slot);
      setTrimStart("0");
      setTrimDuration("4");
    };

    const applyTrim = async () => {
      if (!trimSlot?.path) return;
      const startSeconds = Number(trimStart);
      const durationSeconds = Number(trimDuration);
      if (!Number.isFinite(startSeconds) || !Number.isFinite(durationSeconds)) {
        toast.error(t("characters.voiceSamples.invalidTrim"));
        return;
      }
      try {
        const response = await trimVoice.mutateAsync({
          slot: String(trimSlot.slot),
          sourcePath: trimSlot.path,
          startSeconds,
          durationSeconds,
        });
        if (
          finishMutation<CharacterVoiceSlot>(
            response,
            t("characters.voiceSamples.trimmed"),
          )
        ) {
          setTrimSlot(null);
        }
      } catch {
        toast.error(t("common.error"));
      }
    };

    const clearSlot = async (slot: CharacterVoiceSlot) => {
      try {
        const response = await deleteVoice.mutateAsync(String(slot.slot));
        finishMutation<CharacterVoiceSlot>(
          response,
          t("characters.voiceSamples.cleared"),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    const openVoiceLibrary = (target: CharacterVoiceBindingTarget) => {
      setVoiceBindingTarget(target);
      setDesignName(`${character.name}-${target.label}`.slice(0, 80));
      setDesignPrompt("");
      setDesignPreviewText("");
      setDesignVoiceModelSelector(defaultVoiceDesignSelector);
      const selected = voiceDesignOptions.find(
        (option) => option.value === defaultVoiceDesignSelector,
      );
      setDesignLanguage(selected?.config.defaultLanguage ?? "");
      const defaultPresetModel = presetVoiceModels.find(
        (option) => option.value === defaultPresetVoiceSelector,
      );
      const defaultPresetVoice =
        defaultPresetModel?.voices.find((option) => option.isDefault) ??
        defaultPresetModel?.voices[0];
      setPresetVoiceModelSelector(defaultPresetVoiceSelector);
      setPresetVoice(defaultPresetVoice?.value ?? "");
      setPresetSampleText(DEFAULT_PRESET_SAMPLE_TEXT);
      awaitingInitialVoiceSourceRef.current =
        voiceDesignOptions.length === 0 && presetVoiceModels.length === 0;
      setVoiceSourceType(
        voiceDesignOptions.length > 0
          ? "voice_design"
          : presetVoiceModels.length > 0
            ? "preset_voice"
            : "account_voice",
      );
    };

    const changeDesignVoiceModel = (selector: string) => {
      const selection = resolveVoiceDesignModelSelection(
        voiceDesignOptions,
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

    const openSlotVoiceLibrary = (slot: CharacterVoiceSlot, label: string) => {
      openVoiceLibrary({
        kind: "slot",
        slot: String(slot.slot),
        label,
      });
    };

    const openIdentityVoiceLibrary = (
      identity: CharacterIdentityVoiceSample,
    ) => {
      openVoiceLibrary({
        kind: "identity",
        identityId: identity.identity_id,
        label: identity.identity_name || identity.identity_id,
      });
    };

    const bindLibraryVoice = async (voiceId: string) => {
      if (!voiceBindingTarget) return;
      try {
        const response =
          voiceBindingTarget.kind === "slot"
            ? await bindVoice.mutateAsync({
                slot: voiceBindingTarget.slot,
                voiceId,
              })
            : await bindIdentityVoice.mutateAsync({
                identityId: voiceBindingTarget.identityId,
                voiceId,
              });
        if (
          finishMutation(
            response,
            t("characters.voiceSamples.bound"),
          )
        ) {
          setVoiceBindingTarget(null);
        }
      } catch {
        toast.error(t("common.error"));
      }
    };

    const designAndBindVoice = async () => {
      const target = voiceBindingTarget;
      const design = voiceDesign;
      const designVoice = options.designVoice;
      if (!target || !design || !designVoice) return;
      const voicePrompt = designPrompt.trim();
      const previewText = designPreviewText.trim();
      if (!voicePrompt) {
        toast.error(t("characters.voiceSamples.voiceDesignPromptRequired"));
        return;
      }
      if (!previewText) {
        toast.error(t("characters.voiceSamples.voiceDesignPreviewRequired"));
        return;
      }
      if (
        voicePrompt.length < design.config.promptMinLength ||
        voicePrompt.length > design.config.promptMaxLength ||
        previewText.length < design.config.previewTextMinLength ||
        previewText.length > design.config.previewTextMaxLength ||
        !design.config.languages.includes(designLanguage)
      ) {
        toast.error(t("common.error"));
        return;
      }
      const sampleRate = design.config.defaultSampleRate;
      const responseFormat = design.config.defaultResponseFormat;
      if (
        sampleRate === null ||
        (responseFormat !== "wav" && responseFormat !== "mp3")
      ) {
        toast.error(t("common.error"));
        return;
      }
      setDesigning(true);
      try {
        const created = await designVoice(project, {
          binding:
            target.kind === "slot"
              ? {
                  kind: "character_slot",
                  characterName: character.name,
                  slot: target.slot,
                }
              : {
                  kind: "identity",
                  characterName: character.name,
                  identityId: target.identityId,
                },
          name: designName.trim(),
          modelSelector: design.value,
          voicePrompt,
          previewText,
          preferredName: design.config.preferredName,
          language: designLanguage,
          sampleRate,
          responseFormat,
        });
        voiceDesignTask.start({ scope: created.scope });
      } catch {
        toast.error(t("characters.voiceSamples.voiceDesignFailed"));
      } finally {
        setDesigning(false);
      }
    };

    const createPresetAndBindVoice = async () => {
      const target = voiceBindingTarget;
      const createPresetVoice = options.createPresetVoice;
      if (!target || !presetVoiceModel || !createPresetVoice) return;
      const sampleText = presetSampleText.trim();
      const selectedVoice = presetVoice.trim();
      if (
        !presetVoiceModelSelector.trim() ||
        !sampleText ||
        (presetVoiceRequiresVoice && !selectedVoice)
      ) {
        toast.error(t("characters.voiceSamples.presetInputRequired"));
        return;
      }
      setCreatingPresetVoice(true);
      try {
        const selectedOption = presetVoiceOptions.find(
          (option) => option.value === selectedVoice,
        );
        const created = await createPresetVoice(project, {
          binding:
            target.kind === "slot"
              ? {
                  kind: "character_slot",
                  characterName: character.name,
                  slot: target.slot,
                }
              : {
                  kind: "identity",
                  characterName: character.name,
                  identityId: target.identityId,
                },
          name:
            designName.trim() ||
            selectedOption?.label ||
            selectedVoice ||
            presetVoiceModel.label,
          modelSelector: presetVoiceModelSelector.trim(),
          text: sampleText,
          voice: selectedVoice,
        });
        presetVoiceTask.start({ scope: created.scope });
      } catch {
        toast.error(t("characters.voiceSamples.presetCreateFailed"));
      } finally {
        setCreatingPresetVoice(false);
      }
    };

    const clearIdentityVoice = async (
      identity: CharacterIdentityVoiceSample,
    ) => {
      try {
        const response = await deleteIdentityVoice.mutateAsync(
          identity.identity_id,
        );
        finishMutation(
          response,
          t("characters.voiceSamples.identityCleared"),
        );
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      applyTrim,
      bindLibraryVoice,
      clearSlot,
      clearIdentityVoice,
      closeRecordDialog,
      fileInputRef,
      isLoading: samples.isLoading,
      identityRows,
      designAndBindVoice,
      designLanguage,
      designName,
      designPreviewText,
      designPrompt,
      designVoiceConfig: voiceDesign?.config ?? null,
      designVoiceModelLabel: voiceDesign?.label ?? "",
      designVoiceModelSelector,
      designVoiceOptions: voiceDesignOptions,
      designing: designing || voiceDesignTask.started,
      createPresetAndBindVoice,
      creatingPresetVoice:
        creatingPresetVoice || presetVoiceTask.started,
      libraryFailed: voiceLibrary.isError,
      libraryLoading: voiceLibrary.isLoading,
      libraryOptions: voiceLibrary.data ?? [],
      loadFailed,
      openIdentityVoiceLibrary,
      openRecord,
      openSlotVoiceLibrary,
      openTrim,
      pending,
      presetSampleText,
      presetVoice,
      presetVoiceAcceptsVoice,
      presetVoiceAllowsCustom,
      presetVoiceModelLabel: presetVoiceModel?.label ?? "",
      presetVoiceModelSelector,
      presetVoiceModels,
      presetVoiceOptions,
      presetVoiceRequiresVoice,
      recordPending: recordVoice.isPending,
      recordSlot,
      recordedDataUrl,
      recordedDuration,
      recording,
      recordStatus,
      requestUpload,
      rows,
      saveRecording,
      setDesignLanguage,
      setDesignName,
      setDesignPreviewText,
      setDesignPrompt,
      setDesignVoiceModelSelector: changeDesignVoiceModel,
      setPresetSampleText,
      setPresetVoice,
      setPresetVoiceModelSelector: changePresetVoiceModel,
      setTrimDuration,
      setTrimSlot,
      setTrimStart,
      startRecording,
      stopRecording: () => recorder.stop(),
      trimDuration,
      trimPending: trimVoice.isPending,
      trimSlot,
      trimStart,
      upload,
      voiceBindingTarget,
      voiceSourceType,
      setVoiceSourceType: (value: VoiceSourceType) => {
        awaitingInitialVoiceSourceRef.current = false;
        setVoiceSourceType(value);
      },
      onVoiceLibraryOpenChange: (open: boolean) => {
        if (!open) setVoiceBindingTarget(null);
      },
    };
  };
}

export type CharacterVoiceController = ReturnType<
  ReturnType<typeof createUseCharacterVoiceController>
>;
