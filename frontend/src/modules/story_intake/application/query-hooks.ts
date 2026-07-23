import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { StoryIntakeGateway } from "@/modules/story_intake/application/ports";
import type { ChaptersResult } from "@/modules/story_intake/domain/types";

export function createStoryIntakeQueryHooks(gateway: StoryIntakeGateway) {
  function useUploadNovel(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) => gateway.uploadNovel(project, file),
      onSuccess: (preview) => {
        if (
          Array.isArray(preview.chapters) &&
          typeof preview.total_chars === "number"
        ) {
          queryClient.setQueryData<ChaptersResult>(
            queryKeys.chapters(project),
            {
              chapters: preview.chapters,
              total_chars: preview.total_chars,
              billable_chars: preview.billable_chars,
              count: preview.count,
              preview_only: true,
            },
          );
          return;
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.chapters(project) });
      },
    });
  }

  function useChapters(project: string, enabled = true) {
    return useQuery({
      queryKey: queryKeys.chapters(project),
      queryFn: ({ signal }) => gateway.getChapters(project, signal),
      enabled: !!project && enabled,
    });
  }

  function useKnowledgeGraph(project: string, enabled = true) {
    return useQuery({
      queryKey: queryKeys.knowledgeGraph(project),
      queryFn: ({ signal }) => gateway.getKnowledgeGraph(project, signal),
      enabled: !!project && enabled,
      staleTime: 30_000,
    });
  }

  function useStartIngest(project: string) {
    return useMutation({
      mutationFn: (params: Parameters<StoryIntakeGateway["startIngestion"]>[1]) =>
        gateway.startIngestion(project, params),
    });
  }

  return {
    useChapters,
    useKnowledgeGraph,
    useStartIngest,
    useUploadNovel,
  };
}

export type StoryIntakeQueryHooks = ReturnType<
  typeof createStoryIntakeQueryHooks
>;
