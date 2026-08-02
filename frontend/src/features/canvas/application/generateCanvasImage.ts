// Copyright (c) 2026 AI anime
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "@/modules/creative_canvas/public";

export interface CanvasImageGenerationCamera {
  readonly cameraBodyId?: string | null;
  readonly lensId?: string | null;
  readonly focalLengthMm?: number | null;
  readonly aperture?: string | null;
}

export interface CanvasImageGenerationStyle {
  readonly templateId?: string | null;
}

export interface CanvasImageGenerationCommand {
  readonly prompt: string;
  readonly aspectRatio?: string;
  readonly imageSize?: string;
  readonly referenceUrls?: string[];
  readonly camera?: CanvasImageGenerationCamera | null;
  readonly style?: CanvasImageGenerationStyle | null;
  readonly model: string;
  readonly modelId?: string | null;
  readonly genMode?: string | null;
  readonly quality?: string | null;
  readonly canvasId?: string | null;
  readonly nodeId?: string | null;
}

export interface CanvasImageGenerationTaskRef
  extends CanvasGenerationTaskRef {
  readonly task_type: "freezone_gen";
}

export interface CanvasImageGenerationSubmissionGateway {
  submit(
    projectId: string,
    command: CanvasImageGenerationCommand,
  ): Promise<CanvasImageGenerationTaskRef>;
}

export interface GenerateCanvasImageParams
  extends CanvasImageGenerationCommand {
  readonly projectId: string;
}

export interface GenerateCanvasImageDependencies {
  readonly submissionGateway: CanvasImageGenerationSubmissionGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export async function generateCanvasImage(
  params: GenerateCanvasImageParams,
  dependencies: GenerateCanvasImageDependencies,
) {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
    referenceUrls: params.referenceUrls,
    camera: params.camera,
    style: params.style,
    model: params.model,
    modelId: params.modelId,
    genMode: params.genMode,
    quality: params.quality,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  });
  let resultFallbackError: unknown;
  let resultFallbackFailed = false;
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task },
    {
      taskGateway: {
        awaitCompletion: (taskKey, projectId) =>
          dependencies.taskGateway.awaitCompletion(taskKey, projectId),
        fetchResultUrl: async (projectId, taskType, jobId) => {
          try {
            return await dependencies.taskGateway.fetchResultUrl(
              projectId,
              taskType,
              jobId,
            );
          } catch (error) {
            resultFallbackError = error;
            resultFallbackFailed = true;
            return "";
          }
        },
      },
      onTaskSubmitted: dependencies.onTaskSubmitted,
    },
  );
  return {
    task,
    url: url || null,
    ...(resultFallbackFailed ? { resultFallbackError } : {}),
  };
}
