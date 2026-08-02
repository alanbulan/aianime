import { createElement } from "react";

import { createStoryIntakeQueryHooks } from "@/modules/story_intake/application/query-hooks";
import { loadCommercialModelCatalog } from "@/modules/model_usage/public";
import type { StartIngestionParams } from "@/modules/story_intake/domain/types";
import { defaultKnowledgeModelSelection } from "@/modules/story_intake/domain/knowledge-model-selection";
import { createUseStoryIntakeController } from "@/modules/story_intake/application/use-story-intake-controller";
import { httpStoryIntakeGateway } from "@/modules/story_intake/infrastructure/http-story-intake-gateway";
import { importPreviewPreference } from "@/modules/story_intake/infrastructure/import-preview-preference";
import { IngestPageView } from "@/modules/story_intake/presentation/IngestPageView";

const storyIntakeQueryHooks = createStoryIntakeQueryHooks(
  httpStoryIntakeGateway,
);

export const {
  useChapters,
  useKnowledgeGraph,
  useStartIngest,
  useUploadNovel,
} = storyIntakeQueryHooks;

export function uploadStoryDocument(project: string, file: File) {
  return httpStoryIntakeGateway.uploadNovel(project, file);
}

export function startStoryIngestion(
  project: string,
  params: StartIngestionParams,
) {
  return httpStoryIntakeGateway.startIngestion(project, params);
}

export async function loadDefaultKnowledgeModels() {
  const [textCatalog, embeddingCatalog] = await Promise.all([
    loadCommercialModelCatalog("TEXT"),
    loadCommercialModelCatalog("EMBEDDING"),
  ]);
  return defaultKnowledgeModelSelection(textCatalog, embeddingCatalog);
}

const useStoryIntakeController = createUseStoryIntakeController(
  storyIntakeQueryHooks,
  importPreviewPreference,
);

export function IngestPageContent({ project }: { project: string }) {
  const controller = useStoryIntakeController(project);
  return createElement(IngestPageView, { controller });
}
