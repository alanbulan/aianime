// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { resolveMediaUrl } from "@/lib/media-url";
import {
  NarratorVoicePanelView,
  useCopyProjectNarratorVoice,
  useDeleteNarratorVoice,
  useNarratorVoiceSources,
  useNarratorVoiceStatus,
  useRecordNarratorVoice,
  useTrimNarratorVoice,
  useUploadNarratorVoice,
} from "@/modules/production/public";

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("failed to read audio blob"));
    reader.readAsDataURL(blob);
  });
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

export function NarratorVoicePanel({
  project,
  allowFirstPersonProjectVoice = false,
}: {
  project: string;
  allowFirstPersonProjectVoice?: boolean;
}) {
  const { t } = useTranslation();
  const statusQuery = useNarratorVoiceStatus(project);
  const uploadVoice = useUploadNarratorVoice(project);
  const recordVoice = useRecordNarratorVoice(project);
  const copyProjectVoice = useCopyProjectNarratorVoice(project);
  const trimVoice = useTrimNarratorVoice(project);
  const deleteVoice = useDeleteNarratorVoice(project);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        // The recorder may already be inactive.
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordedDataUrl, setRecordedDataUrl] = useState("");
  const [recordStatus, setRecordStatus] = useState("");
  const [projectAudioOpen, setProjectAudioOpen] = useState(false);
  const [selectedSourcePath, setSelectedSourcePath] = useState("");
  const [trimOpen, setTrimOpen] = useState(false);
  const [trimStart, setTrimStart] = useState("0");
  const [trimDuration, setTrimDuration] = useState("4");

  const status = statusQuery.data?.data;
  const canEdit = Boolean(
    status && (allowFirstPersonProjectVoice || !status.is_first_person),
  );
  const hasVoice = Boolean(status?.reference_path);
  const audioSrc = resolveMediaUrl(status?.reference_url);
  const pending =
    uploadVoice.isPending ||
    recordVoice.isPending ||
    copyProjectVoice.isPending ||
    trimVoice.isPending ||
    deleteVoice.isPending;
  const sources = useNarratorVoiceSources(
    project,
    projectAudioOpen && canEdit,
  );
  const sourceOptions = sources.data?.data.options ?? [];

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

  const handleUploadFile = async (file: File) => {
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

  const stopRecorderTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const openRecord = () => {
    setRecordedDataUrl("");
    setRecordStatus(t("episode.workbench.video.narratorVoiceRecordReady"));
    setRecordOpen(true);
  };

  const startRecording = async () => {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "audio/webm",
          });
          const dataUrl = await dataUrlFromBlob(blob);
          const seconds = Math.max(
            0,
            (performance.now() - startedAtRef.current) / 1000,
          );
          setRecordedDataUrl(dataUrl);
          setRecordStatus(
            t("episode.workbench.video.narratorVoiceRecorded", {
              seconds: seconds.toFixed(1),
            }),
          );
        } catch {
          setRecordStatus(
            t("episode.workbench.video.narratorVoiceRecordFailed"),
          );
        } finally {
          setRecording(false);
          stopRecorderTracks();
        }
      };
      startedAtRef.current = performance.now();
      recorder.start();
      setRecording(true);
      setRecordStatus(t("episode.workbench.video.narratorVoiceRecording"));
    } catch {
      stopRecorderTracks();
      setRecording(false);
      setRecordStatus(
        t("episode.workbench.video.narratorVoiceRecordFailed"),
      );
      toast.error(t("episode.workbench.video.narratorVoiceRecordFailed"));
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
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
    if (recording) {
      mediaRecorderRef.current?.stop();
    } else {
      stopRecorderTracks();
    }
    setRecordOpen(false);
  };

  const useProjectAudio = async () => {
    if (!selectedSourcePath) return;
    try {
      const response =
        await copyProjectVoice.mutateAsync(selectedSourcePath);
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

  const trimNarratorVoice = async () => {
    const startSeconds = Number(trimStart);
    const durationSeconds = Number(trimDuration);
    if (
      !Number.isFinite(startSeconds) ||
      startSeconds < 0 ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      toast.error(t("episode.workbench.video.narratorVoiceTrimInvalid"));
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

  return (
    <NarratorVoicePanelView
      audioSrc={audioSrc}
      canEdit={canEdit}
      copyPending={copyProjectVoice.isPending}
      explanation={status?.explanation}
      hasVoice={hasVoice}
      heading={status?.heading}
      pending={pending}
      projectAudioOpen={projectAudioOpen}
      recordedDataUrl={recordedDataUrl}
      recording={recording}
      recordOpen={recordOpen}
      recordPending={recordVoice.isPending}
      recordStatus={recordStatus}
      selectedSourcePath={selectedSourcePath}
      sourceOptions={sourceOptions}
      sourcesLoading={sources.isLoading}
      trimDuration={trimDuration}
      trimOpen={trimOpen}
      trimPending={trimVoice.isPending}
      trimStart={trimStart}
      onApplyTrim={trimNarratorVoice}
      onDelete={clearNarratorVoice}
      onOpenProjectAudio={() => {
        setSelectedSourcePath("");
        setProjectAudioOpen(true);
      }}
      onOpenRecord={openRecord}
      onOpenTrim={openTrim}
      onProjectAudioOpenChange={setProjectAudioOpen}
      onRecordOpenChange={closeRecordDialog}
      onSaveRecording={saveRecording}
      onSelectedSourcePathChange={setSelectedSourcePath}
      onStartRecording={startRecording}
      onStopRecording={stopRecording}
      onTrimDurationChange={setTrimDuration}
      onTrimOpenChange={setTrimOpen}
      onTrimStartChange={setTrimStart}
      onUpload={handleUploadFile}
      onUseProjectAudio={useProjectAudio}
    />
  );
}
