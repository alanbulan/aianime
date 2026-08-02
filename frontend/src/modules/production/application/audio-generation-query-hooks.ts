// Copyright (c) 2026 AI anime
import { useMutation } from "@tanstack/react-query";

import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type { GenerateAudioCommand } from "@/modules/production/domain/audio-generation";

export function createAudioGenerationQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useGenerateAudio(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: GenerateAudioCommand) =>
        gateway.generateEpisodeAudio(project, episode, command),
    });
  }

  function useRegenerateBeatAudio(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: { beatNumber: number; model: string }) =>
        gateway.regenerateBeatAudio(
          project,
          episode,
          command.beatNumber,
          command.model,
        ),
    });
  }

  return { useGenerateAudio, useRegenerateBeatAudio };
}
