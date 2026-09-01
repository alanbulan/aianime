// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toastSuccess } = vi.hoisted(() => ({ toastSuccess: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: toastSuccess },
}));

import { CommercialUpdateSettingsSection } from "@/modules/platform_release/presentation/CommercialUpdateSettingsSection";

describe("Commercial update settings entry", () => {
  afterEach(() => {
    delete window.aiAnimeDesktop;
    toastSuccess.mockReset();
  });

  it("exposes a manual update check and reports an up-to-date client", async () => {
    const checkRelease = vi.fn().mockResolvedValue({
      available: false,
      required: false,
      version: {
        id: "33333333-3333-4333-8333-333333333333",
        version: "1.1.6",
        notes: "Release notes",
        pubDate: "2026-08-02T00:00:00Z",
        minimumSupportedVersion: "1.1.5",
        status: "PUBLISHED",
        createdAt: "2026-08-01T00:00:00Z",
        publishedAt: "2026-08-02T00:00:00Z",
        artifacts: [],
      },
      reason: "up-to-date",
      artifactId: null,
    });
    window.aiAnimeDesktop = {
      platform: "win32",
      versions: { electron: "43.2.0", chrome: "0", node: "0" },
      commercial: { checkRelease } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CommercialUpdateSettingsSection active bridgeAvailable />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(checkRelease).toHaveBeenCalledOnce());
    expect(screen.getByText("AI anime")).toBeInTheDocument();
    expect(
      screen.getByText("settings.update.platformWindows"),
    ).toBeInTheDocument();
    expect(screen.getByText("Electron 43.2.0")).toBeInTheDocument();
    expect(
      screen.getByText("settings.update.releaseChannelStable"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("settings.update.statusUpToDate"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings.update.check" }),
    );

    await waitFor(() => expect(checkRelease).toHaveBeenCalledTimes(2));
    expect(toastSuccess).toHaveBeenCalledWith("settings.update.upToDate");
  });
});
