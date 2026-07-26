// Copyright (c) 2026 AI anime
import { submitFreezoneVideoCompose } from "@/api/ops";

import type { VideoClipComposeGateway } from "../application/composeVideoClip";

export const freezoneVideoClipComposeGateway: VideoClipComposeGateway = {
  async submit(projectId, submission) {
    return await submitFreezoneVideoCompose(projectId, {
      resolution: submission.resolution,
      tracks: [
        {
          trackId: submission.trackId,
          kind: "video",
          items: [
            {
              itemId: submission.itemId,
              sourceUrl: submission.sourceUrl,
              timelineStart: 0,
              sourceStart: submission.sourceStartSeconds,
              sourceEnd: submission.sourceEndSeconds,
            },
          ],
        },
      ],
    });
  },
};
