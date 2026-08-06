import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { queryKeys } from "@/lib/query-keys";
import {
  parseCommercialBootstrapRelease,
  parseCommercialReleaseStatus,
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

  it("downloads and installs a release artifact through the Electron bridge", async () => {
    const downloadArtifact = vi.fn().mockResolvedValue({
      filePath: "C:\\temp\\ai-anime-artifact-1\\installer.exe",
      fileName: "installer.exe",
      sizeBytes: 123,
      sha256: "a".repeat(64),
    });
    const installArtifact = vi.fn().mockResolvedValue(undefined);
    window.aiAnimeDesktop = {
      commercial: {
        checkRelease: vi.fn().mockResolvedValue({
          available: false,
          required: false,
          reason: null,
          artifactId: null,
        }),
        downloadArtifact,
        installArtifact,
      } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;

    const result = await electronCommercialReleaseGateway.downloadArtifact(
      "artifact-1",
    );
    await electronCommercialReleaseGateway.installArtifact(result);

    expect(downloadArtifact).toHaveBeenCalledWith("artifact-1");
    expect(installArtifact).toHaveBeenCalledWith({
      filePath: result.filePath,
      sha256: result.sha256,
    });
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
