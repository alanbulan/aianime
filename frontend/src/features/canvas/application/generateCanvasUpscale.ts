// Copyright (c) 2026 AI anime
import type {
  CanvasUpscaleImageSize,
  CanvasUpscaleScaleFactor,
} from "../domain/upscale";
import { completeCanvasMediaGenerationTask } from "./completeCanvasMediaGenerationTask";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface CanvasUpscaleGenerationCommand {
  readonly sourceUrl: string;
  readonly scaleFactor: CanvasUpscaleScaleFactor;
  readonly imageSize: CanvasUpscaleImageSize;
  readonly model: string;
}

export interface CanvasUpscaleGenerationGateway {
  submit(
    projectId: string,
    command: CanvasUpscaleGenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasUpscaleParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly scaleFactor: CanvasUpscaleScaleFactor;
  readonly imageSize: CanvasUpscaleImageSize;
  readonly model: string;
}

export interface GenerateCanvasUpscaleDependencies {
  readonly submissionGateway: CanvasUpscaleGenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasUpscaleResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasUpscale(
  params: GenerateCanvasUpscaleParams,
  dependencies: GenerateCanvasUpscaleDependencies,
): Promise<GenerateCanvasUpscaleResult> {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl.split("?")[0],
    scaleFactor: params.scaleFactor,
    imageSize: params.imageSize,
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
