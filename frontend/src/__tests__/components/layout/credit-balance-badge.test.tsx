// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreditBalanceBadge } from "@/components/layout/credit-balance-badge";

const authState = vi.hoisted(() => ({ username: "alice" as string | null }));
const currentUserState = vi.hoisted(() => ({
  isError: false,
  isLoading: false,
  balance: 1234 as number | undefined,
}));
const runtimeState = vi.hoisted(() => ({ isCeRuntime: false }));
const commercialState = vi.hoisted(() => ({
  availability: "unconfigured",
  session: null as { authenticated: true } | null,
  allowsCloudModels: false,
  balance: 7300,
}));
const refreshState = vi.hoisted(() => ({
  currentUser: vi.fn(),
  commercial: vi.fn(),
}));

vi.mock("@/lib/runtime-config", () => ({
  isCeRuntime: () => runtimeState.isCeRuntime,
}));

vi.mock("@/modules/identity_access/public", () => ({
  useAuthStore: (
    selector: (state: { username: string | null; role: string | null }) => unknown,
  ) =>
    selector({
      username: authState.username,
      role: authState.username ? "viewer" : null,
    }),
  useCurrentUser: (enabled: boolean) => ({
    data:
      enabled && currentUserState.balance !== undefined
        ? {
            data: {
              username: authState.username,
              role: "viewer",
              credit_balance: currentUserState.balance,
            },
          }
        : undefined,
    isError: currentUserState.isError,
    isFetching: false,
    isLoading: currentUserState.isLoading,
    refetch: refreshState.currentUser,
  }),
  useCommercialAuthStore: (
    selector: (state: { availability: string; session: unknown }) => unknown,
  ) =>
    selector({
      availability: commercialState.availability,
      session: commercialState.session,
    }),
  useCommercialEntitlementStore: (
    selector: (state: { entitlement: unknown }) => unknown,
  ) =>
    selector({
      entitlement: commercialState.allowsCloudModels
        ? { capabilities: { allowsCloudModels: true } }
        : null,
    }),
}));

vi.mock("@/modules/model_usage/public", () => ({
  useCommercialQuota: (enabled: boolean) => ({
    data: enabled ? { spendableUnits: commercialState.balance } : undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: refreshState.commercial,
  }),
}));

// The badge now uses the shadcn/base-ui Tooltip; mock it so the content always
// renders (base-ui only mounts the portal on hover). Mirrors the header test.
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({
    children,
    render,
  }: React.PropsWithChildren<{ render?: React.ReactElement }>) =>
    render ? cloneElement(render, undefined, children) : <>{children}</>,
  TooltipContent: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "credits.balance": "当前积分余额",
        "credits.refreshBalance": "刷新积分余额",
        "credits.refreshHint": "点击刷新",
        "credits.short": "积分",
      })[key] ?? key,
  }),
}));

function renderBadge() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <CreditBalanceBadge />
    </QueryClientProvider>,
  );
}

describe("CreditBalanceBadge", () => {
  beforeEach(() => {
    authState.username = "alice";
    currentUserState.isError = false;
    currentUserState.isLoading = false;
    currentUserState.balance = 1234;
    runtimeState.isCeRuntime = false;
    commercialState.availability = "unconfigured";
    commercialState.session = null;
    commercialState.allowsCloudModels = false;
    commercialState.balance = 7300;
    refreshState.currentUser.mockReset();
    refreshState.commercial.mockReset();
  });

  it("renders the current credit balance", async () => {
    renderBadge();

    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("当前积分余额: 1,234 · 点击刷新");
  });

  it("renders nothing when logged out", () => {
    authState.username = null;

    const { container } = renderBadge();

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing in CE runtime", () => {
    runtimeState.isCeRuntime = true;

    const { container } = renderBadge();

    expect(container.firstChild).toBeNull();
  });

  it("uses Gateway spendable units in the commercial desktop runtime", () => {
    runtimeState.isCeRuntime = true;
    commercialState.availability = "configured";
    commercialState.session = { authenticated: true };
    commercialState.allowsCloudModels = true;

    renderBadge();

    expect(screen.getByText("7,300")).toBeInTheDocument();
    expect(screen.queryByText("1,234")).not.toBeInTheDocument();
  });

  it("manually refreshes the commercial quota from the header badge", () => {
    runtimeState.isCeRuntime = true;
    commercialState.availability = "configured";
    commercialState.session = { authenticated: true };
    commercialState.allowsCloudModels = true;

    renderBadge();
    fireEvent.click(screen.getByRole("button", { name: "刷新积分余额" }));

    expect(refreshState.commercial).toHaveBeenCalledOnce();
  });
});
