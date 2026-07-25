// Copyright (c) 2026 AI anime
import {
  VoiceRecorderStartError,
  type VoiceRecorder,
  type VoiceRecorderCallbacks,
  type VoiceRecorderStartFailureReason,
} from "@/shared/voice-recording/voice-recorder";

function dataUrlFromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function failureReason(error: unknown): VoiceRecorderStartFailureReason {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "permission_denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "device_missing";
    case "NotReadableError":
    case "TrackStartError":
      return "device_busy";
    default:
      return "unknown";
  }
}

class BrowserVoiceRecorder implements VoiceRecorder {
  private chunks: Blob[] = [];
  private recorder: MediaRecorder | null = null;
  private startedAt = 0;
  private stream: MediaStream | null = null;

  availability() {
    if (!window.isSecureContext) return "insecure_context" as const;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      return "unavailable" as const;
    }
    return "available" as const;
  }

  async start(callbacks: VoiceRecorderCallbacks): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      this.chunks = [];
      const recorder = new MediaRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onstop = async () => {
        try {
          const blob = new Blob(this.chunks, {
            type: recorder.mimeType || "audio/webm",
          });
          callbacks.onComplete({
            dataUrl: await dataUrlFromBlob(blob),
            durationSeconds: Math.max(
              0,
              (performance.now() - this.startedAt) / 1000,
            ),
          });
        } catch {
          callbacks.onFailure();
        } finally {
          this.release();
        }
      };
      this.startedAt = performance.now();
      recorder.start();
    } catch (error) {
      this.release();
      console.error("[voice-record] getUserMedia failed", error);
      throw new VoiceRecorderStartError(failureReason(error));
    }
  }

  stop(): void {
    this.recorder?.stop();
  }

  release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
  }

  dispose(): void {
    try {
      this.recorder?.stop();
    } catch {
      // The recorder may already be inactive during unmount cleanup.
    }
    this.release();
  }
}

export function createBrowserVoiceRecorder(): VoiceRecorder {
  return new BrowserVoiceRecorder();
}
