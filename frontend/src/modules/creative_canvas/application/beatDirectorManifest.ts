// Copyright (c) 2026 AI anime

export interface GetCanvasBeatDirectorManifestParams {
  projectId: string;
  episode: number;
  beat: number;
}

export interface CanvasBeatDirectorManifestGateway<TManifest> {
  getBeatManifest(
    params: GetCanvasBeatDirectorManifestParams,
  ): Promise<TManifest>;
}

export function getCanvasBeatDirectorManifest<TManifest>(
  params: GetCanvasBeatDirectorManifestParams,
  gateway: CanvasBeatDirectorManifestGateway<TManifest>,
): Promise<TManifest> {
  return gateway.getBeatManifest(params);
}
