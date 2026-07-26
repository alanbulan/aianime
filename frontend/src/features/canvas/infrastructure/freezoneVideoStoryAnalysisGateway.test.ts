// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

const submitFreezoneAnalyzeVideoStory = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({ submitFreezoneAnalyzeVideoStory }));

import { freezoneVideoStoryAnalysisGateway } from "./freezoneVideoStoryAnalysisGateway";

describe("freezoneVideoStoryAnalysisGateway", () => {
  it("maps the analysis command and exposes an asynchronous task key", async () => {
    const response = {
      job_id: "analysis-job",
      task_key: "analysis-task",
      task_type: "freezone_analyze_video_story",
    };
    submitFreezoneAnalyzeVideoStory.mockResolvedValue(response);

    await expect(
      freezoneVideoStoryAnalysisGateway.submit("project-1", {
        videoUrl: "/static/video.mp4",
        durationSec: 2.5,
      }),
    ).resolves.toEqual({
      taskKey: "analysis-task",
      inlineResult: response,
    });
    expect(submitFreezoneAnalyzeVideoStory).toHaveBeenCalledWith("project-1", {
      videoUrl: "/static/video.mp4",
      durationSec: 2.5,
    });
  });

  it("preserves an inline analysis result", async () => {
    const response = { analyses: [{ shot: 1 }] };
    submitFreezoneAnalyzeVideoStory.mockResolvedValue(response);

    await expect(
      freezoneVideoStoryAnalysisGateway.submit("project-1", {
        videoUrl: "/static/video.mp4",
      }),
    ).resolves.toEqual({
      taskKey: null,
      inlineResult: response,
    });
  });
});
