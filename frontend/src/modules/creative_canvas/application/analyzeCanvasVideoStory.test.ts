// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasStructuredTaskResultGateway } from "./completeCanvasMediaGenerationTask";
import {
  analyzeCanvasVideoStory,
  type CanvasVideoStoryAnalysisSubmissionGateway,
} from "./analyzeCanvasVideoStory";

describe("analyzeCanvasVideoStory", () => {
  it("waits for an asynchronous analysis task and normalizes its rows", async () => {
    const submissionGateway: CanvasVideoStoryAnalysisSubmissionGateway = {
      submit: vi.fn().mockResolvedValue({
        task: {
          task_key: "analysis-task",
          job_id: "analysis-job",
          task_type: "freezone_video_story",
        },
        inlineResult: {},
      }),
    };
    const rawResult = {
      video_story: {
        shots: [{ shot: 1, visual_description: "Opening shot" }],
      },
    };
    const taskGateway: CanvasStructuredTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: rawResult }),
      fetchResult: vi.fn(),
    };

    await expect(
      analyzeCanvasVideoStory(
        {
          projectId: "project-1",
          videoUrl: "/static/video.mp4",
          durationMs: 2_500,
        },
        {
          submissionGateway,
          taskGateway,
        },
      ),
    ).resolves.toEqual({
      rawResult,
      rows: [
        expect.objectContaining({
          shotNumber: 1,
          visualDescription: "Opening shot",
        }),
      ],
    });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      videoUrl: "/static/video.mp4",
      durationSec: 2.5,
    });
    expect(taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "analysis-task",
      "project-1",
    );
  });

  it("uses an inline response without starting task monitoring", async () => {
    const inlineResult = {
      analyses: [{ shot_number: "2", narrative: "Inline result" }],
    };
    const submissionGateway: CanvasVideoStoryAnalysisSubmissionGateway = {
      submit: vi.fn().mockResolvedValue({
        task: null,
        inlineResult,
      }),
    };
    const taskGateway: CanvasStructuredTaskResultGateway = {
      awaitCompletion: vi.fn(),
      fetchResult: vi.fn(),
    };

    await expect(
      analyzeCanvasVideoStory(
        {
          projectId: "project-1",
          videoUrl: "/static/video.mp4",
          durationMs: 0,
        },
        {
          submissionGateway,
          taskGateway,
        },
      ),
    ).resolves.toEqual({
      rawResult: inlineResult,
      rows: [
        expect.objectContaining({
          shotNumber: 2,
          narrative: "Inline result",
        }),
      ],
    });
    expect(submissionGateway.submit).toHaveBeenCalledWith("project-1", {
      videoUrl: "/static/video.mp4",
      durationSec: undefined,
    });
    expect(taskGateway.awaitCompletion).not.toHaveBeenCalled();
  });

  it("falls back to the durable analysis result when task completion has no payload", async () => {
    const submissionGateway: CanvasVideoStoryAnalysisSubmissionGateway = {
      submit: vi.fn().mockResolvedValue({
        task: {
          task_key: "analysis-task",
          job_id: "analysis-job",
          task_type: "freezone_video_story",
        },
        inlineResult: {},
      }),
    };
    const taskGateway: CanvasStructuredTaskResultGateway = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
      fetchResult: vi.fn(),
    };
    const fallback = {
      video_story: { shots: [{ shot: 3, narrative: "Recovered" }] },
    };
    vi.mocked(taskGateway.fetchResult).mockResolvedValue(fallback);

    await expect(
      analyzeCanvasVideoStory(
        {
          projectId: "project-1",
          videoUrl: "/static/video.mp4",
        },
        { submissionGateway, taskGateway },
      ),
    ).resolves.toEqual({
      rawResult: fallback,
      rows: [expect.objectContaining({ shotNumber: 3, narrative: "Recovered" })],
    });
    expect(taskGateway.fetchResult).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_story",
      "analysis-job",
    );
  });
});
