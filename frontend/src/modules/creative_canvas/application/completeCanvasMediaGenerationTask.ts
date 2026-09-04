// Copyright (c) 2026 AI anime
import {
  resolveGenerationOutputUrl,
  type GenerationOutputMedia,
} from "./generationOutputUrl";

export interface CanvasGenerationTaskRef {
  readonly job_id: string;
  readonly task_key: string;
  readonly task_type: string;
}

export function parseCanvasGenerationTaskRef(
  value: unknown,
): CanvasGenerationTaskRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const jobId = typeof record.job_id === "string" ? record.job_id.trim() : "";
  const taskKey = typeof record.task_key === "string"
    ? record.task_key.trim()
    : "";
  const taskType = typeof record.task_type === "string"
    ? record.task_type.trim()
    : "";
  if (!jobId || !taskKey || !taskType) {
    return null;
  }
  return {
    job_id: jobId,
    task_key: taskKey,
    task_type: taskType,
  };
}

export function requireCanvasGenerationTaskRef(
  value: unknown,
  expectedTaskType?: string,
): CanvasGenerationTaskRef {
  const task = parseCanvasGenerationTaskRef(value);
  if (!task) {
    throw new Error("生成任务回执不完整：缺少 job_id、task_key 或 task_type");
  }
  if (expectedTaskType && task.task_type !== expectedTaskType) {
    throw new Error(
      `生成任务类型不匹配：预期 ${expectedTaskType}，实际 ${task.task_type}`,
    );
  }
  return task;
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

export interface CanvasStructuredTaskResultGateway
  extends Pick<CanvasTaskResultGateway, "awaitCompletion"> {
  fetchResult<Result>(
    projectId: string,
    taskType: string,
    jobId: string,
  ): Promise<Result>;
}

export interface CanvasRecoverableTaskResultGateway
  extends CanvasTaskResultGateway {
  hasTask(projectId: string, taskKey: string): Promise<boolean>;
}

export interface RecoverCanvasMediaGenerationTaskOptions {
  readonly checkTaskExistence?: boolean;
}

export interface CompleteCanvasMediaGenerationTaskParams {
  readonly projectId: string;
  readonly task: CanvasGenerationTaskRef;
  readonly media: GenerationOutputMedia;
}

export interface CompleteCanvasMediaGenerationTaskDependencies {
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface AwaitCanvasMediaGenerationTaskResult {
  readonly completion: CanvasGenerationTaskCompletion;
  readonly url: string | null;
  readonly resultLookupError: unknown | null;
}

/**
 * The one completion path for image/video/audio tasks: trust the terminal task
 * payload first, then query the durable job artifact only when that payload has
 * no media URL.
 */
export async function awaitCanvasMediaGenerationTask(
  params: CompleteCanvasMediaGenerationTaskParams,
  taskGateway: CanvasTaskResultGateway,
): Promise<AwaitCanvasMediaGenerationTaskResult> {
  const task = requireCanvasGenerationTaskRef(params.task);
  const completion = await taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const embeddedUrl = resolveGenerationOutputUrl(
    completion.result,
    params.media,
  );
  if (embeddedUrl) {
    return { completion, url: embeddedUrl, resultLookupError: null };
  }
  try {
    const resultUrl = await taskGateway.fetchResultUrl(
      params.projectId,
      task.task_type,
      task.job_id,
    );
    return {
      completion,
      url: resultUrl.trim() || null,
      resultLookupError: null,
    };
  } catch (error) {
    return { completion, url: null, resultLookupError: error };
  }
}

/**
 * Resume a persisted media task. If the task record has already expired, read
 * its durable output artifact directly instead of waiting for a task event that
 * can no longer arrive.
 */
export async function recoverCanvasMediaGenerationTask(
  params: CompleteCanvasMediaGenerationTaskParams,
  taskGateway: CanvasRecoverableTaskResultGateway,
  options: RecoverCanvasMediaGenerationTaskOptions = {},
): Promise<string> {
  const task = requireCanvasGenerationTaskRef(params.task);
  let taskExists: boolean | null = null;
  if (options.checkTaskExistence !== false) {
    try {
      taskExists = await taskGateway.hasTask(
        params.projectId,
        task.task_key,
      );
    } catch {
      // A transient task-list failure should not prevent the canonical task
      // monitor from attaching and applying its own retry/timeout policy.
    }
  }

  if (taskExists === false) {
    const resultUrl = await taskGateway.fetchResultUrl(
      params.projectId,
      task.task_type,
      task.job_id,
    );
    const normalizedUrl = resultUrl.trim();
    if (!normalizedUrl) {
      throw new Error("生成任务已完成，但没有返回可用的媒体地址");
    }
    return normalizedUrl;
  }

  const completed = await awaitCanvasMediaGenerationTask(
    { ...params, task },
    taskGateway,
  );
  if (completed.resultLookupError) throw completed.resultLookupError;
  if (!completed.url) {
    throw new Error("生成任务已完成，但没有返回可用的媒体地址");
  }
  return completed.url;
}

export async function completeCanvasMediaGenerationTask(
  params: CompleteCanvasMediaGenerationTaskParams,
  dependencies: CompleteCanvasMediaGenerationTaskDependencies,
): Promise<string> {
  const task = requireCanvasGenerationTaskRef(params.task);
  dependencies.onTaskSubmitted(task);
  const completed = await awaitCanvasMediaGenerationTask(
    { ...params, task },
    dependencies.taskGateway,
  );
  if (completed.resultLookupError) throw completed.resultLookupError;
  if (!completed.url) {
    throw new Error("生成任务已完成，但没有返回可用的媒体地址");
  }
  return completed.url;
}
