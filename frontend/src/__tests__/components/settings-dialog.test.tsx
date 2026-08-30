// Copyright (c) 2026 AI anime
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "@/components/settings-dialog";

const modelUsageMockState = vi.hoisted(() => ({
  providers: [] as Array<Record<string, unknown>>,
  cloudModelAssignments: [] as Array<Record<string, unknown>>,
  catalogItems: [] as Array<Record<string, unknown>>,
  detailsItem: null as Record<string, unknown> | null,
  accessError: null as Error | null,
  clearByok: vi.fn(),
  discoverModels: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const template = ({
        "settings.tabs.profile": "账户与安全",
        "settings.tabs.license": "许可与设备",
        "settings.tabs.models": "模型",
        "settings.tabs.invocations": "调用记录",
        "settings.tabs.dependencies": "环境依赖",
        "settings.tabs.update": "关于与更新",
        "settings.dependencies.states.ready": "可用",
        "settings.modelAccess.cloud": "云端模型",
        "settings.modelAccess.byok": "BYOK 模型",
        "settings.modelAccess.fetchModels": "获取模型列表",
        "settings.modelAccess.modelPriority": "模型优先级",
        "settings.modelAccess.modelRole": "模型用途",
        "settings.modelAccess.modelParameters": "模型参数",
        "settings.modelAccess.runtimeOverrideDescription": "留空则跟随上游声明；填写后仅在本机覆盖。",
        "settings.modelAccess.requestParameterOverrides": "请求参数覆盖",
        "settings.modelAccess.manualRequestParameterOverrides": "自定义请求参数（JSON）",
        "settings.modelAccess.manualRequestParameterOverridesDescription": "上游没有提供参数 Schema。这里填写的 JSON 对象会合并到每次该模型的请求正文中。",
        "settings.modelAccess.modelCapabilityOverrides": "模型能力覆盖（JSON）",
        "settings.modelAccess.modelCapabilityOverridesDescription": "补充上游未声明的模型能力。",
        "settings.modelAccess.runtimeMetadataOverrides": "路由元数据覆盖",
        "settings.modelAccess.noOverrideableParameters": "当前模型契约没有声明可覆盖参数。",
        "settings.modelAccess.parameterOverrideInvalid": "参数 {{path}} 不符合模型契约。",
        "settings.modelAccess.capabilityOverrideInvalid": "能力字段 {{path}} 无效。",
        "settings.modelAccess.followDeclared": "跟随上游声明",
        "settings.modelAccess.applyRuntimeOverride": "应用",
        "settings.modelAccess.clearRuntimeOverride": "清除覆盖",
        "settings.modelAccess.declaredValue": "上游声明：{{value}}",
        "settings.modelAccess.showDetails": "查看模型详情",
        "settings.modelAccess.declaredParameters": "已声明请求参数（{{count}} 个顶层字段）",
        "settings.modelAccess.parameterRequired": "必填",
        "settings.modelAccess.parameterOptional": "可选",
        "settings.modelAccess.parameterDefault": "默认：{{value}}",
        "settings.modelAccess.parameterRange": "范围：{{value}}",
        "settings.modelAccess.localOverride": "本地覆盖",
        "settings.modelAccess.contextWindow": "上下文",
        "settings.modelAccess.maxOutputTokens": "最大输出 Token",
        "settings.modelAccess.maxOutputShort": "输出",
        "settings.modelAccess.reasoningEfforts": "思考力度选项",
        "settings.modelAccess.defaultReasoningEffort": "默认思考力度",
        "settings.modelAccess.notDeclared": "未声明",
        "settings.modelAccess.reasoningShort": "思考",
        "settings.modelAccess.parameterCount": "参数 {{count}} 项",
        "settings.modelAccess.modeCount": "模式 {{count}} 项",
        "settings.modelAccess.specificationCount": "规格 {{count}} 项",
        "settings.modelAccess.durationMaximum": "最长 {{max}} 秒",
        "settings.modelAccess.durationRange": "时长 {{min}}–{{max}} 秒",
        "settings.modelAccess.noRecognizedMetadata": "未声明可识别参数",
        "settings.modelAccess.loadFailed": "模型访问配置加载失败",
        "settings.modelAccess.invalidConfigHint": "重置会清除无法读取的本地模型配置及其中保存的 BYOK 凭据。",
        "settings.modelAccess.resetInvalid": "重置损坏配置",
        "settings.modelAccess.resetSucceeded": "本地模型访问配置已重置",
        "settings.modelAccess.resetFailed": "本地模型访问配置重置失败",
        "settings.modelAccess.roles.text": "文本生成",
        "settings.modelAccess.roles.imageGeneration": "图片生成",
        "settings.modelAccess.roles.imageEdit": "图片编辑",
        "settings.modelAccess.roles.videoFirstLastFrame": "视频:首尾帧",
        "settings.modelAccess.roles.embedding": "向量嵌入",
      } as Record<string, string>)[key] ?? key;
      return template.replace(/\{\{(\w+)\}\}/gu, (_, name: string) => (
        String(values?.[name] ?? `{{${name}}}`)
      ));
    },
  }),
}));

