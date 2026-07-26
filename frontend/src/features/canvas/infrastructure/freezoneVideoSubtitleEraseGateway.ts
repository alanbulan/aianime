// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { VideoSubtitleEraseGateway } from "../application/eraseVideoSubtitles";
import type { CanvasGenerationTaskRef } from "../application/ports";

export const freezoneVideoSubtitleEraseGateway: VideoSubtitleEraseGateway = {
  async submit(projectId, submission) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/video/erase`,
      {
        method: "POST",
        json: {
          source_url: submission.sourceUrl,
          mode: submission.mode,
          ...(submission.mode === "box" && submission.box
            ? {
                box_x: submission.box.x,
                box_y: submission.box.y,
                box_width: submission.box.width,
                box_height: submission.box.height,
              }
            : {}),
        },
      },
    );
  },
};
