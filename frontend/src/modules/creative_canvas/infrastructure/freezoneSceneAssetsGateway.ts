// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { CanvasSceneAssetsGateway } from "../application/sceneAssets";

export const freezoneSceneAssetsGateway: CanvasSceneAssetsGateway = {
  async getForBeat({ projectId, episode, beat }) {
    const query = new URLSearchParams();
    query.set("episode", String(episode));
    query.set("beat", String(beat));
    return await apiCall(
      `projects/${encodeURIComponent(projectId)}/freezone/scene-assets-for-beat?${query.toString()}`,
    );
  },
};
