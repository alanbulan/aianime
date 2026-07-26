// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitFreezoneVideoEdit = vi.hoisted(() => vi.fn());
const submitFreezoneVideoGen = vi.hoisted(() => vi.fn());
const submitFreezoneVideoI2v = vi.hoisted(() => vi.fn());
const submitFreezoneVideoKeyframes = vi.hoisted(() => vi.fn());
const submitFreezoneVideoOmniGen = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  submitFreezoneVideoEdit,
  submitFreezoneVideoGen,
  submitFreezoneVideoI2v,
  submitFreezoneVideoKeyframes,
  submitFreezoneVideoOmniGen,
}));

import { freezoneVideoGenerationSubmissionGateway } from "./freezoneVideoGenerationSubmissionGateway";

const task = {
  job_id: "job-1",
  task_key: "task-1",
  task_type: "freezone_video_gen",
};

const common = {
  prompt: "prompt",
  cameraTemplateId: "camera-1",
  aspectRatio: "16:9" as const,
  resolution: "1080p" as const,
  durationSeconds: 8,
  generateAudio: true,
  model: "model-1",
  genMode: "textToVideo" as const,
  canvasId: "canvas-1",
  nodeId: "node-1",
};

beforeEach(() => {
  for (const submit of [
    submitFreezoneVideoEdit,
    submitFreezoneVideoGen,
    submitFreezoneVideoI2v,
    submitFreezoneVideoKeyframes,
    submitFreezoneVideoOmniGen,
  ]) {
    submit.mockReset();
    submit.mockResolvedValue(task);
  }
});

describe("freezoneVideoGenerationSubmissionGateway", () => {
  it("dispatches text generation", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project-1", {
      ...common,
      kind: "text",
      humanReview: true,
      sceneOptimize: "anime",
    });

    expect(submitFreezoneVideoGen).toHaveBeenCalledWith("project-1", {
      ...common,
      humanReview: true,
      sceneOptimize: "anime",
    });
  });

  it("dispatches keyframe generation", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project-1", {
      ...common,
      kind: "keyframes",
      firstFrameUrl: "first.png",
      lastFrameUrl: "last.png",
      humanReview: false,
      sceneOptimize: null,
    });

    expect(submitFreezoneVideoKeyframes).toHaveBeenCalledWith("project-1", {
      ...common,
      firstFrameUrl: "first.png",
      lastFrameUrl: "last.png",
      humanReview: false,
      sceneOptimize: null,
    });
  });

  it("dispatches image-reference generation", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project-1", {
      ...common,
      kind: "imageReferences",
      imageUrls: ["one.png", "two.png"],
      humanReview: true,
      sceneOptimize: "realistic",
    });

    expect(submitFreezoneVideoI2v).toHaveBeenCalledWith("project-1", {
      ...common,
      imageUrls: ["one.png", "two.png"],
      humanReview: true,
      sceneOptimize: "realistic",
    });
  });

  it("dispatches video editing with the existing automatic audio policy", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project-1", {
      ...common,
      kind: "videoEdit",
      videoUrl: "source.mp4",
      imageUrls: ["one.png"],
    });

    expect(submitFreezoneVideoEdit).toHaveBeenCalledWith("project-1", {
      ...common,
      videoUrl: "source.mp4",
      imageUrls: ["one.png"],
      audioSetting: "auto",
    });
  });

  it("dispatches mixed-reference generation", async () => {
    const references = [
      { type: "audio" as const, url: "music.mp3", role: "配乐参考" },
    ];
    await freezoneVideoGenerationSubmissionGateway.submit("project-1", {
      ...common,
      kind: "allReferences",
      references,
      humanReview: false,
      sceneOptimize: null,
    });

    expect(submitFreezoneVideoOmniGen).toHaveBeenCalledWith("project-1", {
      ...common,
      references,
      humanReview: false,
      sceneOptimize: null,
    });
  });

  it("rejects an unexpected task type at the infrastructure boundary", async () => {
    submitFreezoneVideoGen.mockResolvedValue({
      ...task,
      task_type: "freezone_gen",
    });

    await expect(
      freezoneVideoGenerationSubmissionGateway.submit("project-1", {
        ...common,
        kind: "text",
        humanReview: false,
        sceneOptimize: null,
      }),
    ).rejects.toThrow("Unexpected video generation task type: freezone_gen");
  });
});
