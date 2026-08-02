// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

vi.mock("@/modules/model_usage/public", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/model_usage/public")>()),
  loadCommercialModelCatalog: vi.fn(async () => ({
    catalogVersion: "test-image-catalog",
    items: [
      { code: "openrouter_nanobanana2", operation: "IMAGE" },
      { code: "cloud/image-current", operation: "IMAGE" },
      { code: "image-platform-sku", operation: "IMAGE" },
    ],
  })),
}));

import { server } from "@/__mocks__/msw/server";
import { queryKeys } from "@/lib/query-keys";
import {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCropBeatBackgroundAnchor,
  useDirectorControlFrameStatus,
  useUpdateBeatBackgroundAnchor,
  useUploadBeatBackgroundAnchor,
} from "@/modules/asset_world/public";
import {
  useAssignColors,
  useDetectIdentities,
  useDirectorControlToSketch,
  useGenerateSketches,
  useRegenerateGrid,
  useRegenerateRenderBeats,
  useRegenerateSketches,
} from "@/modules/production/public";
import { api } from "@/shared/api/transport";
import { BillingRuleNotConfiguredError } from "@/shared/api/errors";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function wrapperWithClient(queryClient: QueryClient) {
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  server.use(
    http.get(
      "http://localhost:3000/api/v1/projects/demo/sketch-settings",
      () =>
        HttpResponse.json({
          ok: true,
          data: { sketch_image_selection: "openrouter_nanobanana2" },
        }),
    ),
    http.get(
      "http://localhost:3000/api/v1/projects/demo/render-settings",
      () =>
        HttpResponse.json({
          ok: true,
          data: {
            render_image_selection: "openrouter_nanobanana2",
            sketch_aspect_padding: false,
          },
        }),
    ),
  );
});

describe("sketch generation query", () => {
  it("uses /sketches/generate for whole-episode sketch generation", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/generate",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "sketch_generation",
            data: { dispatched: 2, scopes: ["grid_0", "grid_1"] },
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateSketches("demo", 1), {
      wrapper,
    });

    result.current.mutate({ gridIndex: -1 });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/sketches/generate");
    expect(receivedBody).toEqual({
      grid_index: -1,
      image_generation_selection: "openrouter_nanobanana2",
    });
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) throw new Error("expected sketch generation to succeed");
    expect(result.current.data.task_type).toBe("sketch_generation");
  });

  it("passes Sketch model selection and aspect ratio to sketch generation", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/generate",
        async ({ request }) => {
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "sketch_generation",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateSketches("demo", 1), {
      wrapper,
    });

    result.current.mutate({
      aspectRatio: "16:9",
      imageGenerationSelection: "openrouter_nanobanana2",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({
      grid_index: 0,
      aspect_ratio: "16:9",
      image_generation_selection: "openrouter_nanobanana2",
    });
  });
});

describe("selected sketch regeneration query", () => {
  it("maps selected beats and the default sketch mode to the backend request", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/regenerate",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "sketch_regen",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRegenerateSketches("demo", 1), {
      wrapper,
    });

    result.current.mutate({
      beatIndices: [2, 4],
      imageGenerationSelection: "cloud/image-current",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/sketches/regenerate",
    );
    expect(receivedBody).toEqual({
      beat_indices: [2, 4],
      mode_key: "1x1_2-3_sketch",
      image_generation_selection: "cloud/image-current",
    });
  });
});

