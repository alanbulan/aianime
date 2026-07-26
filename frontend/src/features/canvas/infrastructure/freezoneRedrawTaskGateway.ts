// Copyright (c) 2026 AI anime
import { apiCall } from '@/shared/api/client';

import type {
  CanvasGenerationTaskRef,
  CanvasRedrawTaskGateway,
} from '../application/ports';
import { freezoneGenerationTaskGateway } from './freezoneGenerationTaskGateway';

export const freezoneRedrawTaskGateway: CanvasRedrawTaskGateway = {
  awaitCompletion: freezoneGenerationTaskGateway.awaitCompletion,
  fetchResultUrl: freezoneGenerationTaskGateway.fetchResultUrl,

  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/redraw`,
      {
        method: 'POST',
        json: {
          source_url: command.sourceUrl,
          mask_url: command.maskUrl ?? null,
          prompt: command.prompt ?? '',
          aspect_ratio: command.aspectRatio,
          num_images: 1,
          image_size: command.imageSize,
          ...(command.model ? { model: command.model } : {}),
        },
      },
    );
  },
};
