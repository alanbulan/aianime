// Copyright (c) 2026 AI anime
import type { CanvasUpscaleImageSize } from "../domain/upscale";
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

export interface CanvasUpscaleGenerationCommand {
  readonly sourceUrl: string;
  readonly imageSize: CanvasUpscaleImageSize;
  readonly model: string;
  readonly modelSelector?: string;
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
  readonly imageSize: CanvasUpscaleImageSize;
  readonly model: string;
  readonly modelSelector?: string;
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
    imageSize: params.imageSize,
    model: params.model,
    modelSelector: params.modelSelector,
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
