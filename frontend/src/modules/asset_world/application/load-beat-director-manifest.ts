// Copyright (c) 2026 AI anime
import type { DirectorStageManifest } from "@/features/viewer-kit/three-d/directorManifest";
import type { BeatViewerGateway } from "@/modules/asset_world/application/beat-viewer-gateway";

export interface LoadBeatDirectorManifestParams {
  project: string;
  episode: number;
  beatNumber: number;
}

type BeatDirectorManifestGateway = Pick<
  BeatViewerGateway,
  "getDirectorStageManifest"
>;

export async function loadBeatDirectorStageManifest(
  params: LoadBeatDirectorManifestParams,
  gateway: BeatDirectorManifestGateway,
): Promise<DirectorStageManifest> {
  const response = await gateway.getDirectorStageManifest(
    params.project,
    params.episode,
    params.beatNumber,
  );
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response.data;
}
