// Copyright (c) 2026 AI anime
import { submitFreezoneImageTo3GS } from "@/api/ops";

import type { CanvasImageTo3dSubmissionGateway } from "../application/generateCanvasImageTo3d";

export const freezoneImageTo3dGenerationGateway: CanvasImageTo3dSubmissionGateway = {
  async submit(projectId, command) {
    return await submitFreezoneImageTo3GS(projectId, {
      sourceUrl: command.sourceUrl,
      sourceKind: command.sourceKind,
      canvasId: command.canvasId,
      nodeId: command.nodeId,
    });
  },
};
