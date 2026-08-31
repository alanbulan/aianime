// Copyright (c) 2026 AI anime
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createUseNarratorVoicePanelController,
  type NarratorVoicePanelQueries,
} from "@/modules/production/application/use-narrator-voice-panel-controller";
import type { NarratorVoiceStatusData } from "@/modules/production/domain/narrator-voice";
import { TaskControllerProvider } from "@/modules/task_execution/public";
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

vi.mock("@/modules/task_execution/presentation/useTaskStream", () => ({
  useTaskStream: () => ({
    status: "idle" as const,
    progress: 0,
    currentTask: "",
    result: null,
    error: null,
    logs: [],
  }),
}));

const uploadVoice = vi.fn();
const recordVoice = vi.fn();
const generatePresetVoice = vi.fn();
const designNarratorVoice = vi.fn();
const bindNarratorVoice = vi.fn();
const loadVoiceOptions = vi.fn();
const trimVoice = vi.fn();
const deleteVoice = vi.fn();
const recorderStart = vi.fn();
const recorderStop = vi.fn();
const recorderRelease = vi.fn();
const recorderDispose = vi.fn();
const recorderAvailability = vi.fn();
let recorderCallbacks: VoiceRecorderCallbacks | null = null;

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
let accountVoiceOptions = [
  {
    voiceId: "fv_alex",
    label: "Alex",
    previewUrl: "/voices/fv_alex.wav",
  },
];

