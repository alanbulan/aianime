// Copyright (c) 2026 AI anime
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type {
  GenerateSketchesCommand,
  RegenerateGridCommand,
  RegenerateRenderBeatsCommand,
  RegenerateSketchesCommand,
} from "@/modules/production/domain/sketch-generation";

export function createSketchGenerationQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useGenerateSketches(project: string, episode: number) {
    return useMutation({
      mutationFn: (command?: GenerateSketchesCommand) =>
        gateway.generateSketches(project, episode, command),
    });
  }

  function useDirectorControlToSketch(
    project: string,
    episode: number,
    beatNumber: number,
  ) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () =>
        gateway.generateDirectorControlSketch(
          project,
          episode,
          beatNumber,
        ),
      onSuccess: (response) => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.directorControlFrame(
            project,
            episode,
            beatNumber,
          ),
        });
        if (!response.ok) return;
        queryClient.invalidateQueries({
          queryKey: queryKeys.grids(project, episode),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.beats(project, episode),
        });
      },
    });
  }

  function useRegenerateGrid(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: RegenerateGridCommand) =>
        gateway.regenerateGrid(project, episode, command),
    });
  }

  function useRegenerateSketches(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: RegenerateSketchesCommand) =>
        gateway.regenerateSketches(project, episode, command),
    });
  }

  function useRegenerateRenderBeats(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: RegenerateRenderBeatsCommand) =>
        gateway.regenerateRenderBeats(project, episode, command),
    });
  }

  return {
    useDirectorControlToSketch,
    useGenerateSketches,
    useRegenerateGrid,
    useRegenerateRenderBeats,
    useRegenerateSketches,
  };
}
