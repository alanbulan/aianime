// Copyright (c) 2026 AI anime
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { Beat } from "@/modules/narrative_planning/public";
import type {
  ProductionDataResponse,
  ProductionVideoGateway,
  Seedance2BeatStatusResponse,
} from "@/modules/production/application/ports";
import type { VideoInputCropTarget } from "@/modules/production/domain/seedance2-panel";

function patchSeedance2BeatConfig(
  queryClient: QueryClient,
  project: string,
  episode: number,
  beatNumber: number,
  configJson: string,
) {
  if (!configJson) return;
  queryClient.setQueryData<ProductionDataResponse<Beat[]>>(
    queryKeys.beats(project, episode),
    (old) => {
      if (!old?.data) return old;
      return {
        ...old,
        data: old.data.map((beat) =>
          beat.beat_number === beatNumber
            ? { ...beat, seedance2_config_json: configJson }
            : beat,
        ),
      };
    },
  );
}

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
  patchSeedance2BeatConfig(
    queryClient,
    project,
    episode,
    beatNumber,
    response.data.seedance2_config_json,
  );
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
