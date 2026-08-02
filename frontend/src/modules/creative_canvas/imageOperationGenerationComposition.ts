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
  generateCanvasRelight as generateCanvasRelightUseCase,
  type GenerateCanvasRelightParams,
} from "./application/generateCanvasRelight";
import {
  generateCanvasScene360 as generateCanvasScene360UseCase,
  type GenerateCanvasScene360Params,
} from "./application/generateCanvasScene360";
import {
  generateCanvasOutpaint as generateCanvasOutpaintUseCase,
  type GenerateCanvasOutpaintParams,
} from "./application/generateCanvasOutpaint";
import {
  generateCanvasUpscale as generateCanvasUpscaleUseCase,
  type GenerateCanvasUpscaleParams,
} from "./application/generateCanvasUpscale";
import {
  prepareCanvasImageSource as prepareCanvasImageSourceUseCase,
  prepareCanvasImageSources as prepareCanvasImageSourcesUseCase,
  type CanvasImageSourcePreparationGateway,
} from "./application/prepareCanvasImageSource";
import { freezoneMultiAngleGenerationGateway } from "./infrastructure/freezoneMultiAngleGenerationGateway";
import { freezoneOutpaintGenerationGateway } from "./infrastructure/freezoneOutpaintGenerationGateway";
import { fetchCanvasGenerationResultUrl } from "./infrastructure/freezoneGenerationResultGateway";
import { freezoneRelightGenerationGateway } from "./infrastructure/freezoneRelightGenerationGateway";
import { freezoneScene360GenerationGateway } from "./infrastructure/freezoneScene360GenerationGateway";
import { freezoneUpscaleGenerationGateway } from "./infrastructure/freezoneUpscaleGenerationGateway";
import { httpFreezoneAssetUploadGateway } from "./infrastructure/httpFreezoneAssetUploadGateway";

const taskGateway: CanvasTaskResultGateway = {
  awaitCompletion: awaitTaskCompletion,
  fetchResultUrl: fetchCanvasGenerationResultUrl,
};

const imageSourceDependencies = {
  uploadGateway: httpFreezoneAssetUploadGateway,
  now: Date.now,
};

const imageSourceGateway: CanvasImageSourcePreparationGateway = {
  prepare(projectId, rawUrl) {
    return prepareCanvasImageSourceUseCase(
      { projectId, rawUrl },
      imageSourceDependencies,
    );
  },
};

export function prepareCanvasImageSource(projectId: string, rawUrl: string) {
  return imageSourceGateway.prepare(projectId, rawUrl);
}

export function prepareCanvasImageSources(
  projectId: string,
  rawUrls: readonly string[] | null | undefined,
) {
  return prepareCanvasImageSourcesUseCase(
    { projectId, rawUrls },
    imageSourceDependencies,
  );
}

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

export function generateCanvasRelight(
  params: GenerateCanvasRelightParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasRelightUseCase(params, {
    sourceGateway: imageSourceGateway,
    submissionGateway: freezoneRelightGenerationGateway,
    taskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasScene360(
  params: GenerateCanvasScene360Params,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasScene360UseCase(params, {
    sourceGateway: imageSourceGateway,
    submissionGateway: freezoneScene360GenerationGateway,
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
