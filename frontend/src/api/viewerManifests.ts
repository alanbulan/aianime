// Copyright (c) 2026 AI anime
import type {
  DirectorStageOverlayStatus,
} from "@/features/viewer-kit/three-d/directorManifest";
import { apiCall } from "@/shared/api/client";

export interface AiStagingPropResult {
  prop?: Record<string, unknown>;
  model?: string;
}

export async function getBeatDirectorStageOverlay(
  project: string,
  episode: number,
  beat: number,
): Promise<DirectorStageOverlayStatus> {
  return await apiCall<DirectorStageOverlayStatus>(
    `projects/${encodeURIComponent(project)}/episodes/${episode}/beats/${beat}/director-stage/overlay`,
  );
}

export async function saveBeatDirectorStageOverlay(
  project: string,
  episode: number,
  beat: number,
  payload: Record<string, unknown>,
): Promise<DirectorStageOverlayStatus> {
  return await apiCall<DirectorStageOverlayStatus>(
    `projects/${encodeURIComponent(project)}/episodes/${episode}/beats/${beat}/director-stage/overlay`,
    {
      method: "POST",
      json: payload,
    },
  );
}

export async function saveBeatDirectorControlFrame(
  project: string,
  episode: number,
  beat: number,
  payload: Record<string, unknown>,
): Promise<{
  dir: string;
  paths: Record<string, string>;
  rel_paths: Record<string, string>;
  urls?: Record<string, string>;
}> {
  return await apiCall<{
    dir: string;
    paths: Record<string, string>;
    rel_paths: Record<string, string>;
    urls?: Record<string, string>;
  }>(
    `projects/${encodeURIComponent(project)}/episodes/${episode}/beats/${beat}/director-stage/control-frame`,
    {
      method: "POST",
      json: payload,
    },
  );
}

export async function generateAiStagingProp(
  project: string,
  payload: Record<string, unknown>,
): Promise<AiStagingPropResult> {
  return await apiCall<AiStagingPropResult>(
    `projects/${encodeURIComponent(project)}/freezone/ai-staging-prop`,
    {
      method: "POST",
      json: payload,
    },
  );
}
