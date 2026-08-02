// Copyright (c) 2026 AI anime
import { resolveGenerationOutputUrl } from "./generationOutputUrl";
import type {
  CanvasGenerationTaskCompletion,
  CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";
import type { VideoGenerationTaskRef } from "./submitVideoGeneration";

export interface CompleteVideoGenerationTaskParams {
  readonly projectId: string;
  readonly task: VideoGenerationTaskRef;
}

export interface CompleteVideoGenerationTaskDependencies {
  readonly taskGateway: CanvasTaskResultGateway;
}

export interface CompleteVideoGenerationTaskResult {
  readonly completion: CanvasGenerationTaskCompletion;
  readonly url: string | null;
  readonly resultLookupError: unknown | null;
}

export async function completeVideoGenerationTask(
  params: CompleteVideoGenerationTaskParams,
  dependencies: CompleteVideoGenerationTaskDependencies,
): Promise<CompleteVideoGenerationTaskResult> {
  const completion = await dependencies.taskGateway.awaitCompletion(
    params.task.task_key,
    params.projectId,
  );
  const embeddedUrl = resolveGenerationOutputUrl(completion.result, "video");
  if (embeddedUrl) {
    return { completion, url: embeddedUrl, resultLookupError: null };
  }
  try {
    const resultUrl = await dependencies.taskGateway.fetchResultUrl(
      params.projectId,
      params.task.task_type,
      params.task.job_id,
    );
    return { completion, url: resultUrl || null, resultLookupError: null };
  } catch (error) {
    return { completion, url: null, resultLookupError: error };
  }
}
