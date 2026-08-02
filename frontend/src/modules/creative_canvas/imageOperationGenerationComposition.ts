// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./application/completeCanvasMediaGenerationTask";
import {
  generateCanvasMultiAngle as generateCanvasMultiAngleUseCase,
  type GenerateCanvasMultiAngleParams,
} from "./application/generateCanvasMultiAngle";
import {
  generateCanvasOutpaint as generateCanvasOutpaintUseCase,
  type GenerateCanvasOutpaintParams,
} from "./application/generateCanvasOutpaint";
import {
  generateCanvasUpscale as generateCanvasUpscaleUseCase,
  type GenerateCanvasUpscaleParams,
} from "./application/generateCanvasUpscale";
import { freezoneMultiAngleGenerationGateway } from "./infrastructure/freezoneMultiAngleGenerationGateway";
import { freezoneOutpaintGenerationGateway } from "./infrastructure/freezoneOutpaintGenerationGateway";
import { fetchCanvasGenerationResultUrl } from "./infrastructure/freezoneGenerationResultGateway";
import { freezoneUpscaleGenerationGateway } from "./infrastructure/freezoneUpscaleGenerationGateway";

const taskGateway: CanvasTaskResultGateway = {
  awaitCompletion: awaitTaskCompletion,
  fetchResultUrl: fetchCanvasGenerationResultUrl,
};

export function generateCanvasMultiAngle(
  params: GenerateCanvasMultiAngleParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasMultiAngleUseCase(params, {
    submissionGateway: freezoneMultiAngleGenerationGateway,
    taskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasOutpaint(
  params: GenerateCanvasOutpaintParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasOutpaintUseCase(params, {
    submissionGateway: freezoneOutpaintGenerationGateway,
    taskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasUpscale(
  params: GenerateCanvasUpscaleParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasUpscaleUseCase(params, {
    submissionGateway: freezoneUpscaleGenerationGateway,
    taskGateway,
    onTaskSubmitted,
  });
}
