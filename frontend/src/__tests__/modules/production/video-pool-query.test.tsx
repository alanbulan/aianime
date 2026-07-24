// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ky from "ky";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { queryKeys } from "@/lib/query-keys";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  useVideoPool,
  useVideoPoolSelect,
  type VideoPoolData,
} from "@/modules/production/public";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function makeBeat(): Beat {
  return {
    beat_number: 1,
    narration_segment: "旁白",
    visual_description: "画面",
    audio_type: "narration",
    video_mode: "first_frame",
    detected_identities: [],
    video_prompt: "",
    keyframe_prompt: "",
    audio_url: "",
    frame_url: "",
    video_url: "/static/old.mp4",
  };
}

describe("Production video pool queries", () => {
  it("loads the episode video pool through the Production gateway", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/video-pool",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: { episode: 2, videos: [], beat_assignments: {} },
          });
        },
      ),
    );

    const { result } = renderHook(() => useVideoPool("demo", 2), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/2/video-pool");
    expect(result.current.data?.data?.episode).toBe(2);
  });

  it("selects a pool entry and patches only the affected caches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData<{ ok: true; data: VideoPoolData }>(
      queryKeys.videoPool("demo", 2),
      {
        ok: true,
        data: {
          episode: 2,
          videos: [],
          beat_assignments: { "1": "old-pool" },
        },
      },
    );
    queryClient.setQueryData<{ ok: true; data: Beat[] }>(
      queryKeys.beats("demo", 2),
      { ok: true, data: [makeBeat()] },
    );
    let requestBody: unknown;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/1/video-pool-select",
        async ({ request }) => {
          requestBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              beat_num: 1,
              pool_id: "new-pool",
              video_url: "/static/new.mp4",
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useVideoPoolSelect("demo", 2), {
      wrapper: createWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync({ beatNum: 1, poolId: "new-pool" });
    });

    expect(requestBody).toEqual({ pool_id: "new-pool" });
    expect(
      queryClient.getQueryData<{ ok: true; data: VideoPoolData }>(
        queryKeys.videoPool("demo", 2),
      )?.data.beat_assignments,
    ).toEqual({ "1": "new-pool" });
    expect(
      queryClient.getQueryData<{ ok: true; data: Beat[] }>(
        queryKeys.beats("demo", 2),
      )?.data[0]?.video_url,
    ).toBe("/static/new.mp4");
  });

  it("surfaces the backend selection error", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/1/video-pool-select",
        () => HttpResponse.json({ ok: false, error: "候选视频不存在" }),
      ),
    );

    const { result } = renderHook(() => useVideoPoolSelect("demo", 2), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ beatNum: 1, poolId: "missing" }),
    ).rejects.toThrow("候选视频不存在");
  });
});
