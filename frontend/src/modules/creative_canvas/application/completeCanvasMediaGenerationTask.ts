// Copyright (c) 2026 AI anime
export interface CanvasGenerationTaskRef {
  readonly job_id: string;
  readonly task_key: string;
  readonly task_type: string;
}

export interface CanvasGenerationTaskCompletion {
  readonly result?: unknown | null;
}

export interface CanvasTaskResultGateway {
  awaitCompletion(
    taskKey: string,
    projectId: string,
  ): Promise<CanvasGenerationTaskCompletion>;
  fetchResultUrl(
    projectId: string,
    taskType: string,
    jobId: string,
  ): Promise<string>;
}

export interface CompleteCanvasMediaGenerationTaskParams {
  readonly projectId: string;
  readonly task: CanvasGenerationTaskRef;
}

export interface CompleteCanvasMediaGenerationTaskDependencies {
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export function readEmbeddedCanvasGenerationOutputUrl(
  result: unknown,
): string | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return null;
  }
  const outputUrl = Reflect.get(result, "output_url");
  return typeof outputUrl === "string" && outputUrl.length > 0
    ? outputUrl
    : null;
}

export async function completeCanvasMediaGenerationTask(
  params: CompleteCanvasMediaGenerationTaskParams,
  dependencies: CompleteCanvasMediaGenerationTaskDependencies,
): Promise<string> {
  dependencies.onTaskSubmitted(params.task);
  const completion = await dependencies.taskGateway.awaitCompletion(
    params.task.task_key,
    params.projectId,
  );
  const embeddedUrl = readEmbeddedCanvasGenerationOutputUrl(
    completion.result,
  );
  if (embeddedUrl) return embeddedUrl;
  return await dependencies.taskGateway.fetchResultUrl(
    params.projectId,
    params.task.task_type,
    params.task.job_id,
  );
}
