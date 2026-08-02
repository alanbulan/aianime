// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import type { CanvasTaskResultGateway } from "./application/completeCanvasMediaGenerationTask";
import {
  analyzeCanvasVideoStory as analyzeCanvasVideoStoryUseCase,
  type AnalyzeCanvasVideoStoryParams,
} from "./application/analyzeCanvasVideoStory";
import { freezoneVideoStoryAnalysisGateway } from "./infrastructure/freezoneVideoStoryAnalysisGateway";

const taskGateway: Pick<CanvasTaskResultGateway, "awaitCompletion"> = {
  awaitCompletion: awaitTaskCompletion,
};

export function analyzeCanvasVideoStory(
  params: AnalyzeCanvasVideoStoryParams,
) {
  return analyzeCanvasVideoStoryUseCase(params, {
    submissionGateway: freezoneVideoStoryAnalysisGateway,
    taskGateway,
  });
}