vi.mock("@/modules/identity_access/public", () => {
  const state = {
    entitlement: {
      capabilities: {
        allowsCloudModels: true,
        allowsCustomModels: true,
        deviceActivated: true,
      },
      license: { editionType: "PROFESSIONAL", versionName: "专业版" },
    },
    status: "ready",
    error: null,
    activateCurrentDevice: vi.fn(),
  };
  return {
    CommercialAccountSection: () => null,
    CommercialLicenseSection: () => null,
    CommercialProfileSection: () => null,
    CommercialSecuritySection: () => null,
    useCommercialEntitlementStore: (
      selector: (value: typeof state) => unknown,
    ) => selector(state),
  };
});

vi.mock("@/modules/model_usage/public", async () => {
  const metadata = await vi.importActual<
    typeof import("@/modules/model_usage/domain/model-runtime-metadata")
  >("@/modules/model_usage/domain/model-runtime-metadata");
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    BYOK_MODEL_ROLES: [
      "TEXT",
      "IMAGE_GENERATION",
      "IMAGE_EDIT",
      "VIDEO_FIRST_LAST_FRAME",
      "EMBEDDING",
    ],
    BYOK_PROVIDER_PROTOCOLS: ["OPENAI_COMPATIBLE", "ANTHROPIC", "GEMINI"],
    CommercialInvocationSection: () => null,
    catalogRouteSelector: (item: { capabilities?: { routeSelector?: string } }) => (
      item.capabilities?.routeSelector
    ),
    commercialModelParameterDeclarations: metadata.commercialModelParameterDeclarations,
    commercialModelParameterOverrideDeclarations:
      metadata.commercialModelParameterOverrideDeclarations,
    modelParameterOverrideDraft: metadata.modelParameterOverrideDraft,
    parseModelParameterOverrideDrafts: metadata.parseModelParameterOverrideDrafts,
    parseModelParameterOverridesJsonDraft:
      metadata.parseModelParameterOverridesJsonDraft,
    parseModelCapabilityOverridesJsonDraft:
      metadata.parseModelCapabilityOverridesJsonDraft,
    commercialModelRuntimeMetadata: (item: {
      capabilities?: { contextWindowTokens?: number };
      parameterSchema?: { properties?: { reasoning_effort?: Record<string, unknown> } };
    }) => ({
      ...(item.capabilities?.contextWindowTokens
        ? { contextWindow: item.capabilities.contextWindowTokens }
        : {}),
      ...(item.parameterSchema?.properties?.reasoning_effort
        ? {
            reasoningEffort: {
              options: item.parameterSchema.properties.reasoning_effort.enum ?? [],
              defaultValue: item.parameterSchema.properties.reasoning_effort.default,
            },
          }
        : {}),
    }),
    effectiveModelRuntimeSettings: (assignment?: {
      contextWindow?: number;
      maxOutputTokens?: number;
      reasoningEfforts?: string[];
      defaultReasoningEffort?: string;
      runtimeOverrides?: {
        contextWindow?: number;
        maxOutputTokens?: number;
        reasoningEfforts?: string[];
        defaultReasoningEffort?: string;
      };
    }) => {
      if (!assignment) return {};
      const overrides = assignment.runtimeOverrides;
      const options = overrides?.reasoningEfforts ?? assignment.reasoningEfforts;
      const requestedDefault = overrides?.defaultReasoningEffort
        ?? assignment.defaultReasoningEffort;
      return {
        contextWindow: overrides?.contextWindow ?? assignment.contextWindow,
        maxOutputTokens: overrides?.maxOutputTokens ?? assignment.maxOutputTokens,
        ...(options?.length ? { reasoningEfforts: options } : {}),
        ...(requestedDefault && options?.includes(requestedDefault)
          ? { defaultReasoningEffort: requestedDefault }
          : {}),
      };
    },
    commercialModelRoles: (item: { roles?: string[] }) => item.roles ?? [],
    formatModelContextWindow: (value?: number) => value ? `${value} tokens` : "未声明",
    formatReasoningEffort: (value?: { options?: string[] }) => (
      value?.options?.join(" / ") ?? "未声明"
    ),
    useClearByok: () => ({
      mutateAsync: modelUsageMockState.clearByok,
      isPending: false,
    }),
    useDiscoverByokProviderModels: () => ({
      data: {
        providerId: "provider-a",
        models: [],
        modelMetadata: [],
        catalogVersion: "test",
      },
      isPending: false,
      error: null,
      mutateAsync: modelUsageMockState.discoverModels,
      reset: vi.fn(),
    }),
    useCommercialModelAccessStatus: () => ({
      data: {
        mode: "mixed",
        byokConfigured: modelUsageMockState.providers.length > 0,
        cloudModelAssignments: modelUsageMockState.cloudModelAssignments,
        byokProviders: modelUsageMockState.providers,
      },
      isLoading: false,
      error: modelUsageMockState.accessError,
      refetch: vi.fn(),
    }),
    useCommercialModelCatalog: () => ({
      data: { items: modelUsageMockState.catalogItems },
      isLoading: false,
      error: null,
    }),
    useCommercialModelDetails: () => ({
      data: modelUsageMockState.detailsItem,
      isLoading: false,
      error: null,
    }),
    useConfigureByok: () => mutation,
    useSelectCloudModels: () => mutation,
  };
});

