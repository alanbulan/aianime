// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import {
  completeVideoGenerationTask as completeVideoGenerationTaskUseCase,
  type CompleteVideoGenerationTaskParams,
} from "./application/completeVideoGenerationTask";
import type { CanvasTaskResultGateway } from "./application/completeCanvasMediaGenerationTask";
import {
  submitVideoGeneration as submitVideoGenerationUseCase,
  type SubmitVideoGenerationParams,
} from "./application/submitVideoGeneration";
import { fetchCanvasGenerationResultUrl } from "./infrastructure/freezoneGenerationResultGateway";
import { freezoneVideoGenerationSubmissionGateway } from "./infrastructure/freezoneVideoGenerationSubmissionGateway";

const taskGateway: CanvasTaskResultGateway = {
  awaitCompletion: awaitTaskCompletion,
  fetchResultUrl: fetchCanvasGenerationResultUrl,
};

export function submitVideoGeneration(params: SubmitVideoGenerationParams) {
  return submitVideoGenerationUseCase(params, {
    submissionGateway: freezoneVideoGenerationSubmissionGateway,
  });
}

export function completeVideoGenerationTask(
  params: CompleteVideoGenerationTaskParams,
) {
  return completeVideoGenerationTaskUseCase(params, { taskGateway });
}
