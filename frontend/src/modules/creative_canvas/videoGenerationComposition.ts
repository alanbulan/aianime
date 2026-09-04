// Copyright (c) 2026 AI anime
import {
  completeVideoGenerationTask as completeVideoGenerationTaskUseCase,
  type CompleteVideoGenerationTaskParams,
} from "./application/completeVideoGenerationTask";
import {
  submitVideoGeneration as submitVideoGenerationUseCase,
  type SubmitVideoGenerationParams,
} from "./application/submitVideoGeneration";
import { freezoneGenerationTaskGateway } from "./infrastructure/freezoneGenerationTaskGateway";
import { freezoneVideoGenerationSubmissionGateway } from "./infrastructure/freezoneVideoGenerationSubmissionGateway";

export function submitVideoGeneration(params: SubmitVideoGenerationParams) {
  return submitVideoGenerationUseCase(params, {
    submissionGateway: freezoneVideoGenerationSubmissionGateway,
  });
}

export function completeVideoGenerationTask(
  params: CompleteVideoGenerationTaskParams,
) {
  return completeVideoGenerationTaskUseCase(params, {
    taskGateway: freezoneGenerationTaskGateway,
  });
}
