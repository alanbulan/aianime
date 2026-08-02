// Copyright (c) 2026 AI anime
import { awaitTaskCompletion } from "@/modules/task_execution/public";

import {
  composeCanvasVideo as composeCanvasVideoUseCase,
  type ComposeCanvasVideoParams,
} from "./application/composeCanvasVideo";
import {
  composeVideoClip as composeVideoClipUseCase,
  type ComposeVideoClipParams,
} from "./application/composeVideoClip";
import type { CanvasTaskResultGateway } from "./application/completeCanvasMediaGenerationTask";
import { fetchCanvasGenerationResultUrl } from "./infrastructure/freezoneGenerationResultGateway";
import { freezoneVideoComposeGateway } from "./infrastructure/freezoneVideoComposeGateway";

const taskGateway: CanvasTaskResultGateway = {
  awaitCompletion: awaitTaskCompletion,
  fetchResultUrl: fetchCanvasGenerationResultUrl,
};

const composeDependencies = {
  composeGateway: freezoneVideoComposeGateway,
  taskGateway,
};

export function composeCanvasVideo(params: ComposeCanvasVideoParams) {
  return composeCanvasVideoUseCase(params, composeDependencies);
}

export function composeVideoClip(params: ComposeVideoClipParams) {
  return composeVideoClipUseCase(params, {
    ...composeDependencies,
    now: () => Date.now(),
  });
}
