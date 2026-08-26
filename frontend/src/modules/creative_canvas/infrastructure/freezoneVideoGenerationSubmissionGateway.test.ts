// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

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
  modelSelector: "route-model-1",
  canvasId: "canvas-1",
  nodeId: "node-1",
};

const commonBody = {
  prompt: "prompt",
  camera_template_id: "camera-1",
  marks: [],
  aspect_ratio: "16:9",
  resolution: "1080p",
  duration_seconds: 8,
  generate_audio: true,
  model: "model-1",
  model_id: "route-model-1",
  canvas_id: "canvas-1",
  node_id: "node-1",
};

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(apiCall).mockResolvedValue(task);
});

describe("freezoneVideoGenerationSubmissionGateway", () => {
  it("dispatches text generation", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project/1", {
      ...common,
      kind: "text",
      genMode: "textToVideo",
      humanReview: true,
      sceneOptimize: "anime",
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/gen",
      {
        method: "POST",
        json: {
          ...commonBody,
          gen_mode: "textToVideo",
          character_ids: [],
          human_review: true,
          scene_optimize: "anime",
        },
      },
    );
  });

  it("dispatches keyframe generation", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project/1", {
      ...common,
      kind: "keyframes",
      genMode: "firstLastFrame",
      firstFrameUrl: "first.png",
      lastFrameUrl: "last.png",
      humanReview: false,
      sceneOptimize: null,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/keyframes",
      {
        method: "POST",
        json: {
          ...commonBody,
          gen_mode: "firstLastFrame",
          first_frame_url: "first.png",
          last_frame_url: "last.png",
          human_review: false,
          scene_optimize: null,
        },
      },
    );
  });

  it("dispatches first-frame generation without disguising the business mode", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project/1", {
      ...common,
      kind: "keyframes",
      genMode: "firstFrame",
      firstFrameUrl: "first.png",
      lastFrameUrl: null,
      humanReview: false,
      sceneOptimize: null,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/keyframes",
      {
        method: "POST",
        json: {
          ...commonBody,
          gen_mode: "firstFrame",
          first_frame_url: "first.png",
          last_frame_url: null,
          human_review: false,
          scene_optimize: null,
        },
      },
    );
  });

  it("dispatches image-reference generation", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project/1", {
      ...common,
      kind: "imageReferences",
      genMode: "imageReference",
      imageUrls: ["one.png", "two.png"],
      humanReview: true,
      sceneOptimize: "realistic",
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/i2v",
      {
        method: "POST",
        json: {
          ...commonBody,
          gen_mode: "imageReference",
          image_urls: ["one.png", "two.png"],
          human_review: true,
          scene_optimize: "realistic",
        },
      },
    );
  });

  it("dispatches video editing with the existing automatic audio policy", async () => {
    await freezoneVideoGenerationSubmissionGateway.submit("project/1", {
      ...common,
      kind: "videoEdit",
      genMode: "videoEdit",
      videoUrl: "source.mp4",
      imageUrls: ["one.png"],
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/video-edit",
      {
        method: "POST",
        json: {
          ...commonBody,
          gen_mode: "videoEdit",
          video_url: "source.mp4",
          image_urls: ["one.png"],
          audio_setting: "auto",
          human_review: false,
        },
      },
    );
  });

  it("dispatches mixed-reference generation", async () => {
    const references = [
      { type: "audio" as const, url: "music.mp3", role: "配乐参考" },
    ];
    await freezoneVideoGenerationSubmissionGateway.submit("project/1", {
      ...common,
      kind: "allReferences",
      genMode: "allReference",
      references,
      humanReview: false,
      sceneOptimize: null,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/omni-gen",
      {
        method: "POST",
        json: {
          ...commonBody,
          gen_mode: "allReference",
          theme: "",
          references: [
            {
              type: "audio",
              url: "music.mp3",
              role: "配乐参考",
              label: "",
            },
          ],
          human_review: false,
          scene_optimize: null,
        },
      },
    );
  });

  it("rejects an unexpected task type at the infrastructure boundary", async () => {
    vi.mocked(apiCall).mockResolvedValue({
      ...task,
      task_type: "freezone_gen",
    });

    await expect(
      freezoneVideoGenerationSubmissionGateway.submit("project-1", {
        ...common,
        kind: "text",
        genMode: "textToVideo",
        humanReview: false,
        sceneOptimize: null,
      }),
    ).rejects.toThrow("Unexpected video generation task type: freezone_gen");
  });
});
