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
  useSaveSketchRegenQueue,
  useSketchRegenQueue,
  type SketchRegenQueueData,
  type SketchRegenQueueItem,
} from "@/modules/production/public";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function wrapperWithClient(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("Production sketch regen queue queries", () => {
  it("loads the persisted episode queue", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketch-regen-queue",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              items: [
                {
                  id: "2x2_2-3_sketch:1,2",
                  modeKey: "2x2_2-3_sketch",
                  modeLabel: "2x2",
                  beatNumbers: [1, 2],
                  sceneIds: ["store"],
                  createdAt: "2026-05-18T00:00:00.000Z",
                },
              ],
            },
          });
        },
      ),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useSketchRegenQueue("demo", 1), {
      wrapper: wrapperWithClient(queryClient),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/sketch-regen-queue",
    );
    expect(result.current.data?.data.items[0].beatNumbers).toEqual([1, 2]);
  });

  it("persists a replaced queue and updates its query cache", async () => {
    let receivedBody: unknown = undefined;
    const item: SketchRegenQueueItem = {
      id: "1x1_2-3_sketch:3",
      modeKey: "1x1_2-3_sketch",
      modeLabel: "1x1",
      beatNumbers: [3],
      sceneIds: ["store"],
      createdAt: "2026-05-18T00:01:00.000Z",
    };
    const response = { ok: true as const, data: { items: [item] } };
    server.use(
      http.put(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketch-regen-queue",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json(response);
        },
      ),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useSaveSketchRegenQueue("demo", 1),
      { wrapper: wrapperWithClient(queryClient) },
    );
    result.current.mutate([item]);

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({ items: [item] });
    expect(
      queryClient.getQueryData<{ ok: true; data: SketchRegenQueueData }>(
        queryKeys.sketchRegenQueue("demo", 1),
      ),
    ).toEqual(response);
  });
});
