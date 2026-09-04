// Copyright (c) 2026 AI anime
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
        "settings.dependencies.states.checking": "检查中",
        "settings.dependencies.states.unsupported": "暂不支持",
        "settings.dependencies.checking": "正在检查运行环境完整性…",
        "settings.dependencies.install": "安装环境",
        "settings.dependencies.intelMacUnsupportedNotice":
          "Intel Mac 不会下载或启动此组件，安装按钮已停用。受影响的只有本地 SOG/3DGS 生成与转换。",
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
    commercialModelRuntimeMetadata: metadata.commercialModelRuntimeMetadata,
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
    formatReasoningEffort: metadata.formatReasoningEffort,
    formatReasoningEffortOption: metadata.formatReasoningEffortOption,
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

  it("进入环境依赖页签时检查并可独立安装三类运行环境", async () => {
    const dependencyStatus = (id: AIAnimeRuntimeDependencyId) => ({
      id,
      supported: true as const,
      installed: id === "world",
      healthy: id === "world",
      installing: false,
      state: id === "world" ? "ready" as const : "not-installed" as const,
      platform: "win32",
      arch: "x64",
      accelerator:
        id === "world" || id === "worldModels"
          ? "NVIDIA CUDA（支持 CPU 回退）"
          : "WebGPU（WASM 回退）",
      version: "1.1.38",
      message: id === "world" ? "3D 完整" : "抠图环境尚未安装",
    });
    const status = vi.fn(async (id: AIAnimeRuntimeDependencyId) => dependencyStatus(id));
    const install = vi.fn(async (id: AIAnimeRuntimeDependencyId) => ({
      ...dependencyStatus(id),
      installed: true,
      healthy: true,
      state: "ready" as const,
    }));
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: {
        platform: "win32",
        commercial: {},
        runtimeDependencies: {
          status,
          install,
          onProgress: vi.fn(() => vi.fn()),
        },
      },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "环境依赖" }));

    await waitFor(() => expect(status).toHaveBeenCalledTimes(3));
    expect(status).toHaveBeenCalledWith("world");
    expect(status).toHaveBeenCalledWith("worldModels");
    expect(status).toHaveBeenCalledWith("matte");
    expect(await screen.findAllByText("NVIDIA CUDA（支持 CPU 回退）")).toHaveLength(2);
    expect(screen.getByText("WebGPU（WASM 回退）")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /settings\.dependencies\.matteName.*安装环境/,
      }),
    );
    await waitFor(() => expect(install).toHaveBeenCalledWith("matte"));
  });

  it("首次完整性检查期间不把依赖误报为未安装", async () => {
    let resolveWorld!: (value: ReturnType<typeof dependencyStatus>) => void;
    const dependencyStatus = (id: AIAnimeRuntimeDependencyId) => ({
      id,
      supported: true,
      installed: true,
      healthy: true,
      installing: false,
      state: "ready" as const,
      platform: "win32",
      arch: "x64",
      accelerator: id === "matte" ? "WebGPU（WASM 回退）" : "NVIDIA CUDA（支持 CPU 回退）",
      message: "完整",
    });
    const status = vi.fn((id: AIAnimeRuntimeDependencyId) =>
      id === "world"
        ? new Promise<ReturnType<typeof dependencyStatus>>((resolve) => {
            resolveWorld = resolve;
          })
        : Promise.resolve(dependencyStatus(id)),
    );
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

    expect(await screen.findByText("正在检查运行环境完整性…")).toBeInTheDocument();
    expect(screen.getByText("检查中")).toBeInTheDocument();
    expect(screen.queryByText("未安装")).not.toBeInTheDocument();

    resolveWorld(dependencyStatus("world"));
    await waitFor(() => {
      expect(screen.getAllByText("NVIDIA CUDA（支持 CPU 回退）")).toHaveLength(2);
    });
  });

  it("在 Intel Mac 上明确说明 3D 限制并停用安装", async () => {
    const install = vi.fn();
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: {
        platform: "darwin",
        commercial: {},
        runtimeDependencies: {
          status: vi.fn(async (id: AIAnimeRuntimeDependencyId) =>
            id === "world" || id === "worldModels"
              ? {
                  id,
                  supported: false,
                  installed: false,
                  healthy: false,
                  installing: false,
                  state: "unsupported",
                  platform: "darwin",
                  arch: "x64",
                  accelerator: "当前平台暂无预编译运行环境",
                  message:
                    "Intel Mac 可正常使用主应用，但当前不提供导演世界 3D 运行环境。系统不会下载或启动不兼容组件。",
                }
              : {
                  id,
                  supported: true,
                  installed: false,
                  healthy: false,
                  installing: false,
                  state: "not-installed",
                  platform: "darwin",
                  arch: "x64",
                  accelerator: "WebGPU（WASM 回退）",
                  message: "图片抠图运行环境尚未安装",
                },
          ),
          install,
          onProgress: vi.fn(() => vi.fn()),
        },
      },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "环境依赖" }));

    expect(await screen.findByText(/Intel Mac 不会下载或启动此组件/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /settings\.dependencies\.worldName.*安装环境/,
      }),
    ).toBeDisabled();
    expect(install).not.toHaveBeenCalled();
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
              enum: ["none", "low", "medium", "high"],
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
      "上下文 32768 tokens · 思考 关闭思考 / low / medium / high（默认 low） · 参数 1 项",
    ))
      .toBeInTheDocument();
    expect(priority.closest("[data-cloud-model-assignment]"))
      .toHaveClass("items-start");

    fireEvent.click(screen.getByRole("button", { name: "模型参数" }));
    fireEvent.click(await screen.findByRole("combobox", { name: "reasoning_effort" }));
    expect(await screen.findByRole("option", { name: "关闭思考" }))
      .toBeInTheDocument();
  });

  it("按实际可编辑项显示参数数量，并展示视频模式、规格与时长", async () => {
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
      "参数 2 项 · 模式 3 项 · 规格 4 项 · 时长 4–15 秒",
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

  it.each([
    { outputKey: "max_tokens", reasoningKey: "reasoning_effort" },
    { outputKey: "maxOutputTokens", reasoningKey: "reasoningEffort" },
  ])("模型详情去重 $outputKey 并保留模型独有参数", async ({ outputKey, reasoningKey }) => {
    const model = {
      id: "text-model-id",
      code: "text-model",
      displayName: "Text model",
      operation: "TEXT",
      roles: ["TEXT"],
      capabilities: { contextWindowTokens: 1050000, maxOutputTokens: 128000, tools: true },
      parameterSchema: {
        properties: {
          [outputKey]: { type: "integer", maximum: 128000 },
          [reasoningKey]: { type: "string", enum: ["low", "high"] },
          temperature: { type: "number", minimum: 0, maximum: 2 },
        },
      },
    };
    modelUsageMockState.catalogItems = [model];
    modelUsageMockState.detailsItem = model;
    modelUsageMockState.cloudModelAssignments = [
      { modelId: model.code, role: "TEXT", priority: 100, enabled: true },
    ];
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));
    fireEvent.click(await screen.findByRole("button", { name: "查看模型详情" }));

    const dialog = screen.getByRole("dialog", { name: "Text model" });
    expect(within(dialog).getByText("1050000 tokens")).toBeInTheDocument();
    expect(within(dialog).getAllByText("128000 tokens")).toHaveLength(1);
    expect(within(dialog).getAllByText("low / high")).toHaveLength(1);
    expect(within(dialog).queryByText(outputKey)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(reasoningKey)).not.toBeInTheDocument();
    expect(within(dialog).getByText("temperature")).toBeInTheDocument();
    expect(dialog.querySelector("pre")).toBeNull();
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
