// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "@/components/settings-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "settings.tabs.profile": "账户与安全",
        "settings.tabs.license": "许可与设备",
        "settings.tabs.models": "模型",
        "settings.tabs.invocations": "调用记录",
        "settings.tabs.update": "关于与更新",
        "settings.modelAccess.modelRole": "模型用途",
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
  const access = {
    data: {
      mode: "byok",
      byokConfigured: true,
      byokBaseUrl: "https://api.example.com/v1",
      byokApiKeyPreview: null,
      byokModelAssignments: [
        { modelId: "video-model", role: "VIDEO_FIRST_LAST_FRAME" },
      ],
    },
    isLoading: false,
    refetch: vi.fn(),
  };
  const mutation = { mutateAsync: vi.fn(), isPending: false };
  return {
    BYOK_MODEL_ROLES: ["VIDEO_FIRST_LAST_FRAME"],
    CommercialInvocationSection: () => null,
    useClearByok: () => mutation,
    useCommercialModelAccessStatus: () => access,
    useCommercialModelCatalog: () => ({
      data: { items: [] },
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
  it("按商业设置中心分类展示独立页签", () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);

    for (const name of [
      "账户与安全",
      "许可与设备",
      "模型",
      "调用记录",
      "关于与更新",
    ]) {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    }
  });

  it("在模型用途选中后继续显示本地化标签", async () => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });

    render(<SettingsDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "模型" }));

    const trigger = await screen.findByRole("combobox", { name: "模型用途" });
    await waitFor(() => expect(trigger).toHaveTextContent("视频:首尾帧"));
    expect(trigger).not.toHaveTextContent("VIDEO_FIRST_LAST_FRAME");
  });
});
