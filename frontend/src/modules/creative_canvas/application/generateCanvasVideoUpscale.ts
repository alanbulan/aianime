// Copyright (c) 2026 AI anime
import type {
  CanvasVideoUpscaleDenoise,
  CanvasVideoUpscaleResolution,
} from "../domain/videoUpscale";
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

export interface CanvasVideoUpscaleGenerationCommand {
  readonly sourceUrl: string;
  readonly resolution: CanvasVideoUpscaleResolution;
  readonly frameInterpolation: "none";
  readonly denoiseStrength: CanvasVideoUpscaleDenoise;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface CanvasVideoUpscaleGenerationGateway {
  submit(
    projectId: string,
    command: CanvasVideoUpscaleGenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasVideoUpscaleParams {
  readonly projectId: string;
  readonly sourceUrl: string;
  readonly resolution: CanvasVideoUpscaleResolution;
  readonly denoiseStrength: CanvasVideoUpscaleDenoise;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface GenerateCanvasVideoUpscaleDependencies {
  readonly submissionGateway: CanvasVideoUpscaleGenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasVideoUpscaleResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasVideoUpscale(
  params: GenerateCanvasVideoUpscaleParams,
  dependencies: GenerateCanvasVideoUpscaleDependencies,
): Promise<GenerateCanvasVideoUpscaleResult> {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl: params.sourceUrl.split("?")[0],
    resolution: params.resolution,
    frameInterpolation: "none",
    denoiseStrength: params.denoiseStrength,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  });
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task, media: "video" },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: dependencies.onTaskSubmitted,
    },
  );
  return { task, url };
}
