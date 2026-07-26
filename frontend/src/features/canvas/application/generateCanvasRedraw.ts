// Copyright (c) 2026 AI anime
import type {
  CanvasRedrawAspectRatio,
  CanvasRedrawImageSize,
} from "../domain/redraw";
import { completeCanvasMediaGenerationTask } from "./completeCanvasMediaGenerationTask";
import type {
  CanvasGenerationTaskRef,
  CanvasRedrawTaskGateway,
} from "./ports";

export interface GenerateCanvasRedrawParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly maskUrl: string | null;
  readonly prompt?: string;
  readonly aspectRatio: CanvasRedrawAspectRatio;
  readonly imageSize: CanvasRedrawImageSize;
  readonly model?: string;
}

export interface GenerateCanvasRedrawDependencies {
  readonly redrawGateway: CanvasRedrawTaskGateway;
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
  const task = await dependencies.redrawGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl,
    maskUrl: params.maskUrl,
    prompt: params.prompt,
    aspectRatio: params.aspectRatio,
    imageSize: params.imageSize,
    model: params.model,
  });
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task },
    {
      taskGateway: dependencies.redrawGateway,
      onTaskSubmitted: dependencies.onTaskSubmitted,
    },
  );
  return { task, url };
}
