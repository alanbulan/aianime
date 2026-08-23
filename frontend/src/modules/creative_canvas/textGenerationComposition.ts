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
  return (await resolveCanvasTextModelSelection(requested)).model;
}

async function resolveCanvasTextModelSelection(requested?: string): Promise<{
  model: string;
  modelSelector?: string;
}> {
  const catalog = await loadCommercialModelCatalog("TEXT");
  const normalized = requested?.trim() ?? "";
  const candidates = catalog.items.filter(
    (item) => item.operation.trim().toUpperCase() === "TEXT",
  );
  const selected = normalized
    ? candidates.find((item) => {
        const selector = typeof item.capabilities.routeSelector === "string"
          ? item.capabilities.routeSelector.trim()
          : "";
        return item.code === normalized || selector === normalized;
      })
    : undefined;
  const model = selected?.code ?? resolveRequiredCatalogModelCode(catalog, "TEXT");
  const resolved = selected ?? candidates.find((item) => item.code === model);
  const modelSelector = typeof resolved?.capabilities.routeSelector === "string"
    ? resolved.capabilities.routeSelector.trim()
    : "";
  return {
    model,
    ...(modelSelector ? { modelSelector } : {}),
  };
}

export async function translateCanvasText(
  params: Omit<TranslateCanvasTextParams, "model"> & { model?: string },
) {
  const selection = await resolveCanvasTextModelSelection(params.model);
  return translateCanvasTextUseCase(
    { ...params, model: selection.model, modelSelector: selection.modelSelector },
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
  const selection = await resolveCanvasTextModelSelection(params.command.model);
  return generateCanvasStoryScriptUseCase(
    {
      ...params,
      command: {
        ...params.command,
        model: selection.model,
        modelSelector: selection.modelSelector,
      },
    },
    {
      submissionGateway: freezoneStoryScriptGenerationGateway,
      taskGateway: storyScriptTaskGateway,
      onTaskSubmitted,
    },
  );
}
