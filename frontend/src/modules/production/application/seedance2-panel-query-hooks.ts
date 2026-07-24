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
  Seedance2BeatStatusResponse,
} from "@/modules/production/application/ports";
import type { VideoInputCropTarget } from "@/modules/production/domain/seedance2-panel";

function syncSeedance2AssetMutation(
  queryClient: QueryClient,
  project: string,
  episode: number,
  beatNumber: number,
  response: Seedance2BeatStatusResponse,
  invalidateNarratorVoice = false,
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.seedance2BeatStatus(project, episode, beatNumber),
  });
  if (invalidateNarratorVoice) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.narratorVoice(project),
    });
  }
  if (!response.ok) return;
  const configJson = response.data.seedance2_config_json;
  if (!configJson) return;
  patchBeatQueryCache(queryClient, project, episode, beatNumber, {
    seedance2_config_json: configJson,
  });
}

export function createSeedance2PanelQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useSeedance2BeatStatus(
    project: string,
    episode: number,
    beatNumber: number,
    enabled: boolean,
  ) {
    return useQuery({
      queryKey: queryKeys.seedance2BeatStatus(project, episode, beatNumber),
      queryFn: ({ signal }) =>
        gateway.getSeedance2BeatStatus(
          project,
          episode,
          beatNumber,
          signal,
        ),
      enabled: enabled && !!project && !!episode && !!beatNumber,
    });
  }

  function useUploadSeedance2Asset(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ beatNum, file }: { beatNum: number; file: File }) =>
        gateway.uploadSeedance2Asset(project, episode, beatNum, file),
      onSuccess: (response, { beatNum }) => {
        syncSeedance2AssetMutation(
          queryClient,
          project,
          episode,
          beatNum,
          response,
        );
      },
    });
  }

  function useDeleteSeedance2Asset(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        beatNum,
        mediaKind,
        path,
      }: {
        beatNum: number;
        mediaKind: "images" | "audios";
        path: string;
      }) =>
        gateway.deleteSeedance2Asset(
          project,
          episode,
          beatNum,
          mediaKind,
          path,
        ),
      onSuccess: (response, { beatNum }) => {
        syncSeedance2AssetMutation(
          queryClient,
          project,
          episode,
          beatNum,
          response,
        );
      },
    });
  }

  function useCropSeedance2Asset(project: string, episode: number) {
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
        gateway.cropSeedance2Asset(
          project,
          episode,
          beatNum,
          assetKey,
          sourcePath,
          target,
          crop,
        ),
      onSuccess: (response, { beatNum }) => {
        syncSeedance2AssetMutation(
          queryClient,
          project,
          episode,
          beatNum,
          response,
        );
      },
    });
  }

  function useTrimSeedance2Asset(project: string, episode: number) {
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
        gateway.trimSeedance2Asset(
          project,
          episode,
          beatNum,
          assetKey,
          sourcePath,
          startSeconds,
          durationSeconds,
        ),
      onSuccess: (response, { beatNum }) => {
        syncSeedance2AssetMutation(
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
    useSeedance2BeatStatus,
    useUploadSeedance2Asset,
    useDeleteSeedance2Asset,
    useCropSeedance2Asset,
    useTrimSeedance2Asset,
  };
}
