// Copyright (c) 2026 AI anime
import {
  submitFreezoneRedraw,
  type FreezoneRedrawAspectRatio,
} from '@/api/ops';

import type { CanvasRedrawTaskGateway } from '../application/ports';
import { freezoneGenerationTaskGateway } from './freezoneGenerationTaskGateway';

export const freezoneRedrawTaskGateway: CanvasRedrawTaskGateway = {
  awaitCompletion: freezoneGenerationTaskGateway.awaitCompletion,
  fetchResultUrl: freezoneGenerationTaskGateway.fetchResultUrl,

  async submit(projectId, command) {
    return await submitFreezoneRedraw(projectId, {
      aspectRatio: command.aspectRatio as FreezoneRedrawAspectRatio,
      imageSize: command.imageSize,
      maskUrl: command.maskUrl,
      numImages: 1,
      sourceUrl: command.sourceUrl,
    });
  },
};
