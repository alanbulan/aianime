// Copyright (c) 2026 AI anime
import type { CanvasScene360AspectRatio } from "../domain/scene360";
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./ports";

export interface CanvasScene360GenerationCommand {
  readonly referenceUrl: string;
  readonly aspectRatio: CanvasScene360AspectRatio;
}

export interface CanvasScene360GenerationGateway {
  submit(
    projectId: string,
    command: CanvasScene360GenerationCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasScene360Params {
  readonly projectId: string;
  readonly referenceUrl: string;
  readonly aspectRatio: CanvasScene360AspectRatio;
}

export interface GenerateCanvasScene360Dependencies {
  readonly submissionGateway: CanvasScene360GenerationGateway;
  readonly taskGateway: CanvasTaskResultGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasScene360Result {
  readonly task: CanvasGenerationTaskRef;
  readonly url: string;
}

export async function generateCanvasScene360(
  params: GenerateCanvasScene360Params,
  dependencies: GenerateCanvasScene360Dependencies,
): Promise<GenerateCanvasScene360Result> {
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    referenceUrl: params.referenceUrl.split("?")[0],
    aspectRatio: params.aspectRatio,
  });
  dependencies.onTaskSubmitted(task);
  const completion = await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const embeddedUrl = completion.result?.["output_url"] as string | undefined;
  const url =
    embeddedUrl ||
    (await dependencies.taskGateway.fetchResultUrl(
      params.projectId,
      task.task_type,
      task.job_id,
    ));
  return { task, url };
}
