// Copyright (c) 2026 AI anime
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "@/components/settings-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === "settings.tabs.models"
        ? "模型"
        : key === "settings.modelAccess.modelRole"
          ? "模型用途"
          : key === "settings.modelAccess.roles.videoFirstLastFrame"
            ? "视频:首尾帧"
            : key,
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
