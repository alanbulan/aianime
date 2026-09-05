// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import ky from "ky";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import {
  useAllProjectSummaries,
  useProject,
  useProjectGrants,
  usePurgeProject,
} from "@/modules/project_workspace/public";
import { queryKeys } from "@/lib/query-keys";
import { createUseShareProjectController } from "@/modules/project_workspace/application/use-share-project-controller";
import { projectWorkspaceQueries } from "@/modules/project_workspace/composition";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("Project Workspace query boundary", () => {
  it("maps summary transport fields into the domain model", async () => {
    server.use(
      http.get("http://localhost:3000/api/v1/projects/summaries", () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              id: "project-1",
              name: "Demo",
              status: "active",
              owner_username: "alice",
              effective_role: "owner",
              updated_at: "2026-07-23T10:00:00Z",
              episode_count: 2,
              beat_count: 16,
            },
          ],
        }),
      ),
    );

    const { result } = renderHook(() => useAllProjectSummaries(), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0]).toEqual({
      id: "project-1",
      name: "Demo",
      status: "active",
      ownerType: undefined,
      ownerId: undefined,
      ownerUsername: "alice",
      effectiveRole: "owner",
      homeNodeId: undefined,
      archivedAt: undefined,
      deletedAt: undefined,
      updatedAt: "2026-07-23T10:00:00Z",
      episodeCount: 2,
      beatCount: 16,
    });
  });

  it("returns project config without an HTTP response envelope", async () => {
    server.use(
      http.get("http://localhost:3000/api/v1/projects/project-1", () =>
        HttpResponse.json({
          ok: true,
          data: { spine_template: "narrated", visual_style: "ink" },
        }),
      ),
    );

    const { result } = renderHook(() => useProject("project-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      spine_template: "narrated",
      visual_style: "ink",
    });
  });

  it("normalizes project grants", async () => {
    server.use(
      http.get("http://localhost:3000/api/v1/projects/project-1/grants", () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              id: "grant-1",
              project_id: "project-1",
              principal_type: "user",
              principal_id: "user-2",
              principal_username: "bob",
              role: "editor",
            },
          ],
        }),
      ),
    );

    const { result } = renderHook(
      () => useProjectGrants("project-1"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({
      id: "grant-1",
      projectId: "project-1",
      principalId: "user-2",
      principalUsername: "bob",
      role: "editor",
    });
  });

  it("stops sharing queries while the dialog is closed", async () => {
    const searches: string[] = [];
    server.use(
      http.get("http://localhost:3000/api/v1/projects/project-1/grants", () =>
        HttpResponse.json({ ok: true, data: [] }),
      ),
      http.get("http://localhost:3000/api/v1/users/search", ({ request }) => {
        const username = new URL(request.url).searchParams.get("q")!;
        searches.push(username);
        return HttpResponse.json({
          ok: true,
          data: [{ id: username, username }],
        });
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const useController = createUseShareProjectController(
      projectWorkspaceQueries,
      { copy: vi.fn() },
    );
    const { result, rerender } = renderHook(
      ({ open }) => useController(
        { id: "project-1", name: "Demo", status: "active" },
        open,
      ),
      {
        initialProps: { open: true },
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );
    act(() => result.current.setQuery("alice"));
    await waitFor(() => expect(result.current.searchResults[0]?.username).toBe("alice"));

    rerender({ open: false });
    expect(queryClient.getQueryCache().find({
      queryKey: queryKeys.userSearch("alice"),
    })?.isActive()).toBe(false);
    expect(queryClient.getQueryCache().find({
      queryKey: queryKeys.projectGrants("project-1"),
    })?.isActive()).toBe(false);
    await act(() => queryClient.refetchQueries({ type: "active" }));
    expect(searches).toEqual(["alice"]);

    rerender({ open: true });
    await waitFor(() => expect(searches).toEqual(["alice", "alice"]));
  });

  it("accepts the minimal purge response without reintroducing transport DTOs", async () => {
    server.use(
      http.post("http://localhost:3000/api/v1/projects/project-1/purge", () =>
        HttpResponse.json({
          ok: true,
          data: { name: "Demo", status: "deleted" },
        }),
      ),
    );

    const { result } = renderHook(() => usePurgeProject(), { wrapper });
    result.current.mutate("project-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      id: "project-1",
      name: "Demo",
      status: "deleted",
    });
  });
});
