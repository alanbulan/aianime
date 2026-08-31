// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { cloneElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModelQuotaBadge } from "@/components/layout/model-quota-badge";

const commercialState = vi.hoisted(() => ({
  availability: "configured",
  session: { authenticated: true } as { authenticated: true } | null,
  allowsCloudModels: true,
  balance: 7300,
  isError: false,
  isLoading: false,
}));
const refreshQuota = vi.hoisted(() => vi.fn());

vi.mock("@/modules/identity_access/public", () => ({
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
    isLoading: commercialState.isLoading,
    isError: commercialState.isError,
    isFetching: false,
    refetch: refreshQuota,
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
        "modelQuota.balance": "云端模型配额",
        "modelQuota.refreshBalance": "刷新云端模型配额",
        "modelQuota.refreshHint": "点击刷新",
        "modelQuota.short": "配额",
      })[key] ?? key,
  }),
}));

function renderBadge() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ModelQuotaBadge />
    </QueryClientProvider>,
  );
}

describe("ModelQuotaBadge", () => {
  beforeEach(() => {
    commercialState.availability = "configured";
    commercialState.session = { authenticated: true };
    commercialState.allowsCloudModels = true;
    commercialState.balance = 7300;
    commercialState.isError = false;
    commercialState.isLoading = false;
    refreshQuota.mockReset();
  });

  it("renders the current cloud model quota", () => {
    renderBadge();

    expect(screen.getByText("7,300")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("云端模型配额: 7,300 · 点击刷新");
  });

  it("renders nothing when commercial access is not configured", () => {
    commercialState.availability = "unconfigured";

    const { container } = renderBadge();

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing without cloud-model entitlement", () => {
    commercialState.allowsCloudModels = false;

    const { container } = renderBadge();

    expect(container.firstChild).toBeNull();
  });

  it("manually refreshes the commercial quota from the header badge", () => {
    renderBadge();
    fireEvent.click(screen.getByRole("button", { name: "刷新云端模型配额" }));

    expect(refreshQuota).toHaveBeenCalledOnce();
  });
});
