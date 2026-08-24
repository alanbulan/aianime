// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseNarratorVoicePanelController,
  type NarratorVoicePanelQueries,
} from "@/modules/production/application/use-narrator-voice-panel-controller";
import type { NarratorVoiceStatusData } from "@/modules/production/domain/narrator-voice";
import type {
  VoiceRecorder,
  VoiceRecorderCallbacks,
} from "@/shared/voice-recording/voice-recorder";

const toastError = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { seconds?: string }) =>
      values?.seconds ? `${key}:${values.seconds}` : key,
  }),
}));

vi.mock("sonner", () => ({
  toast: { error: toastError, success: toastSuccess },
}));

const uploadVoice = vi.fn();
const recordVoice = vi.fn();
const generatePresetVoice = vi.fn();
const designNarratorVoice = vi.fn();
const copyProjectVoice = vi.fn();
const trimVoice = vi.fn();
const deleteVoice = vi.fn();
const recorderStart = vi.fn();
const recorderStop = vi.fn();
const recorderRelease = vi.fn();
const recorderDispose = vi.fn();
const recorderAvailability = vi.fn();
let recorderCallbacks: VoiceRecorderCallbacks | null = null;
let sourcesEnabled = false;

const recorder: VoiceRecorder = {
  availability: recorderAvailability,
  start: recorderStart,
  stop: recorderStop,
  release: recorderRelease,
  dispose: recorderDispose,
};

const createVoiceRecorder = vi.fn(() => recorder);

const baseStatus: NarratorVoiceStatusData = {
  narration_style: "third_person",
  source: "project_narrator",
  reference_path: "assets/narrator/voice.mp3",
  reference_url: "/static/projects/demo/assets/narrator/voice.mp3",
  heading: "Project narrator",
  detail: "",
  explanation: "Configured project narrator voice.",
  is_first_person: false,
};
let status = { ...baseStatus };
let sourceOptions = [
  {
    label: "Beat 1 narration",
    path: "audio/beat_1.wav",
    rel_path: "audio/beat_1.wav",
  },
];

const queries: NarratorVoicePanelQueries = {
  useNarratorVoiceStatus: () => ({
    data: { ok: true, data: status },
    isLoading: false,
  }),
  useNarratorVoiceSources: (_project, enabled) => {
    sourcesEnabled = enabled;
    return {
      data: { ok: true, data: { options: sourceOptions } },
      isLoading: false,
    };
  },
  useUploadNarratorVoice: () => ({
    isPending: false,
    mutateAsync: uploadVoice,
  }),
  useRecordNarratorVoice: () => ({
    isPending: false,
    mutateAsync: recordVoice,
  }),
  useGenerateNarratorVoicePreset: () => ({
    isPending: false,
    mutateAsync: generatePresetVoice,
  }),
  useDesignNarratorVoice: () => ({
    isPending: false,
    mutateAsync: designNarratorVoice,
  }),
  useCopyProjectNarratorVoice: () => ({
    isPending: false,
    mutateAsync: copyProjectVoice,
  }),
  useTrimNarratorVoice: () => ({
    isPending: false,
    mutateAsync: trimVoice,
  }),
  useDeleteNarratorVoice: () => ({
    isPending: false,
    mutateAsync: deleteVoice,
  }),
};

const useController = createUseNarratorVoicePanelController(queries, {
  createVoiceRecorder,
});

