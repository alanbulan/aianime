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
  useRenderExecute,
  useRenderPlan,
  type RenderPlan,
} from "@/modules/production/public";

const mockPlan: RenderPlan = {
  plan: [
    {
      mode_key: "2x3_1-1",
      rows: 2,
      cols: 3,
      beat_numbers: [1, 2, 3, 4, 5],
      location: "market street",
      padding_count: 1,
      reasons: [],
      warnings: [],
    },
  ],
  plan_hash: "abc123def4567890",
  input_fingerprint: "xyz789abc1234567",
  strategy: "location",
  total_beats: 5,
  total_grids: 1,
};

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

describe("Production render-plan queries", () => {
  it("maps the planning command and returns a render plan", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/render/plan",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({ ok: true, data: mockPlan });
        },
      ),
    );

    const { result } = renderHook(() => useRenderPlan("demo", 1), {
      wrapper,
    });
    result.current.mutate({
      beatIndices: [1, 2, 3, 4, 5],
      strategy: "location",
      aspectMode: "9:16",
      forceOneByOne: false,
      imageGenerationSelection: "openrouter_nanobanana2",
      sketchAspectPadding: true,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({
      beat_indices: [1, 2, 3, 4, 5],
      strategy: "location",
      aspect_mode: "9:16",
      force_one_by_one: false,
      image_generation_selection: "openrouter_nanobanana2",
      sketch_aspect_padding: true,
    });
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) {
      throw new Error("expected ok render plan response");
    }
    expect(result.current.data.data.plan_hash).toBe("abc123def4567890");
  });

  it("maps the execute command and returns dispatched task ids", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/render/execute",
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json({
            ok: true,
            data: {
              task_type: "render_plan",
              message: "started",
              scope: "location__abc123def4567890",
              resolved_grids: mockPlan.plan,
              task_ids: ["task-1"],
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useRenderExecute("demo", 1), {
      wrapper,
    });
    result.current.mutate({
      plan: mockPlan.plan,
      planHash: mockPlan.plan_hash,
      inputFingerprint: mockPlan.input_fingerprint,
      strategy: "location",
      aspectMode: "9:16",
      beatIndices: [1, 2, 3, 4, 5],
      forceOneByOne: false,
      imageGenerationSelection: "openrouter_nanobanana2",
      sketchAspectPadding: true,
      customPlan: false,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({
      plan: mockPlan.plan,
      plan_hash: mockPlan.plan_hash,
      input_fingerprint: mockPlan.input_fingerprint,
      strategy: "location",
      aspect_mode: "9:16",
      beat_indices: [1, 2, 3, 4, 5],
      force_one_by_one: false,
      image_generation_selection: "openrouter_nanobanana2",
      sketch_aspect_padding: true,
      custom_plan: false,
    });
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) {
      throw new Error("expected ok render execute response");
    }
    expect(result.current.data.data.task_ids).toEqual(["task-1"]);
  });
});
