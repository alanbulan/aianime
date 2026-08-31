// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import ky from "ky";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import {
  useGenerateSceneMasterAsync,
  useSceneDirectorStageManifest,
} from "@/modules/asset_world/public";

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
  focusManager.setFocused(undefined);
  server.resetHandlers();
});
afterAll(() => server.close());

function makeWrapperWithMainDefaults() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("scene director stage manifest query", () => {
  it("refetches on window focus because Freezone can commit the manifest from another app", async () => {
    let requestCount = 0;
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/scenes/Hall/director-stage/manifest",
        () => {
          requestCount += 1;
          return HttpResponse.json({
            ok: true,
            data: {
              viewer_kind: "three_d_director",
              mode: "scene",
              project: "demo",
              scene_id: "Hall",
              display_name: "Hall",
              active_source_id: `source-${requestCount}`,
              source: { source_kind: "master" },
              sources: [],
              scenes_by_source_id: {},
              palette: {
                actors: [],
                props: [],
                anonymous_colors: [],
                anonymous_prop_colors: [],
              },
              allowed_destinations: ["view"],
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () => useSceneDirectorStageManifest("demo", "Hall"),
      { wrapper: makeWrapperWithMainDefaults() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.isFetching).toBe(false));
    const beforeFocusRequestCount = requestCount;
    const beforeFocusSourceId = result.current.data?.ok ? result.current.data.data.active_source_id : "";

    focusManager.setFocused(false);
    focusManager.setFocused(true);

    await waitFor(() => expect(requestCount).toBeGreaterThan(beforeFocusRequestCount));
    expect(result.current.data?.ok ? result.current.data.data.active_source_id : "").not.toBe(beforeFocusSourceId);
  });
});

describe("scene reference generation mutation", () => {
  it("passes the selected image source model when generating a master image", async () => {
    let requestBody: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/scenes/Hall/master/generate-async",
        async ({ request }) => {
          requestBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "scene_reference_asset",
            task_id: "task-1",
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateSceneMasterAsync("demo", "Hall"), {
      wrapper: makeWrapperWithMainDefaults(),
    });

    await result.current.mutateAsync({ model: "image-model-b" });

    expect(requestBody).toEqual({ model: "image-model-b" });
  });
});
