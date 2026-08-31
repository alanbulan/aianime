// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
  uploadApi: ky.create({ baseUrl: "http://localhost:3000/", timeout: false }),
}));

import { queryKeys } from "@/lib/query-keys";
import { server } from "@/__tests__/setup-msw";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  useCropVideoReferenceAsset,
  useDeleteVideoReferenceAsset,
  useVideoReferenceBeatStatus,
  useTrimVideoReferenceAsset,
  useUploadVideoReferenceAsset,
  type VideoReferenceBeatStatus,
} from "@/modules/production/public";

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function makeBeat(configJson = "old-config"): Beat {
  return {
    beat_number: 3,
    narration_segment: "旁白",
    visual_description: "画面",
    video_config_json: configJson,
  };
}

function makeStatus(configJson: string): VideoReferenceBeatStatus {
  return {
    beat_number: 3,
    audio_type: "narration",
    video_config_json: configJson,
    media: {
      render_ready: true,
      audio_ready: true,
      video_ready: false,
    },
    voice: {
      required: true,
      ready: true,
      label: "声线就绪",
      detail: "项目旁白",
    },
    prompt: {
      ready: true,
      source: "generated",
      status: "AI 生成",
      has_guidance: false,
      text_overlay_enabled: false,
      text_overlay: {},
      inputs_stale: false,
    },
    assets: {
      total: 1,
      selected: 1,
      missing: 0,
      invalid: 0,
      unused: 0,
      images: 1,
      audios: 0,
      fallbacks: 0,
      items: [
        {
          key: "first_frame",
          label: "当前 render",
          media_type: "image",
          selected: true,
          exists: true,
          required: true,
          state: "sent",
          reference_label: "图片1",
          note: "首帧",
          status_detail: "",
        },
      ],
    },
  };
}

describe("Production VideoReference panel queries", () => {
  it("loads the beat status through the Production gateway", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let requestedPath = "";
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/3/video-reference/status",
        ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          return HttpResponse.json({ ok: true, data: makeStatus("loaded") });
        },
      ),
    );

    const { result } = renderHook(
      () => useVideoReferenceBeatStatus("demo", 2, 3, true),
      { wrapper: createWrapper(queryClient) },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/2/beats/3/video-reference/status",
    );
    expect(result.current.data).toMatchObject({
      ok: true,
      data: { video_config_json: "loaded" },
    });
  });

  it("maps all asset commands and synchronizes the affected caches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData<{ ok: true; data: Beat[] }>(
      queryKeys.beats("demo", 2),
      { ok: true, data: [makeBeat()] },
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    let uploadContentType = "";
    let deleteBody: unknown;
    let cropBody: unknown;
    let trimBody: unknown;

    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/3/video-reference/assets/upload",
        ({ request }) => {
          uploadContentType = request.headers.get("content-type") ?? "";
          return HttpResponse.json({ ok: true, data: makeStatus("uploaded") });
        },
      ),
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/3/video-reference/assets/delete",
        async ({ request }) => {
          deleteBody = await request.clone().json();
          return HttpResponse.json({ ok: true, data: makeStatus("deleted") });
        },
      ),
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/3/video-reference/assets/crop",
        async ({ request }) => {
          cropBody = await request.clone().json();
          return HttpResponse.json({ ok: true, data: makeStatus("cropped") });
        },
      ),
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/3/video-reference/assets/audio-trim",
        async ({ request }) => {
          trimBody = await request.clone().json();
          return HttpResponse.json({ ok: true, data: makeStatus("trimmed") });
        },
      ),
    );

    const { result } = renderHook(
      () => ({
        upload: useUploadVideoReferenceAsset("demo", 2),
        remove: useDeleteVideoReferenceAsset("demo", 2),
        crop: useCropVideoReferenceAsset("demo", 2),
        trim: useTrimVideoReferenceAsset("demo", 2),
      }),
      { wrapper: createWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.upload.mutateAsync({
        beatNum: 3,
        file: new File(["image"], "reference.png", { type: "image/png" }),
      });
      await result.current.remove.mutateAsync({
        beatNum: 3,
        mediaKind: "images",
        path: "videoReference/reference.png",
      });
      await result.current.crop.mutateAsync({
        beatNum: 3,
        assetKey: "first_frame",
        sourcePath: "frames/beat_03.png",
        crop: { x: 1, y: 2, width: 320, height: 180 },
      });
      await result.current.trim.mutateAsync({
        beatNum: 3,
        assetKey: "voice:narrator",
        sourcePath: "audio/narrator.wav",
        startSeconds: 0.5,
        durationSeconds: 4.25,
      });
    });

    expect(uploadContentType).toContain("multipart/form-data");
    expect(deleteBody).toEqual({
      media_kind: "images",
      path: "videoReference/reference.png",
    });
    expect(cropBody).toEqual({
      asset_key: "first_frame",
      source_path: "frames/beat_03.png",
      target: "reference_image",
      x: 1,
      y: 2,
      width: 320,
      height: 180,
    });
    expect(trimBody).toEqual({
      asset_key: "voice:narrator",
      source_path: "audio/narrator.wav",
      start_seconds: 0.5,
      duration_seconds: 4.25,
    });
    expect(
      queryClient.getQueryData<{ ok: true; data: Beat[] }>(
        queryKeys.beats("demo", 2),
      )?.data[0]?.video_config_json,
    ).toBe("trimmed");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.videoReferenceBeatStatus("demo", 2, 3),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.narratorVoice("demo"),
    });
  });

  it("does not patch the beat cache when an asset command is rejected", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData<{ ok: true; data: Beat[] }>(
      queryKeys.beats("demo", 2),
      { ok: true, data: [makeBeat()] },
    );
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/2/beats/3/video-reference/assets/delete",
        () => HttpResponse.json({ ok: false, error: "素材不存在" }),
      ),
    );

    const { result } = renderHook(
      () => useDeleteVideoReferenceAsset("demo", 2),
      { wrapper: createWrapper(queryClient) },
    );
    await act(async () => {
      await result.current.mutateAsync({
        beatNum: 3,
        mediaKind: "images",
        path: "missing.png",
      });
    });

    expect(
      queryClient.getQueryData<{ ok: true; data: Beat[] }>(
        queryKeys.beats("demo", 2),
      )?.data[0]?.video_config_json,
    ).toBe("old-config");
  });
});
