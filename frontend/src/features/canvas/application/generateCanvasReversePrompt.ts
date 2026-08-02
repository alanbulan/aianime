// Copyright (c) 2026 AI anime
import type {
  CanvasGenerationTaskRef,
} from "@/modules/creative_canvas/public";
import type { CanvasGenerationTaskGateway } from "./ports";

export interface CanvasReversePromptCommand {
  readonly sourceUrl: string;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface CanvasReversePromptSubmissionGateway {
  prepareSourceUrl(projectId: string, rawUrl: string): Promise<string>;
  submit(
    projectId: string,
    command: CanvasReversePromptCommand,
  ): Promise<CanvasGenerationTaskRef>;
}

export interface GenerateCanvasReversePromptParams {
  readonly projectId: string;
  readonly rawSourceUrl: string;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface GenerateCanvasReversePromptDependencies {
  readonly submissionGateway: CanvasReversePromptSubmissionGateway;
  readonly taskGateway: Pick<
    CanvasGenerationTaskGateway,
    "awaitCompletion" | "fetchReversePrompt"
  >;
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
  const sourceUrl = await dependencies.submissionGateway.prepareSourceUrl(
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
