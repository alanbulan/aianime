// Copyright (c) 2026 AI anime
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "@/components/settings-dialog";

const modelUsageMockState = vi.hoisted(() => ({
  providers: [] as Array<Record<string, unknown>>,
  cloudModelAssignments: [] as Array<Record<string, unknown>>,
  catalogItems: [] as Array<Record<string, unknown>>,
  discoverModels: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
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
        "settings.modelAccess.contextWindow": "上下文",
        "settings.modelAccess.maxOutputShort": "输出",
        "settings.modelAccess.reasoningShort": "思考",
        "settings.modelAccess.roles.text": "文本生成",
        "settings.modelAccess.roles.videoFirstLastFrame": "视频:首尾帧",
      } as Record<string, string>)[key] ?? key,
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

vi.mock("@/modules/model_usage/public", () => {
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    BYOK_MODEL_ROLES: ["TEXT", "VIDEO_FIRST_LAST_FRAME"],
    BYOK_PROVIDER_PROTOCOLS: ["OPENAI_COMPATIBLE", "ANTHROPIC", "GEMINI"],
    CommercialInvocationSection: () => null,
    catalogRouteSelector: (item: { capabilities?: { routeSelector?: string } }) => (
      item.capabilities?.routeSelector
    ),
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
    useClearByok: () => mutation,
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
      refetch: vi.fn(),
    }),
    useCommercialModelCatalog: () => ({
      data: { items: modelUsageMockState.catalogItems },
      isLoading: false,
      error: null,
    }),
    useCommercialModelDetails: () => ({
      data: null,
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
      "上下文 32768 tokens · 输出 未声明 · 思考 low / medium / xhigh",
    ))
      .toBeInTheDocument();
    expect(priority.closest("[data-cloud-model-assignment]"))
      .toHaveClass("items-start");
  });
});
