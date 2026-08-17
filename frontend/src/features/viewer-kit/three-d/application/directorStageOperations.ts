// Copyright (c) 2026 AI anime
import type {
  DirectorControlFrameBundle,
  DirectorStageOverlayStatus,
} from "../directorManifest";

export interface AiStagingPropResult {
  prop?: Record<string, unknown>;
  model?: string;
}

export interface DirectorControlFrameSaveResult extends Pick<
  DirectorControlFrameBundle,
  "dir" | "paths" | "rel_paths" | "urls"
> {
  background_anchor?: {
    render_anchor_id?: string;
    current_source?: string;
    current_anchor?: string;
  };
}

export interface BeatDirectorStageTarget {
  projectId: string;
  episode: number;
  beat: number;
}

export interface BeatDirectorStageGateway {
  getOverlay(
    target: BeatDirectorStageTarget,
  ): Promise<DirectorStageOverlayStatus>;
  saveOverlay(
    target: BeatDirectorStageTarget,
    payload: Record<string, unknown>,
  ): Promise<DirectorStageOverlayStatus>;
  saveControlFrame(
    target: BeatDirectorStageTarget,
    payload: Record<string, unknown>,
  ): Promise<DirectorControlFrameSaveResult>;
  generateAiStagingProp(
    projectId: string,
    payload: Record<string, unknown>,
  ): Promise<AiStagingPropResult>;
}

export function getBeatDirectorStageOverlay(
  target: BeatDirectorStageTarget,
  gateway: BeatDirectorStageGateway,
): Promise<DirectorStageOverlayStatus> {
  return gateway.getOverlay(target);
}

export function saveBeatDirectorStageOverlay(
  target: BeatDirectorStageTarget,
  payload: Record<string, unknown>,
  gateway: BeatDirectorStageGateway,
): Promise<DirectorStageOverlayStatus> {
  return gateway.saveOverlay(target, payload);
}

export function saveBeatDirectorControlFrame(
  target: BeatDirectorStageTarget,
  payload: Record<string, unknown>,
  gateway: BeatDirectorStageGateway,
): Promise<DirectorControlFrameSaveResult> {
  return gateway.saveControlFrame(target, payload);
}

export function generateAiStagingProp(
  projectId: string,
  payload: Record<string, unknown>,
  gateway: BeatDirectorStageGateway,
): Promise<AiStagingPropResult> {
  return gateway.generateAiStagingProp(projectId, payload);
}
