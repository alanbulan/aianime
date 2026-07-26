// Copyright (c) 2026 AI anime
import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";

export interface GetCanvasBeatDirectorManifestParams {
  projectId: string;
  episode: number;
  beat: number;
}

export interface CanvasBeatDirectorManifestGateway {
  getBeatManifest(
    params: GetCanvasBeatDirectorManifestParams,
  ): Promise<DirectorStageManifest>;
}

export function getCanvasBeatDirectorManifest(
  params: GetCanvasBeatDirectorManifestParams,
  gateway: CanvasBeatDirectorManifestGateway,
): Promise<DirectorStageManifest> {
  return gateway.getBeatManifest(params);
}
