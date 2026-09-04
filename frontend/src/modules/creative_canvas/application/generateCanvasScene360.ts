// Copyright (c) 2026 AI anime
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import type { CanvasImageSourcePreparationGateway } from "./prepareCanvasImageSource";

export interface CanvasScene360GenerationCommand {
  readonly referenceUrl: string;
  readonly canvasId: string;
  readonly nodeId: string;
  readonly model: string;
  readonly modelSelector?: string;
}

export interface CanvasScene360GenerationGateway {
  submit(
    projectId: string,
    command: CanvasScene360GenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasScene360Params {
  readonly projectId: string;
  readonly referenceUrl: string;
  readonly canvasId: string;
  readonly nodeId: string;
  readonly model: string;
  readonly modelSelector?: string;
}

export interface GenerateCanvasScene360Dependencies {
  readonly sourceGateway: CanvasImageSourcePreparationGateway;
  readonly submissionGateway: CanvasScene360GenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasScene360Result {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasScene360(
  params: GenerateCanvasScene360Params,
  dependencies: GenerateCanvasScene360Dependencies,
): Promise<GenerateCanvasScene360Result> {
  const referenceUrl = await dependencies.sourceGateway.prepare(
    params.projectId,
    params.referenceUrl,
  );
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    referenceUrl,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
    model: params.model,
    modelSelector: params.modelSelector,
  });
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task, media: "image" },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: dependencies.onTaskSubmitted,
    },
  );
  return { task, url };
}
