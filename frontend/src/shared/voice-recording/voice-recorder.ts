// Copyright (c) 2026 AI anime
export type VoiceRecorderAvailability =
  | "available"
  | "insecure_context"
  | "unavailable";

export type VoiceRecorderStartFailureReason =
  | "permission_denied"
  | "device_missing"
  | "device_busy"
  | "unknown";

export interface VoiceRecording {
  dataUrl: string;
  durationSeconds: number;
}

export interface VoiceRecorderCallbacks {
  onComplete(recording: VoiceRecording): void;
  onFailure(): void;
}

export class VoiceRecorderStartError extends Error {
  constructor(readonly reason: VoiceRecorderStartFailureReason) {
    super(reason);
    this.name = "VoiceRecorderStartError";
  }
}

export interface VoiceRecorder {
  availability(): VoiceRecorderAvailability;
  start(callbacks: VoiceRecorderCallbacks): Promise<void>;
  stop(): void;
  release(): void;
  dispose(): void;
}
