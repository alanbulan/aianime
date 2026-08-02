import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ky from "ky";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

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

import { RELEASE_NOTIFICATIONS_MUTED_KEY } from "@/modules/platform_release/public";
import { openVersionUpdateDialog } from "@/modules/platform_release/infrastructure/browser-version-update-dialog-events";
import { VersionUpdateDialog } from "@/modules/platform_release/presentation/VersionUpdateDialog";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  delete window.aiAnimeDesktop;
});
afterAll(() => server.close());

function feed(items = [{ title: "Current highlight", body: "Current body" }]) {
  return {
    ok: true,
    data: {
      source: "local_file",
      current_version: "1.0.2",
      current_tag: "v1.0.2",
      current_items: items.map((item, index) => ({
        id: `release:v1.0.2:${index}`,
        kind: "release",
        icon: "sparkles",
        title: item.title,
        body: item.body,
      })),
      update_available: false,
      latest_version: null,
      latest_tag: null,
      release_url: null,
      update_items: [],
      attention: "low",
      latest_published_at: null,
    },
  };
}

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

describe("VersionUpdateDialog release feed behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    server.use(
      http.get("http://localhost:3000/api/v1/release-notifications", () =>
        HttpResponse.json(feed()),
      ),
    );
  });

  it("auto-opens once for an unseen current release and marks it seen", async () => {
    const first = renderDialog();

    expect(await screen.findByText(/Current highlight/)).toBeInTheDocument();
    expect(localStorage.getItem("ai-anime:release-seen:v1.0.2")).toBe("seen");

    first.unmount();
    renderDialog();

    await waitFor(() => {
      expect(screen.queryByText(/Current highlight/)).not.toBeInTheDocument();
    });
  });

  it("manual entry ignores seen and muted state", async () => {
    localStorage.setItem("ai-anime:release-seen:v1.0.2", "seen");
    localStorage.setItem(RELEASE_NOTIFICATIONS_MUTED_KEY, "true");

    renderDialog();
    openVersionUpdateDialog();

    expect(await screen.findByText(/Current highlight/)).toBeInTheDocument();
  });

  it("auto-opens the existing dialog for an optional commercial update", async () => {
    localStorage.setItem("ai-anime:release-seen:v1.0.2", "seen");
    window.aiAnimeDesktop = {
      commercial: {
        checkRelease: vi.fn().mockResolvedValue({
          available: true,
          required: false,
          reason: "new-version",
        }),
      } as unknown as AIAnimeCommercialBridge,
    } as AIAnimeDesktopBridge;

    renderDialog();

    expect(await screen.findByText("Desktop update available")).toBeInTheDocument();
    expect(screen.getByText("Install the new desktop version.")).toBeInTheDocument();
  });
});
