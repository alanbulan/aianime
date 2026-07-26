// Copyright (c) 2026 AI anime
import { submitFreezoneGen } from "@/api/ops";

import type { CanvasImageGenerationSubmissionGateway } from "../application/generateCanvasImage";

export const freezoneImageGenerationGateway: CanvasImageGenerationSubmissionGateway = {
  async submit(projectId, command) {
    const task = await submitFreezoneGen(projectId, {
      prompt: command.prompt,
      aspectRatio: command.aspectRatio,
      imageSize: command.imageSize,
      referenceUrls: command.referenceUrls,
      camera: command.camera,
      style: command.style,
      provider: command.provider,
      model: command.model,
      modelId: command.modelId,
      genMode: command.genMode,
      quality: command.quality,
      canvasId: command.canvasId,
      nodeId: command.nodeId,
    });
    if (task.task_type !== "freezone_gen") {
      throw new Error(`Unexpected image generation task type: ${task.task_type}`);
    }
    return {
      job_id: task.job_id,
      task_key: task.task_key,
      task_type: task.task_type,
    };
  },
};
