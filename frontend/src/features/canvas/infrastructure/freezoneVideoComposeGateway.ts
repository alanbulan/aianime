// Copyright (c) 2026 AI anime
import { submitFreezoneVideoCompose } from "@/api/ops";

import type { CanvasVideoComposeGateway } from "../application/composeCanvasVideo";

export const freezoneVideoComposeGateway: CanvasVideoComposeGateway = {
  async submit(projectId, request) {
    return await submitFreezoneVideoCompose(projectId, request);
  },
};
