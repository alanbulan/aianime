// Copyright (c) 2026 AI anime
import type { CanvasVideoComposeRequest } from "../domain/videoCompose";
import {
  completeCanvasMediaGenerationTask,
  type CanvasGenerationTaskRef,
  type CanvasTaskResultGateway,
} from "@/modules/creative_canvas/public";

export interface CanvasVideoComposeGateway {
  submit(
    projectId: string,
    request: CanvasVideoComposeRequest,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface ComposeCanvasVideoParams {
  readonly projectId: string;
  readonly request: CanvasVideoComposeRequest;
}

export interface ComposeCanvasVideoDependencies {
  readonly composeGateway: CanvasVideoComposeGateway;
  readonly taskGateway: CanvasTaskResultGateway;
}

export interface ComposeCanvasVideoResult {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function composeCanvasVideo(
  params: ComposeCanvasVideoParams,
  dependencies: ComposeCanvasVideoDependencies,
): Promise<ComposeCanvasVideoResult> {
  const task = await dependencies.composeGateway.submit(
    params.projectId,
    params.request,
  );
  const url = await completeCanvasMediaGenerationTask(
    { projectId: params.projectId, task },
    {
      taskGateway: dependencies.taskGateway,
      onTaskSubmitted: () => undefined,
    },
  );
  return { task, url };
}
