// Copyright (c) 2026 AI anime
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { NarratorVoicePanelController } from "@/modules/production/application/use-narrator-voice-panel-controller";
import { NarratorVoicePanelView } from "@/modules/production/presentation/NarratorVoicePanelView";

const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    interpolation: { escapeValue: false },
    resources: {
      zh: {
        translation: {
          common: { cancel: "取消", error: "错误" },
          episode: {
            workbench: {
              video: {
                seedance2Ready: "已配置",
                narratorVoice: "解说声线",
                narratorVoiceMissing: "声线缺失",
                narratorVoiceMissingDetail: "第三人称项目解说声线未配置",
                narratorVoiceUpload: "上传",
                narratorVoiceRecord: "录音",
                narratorVoiceProjectAudio: "项目音频",
                narratorVoiceAiGenerate: "AI 生成",
                narratorVoiceAiGenerateTitle: "生成解说声线",
                narratorVoiceConceptHint: "声线是身份，音色是质感。",
                narratorVoicePresetModel: "语音模型",
                narratorVoicePresetVoice: "预设声线",
                narratorVoiceDefaultSuffix: "（默认）",
                narratorVoiceSampleText: "试听文本",
                narratorVoicePresetHint: "无需上传音频。",
                narratorVoiceGenerateAndUse: "生成并使用",
                narratorVoicePresetAvailability: { ready: "可以生成" },
                narratorVoiceTrim: "裁剪",
                narratorVoiceDelete: "删除",
                narratorVoiceTrimTitle: "裁剪解说声线",
                narratorVoiceTrimHint: "Seedance 2.0 建议参考声线保留清晰单人声 3-5 秒。",
                narratorVoiceTrimStart: "起始秒",
                narratorVoiceTrimDuration: "保留秒数",
                narratorVoiceTrimApply: "裁剪到 3-5 秒",
                narratorVoiceTrimInvalid: "裁剪参数无效",
                narratorVoiceTrimmed: "解说声线已裁剪",
              },
            },
          },
        },
      },
    },
  });
});

const mutateTrim = vi.hoisted(() => vi.fn());
let mockHasVoice = false;

function NarratorVoicePanel({
  allowFirstPersonProjectVoice = false,
}: {
  allowFirstPersonProjectVoice?: boolean;
  project: string;
}) {
  const [trimOpen, setTrimOpen] = useState(false);
  const [aiVoiceOpen, setAiVoiceOpen] = useState(false);
  const controller = {
    aiSampleText: "你好，这是试听文本。",
    aiVoiceOpen,
    audioSrc: mockHasVoice
      ? "/static/projects/demo/assets/narrator/voice.mp3"
      : null,
    canEdit: allowFirstPersonProjectVoice,
    copyPending: false,
    explanation: "第一人称解说使用主角声线。",
    hasVoice: mockHasVoice,
    heading: "第一人称解说声线",
    pending: false,
    generationMode: "preset",
    designGenerationPending: false,
    designLanguage: "",
    designName: "",
    designPreviewText: "",
    designPrompt: "",
    designVoiceAvailability: "catalogMissing",
    designVoiceConfig: null,
    designVoiceModelLabel: "",
    presetGenerationPending: false,
    presetVoice: "claire",
    presetVoiceAvailability: "ready",
    presetVoiceModelLabel: "MOSS-TTSD v0.5",
    presetVoiceOptions: [
      { value: "claire", label: "Claire", isDefault: true },
    ],
    projectAudioOpen: false,
    recordedDataUrl: "",
    recording: false,
    recordOpen: false,
    recordPending: false,
    recordStatus: "",
    selectedSourcePath: "",
    sourceOptions: [],
    sourcesLoading: false,
    trimDuration: "4",
    trimOpen,
    trimPending: false,
    trimStart: "0",
    onApplyTrim: async () => {
      await mutateTrim({ startSeconds: 0, durationSeconds: 4 });
    },
    onAiSampleTextChange: vi.fn(),
    onAiVoiceOpenChange: setAiVoiceOpen,
    onDelete: async () => undefined,
    onDesignLanguageChange: vi.fn(),
    onDesignNameChange: vi.fn(),
    onDesignPreviewTextChange: vi.fn(),
    onDesignPromptChange: vi.fn(),
    onGenerateDesignedVoice: async () => undefined,
    onGenerationModeChange: vi.fn(),
    onGeneratePresetVoice: async () => undefined,
    onOpenAiVoice: () => setAiVoiceOpen(true),
    onOpenProjectAudio: vi.fn(),
    onOpenRecord: vi.fn(),
    onOpenTrim: () => setTrimOpen(true),
    onProjectAudioOpenChange: vi.fn(),
    onRecordOpenChange: vi.fn(),
    onSaveRecording: async () => undefined,
    onSelectedSourcePathChange: vi.fn(),
    onPresetVoiceChange: vi.fn(),
    onStartRecording: async () => undefined,
    onStopRecording: vi.fn(),
    onTrimDurationChange: vi.fn(),
    onTrimOpenChange: setTrimOpen,
    onTrimStartChange: vi.fn(),
    onUpload: async () => undefined,
    onUseProjectAudio: async () => undefined,
  } as NarratorVoicePanelController;

  return <NarratorVoicePanelView controller={controller} />;
}

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function renderPanel(allowFirstPersonProjectVoice = false) {
  render(
    <I18nextProvider i18n={i18n}>
      <NarratorVoicePanel
        project="demo"
        allowFirstPersonProjectVoice={allowFirstPersonProjectVoice}
      />
    </I18nextProvider>,
  );
}

describe("NarratorVoicePanel", () => {
  beforeEach(() => {
    mockHasVoice = false;
    mutateTrim.mockReset();
    mutateTrim.mockResolvedValue({
      ok: true,
      data: {
        reference_path: "assets/narrator/voice.mp3",
      },
    });
  });

  it("hides project narrator upload actions for first-person projects by default", () => {
    renderPanel(false);

    expect(screen.queryByRole("button", { name: "上传" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "录音" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "项目音频" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "裁剪" })).not.toBeInTheDocument();
  });

  it("allows project narrator upload actions when first-person project voice is explicitly enabled", () => {
    renderPanel(true);

    expect(screen.getByRole("button", { name: "上传" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "录音" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "项目音频" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "AI 生成" })).toBeInTheDocument();
  });

  it("exposes working preset generation without a hard-coded unavailable design tab", async () => {
    const user = userEvent.setup();
    renderPanel(true);

    await user.click(screen.getByRole("button", { name: "AI 生成" }));
    expect(
      screen.getByRole("dialog", { name: "生成解说声线" }),
    ).toBeInTheDocument();
    expect(screen.getByText("MOSS-TTSD v0.5")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "生成并使用" }),
    ).toBeEnabled();

    expect(screen.queryByText(/AUDIO_VOICE_DESIGN/)).not.toBeInTheDocument();
  });

  it("trims configured narrator voice from the assets voice panel", async () => {
    mockHasVoice = true;
    const user = userEvent.setup();
    renderPanel(true);

    await user.click(screen.getByRole("button", { name: "裁剪" }));

    expect(screen.getByRole("dialog", { name: "裁剪解说声线" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "裁剪到 3-5 秒" }));

    expect(mutateTrim).toHaveBeenCalledWith({
      startSeconds: 0,
      durationSeconds: 4,
    });
  });
});
