// Copyright (c) 2026 AI anime
import {
  analyzeCanvasVideoStory as analyzeCanvasVideoStoryUseCase,
  type AnalyzeCanvasVideoStoryParams,
} from "./application/analyzeCanvasVideoStory";
import { freezoneGenerationTaskGateway } from "./infrastructure/freezoneGenerationTaskGateway";
import { freezoneVideoStoryAnalysisGateway } from "./infrastructure/freezoneVideoStoryAnalysisGateway";

export function analyzeCanvasVideoStory(
  params: AnalyzeCanvasVideoStoryParams,
) {
  return analyzeCanvasVideoStoryUseCase(params, {
    submissionGateway: freezoneVideoStoryAnalysisGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}
