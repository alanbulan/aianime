// Copyright (c) 2026 AI anime
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type {
  CropSketchCommand,
  SaveSketchPoseEditorCommand,
} from "@/modules/production/domain/sketch-pose-editor";

function invalidateBeatImages(
  queryClient: QueryClient,
  project: string,
  episode: number,
  beatNum: number,
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.sketchPoseEditor(project, episode, beatNum),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.sketchCropSource(project, episode, beatNum),
  });
  queryClient.invalidateQueries({ queryKey: queryKeys.beats(project, episode) });
  queryClient.invalidateQueries({ queryKey: queryKeys.grids(project, episode) });
}

export function createSketchPoseEditorQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useSketchPoseEditor(
    project: string,
    episode: number,
    beatNum: number,
    enabled: boolean,
  ) {
    return useQuery({
      queryKey: queryKeys.sketchPoseEditor(project, episode, beatNum),
      queryFn: ({ signal }) =>
        gateway.getSketchPoseEditor(project, episode, beatNum, signal),
      enabled: !!project && episode > 0 && beatNum > 0 && enabled,
      staleTime: 0,
    });
  }

  function useSaveSketchPoseEditor(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (command: SaveSketchPoseEditorCommand) =>
        gateway.saveSketchPoseEditor(project, episode, command),
      onSuccess: (_response, command) => {
        invalidateBeatImages(
          queryClient,
          project,
          episode,
          command.beatNum,
        );
      },
    });
  }

  function useSketchCropSource(
    project: string,
    episode: number,
    beatNum: number,
    enabled: boolean,
  ) {
    return useQuery({
      queryKey: queryKeys.sketchCropSource(project, episode, beatNum),
      queryFn: ({ signal }) =>
        gateway.getSketchCropSource(project, episode, beatNum, signal),
      enabled: !!project && episode > 0 && beatNum > 0 && enabled,
    });
  }

  function useCropSketch(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (command: CropSketchCommand) =>
        gateway.cropSketch(project, episode, command),
      onSuccess: (_response, command) => {
        invalidateBeatImages(
          queryClient,
          project,
          episode,
          command.beatNum,
        );
      },
    });
  }

  return {
    useCropSketch,
    useSaveSketchPoseEditor,
    useSketchPoseEditor,
    useSketchCropSource,
  };
}
