// Copyright (c) 2026 AI anime
import { useMutation } from "@tanstack/react-query";

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
    useGenerateSketches,
    useRegenerateGrid,
    useRegenerateRenderBeats,
    useRegenerateSketches,
  };
}
