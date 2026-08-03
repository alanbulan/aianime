// Copyright (c) 2026 AI anime

export interface DirectorStagePalette {
  actors: Array<{ identity_id: string; label: string; color: string }>;
  props: Array<{ prop_id: string; label: string; color: string }>;
  anonymous_colors: string[];
  anonymous_prop_colors: string[];
}

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
