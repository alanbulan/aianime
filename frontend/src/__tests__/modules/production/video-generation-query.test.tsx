// Copyright (c) 2026 AI anime
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import ky from "ky";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/transport", () => ({
  api: ky.create({ baseUrl: "http://localhost:3000/" }),
}));

import { server } from "@/__tests__/setup-msw";
import { queryKeys } from "@/lib/query-keys";
import type { Beat } from "@/modules/narrative_planning/public";
import {
  useGenerateBeatVideoPrompt,
  useGenerateVideoPrompt,
  useGlobalOptimize,
  useProductionWorkflow,
  useRegenerateBeatVideo,
} from "@/modules/production/public";
import { ProjectQueueLimitError } from "@/shared/api/errors";
import { useAppStore } from "@/modules/project_workspace/public";

afterEach(() => {
  useAppStore.setState({ language: "zh" });
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function wrapperWithClient(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function makeBeat(): Beat {
  return {
    beat_number: 2,
    narration_segment: "旁白",
    visual_description: "画面",
    video_config_json: "old-config",
    video_prompt: "old-prompt",
  };
}

describe("canonical production workflow query", () => {
  it("uses the shared production endpoint for one frontend episode action", async () => {
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/workflow/production",
        async ({ request }) => {
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "production_workflow",
            task_key: "production_workflow:0:scope",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useProductionWorkflow("demo", 3), {
      wrapper,
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(body).toEqual({
      episodes: [3],
      video_routing_policy: "project_selection",
    });
    expect(result.current.data).toMatchObject({
      ok: true,
      task_type: "production_workflow",
    });
  });
});

describe("video prompt optimization query", () => {
  it("posts prompt inputs and leaves completion data to task reconciliation", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData<{ ok: true; data: Beat[] }>(
      queryKeys.beats("demo", 1),
      { ok: true, data: [makeBeat()] },
    );
    let requestedPath = "";
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/2/video-prompt/optimize",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "videoReference_prompt",
            task_id: "task-video-reference-prompt",
            task_key: "task:videoReference_prompt:1:2",
            message: "第 1 集 Beat 2 视频提示词优化已入队",
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateVideoPrompt("demo", 1), {
      wrapper: wrapperWithClient(queryClient),
    });
    result.current.mutate({
      beatNum: 2,
      manualPromptReference: "current prompt",
      promptGuidance: "more camera motion",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/2/video-prompt/optimize",
    );
    expect(body).toEqual({
      manual_prompt_reference: "current prompt",
      prompt_guidance: "more camera motion",
    });
    expect(result.current.data).toMatchObject({
      ok: true,
      task_type: "videoReference_prompt",
      task_id: "task-video-reference-prompt",
    });
    expect(
      queryClient.getQueryData<{ ok: true; data: Beat[] }>(
        queryKeys.beats("demo", 1),
      )?.data[0]?.video_config_json,
    ).toBe("old-config");
  });

  it("omits an absent manual prompt reference from the request body", async () => {
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/2/video-prompt/optimize",
        async ({ request }) => {
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "videoReference_prompt",
            task_id: "task-video-reference-prompt",
            task_key: "task:videoReference_prompt:1:2",
            message: "第 1 集 Beat 2 视频提示词优化已入队",
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateVideoPrompt("demo", 1), {
      wrapper,
    });
    result.current.mutate({
      beatNum: 2,
      promptGuidance: "more camera motion",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(body).toEqual({
      prompt_guidance: "more camera motion",
    });
  });

});

describe("1.x beat video prompt generation query", () => {
  it("posts to the per-beat 1.x video prompt endpoint", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    queryClient.setQueryData<{ ok: true; data: Beat[] }>(
      queryKeys.beats("demo", 1),
      { ok: true, data: [makeBeat()] },
    );
    let requestedPath = "";
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/2/video-prompt/generate",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              field: "video_prompt",
              prompt: "generated 1.x motion prompt",
              beat: {
                beat_number: 2,
                video_prompt: "generated 1.x motion prompt",
              },
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateBeatVideoPrompt("demo", 1), {
      wrapper: wrapperWithClient(queryClient),
    });
    result.current.mutate({ beatNum: 2 });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/beats/2/video-prompt/generate",
    );
    expect(body).toEqual({ language: "zh" });
    expect(result.current.data?.ok).toBe(true);
    expect(
      queryClient.getQueryData<{ ok: true; data: Beat[] }>(
        queryKeys.beats("demo", 1),
      )?.data[0]?.video_prompt,
    ).toBe("generated 1.x motion prompt");
  });

  it("follows the current app language when generating 1.x video prompts", async () => {
    useAppStore.setState({ language: "en" });
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/2/video-prompt/generate",
        async ({ request }) => {
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            data: {
              field: "video_prompt",
              prompt: "generated 1.x motion prompt",
              beat: {
                beat_number: 2,
                video_prompt: "generated 1.x motion prompt",
              },
            },
          });
        },
      ),
    );

    const { result } = renderHook(() => useGenerateBeatVideoPrompt("demo", 1), {
      wrapper,
    });
    result.current.mutate({ beatNum: 2 });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(body).toEqual({ language: "en" });
  });

});

describe("video generation commands", () => {
  it("uses the current app language for global optimization", async () => {
    useAppStore.setState({ language: "en" });
    let requestedPath = "";
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/optimize/video-global",
        async ({ request }) => {
          requestedPath = new URL(request.url).pathname;
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "global_optimize_video",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useGlobalOptimize("demo", 1), {
      wrapper,
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(requestedPath).toBe(
      "/api/v1/projects/demo/episodes/1/optimize/video-global",
    );
    expect(body).toEqual({ language: "en" });
  });

  it("maps the complete beat video command with an explicit catalog SKU", async () => {
    let body: unknown = null;
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/6/video",
        async ({ request }) => {
          body = await request.clone().json();
          return HttpResponse.json({
            ok: true,
            task_type: "single_video",
            message: "started",
          });
        },
      ),
    );

    const { result } = renderHook(() => useRegenerateBeatVideo("demo", 1), {
      wrapper,
    });
    result.current.mutate({
      beatNum: 6,
      model: "video-model-reference",
      useDirectorRender: true,
      resolution: "720p",
      duration: 5,
      ratio: "16:9",
      mode: "first_frame",
      videoConfigJson: '{"final_prompt":"镜头推进"}',
      audioSetting: "enabled",
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(body).toEqual({
      model: "video-model-reference",
      video_routing_policy: "project_selection",
      use_director_render: true,
      resolution: "720p",
      duration: 5,
      ratio: "16:9",
      mode: "first_frame",
      video_config_json: '{"final_prompt":"镜头推进"}',
      audio_setting: "enabled",
    });
  });

  it("surfaces queue-limit errors for beat video generation", async () => {
    server.use(
      http.post(
        "http://localhost:3000/api/v1/projects/demo/episodes/1/beats/6/video",
        () =>
          HttpResponse.json(
            {
              ok: false,
              error: "当前项目 video 队列任务已满，请等待已有任务完成后再提交",
              data: {
                project_id: "demo",
                queue_kind: "video",
                limit: 1,
                active: 1,
              },
            },
            { status: 429 },
          ),
      ),
    );

    const { result } = renderHook(() => useRegenerateBeatVideo("demo", 1), {
      wrapper,
    });
    const promise = result.current.mutateAsync({
      beatNum: 6,
      model: "video-model-standard",
    });

    await expect(promise).rejects.toMatchObject({
      name: "ProjectQueueLimitError",
      queueKind: "video",
    });
    await expect(promise).rejects.toBeInstanceOf(ProjectQueueLimitError);
  });
});
