// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  CanvasDirectorStagePaletteGateway,
  DirectorStagePalette,
} from "../application/directorStagePalette";

export const freezoneDirectorStagePaletteGateway: CanvasDirectorStagePaletteGateway = {
  async getPalette(projectId) {
    return await apiCall<DirectorStagePalette>(
      `projects/${encodeURIComponent(projectId)}/director-stage/palette`,
    );
  },
};
