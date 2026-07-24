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
  useCutGrid,
  useExportGridPrompt,
  useSketchGridPreview,
  useUploadGrid,
} from "@/modules/production/public";

function createWrapper(queryClient = new QueryClient()) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("Production image grid queries", () => {
  it("loads a sketch grid preview and maps transport fields", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids/2/sketch-preview",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              grid_index: 2,
              rows: 1,
              cols: 2,
              beat_numbers: [5, 6],
              preview_path: "custom/sketch-preview.jpg",
              preview_url: "/static/sketch-preview.jpg",
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useSketchGridPreview("demo", 1, {
          gridIndex: 2,
          rows: 1,
          cols: 2,
          beatNumbers: [5, 6],
          enabled: true,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/grids/2/sketch-preview",
    );
    expect(receivedBody).toEqual({ rows: 1, cols: 2, beat_numbers: [5, 6] });
    expect(result.current.data).toEqual({
      ok: true,
      data: {
        gridIndex: 2,
        rows: 1,
        cols: 2,
        beatNumbers: [5, 6],
        previewPath: "custom/sketch-preview.jpg",
        previewUrl: "/static/sketch-preview.jpg",
      },
    });
  });

  it("cuts a render grid and invalidates the image pool", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids/2/cut",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: { grid_index: 2, added: 2, skipped: 0 },
          });
        },
      ),
    );
    const queryClient = new QueryClient();
    const gridsKey = queryKeys.grids("demo", 1);
    queryClient.setQueryData(gridsKey, { ok: true, data: null });

    const { result } = renderHook(() => useCutGrid("demo", 1), {
      wrapper: createWrapper(queryClient),
    });
    const response = await result.current.mutateAsync({
      gridIndex: 2,
      rows: 1,
      cols: 2,
      modeKey: "2x2",
      beatNumbers: [5, 6],
      gridType: "render",
    });

    expect(receivedBody).toEqual({
      grid_type: "render",
      mode_key: "2x2",
      rows: 1,
      cols: 2,
      beat_start: 5,
      beat_end: 6,
      beat_numbers: [5, 6],
    });
    expect(response).toEqual({
      ok: true,
      data: { gridIndex: 2, added: 2, skipped: 0 },
    });
    expect(queryClient.getQueryState(gridsKey)?.isInvalidated).toBe(true);
  });

  it("uploads all grid form fields and invalidates the image pool", async () => {
    let requestedPath = "";
    let contentType = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids/2/upload",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          contentType = request.headers.get("content-type") ?? "";
          return HttpResponse.json({
            ok: true,
            data: {
              grid_index: 2,
              grid_type: "render",
              mode_key: "2x2",
              beat_numbers: [5, 6],
              grid_path: "custom/render-grid.png",
              grid_url: "/static/render-grid.png",
            },
          });
        },
      ),
    );
    const queryClient = new QueryClient();
    const gridsKey = queryKeys.grids("demo", 1);
    queryClient.setQueryData(gridsKey, { ok: true, data: null });
    const file = new File(["grid"], "grid.png", { type: "image/png" });
    const appendSpy = vi.spyOn(FormData.prototype, "append");

    const { result } = renderHook(() => useUploadGrid("demo", 1), {
      wrapper: createWrapper(queryClient),
    });
    const response = await result.current.mutateAsync({
      gridIndex: 2,
      file,
      gridType: "render",
      modeKey: "2x2",
      beatNumbers: [5, 6],
    });

    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/grids/2/upload",
    );
    expect(contentType).toContain("multipart/form-data");
    expect(appendSpy).toHaveBeenCalledWith("file", file, file.name);
    expect(appendSpy).toHaveBeenCalledWith("grid_type", "render");
    expect(appendSpy).toHaveBeenCalledWith("mode_key", "2x2");
    expect(appendSpy).toHaveBeenCalledWith("beat_numbers", "5,6");
    appendSpy.mockRestore();
    expect(response).toEqual({
      ok: true,
      data: {
        gridIndex: 2,
        gridType: "render",
        modeKey: "2x2",
        beatNumbers: [5, 6],
        gridPath: "custom/render-grid.png",
        gridUrl: "/static/render-grid.png",
      },
    });
    expect(queryClient.getQueryState(gridsKey)?.isInvalidated).toBe(true);
  });

  it("exports a grid prompt with the default render type", async () => {
    let requestedSearch = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids/2/prompt",
        ({ request }) => {
          requestedSearch = new URL(request.url).search;
          return HttpResponse.json({
            ok: true,
            data: {
              grid_index: 2,
              grid_type: "render",
              mode_key: "2x2",
              beat_numbers: [5, 6],
              prompt: "render prompt text",
              prompt_path: "custom/render-prompt.txt",
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useExportGridPrompt("demo", 1), {
      wrapper: createWrapper(),
    });
    const response = await result.current.mutateAsync({
      gridIndex: 2,
      modeKey: "2x2",
      beatNumbers: [5, 6],
    });

    expect(requestedSearch).toContain("grid_type=render");
    expect(requestedSearch).toContain("mode_key=2x2");
    expect(requestedSearch).toContain("beat_numbers=5%2C6");
    expect(response).toEqual({
      ok: true,
      data: {
        gridIndex: 2,
        gridType: "render",
        modeKey: "2x2",
        beatNumbers: [5, 6],
        prompt: "render prompt text",
        promptPath: "custom/render-prompt.txt",
      },
    });
  });
});
