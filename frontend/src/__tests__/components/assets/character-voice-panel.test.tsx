// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18next from "i18next";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ky from "ky";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { CharacterVoicePanelContent } from "@/modules/asset_world/composition";
import type { Character } from "@/modules/asset_world/public";

const server = setupServer();
const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.use(initReactI18next).init({
    lng: "zh",
    fallbackLng: "zh",
    resources: {
      zh: {
        translation: {
          characters: {
            voiceSamples: {
              title: "声线管理 (IndexTTS2)",
              hint: "通常只需上传默认声线；只有年龄变体需要不同声音时再覆盖。",
              defaultRequired: "默认（必填）",
              ageDefaultRequired: "{{age}}（默认 · 必填）",
              optionalOverride: "{{age}}（可选覆盖）",
              missingDefault: "未配置 → 角色将无法出声",
              inheritedDefault: "→ 继承默认",
              missing: "未配置",
              upload: "上传声音样本",
              record: "录音",
              trim: "裁剪到 3-5 秒",
              clear: "清除",
              loading: "正在读取声线样本",
              loadFailed: "读取声线样本失败",
              currentDuration: "当前约 {{seconds}} 秒",
              selectExisting: "选择声线",
              voiceLibraryTitle: "为「{{target}}」选择声线",
              voiceLibraryHint: "选择账号声线库中的声线。",
              libraryLoading: "正在读取声线库",
              libraryFailed: "声线库读取失败",
              libraryEmpty: "声线库为空",
              voiceDesignTab: "文字设计声线",
              voiceLibraryTab: "已有声线",
              voiceDesignModel: "声线设计模型",
              voiceDesignName: "声线名称",
              voiceDesignPrompt: "音色描述",
              voiceDesignPromptPlaceholder: "描述音色",
              voiceDesignPreview: "试听文本",
              voiceDesignLanguage: "试听语言",
              voiceDesignAndBind: "生成并绑定到当前项",
              voiceDesignPromptRequired: "请填写音色描述",
              voiceDesignPreviewRequired: "请填写试听文本",
              voiceDesignFailed: "文字设计声线失败",
              voiceDesignedAndBound: "新声线已生成并绑定",
              bind: "绑定",
              bound: "声线已绑定",
              identityTitle: "身份专属声线",
              identityHint: "身份优先，其次年龄段，最后角色默认。",
              identityDirect: "使用身份专属声线",
              identityInheritedAge: "继承 {{age}} 年龄段声线",
              identityInheritedDefault: "继承角色默认声线",
              identityMissing: "没有可继承的声线",
              removeIdentityOverride: "清除身份专属声线",
              identityCleared: "身份专属声线已清除",
            },
            ageGroups: {
              child: "幼年",
              young: "青年",
              middle: "中年",
              elder: "老年",
            },
          },
          common: {
            error: "错误",
          },
          episode: {
            workbench: {
              video: {
                narratorVoiceDesignLanguages: { zh: "中文" },
              },
            },
          },
        },
      },
    },
    interpolation: { escapeValue: false },
  });
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

function renderPanel(character: Character) {
  return render(
    <CharacterVoicePanelContent project="demo" character={character} />,
    { wrapper },
  );
}

