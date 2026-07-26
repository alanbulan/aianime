// Copyright (c) 2026 AI anime
import {
  generateAiStagingProp as generateAiStagingPropUseCase,
  getBeatDirectorStageOverlay as getBeatDirectorStageOverlayUseCase,
  saveBeatDirectorControlFrame as saveBeatDirectorControlFrameUseCase,
  saveBeatDirectorStageOverlay as saveBeatDirectorStageOverlayUseCase,
} from "./application/directorStageOperations";
import { freezoneDirectorStageGateway } from "./infrastructure/freezoneDirectorStageGateway";

function beatTarget(projectId: string, episode: number, beat: number) {
  return { projectId, episode, beat };
}

export function getBeatDirectorStageOverlay(
  projectId: string,
  episode: number,
  beat: number,
) {
  return getBeatDirectorStageOverlayUseCase(
    beatTarget(projectId, episode, beat),
    freezoneDirectorStageGateway,
  );
}

export function saveBeatDirectorStageOverlay(
  projectId: string,
  episode: number,
  beat: number,
  payload: Record<string, unknown>,
) {
  return saveBeatDirectorStageOverlayUseCase(
    beatTarget(projectId, episode, beat),
    payload,
    freezoneDirectorStageGateway,
  );
}

export function saveBeatDirectorControlFrame(
  projectId: string,
  episode: number,
  beat: number,
  payload: Record<string, unknown>,
) {
  return saveBeatDirectorControlFrameUseCase(
    beatTarget(projectId, episode, beat),
    payload,
    freezoneDirectorStageGateway,
  );
}

export function generateAiStagingProp(
  projectId: string,
  payload: Record<string, unknown>,
) {
  return generateAiStagingPropUseCase(
    projectId,
    payload,
    freezoneDirectorStageGateway,
  );
}
