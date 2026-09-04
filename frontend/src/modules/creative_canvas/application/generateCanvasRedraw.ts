// Copyright (c) 2026 AI anime
import type {
  CanvasRedrawAspectRatio,
  CanvasRedrawImageSize,
} from "../domain/redraw";
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

export interface CanvasRedrawGenerationCommand {
  readonly aspectRatio: CanvasRedrawAspectRatio;
  readonly imageSize: CanvasRedrawImageSize;
  readonly maskUrl: string | null;
  readonly model: string;
  readonly modelSelector?: string;
  readonly prompt?: string;
  readonly sourceUrl: string;
}

export interface CanvasRedrawGenerationGateway {
  submit(
    projectId: string,
    command: CanvasRedrawGenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasRedrawParams
  extends CanvasRedrawGenerationCommand {
  readonly projectId: string;
}

export interface GenerateCanvasRedrawDependencies {
  readonly submissionGateway: CanvasRedrawGenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasRedrawResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasRedraw(
  params: GenerateCanvasRedrawParams,
  dependencies: GenerateCanvasRedrawDependencies,
): Promise<GenerateCanvasRedrawResult> {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl,
    maskUrl: params.maskUrl,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
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
