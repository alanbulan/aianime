// Copyright (c) 2026 AI anime
import type {
  CanvasOutpaintAspectRatio,
  CanvasOutpaintImageSize,
} from "@/modules/creative_canvas/public";
import { completeCanvasMediaGenerationTask } from "./completeCanvasMediaGenerationTask";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface CanvasOutpaintGenerationCommand {
  readonly sourceUrl: string;
  readonly targetAspectRatio: CanvasOutpaintAspectRatio;
  readonly numImages: 1;
  readonly imageSize: CanvasOutpaintImageSize;
  readonly model: string;
}

export interface CanvasOutpaintGenerationGateway {
  submit(
    projectId: string,
    command: CanvasOutpaintGenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasOutpaintParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly targetAspectRatio: CanvasOutpaintAspectRatio;
  readonly imageSize: CanvasOutpaintImageSize;
  readonly model: string;
}

export interface GenerateCanvasOutpaintDependencies {
  readonly submissionGateway: CanvasOutpaintGenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasOutpaintResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasOutpaint(
  params: GenerateCanvasOutpaintParams,
  dependencies: GenerateCanvasOutpaintDependencies,
): Promise<GenerateCanvasOutpaintResult> {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl.split("?")[0],
    targetAspectRatio: params.targetAspectRatio,
    numImages: 1,
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
