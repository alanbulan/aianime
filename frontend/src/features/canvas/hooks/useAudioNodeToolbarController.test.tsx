// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

;

import { useAudioNodeToolbarController } from "./useAudioNodeToolbarController";

import type { AudioNodeData } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  downloadBlob: vi.fn(),
  downloadUrl: vi.fn(),
  resolveUrl: vi.fn(),
  transcode: vi.fn(),
  toastError: vi.fn(),
  fetch: vi.fn(),
  t: vi.fn((key: string) => key),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mocks.t }),
}));

vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mocks.toastError(...args) },
}));

vi.mock("@/modules/creative_canvas/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/creative_canvas/public")>()),
  useCanvasStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) => selector({ updateNodeData: mocks.updateNodeData }),
  resolveImageDisplayUrl: (...args: unknown[]) => mocks.resolveUrl(...args),
}));

vi.mock("@/lib/browserDownload", () => ({
  downloadBlobAsFile: (...args: unknown[]) => mocks.downloadBlob(...args),
  downloadUrlAsFile: (...args: unknown[]) => mocks.downloadUrl(...args),
}));

vi.mock("@/lib/audioTranscode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/audioTranscode")>();
  return {
    ...actual,
  useCanvasStore: (
    selector: (state: Record<string, unknown>) => unknown,
  ) => selector({ updateNodeData: mocks.updateNodeData }),
    transcodeAudio: (...args: unknown[]) => mocks.transcode(...args),
  };
});

function data(patch: Partial<AudioNodeData> = {}): AudioNodeData {
  return {
    audioUrl: "/source.m4a",
    sourceFileName: "episode_背景音",
    ...patch,
  };
}

describe("useAudioNodeToolbarController", () => {
  beforeEach(() => {
    for (const mock of [
      mocks.updateNodeData,
      mocks.downloadBlob,
      mocks.downloadUrl,
      mocks.resolveUrl,
      mocks.transcode,
      mocks.toastError,
      mocks.fetch,
      mocks.t,
    ]) {
      mock.mockReset();
    }
    mocks.resolveUrl.mockImplementation((url: string) => `resolved:${url}`);
    mocks.t.mockImplementation((key: string) => key);
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("projects conversion state and format availability", () => {
    const { result } = renderHook(() =>
      useAudioNodeToolbarController({
        nodeId: "audio-a",
        data: data({
          audioUrl: "/source.mp3",
          convertingAudioFormat: "wav",
        }),
      }),
    );

    expect(result.current).toMatchObject({
      hasAudio: true,
      baseFilename: "episode_背景音",
      convertingFormat: "wav",
      isConverting: true,
      formatOptions: [
        { format: "mp3", available: true },
        { format: "m4a", available: false },
        { format: "wav", available: true },
      ],
    });
  });

  it("rejects unavailable M4A output before fetching source bytes", async () => {
    const { result } = renderHook(() =>
      useAudioNodeToolbarController({
        nodeId: "audio-a",
        data: data({ audioUrl: "/source.mp3" }),
      }),
    );

    await act(async () => result.current.download("m4a"));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "nodeToolbar.audio.m4aSourceOnly",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
  });

  it("downloads matching source containers without conversion", async () => {
    mocks.downloadUrl.mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAudioNodeToolbarController({
        nodeId: "audio-a",
        data: data({ audioUrl: "/source.mp3" }),
      }),
    );

    await act(async () => result.current.download("mp3"));

    expect(mocks.downloadUrl).toHaveBeenCalledWith(
      "resolved:/source.mp3",
      "episode_背景音.mp3",
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.transcode).not.toHaveBeenCalled();
    expect(mocks.updateNodeData).not.toHaveBeenCalled();
  });

  it("transcodes source bytes and clears the persisted conversion state", async () => {
    const sourceBlob = new Blob(["source"]);
    const outputBlob = new Blob(["output"]);
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(sourceBlob),
    });
    mocks.transcode.mockResolvedValue(outputBlob);
    const { result } = renderHook(() =>
      useAudioNodeToolbarController({ nodeId: "audio-a", data: data() }),
    );

    await act(async () => result.current.download("wav"));

    expect(mocks.fetch).toHaveBeenCalledWith("resolved:/source.m4a");
    expect(mocks.transcode).toHaveBeenCalledWith(sourceBlob, "m4a", "wav");
    expect(mocks.downloadBlob).toHaveBeenCalledWith(
      outputBlob,
      "episode_背景音.wav",
    );
    expect(mocks.updateNodeData.mock.calls).toEqual([
      ["audio-a", { convertingAudioFormat: "wav" }],
      ["audio-a", { convertingAudioFormat: null }],
    ]);
  });

  it("reports conversion failures and still clears the active format", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      blob: vi.fn(),
    });
    const { result } = renderHook(() =>
      useAudioNodeToolbarController({ nodeId: "audio-a", data: data() }),
    );

    await act(async () => result.current.download("wav"));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "nodeToolbar.audio.downloadFailed",
    );
    expect(mocks.updateNodeData.mock.calls).toEqual([
      ["audio-a", { convertingAudioFormat: "wav" }],
      ["audio-a", { convertingAudioFormat: null }],
    ]);
  });
});
