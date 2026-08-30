// Copyright (c) 2026 AI anime
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { patchBeatQueryCache } from "@/modules/production/application/beat-query-cache";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type {
  GenerateSeedance2PromptCommand,
  RegenerateBeatVideoCommand,
  VideoPromptLanguage,
} from "@/modules/production/domain/video-generation";

export interface VideoGenerationQueryDependencies {
  gateway: ProductionVideoGateway;
  currentPromptLanguage(): VideoPromptLanguage;
}

export function createVideoGenerationQueryHooks(
  dependencies: VideoGenerationQueryDependencies,
) {
  const { gateway, currentPromptLanguage } = dependencies;

  function useProductionWorkflow(project: string, episode: number) {
    return useMutation({
      mutationFn: () => gateway.runProductionWorkflow(project, episode),
    });
  }

  function useGlobalOptimize(project: string, episode: number) {
    return useMutation({
      mutationFn: () =>
        gateway.optimizeEpisodeVideo(
          project,
          episode,
          currentPromptLanguage(),
        ),
    });
  }

  function useGenerateSeedance2Prompt(project: string, episode: number) {
    return useMutation({
      mutationFn: (command: GenerateSeedance2PromptCommand) =>
        gateway.generateSeedance2Prompt(project, episode, command),
    });
  }

  function useGenerateBeatVideoPrompt(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ beatNum }: { beatNum: number }) =>
        gateway.generateBeatVideoPrompt(
          project,
          episode,
          beatNum,
          currentPromptLanguage(),
        ),
      onSuccess: (response, { beatNum }) => {
        if (!response.ok || !("data" in response)) return;
        patchBeatQueryCache(
          queryClient,
          project,
          episode,
          beatNum,
          response.data.beat,
        );
      },
    });
  }

  function useRegenerateBeatVideo(project: string, episode: number) {
    // Task completion owns cache invalidation; this mutation only returns the start ack.
    return useMutation({
      mutationFn: (command: RegenerateBeatVideoCommand) =>
        gateway.regenerateBeatVideo(project, episode, command),
    });
  }

  return {
    useProductionWorkflow,
    useGlobalOptimize,
    useGenerateSeedance2Prompt,
    useGenerateBeatVideoPrompt,
    useRegenerateBeatVideo,
  };
}
