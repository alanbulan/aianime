// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { backendErrorToastMessage } from "@/shared/api/errors";
import { createBrowserVoiceRecorder } from "@/shared/voice-recording/browser-voice-recorder";
import {
  VoiceRecorderStartError,
  type VoiceRecorder,
} from "@/shared/voice-recording/voice-recorder";
import { transcribeLocalSpeech } from "@/modules/ai_assistant/composition";

type SpeechInputStatus = "idle" | "recording" | "transcribing";

type SpeechInputDependencies = {
  createRecorder: () => VoiceRecorder;
  transcribe: (dataUrl: string) => Promise<string>;
};

const defaultDependencies: SpeechInputDependencies = {
  createRecorder: createBrowserVoiceRecorder,
  transcribe: transcribeLocalSpeech,
};

export function useSpeechInputController({
  onTranscript,
  dependencies = defaultDependencies,
}: {
  onTranscript: (text: string) => void;
  dependencies?: SpeechInputDependencies;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SpeechInputStatus>("idle");
  const recorderRef = useRef<VoiceRecorder | null>(null);

  useEffect(
    () => () => {
      recorderRef.current?.dispose();
      recorderRef.current = null;
    },
    [],
  );

  const toggleSpeech = useCallback(() => {
    if (status === "transcribing") return;
    if (status === "recording") {
      setStatus("transcribing");
      recorderRef.current?.stop();
      return;
    }

    const recorder = dependencies.createRecorder();
    const availability = recorder.availability();
    if (availability !== "available") {
      toast.error(
        t(
          availability === "insecure_context"
            ? "aiAssistant.voiceInsecureContext"
            : "aiAssistant.voiceUnavailable",
        ),
      );
      recorder.dispose();
      return;
    }

    recorderRef.current = recorder;
    setStatus("recording");
    void recorder
      .start({
        onComplete: (recording) => {
          setStatus("transcribing");
          void dependencies
            .transcribe(recording.dataUrl)
            .then((text) => {
              if (text) {
                onTranscript(text);
              } else {
                toast.error(t("aiAssistant.voiceNoSpeech"));
              }
            })
            .catch((error: unknown) => {
              const errorWithCause = error as { cause?: unknown };
              const cause =
                error instanceof Error && errorWithCause.cause instanceof Error
                  ? errorWithCause.cause
                  : error;
              toast.error(backendErrorToastMessage(cause, t));
            })
            .finally(() => {
              recorderRef.current = null;
              setStatus("idle");
            });
        },
        onFailure: () => {
          recorderRef.current = null;
          setStatus("idle");
          toast.error(t("aiAssistant.voiceRecordFailed"));
        },
      })
      .catch((error: unknown) => {
        recorderRef.current = null;
        setStatus("idle");
        const key =
          error instanceof VoiceRecorderStartError
            ? `aiAssistant.voiceStart.${error.reason}`
            : "aiAssistant.voiceStart.unknown";
        toast.error(t(key));
      });
  }, [dependencies, onTranscript, status, t]);

  return {
    recording: status === "recording",
    transcribing: status === "transcribing",
    toggleSpeech,
  };
}
