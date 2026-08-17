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
import { createSketchPoseEditorQueryHooks } from "@/modules/production/application/sketch-pose-editor-query-hooks";
import { httpProductionVideoGateway } from "@/modules/production/infrastructure/http-production-video-gateway";

const {
  useCropSketch,
  useSaveSketchPoseEditor,
  useSketchCropSource,
  useSketchPoseEditor,
} = createSketchPoseEditorQueryHooks(httpProductionVideoGateway);

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe("Production sketch pose editor queries", () => {
  it("从草图姿势接口读取上游身份色编辑数据", async () => {
    let path = "";
    server.use(http.get(
      "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/pose-editor",
      ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ ok: true, data: {
          beat_num: 5,
          sketch_url: "/static/demo/sketches/ep001/beat_05.png",
          width: 64,
          height: 96,
          candidates: [],
          skeleton_edges: [],
          pose_presets: {},
          skeletons: [],
        } });
      },
    ));
    const { result } = renderHook(() => useSketchPoseEditor("demo", 1, 5, true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(path).toContain("/sketch/pose-editor");
    expect(result.current.data?.ok).toBe(true);
  });

  it("提交身份色骨架与笔画后保存当前草图", async () => {
    let body: unknown;
    server.use(http.post(
      "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/pose-editor",
      async ({ request }) => {
        body = await request.clone().json();
        return HttpResponse.json({ ok: true, data: { beat_num: 5, sketch_url: "/sketch.png" } });
      },
    ));
    const { result } = renderHook(() => useSaveSketchPoseEditor("demo", 1), { wrapper: wrapper() });
    result.current.mutate({
      beatNum: 5,
      state: {
        strokes: [{ points: [{ x: 1, y: 2 }], width: 4 }],
        skeletons: [],
      },
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(body).toEqual({
      strokes: [{ points: [{ x: 1, y: 2 }], width: 4 }],
      skeletons: [],
    });
  });

  it("裁剪仍使用独立的草图源接口", async () => {
    server.use(
      http.get(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/crop-source",
        () => HttpResponse.json({ ok: true, data: { beat_num: 5, sketch_url: "/sketch.png", width: 100, height: 150 } }),
      ),
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/5/sketch/crop",
        () => HttpResponse.json({ ok: true, data: { beat_num: 5, sketch_url: "/sketch.png", width: 20, height: 30 } }),
      ),
    );
    const source = renderHook(() => useSketchCropSource("demo", 1, 5, true), { wrapper: wrapper() });
    await waitFor(() => expect(source.result.current.data).toBeDefined());
    expect(source.result.current.data?.ok).toBe(true);
    const crop = renderHook(() => useCropSketch("demo", 1), { wrapper: wrapper() });
    crop.result.current.mutate({ beatNum: 5, crop: { x: 1, y: 2, width: 20, height: 30 } });
    await waitFor(() => expect(crop.result.current.data).toBeDefined());
    expect(crop.result.current.data?.ok).toBe(true);
  });
});
