// Copyright (c) 2026 AI anime
import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./completeCanvasMediaGenerationTask";

export type CanvasTextTranslationNodeType =
  | "generic"
  | "image"
  | "video"
  | "audio"
  | "text";

export interface CanvasTextTranslationSubmission {
  readonly text: string;
  readonly model: string;
  readonly modelSelector?: string;
  readonly nodeType: CanvasTextTranslationNodeType;
  readonly canvasId: string;
  readonly nodeId: string;
}

export interface CanvasTextTranslationGateway {
  submit(
    projectId: string,
    submission: CanvasTextTranslationSubmission,
  ): Promise<CanvasGenerationTaskRef>;
  fetchTranslatedText(projectId: string, jobId: string): Promise<string>;
}

export interface TranslateCanvasTextParams
  extends CanvasTextTranslationSubmission {
  readonly projectId: string;
}

export interface TranslateCanvasTextDependencies {
  readonly translationGateway: CanvasTextTranslationGateway;
  readonly taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion">;
}

export interface TranslateCanvasTextResult {
  readonly translatedText: string;
}

export async function translateCanvasText(
  params: TranslateCanvasTextParams,
  dependencies: TranslateCanvasTextDependencies,
): Promise<TranslateCanvasTextResult> {
  const task = await dependencies.translationGateway.submit(params.projectId, {
    text: params.text,
    model: params.model,
    modelSelector: params.modelSelector,
    nodeType: params.nodeType,
    canvasId: params.canvasId,
    nodeId: params.nodeId,
  });
  await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const translatedText =
    await dependencies.translationGateway.fetchTranslatedText(
      params.projectId,
      task.job_id,
    );
  return { translatedText };
}