vi.mock("@/modules/platform_release/public", () => ({
  CommercialUpdateSettingsSection: () => null,
}));

describe("SettingsDialog", () => {
  beforeEach(() => {
    modelUsageMockState.providers = [
      {
        id: "provider-a",
        name: "Provider A",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://api.example.com/v1",
        apiKeyPreview: "",
        configured: true,
        enabled: true,
        priority: 100,
        modelAssignments: [
          {
            modelId: "video-model",
            role: "VIDEO_FIRST_LAST_FRAME",
            priority: 100,
            enabled: true,
          },
        ],
      },
    ];
    modelUsageMockState.cloudModelAssignments = [];
    modelUsageMockState.catalogItems = [];
    modelUsageMockState.detailsItem = null;
    modelUsageMockState.accessError = null;
    modelUsageMockState.clearByok.mockReset();
    modelUsageMockState.clearByok.mockResolvedValue({
      mode: "mixed",
      cloudModelAssignments: [],
      byokProviders: [],
    });
    modelUsageMockState.discoverModels.mockReset();
    modelUsageMockState.discoverModels.mockResolvedValue({
      providerId: "draft",
      models: ["model-a"],
      modelMetadata: [],
      catalogVersion: "test",
    });
  });

  it("按商业设置中心分类展示独立页签", async () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    await act(async () => {
      render(<SettingsDialog open onOpenChange={vi.fn()} />);
    });

    for (const name of [
      "账户与安全",
      "许可与设备",
      "模型",
      "调用记录",
      "环境依赖",
      "关于与更新",
    ]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("进入环境依赖页签时检查 3D 运行环境完整性", async () => {
    const status = vi.fn().mockResolvedValue({
      id: "world",
      supported: true,
      installed: true,
      healthy: true,
      installing: false,
      state: "ready",
      platform: "win32",
      arch: "x64",
      accelerator: "NVIDIA CUDA（支持 CPU 回退）",
      version: "1.1.38",
      message: "完整",
    });
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: {
        platform: "win32",
        commercial: {},
        runtimeDependencies: {
          status,
          install: vi.fn(),
          onProgress: vi.fn(() => vi.fn()),
        },
      },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "环境依赖" }));

    await waitFor(() => expect(status).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("NVIDIA CUDA（支持 CPU 回退）")).toBeInTheDocument();
  });

  it("在模型用途选中后继续显示本地化标签", async () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("tab", { name: "BYOK 模型" }));

    const trigger = await screen.findByRole("combobox", { name: "模型用途" });
    await waitFor(() => expect(trigger).toHaveTextContent("视频:首尾帧"));
    expect(trigger).not.toHaveTextContent("VIDEO_FIRST_LAST_FRAME");
  });

  it("将云端模型与 BYOK 作为两个独立页签展示", async () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));

    expect(await screen.findByRole("tab", { name: "云端模型" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "BYOK 模型" })).toBeInTheDocument();
  });

  it("显示已保存 BYOK 配置的加载错误", async () => {
    modelUsageMockState.accessError = new Error("BYOK Base URL 无效");
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));

    expect(await screen.findByText(/BYOK Base URL 无效/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重置损坏配置" }));
    await waitFor(() => expect(modelUsageMockState.clearByok).toHaveBeenCalledWith(undefined));
  });

  it("未保存模型 ID 时也能用当前表单获取模型列表", async () => {
    modelUsageMockState.providers = [];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("tab", { name: "BYOK 模型" }));

    fireEvent.change(screen.getByPlaceholderText("https://api.example.com/v1"), {
      target: { value: "https://draft.example.com/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "获取模型列表" }));

    await waitFor(() =>
      expect(modelUsageMockState.discoverModels).toHaveBeenCalledWith({
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://draft.example.com/v1",
      }),
    );
  });

  it("显示并保留云端模型的真实路由优先级", async () => {
    modelUsageMockState.catalogItems = [
      {
        id: "text-model-id",
        code: "QWEN3_8_27B",
        displayName: "Qwen3.8-27B",
        operation: "TEXT",
        roles: ["TEXT"],
        capabilities: { contextWindowTokens: 32768 },
        parameterSchema: {
          properties: {
            reasoning_effort: {
              enum: ["low", "medium", "xhigh"],
              default: "low",
            },
          },
        },
      },
    ];
    modelUsageMockState.cloudModelAssignments = [
      {
        modelId: "QWEN3_8_27B",
        role: "TEXT",
        priority: 37,
        enabled: true,
      },
    ];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));

    const priority = await screen.findByRole("spinbutton", {
      name: "文本生成 模型优先级",
    });
    expect(priority).toHaveValue(37);
    expect(screen.getByText(
      "上下文 32768 tokens · 思考 low / medium / xhigh · 参数 1 项",
    ))
      .toBeInTheDocument();
    expect(priority.closest("[data-cloud-model-assignment]"))
      .toHaveClass("items-start");
  });

  it("按图片和视频契约显示参数、模式、规格与时长，而不是文本字段未声明", async () => {
    modelUsageMockState.catalogItems = [
      {
        id: "video-model-id",
        code: "video-model",
        displayName: "Video model",
        operation: "VIDEO",
        roles: ["VIDEO_FIRST_LAST_FRAME"],
        capabilities: {
          supportedModes: ["TEXT_TO_VIDEO", "IMAGE_TO_VIDEO", "MULTIMODAL_REFERENCE"],
          resolutionOptions: ["480p", "720p"],
          ratioOptions: ["16:9", "9:16"],
          minDuration: 4,
          maxDuration: 15,
        },
        parameterSchema: {
          properties: {
            prompt: { type: "string" },
            fixed_count: { type: "integer", enum: [1], default: 1 },
            seconds: { type: "integer" },
            options: {
              type: "object",
              properties: { turbo: { type: "boolean" } },
            },
          },
          required: ["prompt"],
        },
      },
    ];
    modelUsageMockState.cloudModelAssignments = [
      {
        modelId: "video-model",
        role: "VIDEO_FIRST_LAST_FRAME",
        priority: 100,
        enabled: true,
      },
    ];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));

    expect(await screen.findByText(
      "参数 4 项 · 模式 3 项 · 规格 4 项 · 时长 4–15 秒",
    )).toBeInTheDocument();
    expect(screen.queryByText(/上下文 未声明/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "模型参数" }));
    expect(await screen.findByText("请求参数覆盖")).toBeInTheDocument();
    const parameterDialog = screen.getByRole("dialog", { name: "模型参数" });
    expect(parameterDialog).toHaveClass(
      "grid-rows-[auto_minmax(0,1fr)_auto]",
      "overflow-hidden",
    );
    expect(parameterDialog.querySelector("[data-model-parameter-scroll-body]"))
      .toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.getByRole("spinbutton", { name: "seconds" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "options.turbo" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "prompt" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "fixed_count" })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "上下文" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "seconds" }), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "模型参数" }))
        .not.toBeInTheDocument();
    });
  });

  it("BYOK 没有上游 Schema 时仍可设置通用元数据和自定义请求参数", async () => {
    modelUsageMockState.providers = [{
      id: "provider-a",
      name: "Provider A",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyPreview: "",
      configured: true,
      enabled: true,
      priority: 100,
      modelAssignments: [{
        modelId: "deepseek-ai/DeepSeek-V4-Flash-0731",
        role: "TEXT",
        priority: 100,
        enabled: true,
      }],
    }];
    modelUsageMockState.catalogItems = [{
      id: "provider-a:deepseek-ai/DeepSeek-V4-Flash-0731:TEXT",
      code: "deepseek-ai/DeepSeek-V4-Flash-0731",
      displayName: "DeepSeek V4 Flash · Provider A",
      operation: "TEXT",
      capabilities: {
        routeSelector: "byok:provider-a:deepseek-ai/DeepSeek-V4-Flash-0731",
      },
      parameterSchema: {},
    }];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("tab", { name: "BYOK 模型" }));
    fireEvent.click(await screen.findByRole("button", { name: "模型参数" }));

    const customParameters = await screen.findByRole("textbox", {
      name: "自定义请求参数（JSON）",
    });
    expect(screen.getByRole("spinbutton", { name: "上下文" })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "最大输出 Token" })).toBeInTheDocument();
    fireEvent.change(customParameters, {
      target: { value: '{"temperature":0.7,"thinking":{"type":"disabled"}}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "模型参数" }))
        .not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "模型参数" }));
    expect((
      await screen.findByRole<HTMLTextAreaElement>("textbox", {
        name: "自定义请求参数（JSON）",
      })
    ).value).toContain('"temperature": 0.7');
  });

  it("非文本 BYOK 可补充并保留云端同形的模型能力契约", async () => {
    modelUsageMockState.providers = [{
      id: "provider-a",
      name: "Provider A",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyPreview: "",
      configured: true,
      enabled: true,
      priority: 100,
      modelAssignments: [{
        modelId: "video-model",
        role: "VIDEO_FIRST_LAST_FRAME",
        priority: 100,
        enabled: true,
        capabilities: { supportedModes: ["FIRST_LAST_FRAME"] },
      }],
    }];
    modelUsageMockState.catalogItems = [{
      id: "provider-a:video-model:VIDEO",
      code: "video-model",
      displayName: "Video Model · Provider A",
      operation: "VIDEO",
      roles: ["VIDEO_FIRST_LAST_FRAME"],
      capabilities: {
        routeSelector: "byok:provider-a:video-model",
        supportedModes: ["FIRST_LAST_FRAME"],
      },
      parameterSchema: {},
    }];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("tab", { name: "BYOK 模型" }));
    fireEvent.click(await screen.findByRole("button", { name: "模型参数" }));

    const capabilityEditor = await screen.findByRole("textbox", {
      name: "模型能力覆盖（JSON）",
    });
    expect(screen.queryByRole("spinbutton", { name: "上下文" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: "最大输出 Token" }))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "默认思考力度" }))
      .not.toBeInTheDocument();
    fireEvent.change(capabilityEditor, {
      target: {
        value: JSON.stringify({
          resolutionOptions: ["720p", "1080p"],
          ratioOptions: ["16:9", "9:16"],
          minDuration: 4,
          maxDuration: 10,
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用" }));
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "模型参数" }))
        .not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "模型参数" }));
    expect((await screen.findByRole<HTMLTextAreaElement>("textbox", {
      name: "模型能力覆盖（JSON）",
    })).value).toContain('"maxDuration": 10');
  });

  it("Gemini 原生协议显示后端实际支持的图片与 Embedding 用途", async () => {
    modelUsageMockState.providers = [{
      id: "gemini",
      name: "Gemini",
      protocol: "GEMINI",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      apiKeyPreview: "****",
      configured: true,
      enabled: true,
      priority: 100,
      modelAssignments: [{
        modelId: "gemini-2.5-flash",
        role: "TEXT",
        priority: 100,
        enabled: true,
      }],
    }];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("tab", { name: "BYOK 模型" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "模型用途" }));

    expect(await screen.findByRole("option", { name: "图片生成" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: "图片编辑" }))
      .toBeInTheDocument();
    expect(screen.getByRole("option", { name: "向量嵌入" }))
      .toBeInTheDocument();
  });

  it("同一 BYOK 模型承担多种用途时按当前角色读取对应契约", async () => {
    modelUsageMockState.providers = [{
      id: "provider-a",
      name: "Provider A",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyPreview: "",
      configured: true,
      enabled: true,
      priority: 100,
      modelAssignments: [{
        modelId: "multimodal-model",
        role: "TEXT",
        priority: 100,
        enabled: true,
      }],
    }];
    modelUsageMockState.catalogItems = [
      {
        id: "provider-a:multimodal-model:IMAGE",
        code: "multimodal-model",
        displayName: "Multimodal · Provider A",
        operation: "IMAGE",
        roles: ["IMAGE_GENERATION"],
        capabilities: {
          routeSelector: "byok:provider-a:multimodal-model",
          supportedModes: ["TEXT_TO_IMAGE"],
        },
        parameterSchema: {},
      },
      {
        id: "provider-a:multimodal-model:TEXT",
        code: "multimodal-model",
        displayName: "Multimodal · Provider A",
        operation: "TEXT",
        roles: ["TEXT"],
        capabilities: {
          routeSelector: "byok:provider-a:multimodal-model",
          contextWindowTokens: 262144,
        },
        parameterSchema: {},
      },
    ];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("tab", { name: "BYOK 模型" }));

    expect(await screen.findByText("上下文 262144 tokens"))
      .toBeInTheDocument();
    expect(screen.queryByText("模式 1 项")).not.toBeInTheDocument();
  });

  it("在模型详情中显示嵌套参数的完整路径", async () => {
    const model = {
      id: "nested-text-id",
      code: "nested-text",
      displayName: "Nested text",
      operation: "TEXT",
      roles: ["TEXT"],
      capabilities: {},
      parameterSchema: {
        properties: {
          thinking: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["disabled", "adaptive"],
                default: "adaptive",
              },
            },
          },
          stream_options: {
            type: "object",
            properties: {
              include_usage: { type: "boolean", default: false },
            },
          },
        },
      },
    };
    modelUsageMockState.catalogItems = [model];
    modelUsageMockState.detailsItem = model;
    modelUsageMockState.cloudModelAssignments = [
      {
        modelId: "nested-text",
        role: "TEXT",
        priority: 100,
        enabled: true,
      },
    ];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("button", { name: "查看模型详情" }));

    expect(await screen.findByText("thinking.type")).toBeInTheDocument();
    expect(screen.getByText("stream_options.include_usage")).toBeInTheDocument();
    const detailsDialog = screen.getByRole("dialog", { name: "Nested text" });
    expect(detailsDialog).toHaveClass(
      "grid-rows-[auto_minmax(0,1fr)_auto]",
      "overflow-hidden",
    );
    expect(detailsDialog.querySelector("[data-model-details-scroll-body]"))
      .toHaveClass("min-h-0", "overflow-y-auto");
    expect(screen.queryByText("settings.modelAccess.parameterSchema"))
      .not.toBeInTheDocument();
  });
});
