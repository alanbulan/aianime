// Copyright (c) 2026 AI anime
import {
  awaitCanvasMediaGenerationTask,
  type AwaitCanvasMediaGenerationTaskResult,
  type CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import type { VideoGenerationTaskRef } from "./submitVideoGeneration";

export interface CompleteVideoGenerationTaskParams {
  readonly projectId: string;
  readonly task: VideoGenerationTaskRef;
}

export interface CompleteVideoGenerationTaskDependencies {
  readonly taskGateway: CanvasTaskResultGateway;
}

export type CompleteVideoGenerationTaskResult =
  AwaitCanvasMediaGenerationTaskResult;

export async function completeVideoGenerationTask(
  params: CompleteVideoGenerationTaskParams,
  dependencies: CompleteVideoGenerationTaskDependencies,
): Promise<CompleteVideoGenerationTaskResult> {
  return await awaitCanvasMediaGenerationTask(
    { ...params, media: "video" },
    dependencies.taskGateway,
  );
}
