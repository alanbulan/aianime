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
import { createSketchPoseEditorQueryHooks } from "@/modules/production/application/sketch-pose-editor-query-hooks";
import { httpProductionVideoGateway } from "@/modules/production/infrastructure/http-production-video-gateway";

const { useCropSketch, useSaveSketchPoseEditor, useSketchPoseEditor } =
  createSketchPoseEditorQueryHooks(httpProductionVideoGateway);

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

function expectSketchQueriesInvalidated(
  invalidateQueries: unknown,
) {
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: queryKeys.sketchPoseEditor("demo", 1, 5),
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: queryKeys.beats("demo", 1),
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: queryKeys.grids("demo", 1),
  });
}

describe("Production sketch pose editor queries", () => {
  it("loads the pose editor payload for a beat sketch", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/pose-editor",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              beat_num: 5,
              sketch_url: "/static/demo/sketches/ep001/beat_05.png",
              width: 64,
              height: 96,
              candidates: [],
              skeleton_edges: [],
              pose_presets: {},
              skeletons: [],
            },
          });
        },
      ),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(
      () => useSketchPoseEditor("demo", 1, 5, true),
      { wrapper: wrapperWithClient(queryClient) },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/5/sketch/pose-editor",
    );
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) throw new Error("expected ok response");
    expect(result.current.data.data.width).toBe(64);
  });

  it("saves pose editor state and invalidates affected sketch queries", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/pose-editor",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              beat_num: 5,
              sketch_url: "/static/demo/sketches/ep001/beat_05.png",
            },
          });
        },
      ),
    );

    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveSketchPoseEditor("demo", 1), {
      wrapper: wrapperWithClient(queryClient),
    });
    result.current.mutate({
      beatNum: 5,
      state: {
        strokes: [{ points: [{ x: 1, y: 2 }], width: 4 }],
        skeletons: [],
      },
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({
      strokes: [{ points: [{ x: 1, y: 2 }], width: 4 }],
      skeletons: [],
    });
    expectSketchQueriesInvalidated(invalidateQueries);
  });

  it("crops the canonical sketch and invalidates affected queries", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/crop",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              beat_num: 5,
              sketch_url: "/static/demo/sketches/ep001/beat_05.png",
              width: 20,
              height: 30,
            },
          });
        },
      ),
    );

    const queryClient = createQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCropSketch("demo", 1), {
      wrapper: wrapperWithClient(queryClient),
    });
    result.current.mutate({
      beatNum: 5,
      crop: { x: 4, y: 6, width: 20, height: 30 },
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({ x: 4, y: 6, width: 20, height: 30 });
    expectSketchQueriesInvalidated(invalidateQueries);
  });
});
