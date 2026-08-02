// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import type {
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
} from "./application/completeCanvasMediaGenerationTask";
import {
  generateCanvasGridAction as generateCanvasGridActionUseCase,
  type GenerateCanvasGridActionParams,
} from "./application/generateCanvasGridAction";
import {
  generateCanvasImageTo3d as generateCanvasImageTo3dUseCase,
  type GenerateCanvasImageTo3dParams,
} from "./application/generateCanvasImageTo3d";
import {
  generateCanvasMultiAngle as generateCanvasMultiAngleUseCase,
  type GenerateCanvasMultiAngleParams,
} from "./application/generateCanvasMultiAngle";
import {
  generateCanvasRelight as generateCanvasRelightUseCase,
  type GenerateCanvasRelightParams,
} from "./application/generateCanvasRelight";
import {
  generateCanvasReversePrompt as generateCanvasReversePromptUseCase,
  type CanvasReversePromptTaskGateway,
  type GenerateCanvasReversePromptParams,
} from "./application/generateCanvasReversePrompt";
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
import { freezoneGridActionGenerationGateway } from "./infrastructure/freezoneGridActionGenerationGateway";
import { freezoneImageTo3dGenerationGateway } from "./infrastructure/freezoneImageTo3dGenerationGateway";
import { freezoneMultiAngleGenerationGateway } from "./infrastructure/freezoneMultiAngleGenerationGateway";
import { freezoneOutpaintGenerationGateway } from "./infrastructure/freezoneOutpaintGenerationGateway";
import {
  fetchCanvasGenerationResult,
  fetchCanvasGenerationResultUrl,
} from "./infrastructure/freezoneGenerationResultGateway";
import { freezoneRelightGenerationGateway } from "./infrastructure/freezoneRelightGenerationGateway";
import { freezoneReversePromptGenerationGateway } from "./infrastructure/freezoneReversePromptGenerationGateway";
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

const reversePromptTaskGateway: CanvasReversePromptTaskGateway = {
  awaitCompletion: awaitTaskCompletion,
  async fetchReversePrompt(projectId, jobId) {
    const result = await fetchCanvasGenerationResult<{ readonly prompt: string }>(
      projectId,
      "freezone_image_reverse_prompt",
      jobId,
    );
    return result.prompt;
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

export function generateCanvasGridAction(
  params: GenerateCanvasGridActionParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasGridActionUseCase(params, {
    sourceGateway: imageSourceGateway,
    submissionGateway: freezoneGridActionGenerationGateway,
    taskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasImageTo3d(
  params: GenerateCanvasImageTo3dParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasImageTo3dUseCase(params, {
    sourceGateway: imageSourceGateway,
    submissionGateway: freezoneImageTo3dGenerationGateway,
    taskGateway,
    onTaskSubmitted,
    now: Date.now,
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

export function generateCanvasReversePrompt(
  params: GenerateCanvasReversePromptParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasReversePromptUseCase(params, {
    sourceGateway: imageSourceGateway,
    submissionGateway: freezoneReversePromptGenerationGateway,
    taskGateway: reversePromptTaskGateway,
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
