// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSpeechInputController } from "@/modules/ai_assistant/public";

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string; isFinal?: boolean }>>;
};

class FakeSpeechRecognition {
  static latest: FakeSpeechRecognition | null = null;

  continuous = false;
  interimResults = false;
  lang = "";
  start = vi.fn();
  stop = vi.fn();
  onresult: ((event: SpeechResultEvent) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.latest = this;
  }
}

function installRecognition(name: "SpeechRecognition" | "webkitSpeechRecognition") {
  Object.defineProperty(window, name, {
    configurable: true,
    value: FakeSpeechRecognition,
  });
}

describe("SuperChat speech input controller", () => {
  afterEach(() => {
    Reflect.deleteProperty(window, "SpeechRecognition");
    Reflect.deleteProperty(window, "webkitSpeechRecognition");
    FakeSpeechRecognition.latest = null;
    vi.restoreAllMocks();
  });

  it("remains idle when browser speech recognition is unavailable", () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useSpeechInputController({ onTranscript }),
    );

    act(() => result.current.toggleSpeech());

    expect(result.current.recording).toBe(false);
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("starts the WebKit fallback and projects accumulated transcripts", () => {
    installRecognition("webkitSpeechRecognition");
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useSpeechInputController({ onTranscript }),
    );

    act(() => result.current.toggleSpeech());
    const recognition = FakeSpeechRecognition.latest;
    expect(recognition).not.toBeNull();
    expect(result.current.recording).toBe(true);
    expect(recognition?.continuous).toBe(true);
    expect(recognition?.interimResults).toBe(true);
    expect(recognition?.lang).toBe("zh-CN");
    expect(recognition?.start).toHaveBeenCalledTimes(1);

    act(() => {
      recognition?.onresult?.({
        results: [
          [{ transcript: "你好" }],
          [{ transcript: "世界", isFinal: true }],
        ],
      });
    });
    expect(onTranscript).toHaveBeenCalledWith("你好世界");
  });

  it("stops on a second toggle and clears recording when recognition ends", () => {
    installRecognition("SpeechRecognition");
    const { result } = renderHook(() =>
      useSpeechInputController({ onTranscript: vi.fn() }),
    );

    act(() => result.current.toggleSpeech());
    const recognition = FakeSpeechRecognition.latest;
    act(() => result.current.toggleSpeech());
    expect(recognition?.stop).toHaveBeenCalledTimes(1);
    expect(result.current.recording).toBe(false);

    act(() => result.current.toggleSpeech());
    const restarted = FakeSpeechRecognition.latest;
    expect(result.current.recording).toBe(true);
    act(() => restarted?.onend?.());
    expect(result.current.recording).toBe(false);
  });
});
