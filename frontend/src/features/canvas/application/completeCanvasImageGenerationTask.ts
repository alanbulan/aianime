// Copyright (c) 2026 AI anime
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface CompleteCanvasImageGenerationTaskParams {
  readonly projectId: string;
  readonly task: CanvasGenerationTaskRef;
}

export interface CompleteCanvasImageGenerationTaskDependencies {
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export async function completeCanvasImageGenerationTask(
  params: CompleteCanvasImageGenerationTaskParams,
  dependencies: CompleteCanvasImageGenerationTaskDependencies,
): Promise<string> {
  dependencies.onTaskSubmitted(params.task);
  const completion = await dependencies.taskGateway.awaitCompletion(
    params.task.task_key,
    params.projectId,
  );
  const embeddedUrl = completion.result?.["output_url"] as string | undefined;
  if (embeddedUrl) return embeddedUrl;
  return await dependencies.taskGateway.fetchResultUrl(
    params.projectId,
    params.task.task_type,
    params.task.job_id,
  );
}
