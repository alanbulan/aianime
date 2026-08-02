// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { FreezoneContextQueryGateway } from "../application/contextQueries";
import type {
  FreezoneBeatContextResponse,
  FreezoneProjectAsset,
} from "../domain/beatContext";

export const httpFreezoneContextQueryGateway: FreezoneContextQueryGateway = {
  async listProjectAssets(projectId, options) {
    return await apiCall<FreezoneProjectAsset[]>(
      `projects/${encodeURIComponent(projectId)}/freezone/assets`,
      options?.signal ? { signal: options.signal } : undefined,
    );
  },

  async listBeatContext(projectId, options) {
    const params = new URLSearchParams();
    if (typeof options?.episode === "number") {
      params.set("episode", String(options.episode));
    }
    if (typeof options?.beat === "number") {
      params.set("beat", String(options.beat));
    }
    const query = params.toString();
    return await apiCall<FreezoneBeatContextResponse>(
      `projects/${encodeURIComponent(projectId)}/freezone/assets/beat-context${query ? `?${query}` : ""}`,
      options?.signal ? { signal: options.signal } : undefined,
    );
  },
};
