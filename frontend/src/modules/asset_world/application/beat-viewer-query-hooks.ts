// Copyright (c) 2026 AI anime
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { BeatViewerGateway } from "@/modules/asset_world/application/beat-viewer-gateway";
import type { AssetResponse } from "@/modules/asset_world/application/ports";
import type {
  BeatBackgroundAnchorCropCommand,
  BeatBackgroundAnchors,
} from "@/modules/asset_world/domain/beat-viewer";

function synchronizeBackgroundQueries(
  queryClient: QueryClient,
  project: string,
  episode: number,
  beatNumber: number,
  response: AssetResponse<BeatBackgroundAnchors>,
) {
  const key = queryKeys.beatBackgroundAnchors(
    project,
    episode,
    beatNumber,
  );
  if (response.ok) {
    queryClient.setQueryData(key, response);
  }
  queryClient.invalidateQueries({ queryKey: key });
  queryClient.invalidateQueries({
    queryKey: queryKeys.beats(project, episode),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.grids(project, episode),
  });
}

export function createBeatViewerQueryHooks(gateway: BeatViewerGateway) {
  function useBeatDirectorStageManifest(
    project: string,
    episode: number,
    beatNumber: number,
    enabled = true,
  ) {
    return useQuery({
      queryKey: queryKeys.beatDirectorStageManifest(
        project,
        episode,
        beatNumber,
      ),
      queryFn: ({ signal }) =>
        gateway.getDirectorStageManifest(
          project,
          episode,
          beatNumber,
          signal,
        ),
      enabled: enabled && Boolean(project) && episode > 0 && beatNumber > 0,
      staleTime: 0,
      refetchOnWindowFocus: true,
    });
  }

  function useBeatBackgroundAnchors(
    project: string,
    episode: number,
    beatNumber: number,
  ) {
    return useQuery({
      queryKey: queryKeys.beatBackgroundAnchors(project, episode, beatNumber),
      queryFn: ({ signal }) =>
        gateway.getBackgroundAnchors(project, episode, beatNumber, signal),
      enabled: Boolean(project) && episode > 0 && beatNumber > 0,
      staleTime: 0,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    });
  }

  function useUpdateBeatBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
  ) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ anchorId }: { anchorId: string }) =>
        gateway.updateBackgroundAnchor(
          project,
          episode,
          beatNumber,
          anchorId,
        ),
      onSuccess: (response) =>
        synchronizeBackgroundQueries(
          queryClient,
          project,
          episode,
          beatNumber,
          response,
        ),
    });
  }

  function useUploadBeatBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
  ) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ file }: { file: File }) =>
        gateway.uploadBackgroundAnchor(project, episode, beatNumber, file),
      onSuccess: (response) =>
        synchronizeBackgroundQueries(
          queryClient,
          project,
          episode,
          beatNumber,
          response,
        ),
    });
  }

  function useCropBeatBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
  ) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (command: BeatBackgroundAnchorCropCommand) =>
        gateway.cropBackgroundAnchor(
          project,
          episode,
          beatNumber,
          command,
        ),
      onSuccess: (response) =>
        synchronizeBackgroundQueries(
          queryClient,
          project,
          episode,
          beatNumber,
          response,
        ),
    });
  }

  function useDirectorControlFrameStatus(
    project: string,
    episode: number,
    beatNumber: number,
  ) {
    return useQuery({
      queryKey: queryKeys.directorControlFrame(project, episode, beatNumber),
      queryFn: ({ signal }) =>
        gateway.getDirectorControlFrameStatus(
          project,
          episode,
          beatNumber,
          signal,
        ),
      enabled: Boolean(project) && episode > 0 && beatNumber > 0,
    });
  }

  return {
    useBeatBackgroundAnchors,
    useBeatDirectorStageManifest,
    useCropBeatBackgroundAnchor,
    useDirectorControlFrameStatus,
    useUpdateBeatBackgroundAnchor,
    useUploadBeatBackgroundAnchor,
  };
}

export type BeatViewerQueryHooks = ReturnType<
  typeof createBeatViewerQueryHooks
>;
