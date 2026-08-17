import { createElement } from "react";

import { createStoryIntakeQueryHooks } from "@/modules/story_intake/application/query-hooks";
import type { StartIngestionParams } from "@/modules/story_intake/domain/types";
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

const useStoryIntakeController = createUseStoryIntakeController(
  storyIntakeQueryHooks,
  importPreviewPreference,
);

export function IngestPageContent({ project }: { project: string }) {
  const controller = useStoryIntakeController(project);
  return createElement(IngestPageView, { controller });
}
