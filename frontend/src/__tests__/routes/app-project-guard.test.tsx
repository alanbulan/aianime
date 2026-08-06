// Copyright (c) 2026 AI anime
import { render, waitFor } from "@testing-library/react";
import { createElement, Fragment, type ComponentProps, type ComponentType, type PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigateMock = vi.hoisted(() => vi.fn());
const routeState = vi.hoisted(() => ({ project: "missing-project" as string | undefined }));
const projectSummariesState = vi.hoisted(() => ({
  data: [] as Array<{ id: string; name: string }>,
  isLoading: false,
}));
const authState = vi.hoisted(() => ({
  username: "dev-user" as string | null,
  validateSession: vi.fn<() => Promise<boolean>>(),
  refreshAvatar: vi.fn<() => Promise<void>>(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Outlet: () => createElement("div", { "data-testid": "outlet" }),
  redirect: (options: unknown) => ({ options }),
  useNavigate: () => navigateMock,
  useParams: () => routeState,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: routeState.project ? `/projects/${routeState.project}/episodes` : "/" } }),
}));

vi.mock("@/lib/runtime-config", () => ({
  authRequired: () => true,
}));

const useAuthStoreMock = Object.assign(
  (selector: (state: typeof authState) => unknown) => selector(authState),
  { getState: () => authState },
);

vi.mock("@/modules/identity_access/public", () => ({
  useAuthStore: useAuthStoreMock,
}));
vi.mock("@/app/commercial-access", () => ({
  resolveAppRouteAccess: async () => "granted",
}));

vi.mock("@/components/layout/header", () => ({ Header: () => null }));
vi.mock("@/shared/hooks/use-reduced-motion", () => ({ useReducedMotion: () => true }));
vi.mock("@/modules/project_workspace/public", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/modules/project_workspace/public")
  >()),
  useAppStore: {
    getState: () => ({ clampDimensionsToViewport: vi.fn() }),
  },
  useAllProjectSummaries: () => projectSummariesState,
  canonicalProjectRouteParam: (project: string, projects: Array<{ id: string }>) =>
    projects.some((candidate) => candidate.id === project) ? project : null,
}));
vi.mock("@/shared/stores/region-store", () => ({
  useRegionStore: {
    getState: () => ({ sanitizeAgainstConfig: vi.fn() }),
  },
}));
vi.mock("@/lib/region-tab-sync", () => ({ initRegionTabSync: vi.fn() }));
vi.mock("@/lib/observability", () => ({ initObservability: vi.fn() }));
vi.mock("@/modules/task_execution/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/task_execution/public")>()),
  TaskCenterProvider: ({ children }: PropsWithChildren) => createElement(Fragment, null, children),
}));
vi.mock("@/components/task-center/status-bar", () => ({ TaskStatusBar: () => null }));
vi.mock("@/components/task-center/panel", () => ({ TaskPanel: () => null }));
vi.mock("@/modules/platform_release/public", () => ({
  VersionUpdateDialog: () => null,
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: ComponentProps<"div">) => createElement("div", props, children),
  },
}));

vi.mock("@/shared/platform/cluster-config", () => ({
  clusterConfig: { mode: "none" },
}));

vi.mock("@/lib/region-cookie", () => ({
  getRegionCookie: () => "region-a",
}));

async function renderAppLayout() {
  const { Route } = await import("@/routes/_app");
  const Component = Route.options.component as ComponentType;
  render(createElement(Component));
}

describe("_app project URL guard", () => {
  beforeEach(() => {
    vi.resetModules();
    navigateMock.mockReset();
    authState.username = "dev-user";
    authState.validateSession.mockResolvedValue(true);
    routeState.project = "missing-project";
    projectSummariesState.data = [];
    projectSummariesState.isLoading = false;
  });

  it("redirects home when loaded summaries do not contain the URL project", async () => {
    await renderAppLayout();

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/", replace: true }));
  });

  it("does not redirect when loaded summaries contain the URL project", async () => {
    routeState.project = "project-a";
    projectSummariesState.data = [{ id: "project-a", name: "Project A" }];

    await renderAppLayout();
    await waitFor(() => expect(authState.validateSession).toHaveBeenCalled());

    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/", replace: true });
  });

  it("does not redirect while project summaries are still loading", async () => {
    projectSummariesState.isLoading = true;

    await renderAppLayout();

    expect(navigateMock).not.toHaveBeenCalledWith({ to: "/", replace: true });
  });
});