describe("director control frame queries", () => {
  it("loads beat 3GS director stage manifest", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/director-stage/manifest",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              viewer_kind: "three_d_director",
              mode: "beat",
              project: "demo",
              scene_id: "地下室",
              display_name: "地下室",
              source: {
                ply_url: "/static/admin/demo/director_worlds/地下室/v1/master_sharp.ply",
                source_kind: "master",
              },
              palette: {
                actors: [],
                props: [],
                anonymous_colors: [],
              },
              allowed_destinations: ["view", "beat_selected_background"],
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useBeatDirectorStageManifest("demo", 1, 4), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/beats/4/director-stage/manifest");
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) throw new Error("expected director stage manifest");
    expect(result.current.data.data.source.ply_url).toContain("/static/");
  });

  it("loads and updates beat background anchors", async () => {
    const paths: string[] = [];
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/background-anchors",
        ({ request }) => {
          paths.push(new URL(request.url).pathname);
          return HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              beat_num: 4,
              scene_id: "地下室",
              can_choose: true,
              current_anchor: "master",
              current_reference: {
                id: "master",
                label: "master",
                anchor_id: "master",
                rel_path: "scenes/地下室/master.png",
                url: "/static/master.png",
              },
              anchors: [
                {
                  id: "master",
                  anchor_id: "master",
                  label: "master",
                  current: true,
                  exists: true,
                  rel_path: "scenes/地下室/master.png",
                  url: "/static/master.png",
                  snapshot_to_selected_background: true,
                },
              ],
              error: "",
            },
          });
        },
      ),
      http.patch(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/background-anchor",
        async ({ request }) => {
          paths.push(new URL(request.url).pathname);
          expect(await request.clone().json()).toEqual({ anchor_id: "master" });
          return HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              beat_num: 4,
              scene_id: "地下室",
              can_choose: true,
              current_anchor: "selected_background",
              anchors: [],
              error: "",
            },
          });
        },
      ),
    );

    const { result: query } = renderHook(() => useBeatBackgroundAnchors("demo", 1, 4), {
      wrapper,
    });

    await waitFor(() => expect(query.current.data).toBeDefined());
    expect(query.current.data?.ok).toBe(true);
    if (!query.current.data?.ok) throw new Error("expected background anchors");
    expect(query.current.data.data).toMatchObject({
      beatNumber: 4,
      sceneId: "地下室",
      canChoose: true,
      currentAnchor: "master",
      currentReference: {
        anchorId: "master",
        relativePath: "scenes/地下室/master.png",
      },
      anchors: [
        {
          anchorId: "master",
          relativePath: "scenes/地下室/master.png",
          snapshotToSelectedBackground: true,
        },
      ],
    });

    const { result: mutation } = renderHook(
      () => useUpdateBeatBackgroundAnchor("demo", 1, 4),
      { wrapper },
    );
    mutation.current.mutate({ anchorId: "master" });

    await waitFor(() => expect(mutation.current.data).toBeDefined());
    expect(paths).toContain("/api/v1/projects/demo/episodes/1/beats/4/background-anchors");
    expect(paths).toContain("/api/v1/projects/demo/episodes/1/beats/4/background-anchor");
    expect(mutation.current.data?.ok).toBe(true);
    if (!mutation.current.data?.ok) throw new Error("expected anchor update");
    expect(mutation.current.data.data.currentAnchor).toBe(
      "selected_background",
    );
  });

  it("refreshes beat background anchors on focus without permanent polling", async () => {
    let requestCount = 0;
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/background-anchors",
        () => {
          requestCount += 1;
          return HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              beat_num: 4,
              scene_id: "地下室",
              can_choose: true,
              current_anchor: "master",
              anchors: [
                {
                  id: "director_env_only",
                  label: "director env_only",
                  exists: requestCount > 1,
                  url: requestCount > 1 ? "/static/env_only.png" : null,
                },
              ],
              error: "",
            },
          });
        },
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          refetchOnWindowFocus: false,
          staleTime: 30_000,
        },
      },
    });
    const { result } = renderHook(() => useBeatBackgroundAnchors("demo", 1, 4), {
      wrapper: wrapperWithClient(queryClient),
    });

    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    if (!result.current.data?.ok) throw new Error("expected background anchors");
    expect(result.current.data.data.anchors[0].exists).toBe(false);
    const stableRequestCount = requestCount;

    await new Promise((resolve) => setTimeout(resolve, 2200));
    expect(requestCount).toBe(stableRequestCount);

    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(requestCount).toBeGreaterThan(stableRequestCount));
    const data = result.current.data;
    expect(data?.ok).toBe(true);
    if (!data?.ok) throw new Error("expected background anchors");
    expect(data.data.anchors[0].exists).toBe(true);
  });

  it("uploads beat background anchor images into selected background", async () => {
    let requestedPath = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/background-anchor/upload",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          expect(request.headers.get("content-type") ?? "").toContain("multipart/form-data");
          return HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              beat_num: 4,
              scene_id: "地下室",
              can_choose: true,
              current_anchor: "selected_background",
              anchors: [],
              error: "",
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () => useUploadBeatBackgroundAnchor("demo", 1, 4),
      { wrapper },
    );

    result.current.mutate({
      file: new File(["x"], "background.png", { type: "image/png" }),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/4/background-anchor/upload",
    );
    expect(result.current.data?.ok).toBe(true);
  });

  it("crops beat background anchor images into selected background", async () => {
    let requestedPath = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/background-anchor/crop",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          expect(await request.clone().json()).toEqual({
            anchor_id: "master",
            x: 0,
            y: 0,
            width: 320,
            height: 180,
          });
          return HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              beat_num: 4,
              scene_id: "地下室",
              can_choose: true,
              current_anchor: "master",
              current_source: "master",
              render_anchor_id: "selected_background",
              anchors: [],
              error: "",
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () => useCropBeatBackgroundAnchor("demo", 1, 4),
      { wrapper },
    );

    result.current.mutate({
      anchorId: "master",
      crop: { x: 0, y: 0, width: 320, height: 180 },
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/4/background-anchor/crop",
    );
    expect(result.current.data?.ok).toBe(true);
  });

  it("loads director control frame status for a beat", async () => {
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/director-control-frame",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              episode: 1,
              beat_num: 4,
              ready: true,
              path: "/tmp/director_control_frames/ep001/beat_04/combined.png",
              rel_path: "director_control_frames/ep001/beat_04/combined.png",
              url: "/static/admin/demo/director_control_frames/ep001/beat_04/combined.png",
              scope: "director_control_to_sketch:ep001:beat_04",
            },
          });
        },
      ),
    );

    const { result } = renderHook(
      () => useDirectorControlFrameStatus("demo", 1, 4),
      { wrapper },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/4/director-control-frame",
    );
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) throw new Error("expected status to load");
    expect(result.current.data.data.beatNumber).toBe(4);
    expect(result.current.data.data.relativePath).toBe(
      "director_control_frames/ep001/beat_04/combined.png",
    );
    expect(result.current.data.data.ready).toBe(true);
    expect(result.current.data.data.scope).toBe(
      "director_control_to_sketch:ep001:beat_04",
    );
  });

  it("starts director control frame to sketch conversion for a beat", async () => {
    let requestedPath = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/4/director-control-to-sketch",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            task_type: "sketch_generation",
            scope: "director_control_to_sketch:ep001:beat_04",
            message: "started",
            data: {
              episode: 1,
              beat_num: 4,
              ready: true,
              url: "/static/admin/demo/director_control_frames/ep001/beat_04/combined.png",
              scope: "director_control_to_sketch:ep001:beat_04",
            },
          });
        },
      ),
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const directorKey = queryKeys.directorControlFrame("demo", 1, 4);
    const gridsKey = queryKeys.grids("demo", 1);
    const beatsKey = queryKeys.beats("demo", 1);
    queryClient.setQueryData(directorKey, { ok: true });
    queryClient.setQueryData(gridsKey, { ok: true });
    queryClient.setQueryData(beatsKey, { ok: true });

    const { result } = renderHook(
      () => useDirectorControlToSketch("demo", 1, 4),
      { wrapper: wrapperWithClient(queryClient) },
    );

    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/4/director-control-to-sketch",
    );
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) throw new Error("expected task to start");
    expect(result.current.data.scope).toBe("director_control_to_sketch:ep001:beat_04");
    expect(queryClient.getQueryState(directorKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(gridsKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(beatsKey)?.isInvalidated).toBe(true);
  });
});

