// Copyright (c) 2026 AI anime
import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";

export type DirectorStagePalette = DirectorStageManifest["palette"];

export interface GetCanvasDirectorStagePaletteParams {
  projectId: string;
}

export interface CanvasDirectorStagePaletteGateway {
  getPalette(projectId: string): Promise<DirectorStagePalette>;
}

export function getCanvasDirectorStagePalette(
  params: GetCanvasDirectorStagePaletteParams,
  gateway: CanvasDirectorStagePaletteGateway,
): Promise<DirectorStagePalette> {
  return gateway.getPalette(params.projectId);
}
