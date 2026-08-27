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
  GenerateNarratorVoiceDesignCommand,
  GenerateNarratorVoicePresetCommand,
} from "@/modules/production/domain/narrator-voice";

function invalidateNarratorVoiceQueries(
  queryClient: QueryClient,
  project: string,
) {
  queryClient.invalidateQueries({
    queryKey: queryKeys.narratorVoice(project),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.narratorVoiceSources(project),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.seedance2BeatStatusProject(project),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.audioBillingQuotes(project),
  });
  queryClient.invalidateQueries({
    queryKey: queryKeys.characterVoiceLibrary(project),
  });
}

export function createNarratorVoiceQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useNarratorVoiceStatus(project: string, enabled = true) {
    return useQuery({
      queryKey: queryKeys.narratorVoice(project),
      queryFn: ({ signal }) =>
        gateway.getNarratorVoiceStatus(project, signal),
      enabled: !!project && enabled,
    });
  }

  function useNarratorVoiceSources(project: string, enabled = true) {
    return useQuery({
      queryKey: queryKeys.narratorVoiceSources(project),
      queryFn: ({ signal }) =>
        gateway.listNarratorVoiceSources(project, signal),
      enabled: !!project && enabled,
    });
  }

  function useUploadNarratorVoice(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) => gateway.uploadNarratorVoice(project, file),
      onSuccess: () => invalidateNarratorVoiceQueries(queryClient, project),
    });
  }

  function useRecordNarratorVoice(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (dataUrl: string) =>
        gateway.recordNarratorVoice(project, dataUrl),
      onSuccess: () => invalidateNarratorVoiceQueries(queryClient, project),
    });
  }

  function useGenerateNarratorVoicePreset(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (command: GenerateNarratorVoicePresetCommand) =>
        gateway.generateNarratorVoicePreset(project, command),
      onSuccess: () => invalidateNarratorVoiceQueries(queryClient, project),
    });
  }

  function useDesignNarratorVoice(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (command: GenerateNarratorVoiceDesignCommand) =>
        gateway.designNarratorVoice(project, command),
      onSuccess: () => invalidateNarratorVoiceQueries(queryClient, project),
    });
  }

  function useCopyProjectNarratorVoice(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (sourcePath: string) =>
        gateway.copyProjectNarratorVoice(project, sourcePath),
      onSuccess: () => invalidateNarratorVoiceQueries(queryClient, project),
    });
  }

  function useTrimNarratorVoice(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        startSeconds,
        durationSeconds,
      }: {
        startSeconds: number;
        durationSeconds: number;
      }) =>
        gateway.trimNarratorVoice(project, startSeconds, durationSeconds),
      onSuccess: () => invalidateNarratorVoiceQueries(queryClient, project),
    });
  }

  function useDeleteNarratorVoice(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.deleteNarratorVoice(project),
      onSuccess: () => invalidateNarratorVoiceQueries(queryClient, project),
    });
  }

  return {
    useNarratorVoiceStatus,
    useNarratorVoiceSources,
    useUploadNarratorVoice,
    useRecordNarratorVoice,
    useGenerateNarratorVoicePreset,
    useDesignNarratorVoice,
    useCopyProjectNarratorVoice,
    useTrimNarratorVoice,
    useDeleteNarratorVoice,
  };
}
