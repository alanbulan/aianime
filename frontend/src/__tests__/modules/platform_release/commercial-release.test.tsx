import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";
import {
  parseCommercialBootstrapRelease,
  parseCommercialReleaseStatus,
  parseCommercialUpdateDownloadProgress,
} from "@/modules/platform_release/domain/commercial-release";
import { electronCommercialReleaseGateway } from "@/modules/platform_release/infrastructure/electron-commercial-release-gateway";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "app.commercialUpdate.requiredTitle": "This version must be updated",
        "app.commercialUpdate.requiredDescription": "Install the latest version.",
        "app.commercialUpdate.checkFailed": "Update check failed.",
        "app.commercialUpdate.recheck": "Check again",
        "app.commercialUpdate.checking": "Checking",
      })[key] ?? key,
  }),
}));

import { CommercialUpdateRequired } from "@/modules/platform_release/presentation/CommercialUpdateRequired";
import { seedCommercialBootstrapRelease } from "@/modules/platform_release/composition";

describe("commercial release contract", () => {
  afterEach(() => {
    delete window.aiAnimeDesktop;
  });

  it("uses the same strict status parser for Bootstrap and release checks", () => {
    const status = {
      available: true,
      required: false,
      reason: "new-version",
      artifactId: 1201,
    };

    expect(parseCommercialReleaseStatus(status)).toEqual(status);
    expect(parseCommercialBootstrapRelease({ release: status })).toEqual(status);
    expect(() =>
      parseCommercialReleaseStatus({ available: true, required: "yes" }),
    ).toThrow("commercial release.required must be a boolean");
  });

  it("normalizes Electron update download progress", () => {
    expect(
      parseCommercialUpdateDownloadProgress({
        percent: 42.4,
        transferred: 424,
        total: 1000,
        bytesPerSecond: 100,
      }),
    ).toEqual({
      percent: 42.4,
      transferred: 424,
      total: 1000,
      bytesPerSecond: 100,
    });
    expect(() =>
      parseCommercialUpdateDownloadProgress({ percent: "42" }),
    ).toThrow("percent must be a finite number");
  });

  it("checks releases through the no-argument Electron bridge", async () => {
    const checkRelease = vi.fn().mockResolvedValue({
      available: false,
      required: false,
      reason: "up-to-date",
      artifactId: null,
    });
    window.aiAnimeDesktop = {
      commercial: { checkRelease } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;

    await expect(electronCommercialReleaseGateway.check()).resolves.toEqual({
      available: false,
      required: false,
      reason: "up-to-date",
      artifactId: null,
    });
    expect(checkRelease).toHaveBeenCalledOnce();
    expect(checkRelease).toHaveBeenCalledWith();
  });

  it("rechecks after Bootstrap seeds a release without an artifact id", async () => {
    const checkRelease = vi.fn().mockResolvedValue({
      available: true,
      required: false,
      reason: "new-version",
      artifactId: "artifact-1.1.7",
    });
    window.aiAnimeDesktop = {
      commercial: { checkRelease } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    seedCommercialBootstrapRelease(queryClient, {
      release: {
        available: true,
        required: false,
        reason: "new-version",
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CommercialUpdateRequired enabled={true} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(checkRelease).toHaveBeenCalledOnce());
    expect(queryClient.getQueryData(queryKeys.commercialRelease())).toEqual({
      available: true,
      required: false,
      reason: "new-version",
      artifactId: "artifact-1.1.7",
    });
  });

  it("downloads and installs an update through the Electron bridge", async () => {
    const downloadUpdate = vi.fn().mockResolvedValue({ version: "1.1.6" });
    const installUpdate = vi.fn().mockResolvedValue(undefined);
    window.aiAnimeDesktop = {
      commercial: {
        checkRelease: vi.fn().mockResolvedValue({
          available: false,
          required: false,
          reason: null,
          artifactId: null,
        }),
        downloadUpdate,
        installUpdate,
      } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;

    await electronCommercialReleaseGateway.downloadUpdate(
      "artifact-1",
    );
    await electronCommercialReleaseGateway.installUpdate();

    expect(downloadUpdate).toHaveBeenCalledWith("artifact-1");
    expect(installUpdate).toHaveBeenCalledWith();
  });

  it("renders the blocking page for a required update", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.commercialRelease(), {
      available: true,
      required: true,
      reason: "unsupported-version",
      artifactId: "artifact-2",
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CommercialUpdateRequired enabled={true} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("This version must be updated")).toBeInTheDocument();
    expect(screen.getByText("Install the latest version.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });
});
