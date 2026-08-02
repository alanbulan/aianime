// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { CanvasTaskResultGateway } from "@/modules/creative_canvas/public";
import {
  analyzeCanvasVideoStory,
  type CanvasVideoStoryAnalysisSubmissionGateway,
} from "./analyzeCanvasVideoStory";

describe("analyzeCanvasVideoStory", () => {
  it("waits for an asynchronous analysis task and normalizes its rows", async () => {
    const submissionGateway: CanvasVideoStoryAnalysisSubmissionGateway = {
      submit: vi.fn().mockResolvedValue({
        taskKey: "analysis-task",
        inlineResult: {},
      }),
    };
    const rawResult = {
      video_story: {
        shots: [{ shot: 1, visual_description: "Opening shot" }],
      },
    };
    const taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion"> = {
      awaitCompletion: vi.fn().mockResolvedValue({ result: rawResult }),
    };

    await expect(
      analyzeCanvasVideoStory(
        {
          projectId: "project-1",
          videoUrl: "/static/video.mp4",
          durationMs: 2_500,
        },
        { submissionGateway, taskGateway },
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
        taskKey: null,
        inlineResult,
      }),
    };
    const taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion"> = {
      awaitCompletion: vi.fn(),
    };

    await expect(
      analyzeCanvasVideoStory(
        {
          projectId: "project-1",
          videoUrl: "/static/video.mp4",
          durationMs: 0,
        },
        { submissionGateway, taskGateway },
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
});