const queries: NarratorVoicePanelQueries = {
  useNarratorVoiceStatus: () => ({
    data: { ok: true, data: status },
    isLoading: false,
  }),
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
  useBindNarratorVoice: () => ({
    isPending: false,
    mutateAsync: bindNarratorVoice,
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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <TaskControllerProvider project="demo" episode={0}>
        {children}
      </TaskControllerProvider>
    </QueryClientProvider>
  );
}

function controllerOptions<T extends object>(overrides?: T) {
  return {
    project: "demo",
    loadVoiceOptions,
    ...overrides,
  };
}

describe("Production narrator voice panel controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    status = { ...baseStatus };
    accountVoiceOptions = [
      {
        voiceId: "fv_alex",
        label: "Alex",
        previewUrl: "/voices/fv_alex.wav",
      },
    ];
    loadVoiceOptions.mockImplementation(async () => accountVoiceOptions);
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
      bindNarratorVoice,
      trimVoice,
      deleteVoice,
    ]) {
      mutation.mockResolvedValue({ ok: true, data: status });
    }
  });

  it("projects status and edit permission without exposing project audio", async () => {
    status = { ...baseStatus, is_first_person: true };
    const { result, rerender } = renderHook(
      ({ allowFirstPersonProjectVoice }) =>
        useController(controllerOptions({
          allowFirstPersonProjectVoice,
        })),
      { initialProps: { allowFirstPersonProjectVoice: false }, wrapper },
    );

    expect(result.current.canEdit).toBe(false);
    expect(result.current.hasVoice).toBe(true);
    expect(result.current.audioSrc).toBe(
      "/static/projects/demo/assets/narrator/voice.mp3",
    );

    rerender({ allowFirstPersonProjectVoice: true });
    expect(result.current.canEdit).toBe(true);

    expect("onOpenProjectAudio" in result.current).toBe(false);
  });

  it("validates trim values and closes the dialog after a successful trim", async () => {
    const { result } = renderHook(
      () => useController(controllerOptions()),
      { wrapper },
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

  it("binds an account voice and exposes upload and delete commands", async () => {
    const { result } = renderHook(
      () => useController(controllerOptions()),
      { wrapper },
    );
    const file = new File(["voice"], "voice.wav", { type: "audio/wav" });

    act(() => result.current.onOpenVoiceGenerator());
    await waitFor(() =>
      expect(result.current.accountVoiceOptions).toHaveLength(1),
    );
    await act(async () => result.current.onBindAccountVoice("fv_alex"));
    await act(async () => result.current.onUpload(file));
    await act(async () => result.current.onDelete());

    expect(bindNarratorVoice).toHaveBeenCalledWith("fv_alex");
    expect(result.current.aiVoiceOpen).toBe(false);
    expect(uploadVoice).toHaveBeenCalledWith(file);
    expect(deleteVoice).toHaveBeenCalledOnce();
  });

  it("generates and saves a narrator reference from a catalog preset", async () => {
    generatePresetVoice.mockResolvedValue({
      ok: true,
      task_type: "freezone_voice_preset",
      task_id: "task-narrator-preset",
      task_key: "freezone_voice_preset:demo:0:project_narrator",
      scope: "project_narrator",
      message: "旁白预设声线任务已进入队列",
    });
    const { result } = renderHook(
      () => useController(controllerOptions({
        presetVoiceAvailability: "ready",
        presetVoiceDefaultSelector: "cloud:MOSS-TTSD-v0.5",
        presetVoiceModels: [
          {
            value: "cloud:MOSS-TTSD-v0.5",
            label: "MOSS-TTSD v0.5",
            acceptsVoice: true,
            voices: [
              { value: "claire", label: "Claire", isDefault: true },
              { value: "anna", label: "Anna" },
            ],
            allowsCustomVoice: false,
            requiresVoice: true,
          },
        ],
      })),
      { wrapper },
    );

    act(() => result.current.onOpenVoiceGenerator());
    expect(result.current.aiVoiceOpen).toBe(true);
    expect(result.current.presetVoice).toBe("claire");

    act(() => {
      result.current.onPresetVoiceChange("anna");
      result.current.onAiSampleTextChange("这是一段试听文本。");
    });
    await act(async () => result.current.onGeneratePresetVoice());

    expect(generatePresetVoice).toHaveBeenCalledWith({
      name: "Anna",
      model_selector: "cloud:MOSS-TTSD-v0.5",
      voice: "anna",
      text: "这是一段试听文本。",
    });
    expect(result.current.aiVoiceOpen).toBe(true);
    expect(result.current.pending).toBe(true);
    expect(toastSuccess).toHaveBeenCalledWith(
      "旁白预设声线任务已进入队列",
    );
  });

  it("designs a reusable voice from text with the manually selected BYOK route", async () => {
    designNarratorVoice.mockResolvedValue({
      ok: true,
      task_type: "freezone_voice_design",
      task_id: "task-narrator-design",
      task_key: "freezone_voice_design:demo:0:project_narrator",
      scope: "project_narrator",
      message: "旁白声线设计任务已进入队列",
    });
    const config = {
      promptMinLength: 1,
      promptMaxLength: 2048,
      previewTextMinLength: 1,
      previewTextMaxLength: 1024,
      preferredName: "custom_voice",
      languages: ["zh", "en"],
      defaultLanguage: "zh",
      sampleRates: [24000],
      defaultSampleRate: 24000,
      responseFormats: ["wav", "mp3"],
      defaultResponseFormat: "wav",
    };
    const { result } = renderHook(
      () => useController(controllerOptions({
        designVoiceAvailability: "ready",
        designVoiceDefaultSelector: "cloud:voice-design-model",
        designVoiceOptions: [
          {
            value: "cloud:voice-design-model",
            label: "Qwen voice design",
            config,
          },
          {
            value: "byok:fish:voice-design-model",
            label: "BYOK voice design",
            config,
          },
        ],
      })),
      { wrapper },
    );

    act(() => result.current.onOpenVoiceGenerator());
    expect(result.current.voiceSourceType).toBe("voice_design");
    expect(result.current.designLanguage).toBe("zh");
    expect(result.current.designVoiceModelSelector).toBe(
      "cloud:voice-design-model",
    );

    act(() => {
      result.current.onDesignVoiceModelChange(
        "byok:fish:voice-design-model",
      );
      result.current.onDesignNameChange("纪录片旁白");
      result.current.onDesignPromptChange("沉稳清晰、富有磁性的中年男声");
      result.current.onDesignPreviewTextChange("欢迎收听今天的节目。");
    });
    await act(async () => result.current.onGenerateDesignedVoice());

    expect(designNarratorVoice).toHaveBeenCalledWith({
      name: "纪录片旁白",
      model_selector: "byok:fish:voice-design-model",
      voice_prompt: "沉稳清晰、富有磁性的中年男声",
      preview_text: "欢迎收听今天的节目。",
      preferred_name: "custom_voice",
      language: "zh",
      sample_rate: 24000,
      response_format: "wav",
    });
    expect(result.current.aiVoiceOpen).toBe(true);
    expect(result.current.pending).toBe(true);
    expect(toastSuccess).toHaveBeenCalledWith(
      "旁白声线设计任务已进入队列",
    );
  });

  it("records through the shared recorder and saves the completed data URL", async () => {
    const { result, unmount } = renderHook(
      () => useController(controllerOptions()),
      { wrapper },
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
    const { result } = renderHook(
      () => useController(controllerOptions()),
      { wrapper },
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
