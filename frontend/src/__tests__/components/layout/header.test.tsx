// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Header } from "@/components/layout/header";

const runtimeState = vi.hoisted(() => ({ authRequired: true, isCe: false }));
const authState = vi.hoisted(() => ({ username: "local", logout: vi.fn() }));
const commercialState = vi.hoisted(() => ({
  session: null as null | {
    authenticated: true;
    expiresAtEpochMs: number;
    user: {
      id: number;
      username: string;
      nickname?: string;
      email?: string;
      avatar?: string;
    };
    tenant: { id: number; code: string; name: string };
  },
}));
const resetUserSessionStateMock = vi.hoisted(() => vi.fn());
const releaseState = vi.hoisted(() => ({
  announcements: [] as Array<{ id: string; title: string; body: string }>,
  release: { available: false, required: false, reason: null, artifactId: null },
}));

vi.mock("@/lib/reset-region-state", () => ({
  resetUserSessionState: resetUserSessionStateMock,
}));

vi.mock("@/lib/runtime-config", () => ({
  authRequired: () => runtimeState.authRequired,
  isCeRuntime: () => runtimeState.isCe,
}));

vi.mock("@/modules/model_usage/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/model_usage/public")>()),
  useModelGatewayConfig: () => ({ data: undefined }),
}));

vi.mock("@/modules/platform_release/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/platform_release/public")>()),
  useCommercialAnnouncements: () => ({
    data: { items: releaseState.announcements, total: releaseState.announcements.length },
    isLoading: false,
    error: null,
  }),
  useCommercialRelease: () => ({ data: releaseState.release }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
  useNavigate: () => vi.fn(),
  useParams: () => ({}),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: "/" } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "app.logoHomeTooltip": "Home",
        "header.account.open": "Open account",
        "header.account.selectLanguage": "Select language",
        "header.account.languageChinese": "Chinese",
        "header.account.languageEnglish": "English",
        "auth.logout": "Log out",
      })[key] ?? key,
    i18n: {
      language: "en",
      resolvedLanguage: "en",
      changeLanguage: vi.fn(),
    },
  }),
}));

vi.mock("@/modules/identity_access/public", () => ({
  CommercialAccountSection: () => null,
  CommercialLicenseSection: () => null,
  CommercialProfileSection: () => null,
  CommercialSecuritySection: () => null,
  logoutAllSessions: () => authState.logout(),
  useAuthStore: (selector: (state: typeof authState) => unknown) =>
    selector(authState),
  useCommercialAuthStore: (
    selector: (state: typeof commercialState) => unknown,
  ) => selector(commercialState),
}));

vi.mock("@/modules/project_workspace/presentation/appStore", () => ({
  useAppStore: () => vi.fn(),
}));

vi.mock("@/components/layout/credit-balance-badge", () => ({
  CreditBalanceBadge: () => <div data-testid="credit-balance" />,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuGroup: ({ children }: React.PropsWithChildren) => <>{children}</>,
  DropdownMenuLabel: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

function renderHeader() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <Header />
    </QueryClientProvider>,
  );
}

describe("Header runtime gating", () => {
  beforeEach(() => {
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: undefined,
    });
    runtimeState.authRequired = true;
    authState.username = "local";
    commercialState.session = null;
    authState.logout.mockReset();
    resetUserSessionStateMock.mockReset();
    releaseState.announcements = [];
    releaseState.release = {
      available: false,
      required: false,
      reason: null,
      artifactId: null,
    };
    window.localStorage.clear();
  });

  it("does not repeat the product brand below the desktop title bar", () => {
    const actionsHost = document.createElement("div");
    actionsHost.id = "desktop-title-bar-actions";
    document.body.append(actionsHost);
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: {},
    });

    const { container } = renderHeader();

    expect(screen.queryByText("AI anime")).not.toBeInTheDocument();
    expect(container.querySelector("header")).not.toBeInTheDocument();
    expect(container.querySelector("#superchat-header-controls")).toBeNull();
    expect(screen.queryByLabelText("Toggle theme")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Open account")).toBeInTheDocument();
    actionsHost.remove();
  });

  it("renders logout in the account panel when runtime requires auth", async () => {
    renderHeader();

    fireEvent.mouseEnter(screen.getByLabelText("Open account").parentElement!);

    expect(await screen.findByText("Log out")).toBeInTheDocument();
  });

  it("opens on click and shows the authenticated commercial user", async () => {
    runtimeState.isCe = true;
    commercialState.session = {
      authenticated: true,
      expiresAtEpochMs: Date.now() + 60_000,
      user: {
        id: 1001,
        username: "client_user",
        nickname: "客户端用户",
        email: "client@example.com",
      },
      tenant: { id: 11, code: "customer-a", name: "客户 A" },
    };

    renderHeader();
    fireEvent.click(screen.getByLabelText("Open account"));

    expect(await screen.findByText("客户端用户")).toBeInTheDocument();
    expect(screen.getByText("@client_user")).toBeInTheDocument();
    expect(screen.getByText("client@example.com")).toBeInTheDocument();
    expect(screen.getByText("客户 A")).toBeInTheDocument();
  });

  it("hides logout when runtime does not require auth while keeping the local identity", async () => {
    runtimeState.authRequired = false;

    renderHeader();

    fireEvent.mouseEnter(screen.getByLabelText("Open account").parentElement!);

    await waitFor(() => {
      expect(screen.getByText("local")).toBeInTheDocument();
    });
    expect(screen.queryByText("Log out")).not.toBeInTheDocument();
  });

  it("purges user-scoped caches after logout so the next account can't see stale data", async () => {
    // 回归用例：手动退出是 SPA 内部跳转，不清 QueryClient 的话换账号登录后
    // projectSummaries 还在 staleTime 内，新账号会看到上一个账号的项目列表。
    authState.logout.mockResolvedValue(undefined);

    renderHeader();

    fireEvent.mouseEnter(screen.getByLabelText("Open account").parentElement!);
    fireEvent.click(await screen.findByText("Log out"));

    await waitFor(() => {
      expect(resetUserSessionStateMock).toHaveBeenCalled();
    });
    expect(authState.logout).toHaveBeenCalled();
  });

  it("clears the unread dot after opening notifications and lights it for a new item", async () => {
    const actionsHost = document.createElement("div");
    actionsHost.id = "desktop-title-bar-actions";
    document.body.append(actionsHost);
    Object.defineProperty(window, "aiAnimeDesktop", {
      configurable: true,
      value: { commercial: {} },
    });
    releaseState.announcements = [
      { id: "announcement-1", title: "Notice", body: "Body" },
    ];

    const first = renderHeader();
    const bell = await screen.findByRole("button", { name: "header.notifications" });
    expect(bell.querySelector(".bg-destructive")).not.toBeNull();

    fireEvent.click(bell);
    await waitFor(() => {
      expect(bell.querySelector(".bg-destructive")).toBeNull();
    });

    first.unmount();
    releaseState.announcements = [
      { id: "announcement-2", title: "New notice", body: "New body" },
    ];
    renderHeader();
    const nextBell = await screen.findByRole("button", {
      name: "header.notifications",
    });
    expect(nextBell.querySelector(".bg-destructive")).not.toBeNull();
    actionsHost.remove();
  });
});
