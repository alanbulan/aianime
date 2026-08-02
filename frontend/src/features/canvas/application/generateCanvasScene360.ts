// Copyright (c) 2026 AI anime
import type { CanvasScene360AspectRatio } from "@/modules/creative_canvas/public";
import { completeCanvasMediaGenerationTask } from "./completeCanvasMediaGenerationTask";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface CanvasScene360GenerationCommand {
  readonly referenceUrl: string;
  readonly aspectRatio: CanvasScene360AspectRatio;
  readonly model: string;
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
  readonly aspectRatio: CanvasScene360AspectRatio;
  readonly model: string;
}

export interface GenerateCanvasScene360Dependencies {
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
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    referenceUrl: params.referenceUrl.split("?")[0],
    aspectRatio: params.aspectRatio,
    model: params.model,
  });
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: dependencies.onTaskSubmitted,
    },
  );
  return { task, url };
}
