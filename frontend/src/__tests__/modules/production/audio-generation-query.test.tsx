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
import {
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
      model: "audio-speech-test",
      mode: "redo_selected",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/audio/generate");
    expect(receivedBody).toEqual({
      beat_numbers: [2, 4],
      model: "audio-speech-test",
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
      model: "audio-speech-test",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/beats/5/audio");
    expect(receivedBody).toEqual({ model: "audio-speech-test" });
    expect(result.current.data?.ok).toBe(true);
    if (result.current.data?.ok !== true) throw new Error("expected task response");
    expect(result.current.data.task_type).toBe("audio_generation_indextts2");
  });
});
