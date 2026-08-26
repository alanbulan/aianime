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
  useComposeEpisode,
  useFinalVideo,
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

describe("Production episode compose queries", () => {
  it("maps the compose command to the backend request", async () => {
    let requestedPath = "";
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/videos/compose",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "compose_episode",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useComposeEpisode("demo", 2), {
      wrapper,
    });
    result.current.mutate({
      addSubtitles: true,
      addBgm: false,
      resolution: "1080x1920",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/2/videos/compose",
    );
    expect(body).toEqual({
      add_subtitles: true,
      add_bgm: false,
      resolution: "1080x1920",
    });
  });

  it("loads an existing final video through the Production gateway", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/final",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              exists: true,
              filename: "ep002_final.mp4",
              video_url: "/static/demo/videos/episodes/ep002_final.mp4",
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useFinalVideo("demo", 2), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/2/final",
    );
    expect(result.current.data?.data.video_url).toBe(
      "/static/demo/videos/episodes/ep002_final.mp4",
    );
  });
});
