// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  awaitTaskCompletion: vi.fn(),
  fetchCanvasGenerationResultUrl: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@/modules/task_execution/public", () => ({
  awaitTaskCompletion: mocks.awaitTaskCompletion,
}));
vi.mock("./infrastructure/freezoneGenerationResultGateway", () => ({
  fetchCanvasGenerationResultUrl: mocks.fetchCanvasGenerationResultUrl,
}));
vi.mock("./infrastructure/freezoneVideoGenerationSubmissionGateway", () => ({
  freezoneVideoGenerationSubmissionGateway: { submit: mocks.submit },
}));

import {
  completeVideoGenerationTask,
  submitVideoGeneration,
} from "./videoGenerationComposition";

const task = {
  job_id: "job-1",
  task_key: "task-1",
  task_type: "freezone_video_gen" as const,
};

beforeEach(() => {
  mocks.awaitTaskCompletion.mockReset();
  mocks.fetchCanvasGenerationResultUrl.mockReset();
  mocks.submit.mockReset();
});

describe("videoGenerationComposition", () => {
  it("submits video generation through the module HTTP gateway", async () => {
    mocks.submit.mockResolvedValue(task);

    await expect(
      submitVideoGeneration({
        projectId: "project-1",
        kind: "text",
        prompt: "cinematic rain",
        cameraTemplateId: null,
        aspectRatio: "16:9",
        quality: "720P",
        durationSeconds: 5,
        generateAudio: false,
        model: "video-model-1",
        canvasId: "canvas-1",
        nodeId: "node-1",
        humanReview: false,
        sceneOptimize: null,
      }),
    ).resolves.toEqual(task);
    expect(mocks.submit).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        kind: "text",
        resolution: "720p",
        model: "video-model-1",
      }),
    );
  });

  it("completes video generation through Task Execution and the result gateway", async () => {
    mocks.awaitTaskCompletion.mockResolvedValue({
      result: { output_format: "video" },
    });
    mocks.fetchCanvasGenerationResultUrl.mockResolvedValue("result.mp4");

    await expect(
      completeVideoGenerationTask({ projectId: "project-1", task }),
    ).resolves.toEqual({
      completion: { result: { output_format: "video" } },
      url: "result.mp4",
      resultLookupError: null,
    });
    expect(mocks.awaitTaskCompletion).toHaveBeenCalledWith(
      "task-1",
      "project-1",
    );
    expect(mocks.fetchCanvasGenerationResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_video_gen",
      "job-1",
    );
  });
});
