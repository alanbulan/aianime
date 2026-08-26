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

import { server } from "@/__tests__/setup-msw";
import {
  useRenderSettings,
  useSketchSettings,
  useUpdateRenderSettings,
  useUpdateSketchSettings,
} from "@/modules/production/public";

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

describe("Production render settings queries", () => {
  it("loads the render image model and sketch padding switch", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/render-settings",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              render_image_selection: "openrouter_nanobanana2",
              sketch_aspect_padding: true,
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useRenderSettings("demo"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/render-settings");
    expect(result.current.data?.data.render_image_selection).toBe(
      "openrouter_nanobanana2",
    );
    expect(result.current.data?.data.sketch_aspect_padding).toBe(true);
  });

  it("maps the render settings command to the backend request", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.patch(
        "http://localhost:3000/api/v1/projects/demo/render-settings",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              render_image_selection: "openrouter_nanobanana2",
              sketch_aspect_padding: true,
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useUpdateRenderSettings("demo"), {
      wrapper,
    });
    result.current.mutate({
      renderImageSelection: "openrouter_nanobanana2",
      sketchAspectPadding: true,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/render-settings");
    expect(receivedBody).toEqual({
      render_image_selection: "openrouter_nanobanana2",
      sketch_aspect_padding: true,
    });
  });
});

describe("Production sketch settings queries", () => {
  it("loads the sketch-stage image model settings", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/sketch-settings",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              sketch_image_selection: "openrouter_nanobanana2",
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useSketchSettings("demo"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/sketch-settings");
    expect(result.current.data?.data.sketch_image_selection).toBe(
      "openrouter_nanobanana2",
    );
  });

  it("maps the sketch settings command to the backend request", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.patch(
        "http://localhost:3000/api/v1/projects/demo/sketch-settings",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              sketch_image_selection: "openrouter_nanobanana2",
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useUpdateSketchSettings("demo"), {
      wrapper,
    });
    result.current.mutate({
      sketchImageSelection: "openrouter_nanobanana2",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/sketch-settings");
    expect(receivedBody).toEqual({
      sketch_image_selection: "openrouter_nanobanana2",
    });
  });
});
