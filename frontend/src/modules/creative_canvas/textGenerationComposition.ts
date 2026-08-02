// Copyright (c) 2026 AI anime
import {
  loadCommercialModelCatalog,
  resolveRequiredCatalogModelCode,
} from "@/modules/model_usage/public";
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import type { CanvasTaskResultGateway } from "./application/completeCanvasMediaGenerationTask";
import {
  translateCanvasText as translateCanvasTextUseCase,
  type TranslateCanvasTextParams,
} from "./application/translateCanvasText";
import { freezoneCanvasTextTranslationGateway } from "./infrastructure/freezoneCanvasTextTranslationGateway";

const taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion"> = {
  awaitCompletion: awaitTaskCompletion,
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