describe("render grid query", () => {
  it("regenerates one render grid by grid index", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids/3/regenerate",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "grid_regenerate",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRegenerateGrid("demo", 1), {
      wrapper,
    });

    result.current.mutate({
      gridIndex: 3,
      sceneGrouping: true,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/grids/3/regenerate",
    );
    expect(receivedBody).toEqual({
      scene_grouping: true,
      character_grouping: false,
      image_generation_selection: "openrouter_nanobanana2",
    });
  });

  it("passes Render model and sizing settings to grid regeneration", async () => {
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/grids/3/regenerate",
        async ({ request }) => {
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "grid_regenerate",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRegenerateGrid("demo", 1), {
      wrapper,
    });

    result.current.mutate({
      gridIndex: 3,
      imageGenerationSelection: "image-platform-sku",
      sketchAspectPadding: false,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(receivedBody).toEqual({
      scene_grouping: false,
      character_grouping: false,
      image_generation_selection: "image-platform-sku",
      sketch_aspect_padding: false,
    });
  });

  it("passes Render model and sketch padding settings to selected beat regeneration", async () => {
    let requestedPath = "";
    let receivedBody: unknown = undefined;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/regenerate",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          receivedBody = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "selected_regen",
            scope: "selected__1x1_2-3__1-3",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRegenerateRenderBeats("demo", 1), {
      wrapper,
    });

    result.current.mutate({
      beatIndices: [1, 3],
      imageGenerationSelection: "openrouter_nanobanana2",
      sketchAspectPadding: true,
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/beats/regenerate");
    expect(receivedBody).toEqual({
      beat_indices: [1, 3],
      mode_key: "1x1_2-3",
      image_generation_selection: "openrouter_nanobanana2",
      sketch_aspect_padding: true,
    });
  });
});

describe("sketch action queries", () => {
  it("uses the v2 assign-colors endpoint and forwards force=true", async () => {
    let requestedPath = "";
    let requestedForce = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/assign-colors",
        ({ request }) => {
          const url = new URL(request.url);
          requestedPath = url.pathname;
          requestedForce = url.searchParams.get("force") ?? "";
          return HttpResponse.json({
            ok: true,
            data: {
              colors: { hero_main: "#ffffff" },
              count: 1,
              prop_colors: { jade_sword: "#00ff00" },
              prop_count: 1,
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useAssignColors("demo", 1), {
      wrapper,
    });

    result.current.mutate({ force: true });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/sketches/assign-colors");
    expect(requestedForce).toBe("true");
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) throw new Error("expected assign-colors to succeed");
    expect(result.current.data.data.prop_count).toBe(1);
  });

  it("invalidates episode detail after assigning prop colors", async () => {
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/assign-colors",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              colors: { hero_main: "#ffffff" },
              count: 1,
              prop_colors: { jade_sword: "#00ff00" },
              prop_count: 1,
            },
          }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const episodeDetailKey = queryKeys.episodeDetail("demo", 1);
    queryClient.setQueryData(episodeDetailKey, {
      ok: true,
      data: {
        number: 1,
        prop_menu: [{ prop_id: "jade_sword", marker_color: null }],
      },
    });

    const { result } = renderHook(() => useAssignColors("demo", 1), {
      wrapper: wrapperWithClient(queryClient),
    });

    await result.current.mutateAsync({ force: true });

    expect(queryClient.getQueryState(episodeDetailKey)?.isInvalidated).toBe(
      true,
    );
  });

  it("uses the v2 detect-identities endpoint", async () => {
    let requestedPath = "";
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/detect-identities",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({
            ok: true,
            data: {
              detections: { "1": ["hero_main"] },
              identity_detections: { "1": ["hero_main"] },
              prop_detections: { "1": ["jade_sword"] },
              total_beats: 1,
              total_identities: 1,
              total_props: 1,
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useDetectIdentities("demo", 1), {
      wrapper,
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe("/api/v1/projects/demo/episodes/1/sketches/detect-identities");
    expect(result.current.data?.ok).toBe(true);
    if (!result.current.data?.ok) throw new Error("expected detect identities to succeed");
    expect(result.current.data.data.prop_detections).toEqual({ "1": ["jade_sword"] });
    expect(result.current.data.data.total_props).toBe(1);
  });

  it("uses a long timeout for AI detection because the backend runs model batches synchronously", async () => {
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/detect-identities",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              detections: {},
              identity_detections: {},
              prop_detections: {},
              total_beats: 64,
              total_identities: 0,
              total_props: 0,
            },
          }),
      ),
    );
    const postSpy = vi.spyOn(api, "post");

    const { result } = renderHook(() => useDetectIdentities("demo", 1), {
      wrapper,
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(postSpy).toHaveBeenCalledWith(
      "api/v1/projects/demo/episodes/1/sketches/detect-identities",
      expect.objectContaining({ timeout: 180_000 }),
    );

    postSpy.mockRestore();
  });

  it("parses AI detection billing errors from backend responses", async () => {
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/detect-identities",
        () =>
          HttpResponse.json(
            {
              ok: false,
              error: "计费规则未配置，请联系管理员设置积分规则",
              data: {
                error_code: "BILLING_RULE_NOT_CONFIGURED",
                billing_kind: "feature",
                billing_key: "ai_identity_detection",
              },
            },
            { status: 409 },
          ),
      ),
    );

    const { result } = renderHook(() => useDetectIdentities("demo", 1), {
      wrapper,
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error).toBeInstanceOf(BillingRuleNotConfiguredError);
  });

  it("refreshes beats and script caches after AI detection writes detected identities", async () => {
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/sketches/detect-identities",
        () =>
          HttpResponse.json({
            ok: true,
            data: {
              detections: { "1": ["hero_main"] },
              identity_detections: { "1": ["hero_main"] },
              prop_detections: {},
              total_beats: 1,
              total_identities: 1,
              total_props: 0,
            },
          }),
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDetectIdentities("demo", 1), {
      wrapper: wrapperWithClient(queryClient),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.beats("demo", 1),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.script("demo", 1),
    });
  });
});
