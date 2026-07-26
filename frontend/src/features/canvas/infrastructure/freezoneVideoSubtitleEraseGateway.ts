// Copyright (c) 2026 AI anime
import { submitFreezoneVideoErase } from "@/api/ops";

import type { VideoSubtitleEraseGateway } from "../application/eraseVideoSubtitles";

export const freezoneVideoSubtitleEraseGateway: VideoSubtitleEraseGateway = {
  async submit(projectId, submission) {
    return await submitFreezoneVideoErase(projectId, {
      sourceUrl: submission.sourceUrl,
      mode: submission.mode,
      box: submission.box,
    });
  },
};
