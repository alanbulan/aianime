import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "app.versionUpdate.title": "New features are live",
        "app.versionUpdate.confirm": "Got it",
        "app.versionUpdate.empty": "No release notes",
        "app.commercialUpdate.availableTitle": "Desktop update available",
        "app.commercialUpdate.availableDescription": "Install the new desktop version.",
        "app.commercialUpdate.acknowledge": "Later",
      })[key] ?? key,
    i18n: {
      language: "en",
      resolvedLanguage: "en",
    },
  }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: React.PropsWithChildren) => <h2>{children}</h2>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

import { openVersionUpdateDialog } from "@/modules/platform_release/infrastructure/browser-version-update-dialog-events";
import { VersionUpdateDialog } from "@/modules/platform_release/presentation/VersionUpdateDialog";

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VersionUpdateDialog />
    </QueryClientProvider>,
  );
}

function withCommercialRelease(available: boolean) {
  window.aiAnimeDesktop = {
    commercial: {
      checkRelease: vi.fn().mockResolvedValue({
        available,
        required: false,
        version: {
          id: "22222222-2222-4222-8222-222222222222",
          version: "1.1.6",
          notes: "Release notes",
          pubDate: "2026-08-02T00:00:00Z",
          minimumSupportedVersion: "1.1.5",
          status: "PUBLISHED",
          createdAt: "2026-08-01T00:00:00Z",
          publishedAt: "2026-08-02T00:00:00Z",
          artifacts: [],
        },
        reason: available ? "new-version" : "up-to-date",
        artifactId: available
          ? "11111111-1111-4111-8111-111111111111"
          : null,
      }),
    },
  } as unknown as AIAnimeDesktopBridge;
}

describe("VersionUpdateDialog commercial release behavior", () => {
  beforeEach(() => {
    delete window.aiAnimeDesktop;
  });

  it("auto-opens when an optional commercial update is available", async () => {
    withCommercialRelease(true);
    renderDialog();

    expect(await screen.findByText("Desktop update available")).toBeInTheDocument();
    expect(screen.getByText("Install the new desktop version.")).toBeInTheDocument();
  });

  it("does not auto-open when no commercial update is available", async () => {
    withCommercialRelease(false);
    renderDialog();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("manual entry opens the dialog", async () => {
    withCommercialRelease(true);
    renderDialog();
    openVersionUpdateDialog();

    expect(await screen.findByText("Desktop update available")).toBeInTheDocument();
  });
});