// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasImageTo3dSubmissionGateway } from "../application/generateCanvasImageTo3d";
import type { CanvasGenerationTaskRef } from "@/modules/creative_canvas/public";

export const freezoneImageTo3dGenerationGateway: CanvasImageTo3dSubmissionGateway = {
  async submit(projectId, command) {
    return await apiCall<CanvasGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/image-to-3gs`,
      {
        method: "POST",
        json: {
          source_url: command.sourceUrl,
          source_kind: command.sourceKind,
          ...(command.canvasId ? { canvas_id: command.canvasId } : {}),
          ...(command.nodeId ? { node_id: command.nodeId } : {}),
        },
      },
    );
  },
};
