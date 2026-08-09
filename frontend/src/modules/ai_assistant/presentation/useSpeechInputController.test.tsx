import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  VoiceRecorder,
  VoiceRecorderAvailability,
  VoiceRecorderCallbacks,
} from "@/shared/voice-recording/voice-recorder";
import { useSpeechInputController } from "@/modules/ai_assistant/public";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

class FakeVoiceRecorder implements VoiceRecorder {
  callbacks: VoiceRecorderCallbacks | null = null;
  availability = vi.fn<() => VoiceRecorderAvailability>(() => "available");
  start = vi.fn(async (callbacks: VoiceRecorderCallbacks) => {
    this.callbacks = callbacks;
  });
  stop = vi.fn(() => {
    this.callbacks?.onComplete({
      dataUrl: "data:audio/webm;base64,dm9pY2U=",
      durationSeconds: 1.5,
    });
  });
  release = vi.fn();
  dispose = vi.fn();
}

describe("SuperChat local speech input controller", () => {
  afterEach(() => vi.restoreAllMocks());

  it("records locally, transcribes through the sidecar, and projects the text", async () => {
    const recorder = new FakeVoiceRecorder();
    const transcribe = vi.fn().mockResolvedValue("你好，世界");
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useSpeechInputController({
        onTranscript,
        dependencies: {
          createRecorder: () => recorder,
          transcribe,
        },
      }),
    );

    act(() => result.current.toggleSpeech());
    expect(result.current.recording).toBe(true);
    expect(recorder.start).toHaveBeenCalledOnce();

    act(() => result.current.toggleSpeech());
    expect(recorder.stop).toHaveBeenCalledOnce();
    expect(result.current.transcribing).toBe(true);

    await waitFor(() => expect(result.current.transcribing).toBe(false));
    expect(transcribe).toHaveBeenCalledWith(
      "data:audio/webm;base64,dm9pY2U=",
    );
    expect(onTranscript).toHaveBeenCalledWith("你好，世界");
  });

  it("keeps the controller idle when microphone capture is unavailable", () => {
    const recorder = new FakeVoiceRecorder();
    recorder.availability.mockReturnValue("unavailable");
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useSpeechInputController({
        onTranscript,
        dependencies: {
          createRecorder: () => recorder,
          transcribe: vi.fn(),
        },
      }),
    );

    act(() => result.current.toggleSpeech());

    expect(result.current.recording).toBe(false);
    expect(recorder.start).not.toHaveBeenCalled();
    expect(recorder.dispose).toHaveBeenCalledOnce();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("disposes an active recorder when the composer unmounts", () => {
    const recorder = new FakeVoiceRecorder();
    const { result, unmount } = renderHook(() =>
      useSpeechInputController({
        onTranscript: vi.fn(),
        dependencies: {
          createRecorder: () => recorder,
          transcribe: vi.fn(),
        },
      }),
    );

    act(() => result.current.toggleSpeech());
    unmount();

    expect(recorder.dispose).toHaveBeenCalledOnce();
  });
});
