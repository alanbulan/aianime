// Copyright (c) 2026 AI anime
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import { patchBeatQueryCache } from "@/modules/production/application/beat-query-cache";
import type {
  ProductionVideoGateway,
  VideoReferenceBeatStatusResponse,
} from "@/modules/production/application/ports";
import type { VideoInputCropTarget } from "@/modules/production/domain/video-reference-panel";

function syncVideoReferenceAssetMutation(
  queryClient: QueryClient,
  project: string,
  episode: number,
  beatNumber: number,
  response: VideoReferenceBeatStatusResponse,
  invalidateNarratorVoice = false,
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.videoReferenceBeatStatus(project, episode, beatNumber),
  });
  if (invalidateNarratorVoice) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.narratorVoice(project),
    });
  }
  if (!response.ok) return;
  const configJson = response.data.video_config_json;
  if (!configJson) return;
  patchBeatQueryCache(queryClient, project, episode, beatNumber, {
    video_config_json: configJson,
  });
}

export function createVideoReferencePanelQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useVideoReferenceBeatStatus(
    project: string,
    episode: number,
    beatNumber: number,
    enabled: boolean,
  ) {
    return useQuery({
      queryKey: queryKeys.videoReferenceBeatStatus(project, episode, beatNumber),
      queryFn: ({ signal }) =>
        gateway.getVideoReferenceBeatStatus(
          project,
          episode,
          beatNumber,
          signal,
        ),
      enabled: enabled && !!project && !!episode && !!beatNumber,
    });
  }

  function useUploadVideoReferenceAsset(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ beatNum, file }: { beatNum: number; file: File }) =>
        gateway.uploadVideoReferenceAsset(project, episode, beatNum, file),
      onSuccess: (response, { beatNum }) => {
        syncVideoReferenceAssetMutation(
          queryClient,
          project,
          episode,
          beatNum,
          response,
        );
      },
    });
  }

  function useDeleteVideoReferenceAsset(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        beatNum,
        mediaKind,
        path,
      }: {
        beatNum: number;
        mediaKind: "images" | "videos" | "audios";
        path: string;
      }) =>
        gateway.deleteVideoReferenceAsset(
          project,
          episode,
          beatNum,
          mediaKind,
          path,
        ),
      onSuccess: (response, { beatNum }) => {
        syncVideoReferenceAssetMutation(
          queryClient,
          project,
          episode,
          beatNum,
          response,
        );
      },
    });
  }

  function useCropVideoReferenceAsset(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        beatNum,
        assetKey,
        sourcePath,
        crop,
        target = "reference_image",
      }: {
        beatNum: number;
        assetKey: string;
        sourcePath: string;
        crop: { x: number; y: number; width: number; height: number };
        target?: VideoInputCropTarget;
      }) =>
        gateway.cropVideoReferenceAsset(
          project,
          episode,
          beatNum,
          assetKey,
          sourcePath,
          target,
          crop,
        ),
      onSuccess: (response, { beatNum }) => {
        syncVideoReferenceAssetMutation(
          queryClient,
          project,
          episode,
          beatNum,
          response,
        );
      },
    });
  }

  function useTrimVideoReferenceAsset(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        beatNum,
        assetKey,
        sourcePath,
        startSeconds,
        durationSeconds,
      }: {
        beatNum: number;
        assetKey: string;
        sourcePath: string;
        startSeconds: number;
        durationSeconds: number;
      }) =>
        gateway.trimVideoReferenceAsset(
          project,
          episode,
          beatNum,
          assetKey,
          sourcePath,
          startSeconds,
          durationSeconds,
        ),
      onSuccess: (response, { beatNum }) => {
        syncVideoReferenceAssetMutation(
          queryClient,
          project,
          episode,
          beatNum,
          response,
          true,
        );
      },
    });
  }

  return {
    useVideoReferenceBeatStatus,
    useUploadVideoReferenceAsset,
    useDeleteVideoReferenceAsset,
    useCropVideoReferenceAsset,
    useTrimVideoReferenceAsset,
  };
}
