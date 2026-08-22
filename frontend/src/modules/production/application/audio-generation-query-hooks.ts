// Copyright (c) 2026 AI anime
import { useMutation, useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
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

  function useAudioBillingQuote(
    project: string,
    episode: number,
    command: GenerateAudioCommand = {},
    revision = "",
  ) {
    const beatNumbers = command.beatNumbers ?? [];
    const mode = command.mode ?? "sync_changed";
    return useQuery({
      queryKey: [
        ...queryKeys.audioBillingQuotes(project),
        episode,
        mode,
        beatNumbers.join(","),
        revision,
      ] as const,
      queryFn: ({ signal }) =>
        gateway.getEpisodeAudioBillingQuote(
          project,
          episode,
          {
            mode,
            ...(beatNumbers.length > 0 ? { beatNumbers } : {}),
          },
          signal,
        ),
      enabled: Boolean(project) && episode > 0,
    });
  }

  function useRegenerateBeatAudio(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: { beatNumber: number }) =>
        gateway.regenerateBeatAudio(
          project,
          episode,
          command.beatNumber,
        ),
    });
  }

  return { useAudioBillingQuote, useGenerateAudio, useRegenerateBeatAudio };
}
