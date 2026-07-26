// Copyright (c) 2026 AI anime
import { submitFreezoneRedraw } from '@/api/ops';

import type { CanvasRedrawTaskGateway } from '../application/ports';
import { freezoneGenerationTaskGateway } from './freezoneGenerationTaskGateway';

export const freezoneRedrawTaskGateway: CanvasRedrawTaskGateway = {
  awaitCompletion: freezoneGenerationTaskGateway.awaitCompletion,
  fetchResultUrl: freezoneGenerationTaskGateway.fetchResultUrl,

  async submit(projectId, command) {
    return await submitFreezoneRedraw(projectId, {
      aspectRatio: command.aspectRatio,
      imageSize: command.imageSize,
      maskUrl: command.maskUrl,
      model: command.model,
      numImages: 1,
      prompt: command.prompt,
      sourceUrl: command.sourceUrl,
    });
  },
};
