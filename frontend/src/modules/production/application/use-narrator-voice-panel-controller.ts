// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { resolveMediaUrl } from "@/lib/media-url";
import type { ProductionDataResponse } from "@/modules/production/application/ports";
import type {
  NarratorVoiceSourceOption,
  NarratorVoiceSourcesData,
  NarratorVoiceStatusData,
} from "@/modules/production/domain/narrator-voice";
import type { VoiceRecorder } from "@/shared/voice-recording/voice-recorder";

const EMPTY_SOURCE_OPTIONS: NarratorVoiceSourceOption[] = [];

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
  useNarratorVoiceSources(
    project: string,
    enabled: boolean,
  ): NarratorVoiceQuery<NarratorVoiceSourcesData>;
  useUploadNarratorVoice(project: string): NarratorVoiceMutation<File>;
  useRecordNarratorVoice(project: string): NarratorVoiceMutation<string>;
  useCopyProjectNarratorVoice(
    project: string,
  ): NarratorVoiceMutation<string>;
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
}

export interface NarratorVoicePanelController {
  audioSrc: string | null;
  canEdit: boolean;
  copyPending: boolean;
  explanation?: string | null;
  hasVoice: boolean;
  heading?: string | null;
  pending: boolean;
  projectAudioOpen: boolean;
  recordedDataUrl: string;
  recording: boolean;
  recordOpen: boolean;
  recordPending: boolean;
  recordStatus: string;
  selectedSourcePath: string;
  sourceOptions: NarratorVoiceSourceOption[];
  sourcesLoading: boolean;
  trimDuration: string;
  trimOpen: boolean;
  trimPending: boolean;
  trimStart: string;
  onApplyTrim(): Promise<void>;
  onDelete(): Promise<void>;
  onOpenProjectAudio(): void;
  onOpenRecord(): void;
  onOpenTrim(): void;
  onProjectAudioOpenChange(open: boolean): void;
  onRecordOpenChange(open: boolean): void;
  onSaveRecording(): Promise<void>;
  onSelectedSourcePathChange(path: string): void;
  onStartRecording(): Promise<void>;
  onStopRecording(): void;
  onTrimDurationChange(value: string): void;
  onTrimOpenChange(open: boolean): void;
  onTrimStartChange(value: string): void;
  onUpload(file: File): Promise<void>;
  onUseProjectAudio(): Promise<void>;
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
    const copyProjectVoice = queries.useCopyProjectNarratorVoice(
      options.project,
    );
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
    const [projectAudioOpen, setProjectAudioOpen] = useState(false);
    const [selectedSourcePath, setSelectedSourcePath] = useState("");
    const [trimOpen, setTrimOpen] = useState(false);
    const [trimStart, setTrimStart] = useState("0");
    const [trimDuration, setTrimDuration] = useState("4");

    useEffect(() => () => recorder.dispose(), [recorder]);

    const status = statusQuery.data?.data;
    const canEdit = Boolean(
      status &&
        (options.allowFirstPersonProjectVoice || !status.is_first_person),
    );
    const hasVoice = Boolean(status?.reference_path);
    const pending =
      uploadVoice.isPending ||
      recordVoice.isPending ||
      copyProjectVoice.isPending ||
      trimVoice.isPending ||
      deleteVoice.isPending;
    const sources = queries.useNarratorVoiceSources(
      options.project,
      projectAudioOpen && canEdit,
    );
    const sourceOptions = sources.data?.data.options ?? EMPTY_SOURCE_OPTIONS;

    useEffect(() => {
      if (
        !projectAudioOpen ||
        selectedSourcePath ||
        sourceOptions.length === 0
      ) {
        return;
      }
      setSelectedSourcePath(sourceOptions[0].path);
    }, [projectAudioOpen, selectedSourcePath, sourceOptions]);

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

    const useProjectAudio = async () => {
      if (!selectedSourcePath) return;
      try {
        const response = await copyProjectVoice.mutateAsync(
          selectedSourcePath,
        );
        if (
          finishMutation(
            response,
            t("episode.workbench.video.narratorVoiceCopied"),
          )
        ) {
          setProjectAudioOpen(false);
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
      audioSrc: resolveMediaUrl(status?.reference_url),
      canEdit,
      copyPending: copyProjectVoice.isPending,
      explanation: status?.explanation,
      hasVoice,
      heading: status?.heading,
      pending,
      projectAudioOpen,
      recordedDataUrl,
      recording,
      recordOpen,
      recordPending: recordVoice.isPending,
      recordStatus,
      selectedSourcePath,
      sourceOptions,
      sourcesLoading: sources.isLoading,
      trimDuration,
      trimOpen,
      trimPending: trimVoice.isPending,
      trimStart,
      onApplyTrim: applyTrim,
      onDelete: clearNarratorVoice,
      onOpenProjectAudio: () => {
        setSelectedSourcePath("");
        setProjectAudioOpen(true);
      },
      onOpenRecord: openRecord,
      onOpenTrim: openTrim,
      onProjectAudioOpenChange: setProjectAudioOpen,
      onRecordOpenChange: closeRecordDialog,
      onSaveRecording: saveRecording,
      onSelectedSourcePathChange: setSelectedSourcePath,
      onStartRecording: startRecording,
      onStopRecording: () => recorder.stop(),
      onTrimDurationChange: setTrimDuration,
      onTrimOpenChange: setTrimOpen,
      onTrimStartChange: setTrimStart,
      onUpload: upload,
      onUseProjectAudio: useProjectAudio,
    };
  };
}
