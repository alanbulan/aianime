// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { server } from "@/__mocks__/msw/server";
import { queryKeys } from "@/lib/query-keys";
import {
  type PoolImage,
  useGrids,
  useGridsByBeat,
  useRebuildPoolIndex,
} from "@/modules/production/public";

function createWrapper(queryClient = new QueryClient()) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function poolImage(id: string, beatNumber: number): PoolImage {
  return {
    id,
    type: "sketch",
    mode: "1x1_2-3_sketch",
    grid_index: 0,
    cell_index: beatNumber - 1,
    row: 0,
    col: beatNumber - 1,
    original_beat: beatNumber,
    cell_url: `/static/${id}.png`,
    grid_url: "/static/grid.png",
    grid_path: "grids/grid.png",
    stale: false,
  };
}

describe("Production image pool queries", () => {
  it("loads the episode image pool from the grids endpoint", async () => {
    let requestedPath = "";
    const image = poolImage("sketch-2", 2);
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              modes: {},
              images: [image],
              beat_assignments: { "2": image.id },
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useGrids("demo", 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/grids");
    expect(result.current.data?.data?.images).toEqual([image]);
  });

  it("groups pool images by original Beat and preserves assignments", async () => {
    const first = poolImage("sketch-2-a", 2);
    const second = poolImage("sketch-2-b", 2);
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              modes: {},
              images: [first, second],
              beat_assignments: { "2": second.id },
            },
          }),
      ),
    );

    const { result } = renderHook(() => useGridsByBeat("demo", 1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.byBeat.get(2)).toHaveLength(2));
    expect(result.current.byBeat.get(2)).toEqual([first, second]);
    expect(result.current.assignments).toEqual({ "2": second.id });
  });

  it("rebuilds the pool index and invalidates the grids cache", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids/rebuild-pool",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: { episode: 1, image_count: 8 },
          });
        },
      ),
    );
    const queryClient = new QueryClient();
    const gridQueryKey = queryKeys.grids("demo", 1);
    queryClient.setQueryData(gridQueryKey, { ok: true, data: null });

    const { result } = renderHook(() => useRebuildPoolIndex("demo", 1), {
      wrapper: createWrapper(queryClient),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeDefined());
    await waitFor(() =>
      expect(queryClient.getQueryState(gridQueryKey)?.isInvalidated).toBe(true),
    );
    expect(receivedBody).toEqual({});
    expect(result.current.data?.data.image_count).toBe(8);
  });
});
