// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type { DirectorStageOverlayStatus } from "../directorManifest";
import type {
  AiStagingPropResult,
  BeatDirectorStageGateway,
  DirectorControlFrameSaveResult,
} from "../application/directorStageOperations";

function beatDirectorPath(
  projectId: string,
  episode: number,
  beat: number,
  suffix: string,
): string {
  return `projects/${encodeURIComponent(projectId)}/episodes/${episode}/beats/${beat}/director-stage/${suffix}`;
}

export const freezoneDirectorStageGateway: BeatDirectorStageGateway = {
  async getOverlay(target) {
    return await apiCall<DirectorStageOverlayStatus>(
      beatDirectorPath(
        target.projectId,
        target.episode,
        target.beat,
        "overlay",
      ),
    );
  },
  async saveOverlay(target, payload) {
    return await apiCall<DirectorStageOverlayStatus>(
      beatDirectorPath(
        target.projectId,
        target.episode,
        target.beat,
        "overlay",
      ),
      { method: "POST", json: payload },
    );
  },
  async saveControlFrame(target, payload) {
    return await apiCall<DirectorControlFrameSaveResult>(
      beatDirectorPath(
        target.projectId,
        target.episode,
        target.beat,
        "control-frame",
      ),
      { method: "POST", json: payload },
    );
  },
  async generateAiStagingProp(projectId, payload) {
    return await apiCall<AiStagingPropResult>(
      `projects/${encodeURIComponent(projectId)}/freezone/ai-staging-prop`,
      { method: "POST", json: payload },
    );
  },
};
