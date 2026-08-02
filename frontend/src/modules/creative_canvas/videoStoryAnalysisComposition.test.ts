// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const awaitTaskCompletion = vi.hoisted(() => vi.fn());
const submitVideoStoryAnalysis = vi.hoisted(() => vi.fn());

vi.mock("@/modules/task_execution/public", () => ({
  awaitTaskCompletion,
}));

vi.mock("./infrastructure/freezoneVideoStoryAnalysisGateway", () => ({
  freezoneVideoStoryAnalysisGateway: {
    submit: submitVideoStoryAnalysis,
  },
}));

import { analyzeCanvasVideoStory } from "./videoStoryAnalysisComposition";

beforeEach(() => {
  awaitTaskCompletion.mockReset();
  submitVideoStoryAnalysis.mockReset();
});

describe("videoStoryAnalysisComposition", () => {
  it("wires the HTTP submission to Task Execution completion", async () => {
    const rawResult = {
      video_story: {
        shots: [{ shot: 1, narrative: "Opening" }],
      },
    };
    submitVideoStoryAnalysis.mockResolvedValue({
      taskKey: "analysis-task",
      inlineResult: {},
    });
    awaitTaskCompletion.mockResolvedValue({ result: rawResult });

    await expect(
      analyzeCanvasVideoStory({
        projectId: "project-1",
        videoUrl: "/video.mp4",
        durationMs: 3_000,
      }),
    ).resolves.toEqual({
      rawResult,
      rows: [expect.objectContaining({ shotNumber: 1, narrative: "Opening" })],
    });
    expect(submitVideoStoryAnalysis).toHaveBeenCalledWith("project-1", {
      videoUrl: "/video.mp4",
      durationSec: 3,
    });
    expect(awaitTaskCompletion).toHaveBeenCalledWith(
      "analysis-task",
      "project-1",
    );
  });
});
