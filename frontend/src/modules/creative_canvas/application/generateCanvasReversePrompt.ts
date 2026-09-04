// Copyright (c) 2026 AI anime
import {
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskRef,
} from "./completeCanvasMediaGenerationTask";
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
  awaitCompletion(
    taskKey: string,
    projectId: string,
  ): Promise<{ readonly result?: unknown | null }>;
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

export function resolveCanvasReversePrompt(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const prompt = Reflect.get(result, "prompt");
  return typeof prompt === "string" && prompt.trim().length > 0
    ? prompt
    : null;
}

export async function generateCanvasReversePrompt(
  params: GenerateCanvasReversePromptParams,
  dependencies: GenerateCanvasReversePromptDependencies,
): Promise<GenerateCanvasReversePromptResult> {
  const sourceUrl = await dependencies.sourceGateway.prepare(
    params.projectId,
    params.rawSourceUrl,
  );
  const task = requireCanvasGenerationTaskRef(
    await dependencies.submissionGateway.submit(params.projectId, {
      sourceUrl,
      canvasId: params.canvasId,
      nodeId: params.nodeId,
    }),
    "freezone_image_reverse_prompt",
  );
  dependencies.onTaskSubmitted(task);
  const completion = await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const candidate =
    resolveCanvasReversePrompt(completion.result)
    ?? await dependencies.taskGateway.fetchReversePrompt(
      params.projectId,
      task.job_id,
    );
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error("反推提示词任务已完成，但没有返回提示词");
  }
  const prompt = candidate;
  return { task, prompt };
}
