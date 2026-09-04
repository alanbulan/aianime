// Copyright (c) 2026 AI anime
import {
  requireCanvasGenerationTaskRef,
  type CanvasGenerationTaskRef,
  type CanvasStructuredTaskResultGateway,
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
}

export interface TranslateCanvasTextParams
  extends CanvasTextTranslationSubmission {
  readonly projectId: string;
}

export interface TranslateCanvasTextDependencies {
  readonly translationGateway: CanvasTextTranslationGateway;
  readonly taskGateway: CanvasStructuredTaskResultGateway;
}

export interface TranslateCanvasTextResult {
  readonly translatedText: string;
}

export function resolveCanvasTranslatedText(result: unknown): string | null {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return null;
  }
  const translatedText = Reflect.get(result, "translated_text");
  return typeof translatedText === "string" && translatedText.length > 0
    ? translatedText
    : null;
}

export async function translateCanvasText(
  params: TranslateCanvasTextParams,
  dependencies: TranslateCanvasTextDependencies,
): Promise<TranslateCanvasTextResult> {
  const task = requireCanvasGenerationTaskRef(
    await dependencies.translationGateway.submit(params.projectId, {
      text: params.text,
      model: params.model,
      modelSelector: params.modelSelector,
      nodeType: params.nodeType,
      canvasId: params.canvasId,
      nodeId: params.nodeId,
    }),
    "freezone_text_translate",
  );
  const completion = await dependencies.taskGateway.awaitCompletion(
    task.task_key,
    params.projectId,
  );
  const candidate =
    resolveCanvasTranslatedText(completion.result)
    ?? resolveCanvasTranslatedText(
      await dependencies.taskGateway.fetchResult<Record<string, unknown>>(
        params.projectId,
        task.task_type,
        task.job_id,
      ),
    );
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error("翻译任务已完成，但没有返回译文");
  }
  const translatedText = candidate;
  return { translatedText };
}
