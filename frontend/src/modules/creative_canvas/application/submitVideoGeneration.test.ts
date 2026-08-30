// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  submitVideoGeneration,
  type SubmitVideoGenerationParams,
  type VideoGenerationSubmission,
  type VideoGenerationSubmissionGateway,
} from "./submitVideoGeneration";

const task = {
  job_id: "job-1",
  task_key: "task-1",
  task_type: "freezone_video_gen",
};

const commonParams = {
  projectId: "project-1",
  prompt: "prompt",
  cameraTemplateId: "camera-1",
  aspectRatio: "16:9" as const,
  output: { parameter: "size" as const, value: "1344x768" },
  extraParams: { steps: 20, seed: 42, turbo: false },
  durationSeconds: 8,
  generateAudio: true,
  model: "model-1",
  canvasId: "canvas-1",
  nodeId: "node-1",
};

const commonSubmission = {
  prompt: "prompt",
  cameraTemplateId: "camera-1",
  aspectRatio: "16:9" as const,
  output: { parameter: "size" as const, value: "1344x768" },
  extraParams: { steps: 20, seed: 42, turbo: false },
  durationSeconds: 8,
  generateAudio: true,
  model: "model-1",
  canvasId: "canvas-1",
  nodeId: "node-1",
};

describe("submitVideoGeneration", () => {
  it("projects common settings and preserves every submission variant", async () => {
    const submissionGateway: VideoGenerationSubmissionGateway = {
      submit: vi.fn().mockResolvedValue(task),
    };
    const cases: Array<{
      params: SubmitVideoGenerationParams;
      submission: VideoGenerationSubmission;
    }> = [
      {
        params: {
          ...commonParams,
          kind: "text",
          genMode: "textToVideo",
          humanReview: true,
          sceneOptimize: "anime",
        },
        submission: {
          ...commonSubmission,
          kind: "text",
          genMode: "textToVideo",
          humanReview: true,
          sceneOptimize: "anime",
        },
      },
      {
        params: {
          ...commonParams,
          kind: "keyframes",
          genMode: "firstFrame",
          firstFrameUrl: "first.png",
          lastFrameUrl: null,
          humanReview: false,
          sceneOptimize: null,
        },
        submission: {
          ...commonSubmission,
          kind: "keyframes",
          genMode: "firstFrame",
          firstFrameUrl: "first.png",
          lastFrameUrl: null,
          humanReview: false,
          sceneOptimize: null,
        },
      },
      {
        params: {
          ...commonParams,
          kind: "keyframes",
          genMode: "firstLastFrame",
          firstFrameUrl: "first.png",
          lastFrameUrl: "last.png",
          humanReview: false,
          sceneOptimize: null,
        },
        submission: {
          ...commonSubmission,
          kind: "keyframes",
          genMode: "firstLastFrame",
          firstFrameUrl: "first.png",
          lastFrameUrl: "last.png",
          humanReview: false,
          sceneOptimize: null,
        },
      },
      {
        params: {
          ...commonParams,
          kind: "imageReferences",
          genMode: "imageReference",
          imageUrls: ["one.png", "two.png"],
          humanReview: true,
          sceneOptimize: "realistic",
        },
        submission: {
          ...commonSubmission,
          kind: "imageReferences",
          genMode: "imageReference",
          imageUrls: ["one.png", "two.png"],
          humanReview: true,
          sceneOptimize: "realistic",
        },
      },
      {
        params: {
          ...commonParams,
          kind: "videoEdit",
          genMode: "videoEdit",
          videoUrl: "source.mp4",
          imageUrls: ["one.png"],
        },
        submission: {
          ...commonSubmission,
          kind: "videoEdit",
          genMode: "videoEdit",
          videoUrl: "source.mp4",
          imageUrls: ["one.png"],
        },
      },
      {
        params: {
          ...commonParams,
          kind: "allReferences",
          genMode: "allReference",
          references: [{ type: "audio", url: "music.mp3", role: "配乐参考" }],
          humanReview: false,
          sceneOptimize: null,
        },
        submission: {
          ...commonSubmission,
          kind: "allReferences",
          genMode: "allReference",
          references: [{ type: "audio", url: "music.mp3", role: "配乐参考" }],
          humanReview: false,
          sceneOptimize: null,
        },
      },
    ];

    for (const testCase of cases) {
      await expect(
        submitVideoGeneration(testCase.params, { submissionGateway }),
      ).resolves.toEqual(task);
      expect(submissionGateway.submit).toHaveBeenLastCalledWith(
        "project-1",
        testCase.submission,
      );
    }
  });
});
