// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { awaitTaskCompletion } from "@/task-center/public";
import { apiCall } from "@/shared/api/client";

vi.mock("@/task-center/public", () => ({ awaitTaskCompletion: vi.fn() }));
vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezonePipelineVideoProcessingGateway } from "./freezone-video-processing-gateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(awaitTaskCompletion).mockReset();
});

describe("freezonePipelineVideoProcessingGateway", () => {
  it("extracts frame URLs through the encoded asynchronous task endpoint", async () => {
    vi.mocked(apiCall).mockResolvedValue({ task_key: "extract-task" });
    vi.mocked(awaitTaskCompletion).mockResolvedValue({
      task_type: "freezone_extract",
      task_key: "extract-task",
      username: "local",
      project: "project/1",
      episode: 0,
      status: "completed",
      result: { frame_urls: ["/frame-1.png", 42, "/frame-2.png"] },
    });

    await expect(
      freezonePipelineVideoProcessingGateway.extractFrames({
        projectId: "project/1",
        videoUrl: "/video.mp4",
        maxFrames: 12,
        sceneThreshold: 0.4,
      }),
    ).resolves.toEqual(["/frame-1.png", "/frame-2.png"]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/extract-frames",
      {
        method: "POST",
        json: {
          video_url: "/video.mp4",
          max_frames: 12,
          scene_threshold: 0.4,
        },
      },
    );
    expect(awaitTaskCompletion).toHaveBeenCalledWith(
      "extract-task",
      "project/1",
    );
  });

  it("analyzes frames through the encoded asynchronous task endpoint", async () => {
    const analyses = [{ shot_type: "close-up", mood: "tense" }];
    vi.mocked(apiCall).mockResolvedValue({ task_key: "analyze-task" });
    vi.mocked(awaitTaskCompletion).mockResolvedValue({
      task_type: "freezone_analyze",
      task_key: "analyze-task",
      username: "local",
      project: "project/2",
      episode: 0,
      status: "completed",
      result: { analyses },
    });

    await expect(
      freezonePipelineVideoProcessingGateway.analyzeFrames({
        projectId: "project/2",
        frameUrls: ["/frame-1.png"],
      }),
    ).resolves.toBe(analyses);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F2/freezone/analyze-shots",
      {
        method: "POST",
        json: {
          frame_urls: ["/frame-1.png"],
          provider: "openrouter",
          model: null,
        },
      },
    );
    expect(awaitTaskCompletion).toHaveBeenCalledWith(
      "analyze-task",
      "project/2",
    );
  });
});
