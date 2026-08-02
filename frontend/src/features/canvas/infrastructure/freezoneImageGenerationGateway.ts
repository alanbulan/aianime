// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasImageGenerationSubmissionGateway } from "../application/generateCanvasImage";
import {
  prepareCanvasImageSources,
  type CanvasGenerationTaskRef,
} from "@/modules/creative_canvas/public";

export const freezoneImageGenerationGateway: CanvasImageGenerationSubmissionGateway = {
  async submit(projectId, command) {
    const camera = command.camera
      ? {
          camera_body: command.camera.cameraBodyId ?? "",
          lens: command.camera.lensId ?? "",
          focal_length_mm: command.camera.focalLengthMm ?? 0,
          aperture: command.camera.aperture ?? "",
        }
      : null;
    const style = command.style?.templateId
      ? { template_id: command.style.templateId }
      : null;
    const referenceUrls = await prepareCanvasImageSources(
      projectId,
      command.referenceUrls,
    );
    const task = await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/gen`,
      {
        method: "POST",
        json: {
          prompt: command.prompt,
          aspect_ratio: command.aspectRatio ?? "1:1",
          image_size: command.imageSize ?? "2K",
          reference_urls: referenceUrls,
          camera,
          style,
          model: command.model,
          ...(command.modelId ? { model_id: command.modelId } : {}),
          ...(command.genMode ? { gen_mode: command.genMode } : {}),
          quality: command.quality ?? null,
          ...(command.canvasId ? { canvas_id: command.canvasId } : {}),
          ...(command.nodeId ? { node_id: command.nodeId } : {}),
        },
      },
    );
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
