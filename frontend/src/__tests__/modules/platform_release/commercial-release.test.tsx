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

const releaseVersion = {
  id: "99999999-9999-4999-8999-999999999999",
  version: "1.1.6",
  notes: "Release notes",
  pubDate: "2026-08-02T00:00:00Z",
  minimumSupportedVersion: "1.1.5",
  status: "PUBLISHED",
  createdAt: "2026-08-01T00:00:00Z",
  publishedAt: "2026-08-02T00:00:00Z",
  artifacts: [],
};

const emptyReleaseVersion = {
  id: "",
  version: "",
  notes: "",
  pubDate: "",
  minimumSupportedVersion: "",
  status: "",
  createdAt: "",
  publishedAt: "",
  artifacts: [],
};

describe("commercial release contract", () => {
  afterEach(() => {
    delete window.aiAnimeDesktop;
  });

  it("uses the same strict status parser for Bootstrap and release checks", () => {
    const artifactId = "11111111-1111-4111-8111-111111111111";
    const version = releaseVersion;
    const status = {
      available: true,
      required: false,
      version,
      reason: "new-version",
      artifactId,
    };

    expect(parseCommercialReleaseStatus(status)).toEqual({
      available: true,
      required: false,
      reason: "new-version",
      artifactId,
    });
    expect(
      parseCommercialBootstrapRelease({
        softwareAuthorization: null,
        personalQuota: null,
        models: null,
        release: { available: true, required: false, version, reason: "new-version" },
        warnings: [],
      }),
    ).toEqual({
      available: true,
      required: false,
      reason: "new-version",
      artifactId: null,
    });
    expect(() =>
      parseCommercialReleaseStatus({
        available: true,
        required: "yes",
        version,
        reason: "new-version",
        artifactId,
      }),
    ).toThrow("commercial release.required must be a boolean");
    expect(() =>
      parseCommercialReleaseStatus({
        ...status,
        version: { ...version, channel: "stable" },
      }),
    ).toThrow("commercial release.version fields must be exactly");
  });

  it("accepts the canonical empty version when no update is available", () => {
    expect(
      parseCommercialBootstrapRelease({
        softwareAuthorization: null,
        personalQuota: null,
        models: null,
        release: {
          available: false,
          required: false,
          version: emptyReleaseVersion,
          reason: "already up to date",
        },
        warnings: [],
      }),
    ).toEqual({
      available: false,
      required: false,
      reason: "already up to date",
      artifactId: null,
    });
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
      parseCommercialUpdateDownloadProgress({
        percent: "42",
        transferred: 424,
        total: 1000,
        bytesPerSecond: 100,
      }),
    ).toThrow("percent must be a finite number");
    expect(() =>
      parseCommercialUpdateDownloadProgress({
        percent: 101,
        transferred: 424,
        total: 1000,
        bytesPerSecond: 100,
      }),
    ).toThrow("percent must be between 0 and 100");
  });

  it("checks releases through the no-argument Electron bridge", async () => {
    const checkRelease = vi.fn().mockResolvedValue({
      available: false,
      required: false,
      version: releaseVersion,
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
      version: releaseVersion,
      reason: "new-version",
      artifactId: "22222222-2222-4222-8222-222222222222",
    });
    window.aiAnimeDesktop = {
      commercial: { checkRelease } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    seedCommercialBootstrapRelease(queryClient, {
      softwareAuthorization: null,
      personalQuota: null,
      models: null,
      release: {
        available: true,
        required: false,
        version: releaseVersion,
        reason: "new-version",
      },
      warnings: [],
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
      artifactId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("downloads and installs an update through the Electron bridge", async () => {
    const downloadUpdate = vi.fn().mockResolvedValue({ version: "1.1.6" });
    const installUpdate = vi.fn().mockResolvedValue({ accepted: true });
    window.aiAnimeDesktop = {
      commercial: {
        checkRelease: vi.fn().mockResolvedValue({
          available: false,
          required: false,
          reason: "",
          version: releaseVersion,
          artifactId: null,
        }),
        downloadUpdate,
        installUpdate,
      } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;

    await expect(
      electronCommercialReleaseGateway.downloadUpdate(
        "33333333-3333-4333-8333-333333333333",
      ),
    ).resolves.toEqual({ version: "1.1.6" });
    downloadUpdate.mockResolvedValueOnce({
      version: "1.1.6",
      artifactId: "33333333-3333-4333-8333-333333333333",
    } as never);
    await expect(
      electronCommercialReleaseGateway.downloadUpdate(
        "33333333-3333-4333-8333-333333333333",
      ),
    ).rejects.toThrow(/fields must be exactly/);
    await expect(
      electronCommercialReleaseGateway.installUpdate(),
    ).resolves.toEqual({ accepted: true });
    installUpdate.mockResolvedValueOnce({ accepted: false });
    await expect(
      electronCommercialReleaseGateway.installUpdate(),
    ).rejects.toThrow("Update installation was not accepted");

    expect(downloadUpdate).toHaveBeenCalledWith(
      "33333333-3333-4333-8333-333333333333",
    );
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
      artifactId: "44444444-4444-4444-8444-444444444444",
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
