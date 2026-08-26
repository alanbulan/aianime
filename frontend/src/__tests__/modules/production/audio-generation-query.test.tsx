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
  useAudioBillingQuote,
  useGenerateAudio,
  useRegenerateBeatAudio,
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

describe("Production IndexTTS2 audio queries", () => {
  it("posts the exact audio quote parameters to the project endpoint", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/audio/billing-quote",
        async ({ request }) => {
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              beat_numbers: [2],
              quantity: 1,
              unit_cost: 5,
              cost: 5,
              display: "5",
              prereq_errors: [],
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () =>
        useAudioBillingQuote(
          "demo",
          1,
          { beatNumbers: [2], mode: "redo_selected" },
          "revision-1",
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({
      beat_numbers: [2],
      mode: "redo_selected",
    });
    expect(result.current.data?.data.beat_numbers).toEqual([2]);
  });

  it("maps selected beat audio generation to the async task endpoint", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/audio/generate",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "audio_generation_indextts2",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateAudio("demo", 1), {
      wrapper,
    });
    result.current.mutate({
      beatNumbers: [2, 4],
      mode: "redo_selected",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/audio/generate");
    expect(receivedBody).toEqual({
      beat_numbers: [2, 4],
      mode: "redo_selected",
    });
    expect(result.current.data?.ok).toBe(true);
    if (result.current.data?.ok !== true) throw new Error("expected task response");
    expect(result.current.data.task_type).toBe("audio_generation_indextts2");
  });

  it("maps single beat regeneration to the async task endpoint", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/audio",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "audio_generation_indextts2",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRegenerateBeatAudio("demo", 1), {
      wrapper,
    });
    result.current.mutate({
      beatNumber: 5,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/beats/5/audio");
    expect(receivedBody).toEqual({});
    expect(result.current.data?.ok).toBe(true);
    if (result.current.data?.ok !== true) throw new Error("expected task response");
    expect(result.current.data.task_type).toBe("audio_generation_indextts2");
  });
});
