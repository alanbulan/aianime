// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
  uploadApi: ky.create({ baseUrl: "http://localhost:3000/", timeout: false }),
}));

import { server } from "@/__tests__/setup-msw";
import { queryKeys } from "@/lib/query-keys";
import {
  StalePoolSelectError,
  type PoolImage,
  useGrids,
  useGridsByBeat,
  usePoolSelect,
  useRebuildPoolIndex,
  useUploadBeatImage,
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
          receivedBody = await request.clone().json();
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

  it("sends force=false and raises the dedicated stale selection error", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/pool-select",
        async ({ request }) => {
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: false,
            stale: true,
            error: "该草图已过期，请先重新生成。",
          });
        },
      ),
    );

    const { result } = renderHook(() => usePoolSelect("demo", 1), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({ beatNum: 5, poolId: "stale_sketch" }),
    ).rejects.toBeInstanceOf(StalePoolSelectError);
    expect(receivedBody).toEqual({ pool_id: "stale_sketch", force: false });
  });

  it("patches the sketch URL without changing render assignments", async () => {
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/pool-select",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              beat_num: 5,
              pool_id: "sketch_pool",
              image_type: "sketch",
              sketch_url: "/static/demo/sketches/ep001/beat_05.png",
            },
          }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const beatsKey = queryKeys.beats("demo", 1);
    const gridsKey = queryKeys.grids("demo", 1);
    const cropSourceKey = queryKeys.sketchCropSource("demo", 1, 5);
    queryClient.setQueryData(beatsKey, {
      ok: true,
      data: [
        {
          beat_number: 5,
          narration_segment: "n",
          visual_description: "v",
          frame_url: "/static/demo/frames/ep001/beat_05.png",
          sketch_url: null,
        },
      ],
    });
    queryClient.setQueryData(gridsKey, {
      ok: true,
      data: {
        episode: 1,
        modes: {},
        images: [],
        beat_assignments: { "5": "render_pool" },
      },
    });
    queryClient.setQueryData(cropSourceKey, { ok: true, data: {} });

    const { result } = renderHook(() => usePoolSelect("demo", 1), {
      wrapper: createWrapper(queryClient),
    });
    const response = await result.current.mutateAsync({
      beatNum: 5,
      poolId: "sketch_pool",
    });

    const beats = queryClient.getQueryData<{
      ok: true;
      data: Array<{ beat_number: number; sketch_url?: string | null }>;
    }>(beatsKey);
    const grids = queryClient.getQueryData<{
      ok: true;
      data: { beat_assignments: Record<string, string> };
    }>(gridsKey);
    expect(response.data).toEqual({
      beatNum: 5,
      poolId: "sketch_pool",
      imageType: "sketch",
      sketchUrl: "/static/demo/sketches/ep001/beat_05.png",
    });
    expect(beats?.data[0].sketch_url).toBe(
      "/static/demo/sketches/ep001/beat_05.png",
    );
    expect(grids?.data.beat_assignments["5"]).toBe("render_pool");
    expect(queryClient.getQueryState(cropSourceKey)?.isInvalidated).toBe(true);
  });

  it("sends force=true and patches render assignment plus canonical frame", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/pool-select",
        async ({ request }) => {
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              beat_num: 5,
              pool_id: "render_pool_new",
              image_type: "render",
              frame_url: "/static/demo/frames/ep001/beat_05.png?v=2",
            },
          });
        },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const beatsKey = queryKeys.beats("demo", 1);
    const gridsKey = queryKeys.grids("demo", 1);
    queryClient.setQueryData(beatsKey, {
      ok: true,
      data: [
        {
          beat_number: 5,
          narration_segment: "n",
          visual_description: "v",
          frame_url: null,
        },
      ],
    });
    queryClient.setQueryData(gridsKey, {
      ok: true,
      data: {
        episode: 1,
        modes: {},
        images: [],
        beat_assignments: { "5": "render_pool_old" },
      },
    });

    const { result } = renderHook(() => usePoolSelect("demo", 1), {
      wrapper: createWrapper(queryClient),
    });
    const response = await result.current.mutateAsync({
      beatNum: 5,
      poolId: "render_pool_new",
      force: true,
    });

    const beats = queryClient.getQueryData<{
      ok: true;
      data: Array<{ beat_number: number; frame_url?: string | null }>;
    }>(beatsKey);
    const grids = queryClient.getQueryData<{
      ok: true;
      data: { beat_assignments: Record<string, string> };
    }>(gridsKey);
    expect(receivedBody).toEqual({ pool_id: "render_pool_new", force: true });
    expect(response.data?.frameUrl).toBe(
      "/static/demo/frames/ep001/beat_05.png?v=2",
    );
    expect(beats?.data[0].frame_url).toBe(
      "/static/demo/frames/ep001/beat_05.png?v=2",
    );
    expect(grids?.data.beat_assignments["5"]).toBe("render_pool_new");
  });

  it("uploads a sketch file and invalidates grids and beats", async () => {
    let requestedPath = "";
    let contentType = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/upload",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          contentType = request.headers.get("content-type") ?? "";
          return HttpResponse.json({
            ok: true,
            data: {
              beat_num: 5,
              pool_id: "beat_05_sketch",
              sketch_url: "/static/demo/sketches/ep001/beat_05.png",
            },
          });
        },
      ),
    );
    const queryClient = new QueryClient();
    const gridsKey = queryKeys.grids("demo", 1);
    const beatsKey = queryKeys.beats("demo", 1);
    queryClient.setQueryData(gridsKey, { ok: true, data: null });
    queryClient.setQueryData(beatsKey, { ok: true, data: [] });

    const { result } = renderHook(
      () => useUploadBeatImage("demo", 1, "sketch"),
      { wrapper: createWrapper(queryClient) },
    );
    const file = new File(["x"], "sketch.png", { type: "image/png" });
    const appendSpy = vi.spyOn(FormData.prototype, "append");
    const response = await result.current.mutateAsync({
      beatNum: 5,
      file,
    });

    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/5/sketch/upload",
    );
    expect(contentType).toContain("multipart/form-data");
    expect(appendSpy).toHaveBeenCalledWith("file", file, file.name);
    appendSpy.mockRestore();
    expect(response).toEqual({
      ok: true,
      data: {
        beatNum: 5,
        poolId: "beat_05_sketch",
        sketchUrl: "/static/demo/sketches/ep001/beat_05.png",
      },
    });
    expect(queryClient.getQueryState(gridsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(beatsKey)?.isInvalidated).toBe(true);
  });

  it("uploads a render file through the render endpoint", async () => {
    let requestedPath = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/render/upload",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              beat_num: 5,
              pool_id: "beat_05_render",
              frame_url: "/static/demo/frames/ep001/beat_05.png",
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () => useUploadBeatImage("demo", 1, "render"),
      { wrapper: createWrapper() },
    );
    const response = await result.current.mutateAsync({
      beatNum: 5,
      file: new File(["x"], "render.png", { type: "image/png" }),
    });

    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/5/render/upload",
    );
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);
    expect(response.data.frameUrl).toBe(
      "/static/demo/frames/ep001/beat_05.png",
    );
  });
});
