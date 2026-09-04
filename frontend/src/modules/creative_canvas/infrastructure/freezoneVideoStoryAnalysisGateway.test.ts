// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneVideoStoryAnalysisGateway } from "./freezoneVideoStoryAnalysisGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneVideoStoryAnalysisGateway", () => {
  it("maps the analysis command and exposes an asynchronous task key", async () => {
    const response = {
      job_id: "analysis-job",
      task_key: "analysis-task",
      task_type: "freezone_video_story",
    };
    vi.mocked(apiCall).mockResolvedValue(response);

    await expect(
      freezoneVideoStoryAnalysisGateway.submit("project/1", {
        videoUrl: "/static/video.mp4",
        durationSec: 2.5,
      }),
    ).resolves.toEqual({
      task: {
        job_id: "analysis-job",
        task_key: "analysis-task",
        task_type: "freezone_video_story",
      },
      inlineResult: response,
    });
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/analyze-video-story",
      {
        method: "POST",
        json: {
          video_url: "/static/video.mp4",
          duration_sec: 2.5,
        },
      },
    );
  });

  it("preserves an inline analysis result", async () => {
    const response = { analyses: [{ shot: 1 }] };
    vi.mocked(apiCall).mockResolvedValue(response);

    await expect(
      freezoneVideoStoryAnalysisGateway.submit("project-1", {
        videoUrl: "/static/video.mp4",
      }),
    ).resolves.toEqual({
      task: null,
      inlineResult: response,
    });
  });

  it("rejects a partial asynchronous task receipt instead of treating it as inline data", async () => {
    vi.mocked(apiCall).mockResolvedValue({ task_key: "analysis-task" });

    await expect(
      freezoneVideoStoryAnalysisGateway.submit("project-1", {
        videoUrl: "/static/video.mp4",
      }),
    ).rejects.toThrow("视频解读任务回执不完整或任务类型不匹配");
  });
});
