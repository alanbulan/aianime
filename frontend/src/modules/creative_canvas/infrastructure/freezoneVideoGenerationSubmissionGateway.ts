// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  VideoGenerationSubmission,
  VideoGenerationSubmissionGateway,
  VideoGenerationTaskRef,
} from "../application/submitVideoGeneration";

interface VideoGenerationTaskTransport {
  readonly job_id: string;
  readonly task_key: string;
  readonly task_type: string;
}

function videoGenerationTask(
  task: VideoGenerationTaskTransport,
): VideoGenerationTaskRef {
  if (task.task_type !== "freezone_video_gen") {
    throw new Error(`Unexpected video generation task type: ${task.task_type}`);
  }
  return {
    job_id: task.job_id,
    task_key: task.task_key,
    task_type: task.task_type,
  };
}

function nodeContextBody(submission: VideoGenerationSubmission) {
  return {
    ...(submission.canvasId ? { canvas_id: submission.canvasId } : {}),
    ...(submission.nodeId ? { node_id: submission.nodeId } : {}),
  };
}

function commonRequestBody(submission: VideoGenerationSubmission) {
  return {
    prompt: submission.prompt,
    camera_template_id: submission.cameraTemplateId ?? null,
    marks: [],
    aspect_ratio: submission.aspectRatio ?? "16:9",
    resolution: submission.resolution,
    duration_seconds: Math.max(submission.durationSeconds ?? 5, 1),
    generate_audio: submission.generateAudio ?? false,
    ...(submission.model
      ? { model: submission.model, model_id: submission.model }
      : {}),
    gen_mode: submission.genMode,
    ...nodeContextBody(submission),
  };
}

async function submitVideoGenerationRequest(
  projectId: string,
  endpoint: string,
  json: unknown,
): Promise<VideoGenerationTaskRef> {
  const task = await apiCall<VideoGenerationTaskTransport>(
    `projects/${encodeURIComponent(projectId)}/freezone/video/${endpoint}`,
    { method: "POST", json },
  );
  return videoGenerationTask(task);
}

export const freezoneVideoGenerationSubmissionGateway: VideoGenerationSubmissionGateway = {
  async submit(projectId, submission) {
    const common = commonRequestBody(submission);
    switch (submission.kind) {
      case "text":
        return await submitVideoGenerationRequest(projectId, "gen", {
          ...common,
          character_ids: [],
          human_review: submission.humanReview ?? false,
          scene_optimize: submission.sceneOptimize ?? null,
        });
      case "keyframes":
        return await submitVideoGenerationRequest(projectId, "keyframes", {
          ...common,
          first_frame_url: submission.firstFrameUrl ?? null,
          last_frame_url: submission.lastFrameUrl ?? null,
          human_review: submission.humanReview ?? false,
          scene_optimize: submission.sceneOptimize ?? null,
        });
      case "imageReferences":
        return await submitVideoGenerationRequest(projectId, "i2v", {
          ...common,
          image_urls: submission.imageUrls.slice(0, 9),
          human_review: submission.humanReview ?? false,
          scene_optimize: submission.sceneOptimize ?? null,
        });
      case "videoEdit":
        return await submitVideoGenerationRequest(projectId, "video-edit", {
          ...common,
          video_url: submission.videoUrl,
          image_urls: submission.imageUrls.slice(0, 5),
          audio_setting: "auto",
          human_review: false,
        });
      case "allReferences":
        return await submitVideoGenerationRequest(projectId, "omni-gen", {
          ...common,
          theme: "",
          references: submission.references.map((reference) => ({
            type: reference.type,
            url: reference.url,
            role: reference.role ?? "",
            label: reference.label ?? "",
          })),
          human_review: submission.humanReview ?? false,
          scene_optimize: submission.sceneOptimize ?? null,
        });
    }
  },
};
