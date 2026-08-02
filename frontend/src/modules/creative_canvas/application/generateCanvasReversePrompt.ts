// Copyright (c) 2026 AI anime
import type { CanvasGenerationTaskRef } from "./completeCanvasMediaGenerationTask";
import type { CanvasImageSourcePreparationGateway } from "./prepareCanvasImageSource";

export interface CanvasReversePromptCommand {
  readonly sourceUrl: string;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface CanvasReversePromptSubmissionGateway {
  submit(
    projectId: string,
    command: CanvasReversePromptCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface CanvasReversePromptTaskGateway {
  awaitCompletion(taskKey: string, projectId: string): Promise<unknown>;
  fetchReversePrompt(projectId: string, jobId: string): Promise<string>;
}

export interface GenerateCanvasReversePromptParams {
  readonly projectId: string;
  readonly rawSourceUrl: string;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface GenerateCanvasReversePromptDependencies {
  readonly sourceGateway: CanvasImageSourcePreparationGateway;
  readonly submissionGateway: CanvasReversePromptSubmissionGateway;
  readonly taskGateway: CanvasReversePromptTaskGateway;
  readonly onTaskSubmitted: (task: CanvasGenerationTaskRef) => void;
}

export interface GenerateCanvasReversePromptResult {
  readonly task: CanvasGenerationTaskRef;
  readonly prompt: string;
}

export async function generateCanvasReversePrompt(
  params: GenerateCanvasReversePromptParams,
  dependencies: GenerateCanvasReversePromptDependencies,
): Promise<GenerateCanvasReversePromptResult> {
  const sourceUrl = await dependencies.sourceGateway.prepare(
    params.projectId,
    params.rawSourceUrl,
  );
  const task = await dependencies.submissionGateway.submit(params.projectId, {
    sourceUrl,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  });
  dependencies.onTaskSubmitted(task);
  await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const prompt = await dependencies.taskGateway.fetchReversePrompt(
    params.projectId,
    task.job_id,
  );
  return { task, prompt };
}