describe("Production narrator voice panel controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status = { ...baseStatus };
    sourceOptions = [
      {
        label: "Beat 1 narration",
        path: "audio/beat_1.wav",
        rel_path: "audio/beat_1.wav",
      },
    ];
    sourcesEnabled = false;
    recorderCallbacks = null;
    recorderAvailability.mockReturnValue("available");
    recorderStart.mockImplementation(
      async (callbacks: VoiceRecorderCallbacks) => {
        recorderCallbacks = callbacks;
      },
    );
    for (const mutation of [
      uploadVoice,
      recordVoice,
      generatePresetVoice,
      designNarratorVoice,
      copyProjectVoice,
      trimVoice,
      deleteVoice,
    ]) {
      mutation.mockResolvedValue({ ok: true, data: status });
    }
  });

  it("projects status, edit permission, and the default project audio source", async () => {
    status = { ...baseStatus, is_first_person: true };
    const { result, rerender } = renderHook(
      ({ allowFirstPersonProjectVoice }) =>
        useController({
          project: "demo",
          allowFirstPersonProjectVoice,
        }),
      { initialProps: { allowFirstPersonProjectVoice: false } },
    );

    expect(result.current.canEdit).toBe(false);
    expect(result.current.hasVoice).toBe(true);
    expect(result.current.audioSrc).toBe(
      "/static/projects/demo/assets/narrator/voice.mp3",
    );

    rerender({ allowFirstPersonProjectVoice: true });
    expect(result.current.canEdit).toBe(true);

    act(() => result.current.onOpenProjectAudio());
    await waitFor(() => {
      expect(result.current.selectedSourcePath).toBe("audio/beat_1.wav");
    });
    expect(sourcesEnabled).toBe(true);
  });

  it("validates trim values and closes the dialog after a successful trim", async () => {
    const { result } = renderHook(() =>
      useController({ project: "demo" }),
    );

    act(() => {
      result.current.onOpenTrim();
      result.current.onTrimStartChange("-1");
    });
    await act(async () => result.current.onApplyTrim());

    expect(trimVoice).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "episode.workbench.video.narratorVoiceTrimInvalid",
    );

    act(() => {
      result.current.onTrimStartChange("1.5");
      result.current.onTrimDurationChange("3.5");
    });
    await act(async () => result.current.onApplyTrim());

    expect(trimVoice).toHaveBeenCalledWith({
      startSeconds: 1.5,
      durationSeconds: 3.5,
    });
    expect(result.current.trimOpen).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.video.narratorVoiceTrimmed",
    );
  });

  it("copies the selected project audio and exposes upload and delete commands", async () => {
    const { result } = renderHook(() =>
      useController({ project: "demo" }),
    );
    const file = new File(["voice"], "voice.wav", { type: "audio/wav" });

    act(() => result.current.onOpenProjectAudio());
    await waitFor(() => {
      expect(result.current.selectedSourcePath).toBe("audio/beat_1.wav");
    });
    await act(async () => result.current.onUseProjectAudio());
    await act(async () => result.current.onUpload(file));
    await act(async () => result.current.onDelete());

    expect(copyProjectVoice).toHaveBeenCalledWith("audio/beat_1.wav");
    expect(result.current.projectAudioOpen).toBe(false);
    expect(uploadVoice).toHaveBeenCalledWith(file);
    expect(deleteVoice).toHaveBeenCalledOnce();
  });

  it("generates and saves a narrator reference from a catalog preset", async () => {
    const { result } = renderHook(() =>
      useController({
        project: "demo",
        presetVoiceAvailability: "ready",
        presetVoiceModelLabel: "MOSS-TTSD v0.5",
        presetVoiceOptions: [
          { value: "claire", label: "Claire", isDefault: true },
          { value: "anna", label: "Anna" },
        ],
      }),
    );

    act(() => result.current.onOpenAiVoice());
    expect(result.current.aiVoiceOpen).toBe(true);
    expect(result.current.presetVoice).toBe("claire");

    act(() => {
      result.current.onPresetVoiceChange("anna");
      result.current.onAiSampleTextChange("这是一段试听文本。");
    });
    await act(async () => result.current.onGeneratePresetVoice());

    expect(generatePresetVoice).toHaveBeenCalledWith({
      name: "Anna",
      voice: "anna",
      text: "这是一段试听文本。",
    });
    expect(result.current.aiVoiceOpen).toBe(false);
    expect(toastSuccess).toHaveBeenCalledWith(
      "episode.workbench.video.narratorVoicePresetGenerated",
    );
  });

  it("designs a reusable voice from text with the selected cloud route", async () => {
    const { result } = renderHook(() =>
      useController({
        project: "demo",
        designVoiceAvailability: "ready",
        designVoiceModelLabel: "Qwen voice design",
        designVoiceModelSelector: "cloud:voice-design-model",
        designVoiceConfig: {
          promptMaxLength: 2048,
          previewTextMaxLength: 1024,
          preferredName: "custom_voice",
          languages: ["zh", "en"],
          defaultLanguage: "zh",
          sampleRates: [24000],
          defaultSampleRate: 24000,
          responseFormats: ["wav", "mp3"],
          defaultResponseFormat: "wav",
        },
      }),
    );

    act(() => result.current.onOpenAiVoice());
    expect(result.current.generationMode).toBe("design");
    expect(result.current.designLanguage).toBe("zh");

    act(() => {
      result.current.onDesignNameChange("纪录片旁白");
      result.current.onDesignPromptChange("沉稳清晰、富有磁性的中年男声");
      result.current.onDesignPreviewTextChange("欢迎收听今天的节目。");
    });
    await act(async () => result.current.onGenerateDesignedVoice());

    expect(designNarratorVoice).toHaveBeenCalledWith({
      name: "纪录片旁白",
      model_selector: "cloud:voice-design-model",
      voice_prompt: "沉稳清晰、富有磁性的中年男声",
      preview_text: "欢迎收听今天的节目。",
      preferred_name: "custom_voice",
      language: "zh",
      sample_rate: 24000,
      response_format: "wav",
    });
    expect(result.current.aiVoiceOpen).toBe(false);
  });

  it("records through the shared recorder and saves the completed data URL", async () => {
    const { result, unmount } = renderHook(() =>
      useController({ project: "demo" }),
    );

    act(() => result.current.onOpenRecord());
    expect(result.current.recordOpen).toBe(true);
    expect(result.current.recordStatus).toBe(
      "episode.workbench.video.narratorVoiceRecordReady",
    );

    await act(async () => result.current.onStartRecording());
    expect(recorderStart).toHaveBeenCalledOnce();
    expect(result.current.recording).toBe(true);

    const callbacks = recorderCallbacks;
    expect(callbacks).not.toBeNull();
    act(() => {
      callbacks?.onComplete({
        dataUrl: "data:audio/webm;base64,voice",
        durationSeconds: 2.34,
      });
    });

    expect(result.current.recording).toBe(false);
    expect(result.current.recordedDataUrl).toBe(
      "data:audio/webm;base64,voice",
    );
    expect(result.current.recordStatus).toBe(
      "episode.workbench.video.narratorVoiceRecorded:2.3",
    );

    await act(async () => result.current.onSaveRecording());
    expect(recordVoice).toHaveBeenCalledWith(
      "data:audio/webm;base64,voice",
    );
    expect(result.current.recordOpen).toBe(false);

    unmount();
    expect(recorderDispose).toHaveBeenCalledOnce();
  });

  it("reports an unavailable or failed recorder", async () => {
    recorderAvailability.mockReturnValue("unavailable");
    const { result } = renderHook(() =>
      useController({ project: "demo" }),
    );

    await act(async () => result.current.onStartRecording());
    expect(recorderStart).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      "episode.workbench.video.narratorVoiceRecordUnavailable",
    );

    recorderAvailability.mockReturnValue("available");
    recorderStart.mockRejectedValueOnce(new Error("permission denied"));
    await act(async () => result.current.onStartRecording());

    expect(result.current.recording).toBe(false);
    expect(result.current.recordStatus).toBe(
      "episode.workbench.video.narratorVoiceRecordFailed",
    );
    expect(toastError).toHaveBeenCalledWith(
      "episode.workbench.video.narratorVoiceRecordFailed",
    );
  });
});
