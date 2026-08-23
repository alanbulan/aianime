// Copyright (c) 2026 AI anime
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

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
  readonly extraParams?: Record<string, unknown>;
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

export interface CanvasImageReferencePreparationGateway {
  prepareAll(
    projectId: string,
    rawUrls: readonly string[] | null | undefined,
  ): Promise<string[]>;
}

export interface GenerateCanvasImageParams
  extends CanvasImageGenerationCommand {
  readonly projectId: string;
}

export interface SubmitCanvasImageGenerationDependencies {
  readonly sourceGateway: CanvasImageReferencePreparationGateway;
  readonly submissionGateway: CanvasImageGenerationSubmissionGateway;
}

export interface GenerateCanvasImageDependencies
  extends SubmitCanvasImageGenerationDependencies {
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasImageResult {
  readonly task: CanvasImageGenerationTaskRef;
  readonly url: string | null;
  readonly resultFallbackError?: unknown;
}

export async function submitCanvasImageGeneration(
  params: GenerateCanvasImageParams,
  dependencies: SubmitCanvasImageGenerationDependencies,
): Promise<CanvasImageGenerationTaskRef> {
  const referenceUrls = await dependencies.sourceGateway.prepareAll(
    params.projectId,
    params.referenceUrls,
  );
  return await dependencies.submissionGateway.submit(params.projectId, {
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
    referenceUrls,
    camera: params.camera,
    style: params.style,
    model: params.model,
    modelId: params.modelId,
    genMode: params.genMode,
    quality: params.quality,
    extraParams: params.extraParams,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  });
}

export async function generateCanvasImage(
  params: GenerateCanvasImageParams,
  dependencies: GenerateCanvasImageDependencies,
): Promise<GenerateCanvasImageResult> {
  const task = await submitCanvasImageGeneration(params, dependencies);
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
