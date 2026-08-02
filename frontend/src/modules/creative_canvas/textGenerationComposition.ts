// Copyright (c) 2026 AI anime
import {
  loadCommercialModelCatalog,
  resolveRequiredCatalogModelCode,
} from "@/modules/model_usage/public";
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./application/completeCanvasMediaGenerationTask";
import {
  generateCanvasStoryScript as generateCanvasStoryScriptUseCase,
  type CanvasStoryScriptResult,
  type CanvasStoryScriptTaskGateway,
  type GenerateCanvasStoryScriptParams,
} from "./application/generateCanvasStoryScript";
import {
  translateCanvasText as translateCanvasTextUseCase,
  type TranslateCanvasTextParams,
} from "./application/translateCanvasText";
import { freezoneCanvasTextTranslationGateway } from "./infrastructure/freezoneCanvasTextTranslationGateway";
import { fetchCanvasGenerationResult } from "./infrastructure/freezoneGenerationResultGateway";
import { freezoneStoryScriptGenerationGateway } from "./infrastructure/freezoneStoryScriptGenerationGateway";

const taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion"> = {
  awaitCompletion: awaitTaskCompletion,
};

const storyScriptTaskGateway: CanvasStoryScriptTaskGateway = {
  awaitCompletion: awaitTaskCompletion,
  fetchStoryScriptResult(projectId, jobId) {
    return fetchCanvasGenerationResult<CanvasStoryScriptResult>(
      projectId,
      "freezone_story_script",
      jobId,
    );
  },
};

export async function resolveCanvasTextModel(
  requested?: string,
): Promise<string> {
  const catalog = await loadCommercialModelCatalog("TEXT");
  const normalized = requested?.trim() ?? "";
  if (
    normalized &&
    catalog.items.some(
      (item) =>
        item.operation.trim().toUpperCase() === "TEXT" &&
        item.code === normalized,
    )
  ) {
    return normalized;
  }
  return resolveRequiredCatalogModelCode(catalog, "TEXT");
}

export async function translateCanvasText(
  params: Omit<TranslateCanvasTextParams, "model"> & { model?: string },
) {
  const model = await resolveCanvasTextModel(params.model);
  return translateCanvasTextUseCase(
    { ...params, model },
    {
      translationGateway: freezoneCanvasTextTranslationGateway,
      taskGateway,
    },
  );
}

export async function generateCanvasStoryScript(
  params: GenerateCanvasStoryScriptParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  const model = await resolveCanvasTextModel(params.command.model);
  return generateCanvasStoryScriptUseCase(
    { ...params, command: { ...params.command, model } },
    {
      submissionGateway: freezoneStoryScriptGenerationGateway,
      taskGateway: storyScriptTaskGateway,
      onTaskSubmitted,
    },
  );
}
