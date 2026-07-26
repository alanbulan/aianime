// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasScene360GenerationGateway } from "../application/generateCanvasScene360";
import type { CanvasGenerationTaskRef } from "../application/ports";
import { ensureBackendImageUrl } from "./freezoneAssetGateway";

export const freezoneScene360GenerationGateway: CanvasScene360GenerationGateway = {
  async submit(projectId, command) {
    const referenceUrl = await ensureBackendImageUrl(
      projectId,
      command.referenceUrl,
    );
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/scene-360`,
      {
        method: "POST",
        json: {
          reference_url: referenceUrl,
          image_size: "2K",
          mode: "candidate",
          aspect_ratio: command.aspectRatio,
        },
      },
    );
  },
};
