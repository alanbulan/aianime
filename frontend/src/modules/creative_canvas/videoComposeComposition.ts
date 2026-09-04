// Copyright (c) 2026 AI anime
import {
  composeCanvasVideo as composeCanvasVideoUseCase,
  type ComposeCanvasVideoParams,
} from "./application/composeCanvasVideo";
import {
  composeVideoClip as composeVideoClipUseCase,
  type ComposeVideoClipParams,
} from "./application/composeVideoClip";
import { freezoneGenerationTaskGateway } from "./infrastructure/freezoneGenerationTaskGateway";
import { freezoneVideoComposeGateway } from "./infrastructure/freezoneVideoComposeGateway";

const composeDependencies = {
  composeGateway: freezoneVideoComposeGateway,
  taskGateway: freezoneGenerationTaskGateway,
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
