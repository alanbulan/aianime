// Copyright (c) 2026 AI anime
import { api } from "@/shared/api/transport";
import { dataUrlToBlob } from "@/shared/media/data-url";

type SpeechTranscriptionResponse = {
  ok: boolean;
  data?: {
    text?: unknown;
  };
};

export async function transcribeLocalSpeech(dataUrl: string): Promise<string> {
  const audio = dataUrlToBlob(dataUrl);
  const body = new FormData();
  body.append("audio", audio, recordingFileName(audio.type));
  const response = await api
    .post("api/v1/chat/speech/transcribe", {
      body,
      timeout: 120_000,
    })
    .json<SpeechTranscriptionResponse>();
  const text = response.data?.text;
  if (!response.ok || typeof text !== "string") {
    throw new Error("本地语音转写返回无效结果");
  }
  return text.trim();
}

function recordingFileName(contentType: string): string {
  if (contentType.includes("ogg")) return "recording.ogg";
  if (contentType.includes("mp4")) return "recording.m4a";
  return "recording.webm";
}
