// Copyright (c) 2026 AI anime
import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { NarratorVoicePanelController } from "@/modules/production/application/use-narrator-voice-panel-controller";
import { NarratorVoicePanelView } from "@/modules/production/presentation/NarratorVoicePanelView";

const runtimeState = vi.hoisted(() => ({ isCeRuntime: true }));
const toastErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => runtimeState.isCeRuntime,
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: vi.fn(),
  },
}));

function NarratorVoicePanel({ project: _project }: { project: string }) {
  const controller = {
    aiSampleText: "Preview text",
    aiVoiceOpen: false,
    accountVoiceFailed: false,
    accountVoiceLoading: false,
    accountVoiceOptions: [],
    audioSrc: "/static/projects/demo/assets/narrator/voice.mp3",
    bindPending: false,
    canEdit: true,
    explanation: "Project narrator voice.",
    hasVoice: true,
    heading: "Narrator voice",
    pending: false,
    voiceSourceType: "account_voice",
    designGenerationPending: false,
    designLanguage: "",
    designName: "",
    designPreviewText: "",
    designPrompt: "",
    designVoiceAvailability: "catalogMissing",
    designVoiceConfig: null,
    designVoiceModelLabel: "",
    designVoiceModelSelector: "",
    designVoiceOptions: [],
    presetGenerationPending: false,
    presetVoice: "",
    presetVoiceAcceptsVoice: true,
    presetVoiceAllowsCustom: false,
    presetVoiceRequiresVoice: true,
    presetVoiceAvailability: "catalogMissing",
    presetVoiceModelLabel: "",
    presetVoiceModelSelector: "",
    presetVoiceModels: [],
    presetVoiceOptions: [],
    recordedDataUrl: "",
    recording: false,
    recordOpen: false,
    recordPending: false,
    recordStatus: "",
    trimDuration: "4",
    trimOpen: false,
    trimPending: false,
    trimStart: "0",
    onApplyTrim: async () => undefined,
    onAiSampleTextChange: vi.fn(),
    onAiVoiceOpenChange: vi.fn(),
    onDelete: async () => undefined,
    onDesignLanguageChange: vi.fn(),
    onDesignNameChange: vi.fn(),
    onDesignPreviewTextChange: vi.fn(),
    onDesignPromptChange: vi.fn(),
    onDesignVoiceModelChange: vi.fn(),
    onGenerateDesignedVoice: async () => undefined,
    onVoiceSourceTypeChange: vi.fn(),
    onGeneratePresetVoice: async () => undefined,
    onOpenAiVoice: vi.fn(),
    onOpenRecord: vi.fn(),
    onOpenTrim: vi.fn(),
    onRecordOpenChange: vi.fn(),
    onSaveRecording: async () => undefined,
    onBindAccountVoice: async () => undefined,
    onPresetVoiceChange: vi.fn(),
    onPresetVoiceModelChange: vi.fn(),
    onStartRecording: async () => undefined,
    onStopRecording: vi.fn(),
    onTrimDurationChange: vi.fn(),
    onTrimOpenChange: vi.fn(),
    onTrimStartChange: vi.fn(),
    onUpload: async () => undefined,
  } as NarratorVoicePanelController;

  return <NarratorVoicePanelView controller={controller} />;
}

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          common: {
            cancel: "Cancel",
            error: "Error",
            stop: "Stop",
          },
          episode: {
            workbench: {
              video: {
                seedance2Ready: "Ready",
                narratorVoice: "Narrator voice",
                narratorVoiceMissing: "Missing",
                narratorVoiceUpload: "Upload",
                narratorVoiceRecord: "Record",
                narratorVoiceTrim: "Trim",
                narratorVoiceDelete: "Delete",
                narratorVoiceRecordTitle: "Record narrator voice",
                narratorVoiceRecordHint: "Record a voice sample.",
                narratorVoiceRecordReady: "Ready to record",
                narratorVoiceRecordUnavailable: "Recording unavailable",
                narratorVoiceRequestingMic: "Requesting microphone",
                narratorVoiceRecorded: "Recorded {{seconds}}s",
                narratorVoiceRecordFailed: "Recording failed",
                narratorVoiceRecording: "Recording",
                narratorVoiceSaveRecording: "Save recording",
                narratorVoiceTrimTitle: "Trim narrator voice",
                narratorVoiceTrimHint: "Keep a short voice sample.",
                narratorVoiceTrimStart: "Start",
                narratorVoiceTrimDuration: "Duration",
                narratorVoiceTrimApply: "Apply trim",
                narratorVoiceTrimInvalid: "Invalid trim",
              },
            },
          },
        },
      },
    },
  });
});

function classNameContains(container: HTMLElement, token: string) {
  return Array.from(container.querySelectorAll("*")).some((node) =>
    String(node.getAttribute("class") ?? "").includes(token),
  );
}

describe("NarratorVoicePanel CE generation credit gating", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = true;
    toastErrorMock.mockClear();
  });

  it("keeps the narrator voice entry point free of credit UI, credit styling, and credit errors", () => {
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <NarratorVoicePanel project="demo" />
      </I18nextProvider>,
    );

    expect(screen.getAllByText("Narrator voice")).not.toHaveLength(0);
    expect(screen.getAllByRole("button", { name: "Upload" })).not.toHaveLength(0);

    expect(screen.queryByText(/credits?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/积分|额度/)).not.toBeInTheDocument();
    expect(classNameContains(container, "#007A87")).toBe(false);
    expect(toastErrorMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/积分不足|credit|insufficient/i),
    );
  });
});
