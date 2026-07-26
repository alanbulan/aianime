// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

import { probeAudioDurationMs } from "./browserAudioMetadata";

function installAudioElement(duration = Number.NaN): {
  audio: HTMLAudioElement;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
} {
  const load = vi.fn();
  const removeAttribute = vi.fn();
  const audio = {
    duration,
    load,
    onerror: null,
    onloadedmetadata: null,
    preload: "",
    removeAttribute,
    src: "",
  } as unknown as HTMLAudioElement;

  vi.spyOn(document, "createElement").mockImplementation(
    ((tagName: string) => {
      expect(tagName).toBe("audio");
      return audio;
    }) as typeof document.createElement,
  );

  return { audio, load, removeAttribute };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("probeAudioDurationMs", () => {
  it("returns null without creating an element for an empty URL", async () => {
    const createElement = vi.spyOn(document, "createElement");

    await expect(probeAudioDurationMs("")).resolves.toBeNull();
    expect(createElement).not.toHaveBeenCalled();
  });

  it("reads and rounds loaded audio metadata, then releases the resource", async () => {
    vi.useFakeTimers();
    const { audio, load, removeAttribute } = installAudioElement(1.2346);

    const result = probeAudioDurationMs("https://cdn.example.test/voice.wav");
    expect(audio.preload).toBe("metadata");
    expect(audio.src).toBe("https://cdn.example.test/voice.wav");

    audio.onloadedmetadata?.call(audio, new Event("loadedmetadata"));

    await expect(result).resolves.toBe(1235);
    expect(removeAttribute).toHaveBeenCalledWith("src");
    expect(load).toHaveBeenCalledOnce();
    expect(audio.onloadedmetadata).toBeNull();
    expect(audio.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns null and cleans up when the media element reports an error", async () => {
    vi.useFakeTimers();
    const { audio, load } = installAudioElement();

    const result = probeAudioDurationMs("/static/missing.wav");
    audio.onerror?.call(audio, new Event("error"));

    await expect(result).resolves.toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns null and cleans up after eight seconds without metadata", async () => {
    vi.useFakeTimers();
    const { load } = installAudioElement();

    const result = probeAudioDurationMs("/static/slow.wav");
    await vi.advanceTimersByTimeAsync(8000);

    await expect(result).resolves.toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