describe("CharacterVoicePanel", () => {
  it("renders default and age voice slots with inherited status and actions", async () => {
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/voice-samples",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              character: "秦",
              slots: [
                {
                  slot: "default",
                  label: "默认（兜底）",
                  path: "assets/characters/秦/voices/voice_default.wav",
                  url: "/static/admin/demo/assets/characters/秦/voices/voice_default.wav",
                  sha256: "sha-default",
                  updated_at: "2026-05-13T00:00:00+00:00",
                  inherited_from_default: false,
                  required: true,
                },
                {
                  slot: "child",
                  label: "幼年",
                  path: "",
                  url: "",
                  sha256: "",
                  updated_at: "",
                  inherited_from_default: true,
                  required: false,
                },
                {
                  slot: "youth",
                  label: "青年",
                  path: "",
                  url: "",
                  sha256: "",
                  updated_at: "",
                  inherited_from_default: true,
                  required: false,
                },
                {
                  slot: "middle",
                  label: "中年",
                  path: "",
                  url: "",
                  sha256: "",
                  updated_at: "",
                  inherited_from_default: true,
                  required: false,
                },
                {
                  slot: "elder",
                  label: "老年",
                  path: "assets/characters/秦/voices/voice_elder.wav",
                  url: "/static/admin/demo/assets/characters/秦/voices/voice_elder.wav",
                  sha256: "sha-elder",
                  updated_at: "2026-05-13T00:00:01+00:00",
                  inherited_from_default: false,
                  required: false,
                },
              ],
            },
          }),
      ),
    );

    const { container } = renderPanel({ name: "秦", age_group: "youth" });

    expect(await screen.findByText("声线管理 (IndexTTS2)")).toBeInTheDocument();
    expect(await screen.findByText("青年（默认 · 必填）")).toBeInTheDocument();
    expect(screen.getByText("幼年（可选覆盖）")).toBeInTheDocument();
    expect(screen.getAllByText("→ 继承默认").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("voice_elder.wav")).toHaveAttribute(
      "data-ui-tooltip",
      "assets/characters/秦/voices/voice_elder.wav",
    );
    expect(screen.getAllByRole("button", { name: "上传声音样本" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "录音" })).toHaveLength(4);
    expect(screen.getAllByRole("button", { name: "裁剪到 3-5 秒" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "清除" })).toHaveLength(2);

    const audio = await waitFor(() => {
      const el = container.querySelector("audio");
      expect(el).not.toBeNull();
      return el as HTMLAudioElement;
    });
    Object.defineProperty(audio, "duration", { value: 6.5, configurable: true });
    fireEvent.loadedMetadata(audio);
    expect(await screen.findByText("当前约 6.5 秒")).toBeInTheDocument();
  });

  it("warns when the default voice is missing", async () => {
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/voice-samples",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              character: "秦",
              slots: [
                {
                  slot: "default",
                  label: "默认（兜底）",
                  path: "",
                  url: "",
                  sha256: "",
                  updated_at: "",
                  inherited_from_default: false,
                  required: true,
                },
              ],
            },
          }),
      ),
    );

    renderPanel({ name: "秦" });

    await waitFor(() =>
      expect(screen.getByText("未配置 → 角色将无法出声")).toBeInTheDocument(),
    );
  });

  it("shows an error instead of crashing when the voice API returns ok false", async () => {
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/voice-samples",
        () =>
          HttpResponse.json({
            ok: false,
            error: "Character '秦' not found",
          }),
      ),
    );

    renderPanel({ name: "秦" });

    expect(await screen.findByText("读取声线样本失败")).toBeInTheDocument();
  });

  it("binds an AI-generated library voice to a specific identity", async () => {
    let bindBody: unknown;
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/voice-samples",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              character: "秦",
              slots: [],
              identities: [
                {
                  identity_id: "秦_少年",
                  identity_name: "少年时期",
                  age_group: "child",
                  path: "",
                  url: "",
                  sha256: "",
                  updated_at: "",
                  resolved_path: "",
                  resolved_url: "",
                  resolved_from: "",
                },
              ],
            },
          }),
      ),
      http.get(
        "http://localhost:3000/api/v1/projects/demo/freezone/audio/references",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              available: [
                {
                  scope: "user_custom",
                  voice_id: "fv_generated",
                  label: "AI 生成 · Claire",
                  url: "/api/v1/projects/demo/freezone/audio/voices/fv_generated/media",
                },
              ],
            },
          }),
      ),
      http.post(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/identities/%E7%A7%A6_%E5%B0%91%E5%B9%B4/voice/bind",
        async ({ request }) => {
          bindBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              identity_id: "秦_少年",
              identity_name: "少年时期",
              age_group: "child",
              path: "assets/characters/秦/identities/秦_少年/voice_reference.mp3",
              url: "/static/voice_reference.mp3",
              sha256: "bound-sha",
              updated_at: "2026-08-24T00:00:00+00:00",
              resolved_path: "assets/characters/秦/identities/秦_少年/voice_reference.mp3",
              resolved_url: "/static/voice_reference.mp3",
              resolved_from: "identity",
            },
          });
        },
      ),
    );

    renderPanel({ name: "秦" });

    expect(await screen.findByText("身份专属声线")).toBeInTheDocument();
    const chooseButtons = screen.getAllByRole("button", { name: "选择声线" });
    fireEvent.click(chooseButtons[chooseButtons.length - 1]);
    expect(await screen.findByText("AI 生成 · Claire")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "绑定" }));

    await waitFor(() =>
      expect(bindBody).toEqual({ voice_id: "fv_generated" }),
    );
  });

  it("requests the cloud voice-design catalog and generates a voice for an identity", async () => {
    const modelCatalog = vi.fn(async () => ({
      catalogVersion: "voice-design-v1",
      items: [
        {
          id: "voice-design-1",
          code: "QWEN3_TTS_VD_2026_01_26",
          displayName: "Qwen3 TTS Voice Design",
          operation: "AUDIO_VOICE_DESIGN",
          capabilityJson: JSON.stringify({
            supportedModes: ["VOICE_DESIGN"],
          }),
          parameterSchemaJson: JSON.stringify({
            type: "object",
            properties: {
              voice_prompt: { type: "string", maxLength: 2048 },
              preview_text: { type: "string", maxLength: 1024 },
              preferred_name: {
                type: "string",
                default: "custom_voice",
              },
              language: {
                type: "string",
                enum: ["zh"],
                default: "zh",
              },
              sample_rate: {
                type: "integer",
                enum: [24000],
                default: 24000,
              },
              response_format: {
                type: "string",
                enum: ["wav"],
                default: "wav",
              },
            },
          }),
          isDefault: true,
        },
      ],
    }));
    vi.stubGlobal("aiAnimeDesktop", {
      commercial: { modelCatalog },
    });
    let designBody: unknown;
    let bindBody: unknown;
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/voice-samples",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              character: "秦",
              slots: [],
              identities: [
                {
                  identity_id: "秦_少年",
                  identity_name: "少年时期",
                  age_group: "child",
                  path: "",
                  url: "",
                  sha256: "",
                  updated_at: "",
                  resolved_path: "",
                  resolved_url: "",
                  resolved_from: "",
                },
              ],
            },
          }),
      ),
      http.get(
        "http://localhost:3000/api/v1/projects/demo/freezone/audio/references",
        () => HttpResponse.json({ ok: true, data: { available: [] } }),
      ),
      http.post(
        "http://localhost:3000/api/v1/projects/demo/freezone/audio/voices/design",
        async ({ request }) => {
          designBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              voice_id: "fv_designed",
              name: "秦-少年时期",
              preview_url: "/voice/fv_designed.wav",
              provider_voice_id: "qwen_voice_123",
            },
          });
        },
      ),
      http.post(
        "http://localhost:3000/api/v1/projects/demo/characters/%E7%A7%A6/identities/%E7%A7%A6_%E5%B0%91%E5%B9%B4/voice/bind",
        async ({ request }) => {
          bindBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              identity_id: "秦_少年",
              identity_name: "少年时期",
              age_group: "child",
              path: "assets/characters/秦/identities/秦_少年/voice_reference.wav",
              url: "/voice_reference.wav",
              sha256: "bound-sha",
              updated_at: "2026-08-24T00:00:00+00:00",
              resolved_path: "assets/characters/秦/identities/秦_少年/voice_reference.wav",
              resolved_url: "/voice_reference.wav",
              resolved_from: "identity",
            },
          });
        },
      ),
    );

    renderPanel({ name: "秦" });

    const chooseButtons = await screen.findAllByRole("button", {
      name: "选择声线",
    });
    fireEvent.click(chooseButtons[chooseButtons.length - 1]);
    expect(await screen.findByText("文字设计声线")).toBeInTheDocument();
    expect(screen.getByText("Qwen3 TTS Voice Design")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("音色描述"), {
      target: { value: "清澈温暖的青年女声" },
    });
    fireEvent.change(screen.getByLabelText("试听文本"), {
      target: { value: "你好，这是声线试听。" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成并绑定到当前项" }));

    await waitFor(() =>
      expect(designBody).toEqual({
        name: "秦-少年时期",
        model_selector: "cloud:QWEN3_TTS_VD_2026_01_26",
        voice_prompt: "清澈温暖的青年女声",
        preview_text: "你好，这是声线试听。",
        preferred_name: "custom_voice",
        language: "zh",
        sample_rate: 24000,
        response_format: "wav",
      }),
    );
    expect(bindBody).toEqual({ voice_id: "fv_designed" });
    expect(modelCatalog).toHaveBeenCalledWith({
      operation: "AUDIO_VOICE_DESIGN",
      source: "cloud",
    });
  });
});
