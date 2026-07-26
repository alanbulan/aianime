// Copyright (c) 2026 AI anime
import {
  submitFreezoneVideoEdit,
  submitFreezoneVideoGen,
  submitFreezoneVideoI2v,
  submitFreezoneVideoKeyframes,
  submitFreezoneVideoOmniGen,
  type FreezoneJobRef,
} from "@/api/ops";

import type {
  VideoGenerationSubmission,
  VideoGenerationSubmissionGateway,
  VideoGenerationTaskRef,
} from "../application/submitVideoGeneration";

function videoGenerationTask(task: FreezoneJobRef): VideoGenerationTaskRef {
  if (task.task_type !== "freezone_video_gen") {
    throw new Error(`Unexpected video generation task type: ${task.task_type}`);
  }
  return {
    job_id: task.job_id,
    task_key: task.task_key,
    task_type: task.task_type,
  };
}

function commonPayload(submission: VideoGenerationSubmission) {
  return {
    prompt: submission.prompt,
    cameraTemplateId: submission.cameraTemplateId,
    aspectRatio: submission.aspectRatio,
    resolution: submission.resolution,
    durationSeconds: submission.durationSeconds,
    generateAudio: submission.generateAudio,
    model: submission.model,
    genMode: submission.genMode,
    canvasId: submission.canvasId,
    nodeId: submission.nodeId,
  };
}

export const freezoneVideoGenerationSubmissionGateway: VideoGenerationSubmissionGateway = {
  async submit(projectId, submission) {
    const common = commonPayload(submission);
    switch (submission.kind) {
      case "text":
        return videoGenerationTask(
          await submitFreezoneVideoGen(projectId, {
            ...common,
            humanReview: submission.humanReview,
            sceneOptimize: submission.sceneOptimize,
          }),
        );
      case "keyframes":
        return videoGenerationTask(
          await submitFreezoneVideoKeyframes(projectId, {
            ...common,
            firstFrameUrl: submission.firstFrameUrl,
            lastFrameUrl: submission.lastFrameUrl,
            humanReview: submission.humanReview,
            sceneOptimize: submission.sceneOptimize,
          }),
        );
      case "imageReferences":
        return videoGenerationTask(
          await submitFreezoneVideoI2v(projectId, {
            ...common,
            imageUrls: [...submission.imageUrls],
            humanReview: submission.humanReview,
            sceneOptimize: submission.sceneOptimize,
          }),
        );
      case "videoEdit":
        return videoGenerationTask(
          await submitFreezoneVideoEdit(projectId, {
            ...common,
            videoUrl: submission.videoUrl,
            imageUrls: [...submission.imageUrls],
            audioSetting: "auto",
          }),
        );
      case "allReferences":
        return videoGenerationTask(
          await submitFreezoneVideoOmniGen(projectId, {
            ...common,
            references: submission.references.map((reference) => ({
              ...reference,
            })),
            humanReview: submission.humanReview,
            sceneOptimize: submission.sceneOptimize,
          }),
        );
    }
  },
};
