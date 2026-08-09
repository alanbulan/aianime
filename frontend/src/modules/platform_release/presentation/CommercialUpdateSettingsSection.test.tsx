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
      reason: "up-to-date",
      artifactId: null,
    });
    window.aiAnimeDesktop = {
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
    fireEvent.click(
      screen.getByRole("button", { name: "settings.update.check" }),
    );

    await waitFor(() => expect(checkRelease).toHaveBeenCalledTimes(2));
    expect(toastSuccess).toHaveBeenCalledWith("settings.update.upToDate");
  });
});
