import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { OkResponse } from "@/types/api";
import { queryKeys } from "@/lib/query-keys";
import type { StoryIntakeGateway } from "@/modules/story_intake/application/ports";
import type { ChaptersResult } from "@/modules/story_intake/domain/types";

export function createStoryIntakeQueryHooks(gateway: StoryIntakeGateway) {
  function useUploadNovel(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (file: File) => {
        const response = await gateway.uploadNovel(project, file);
        if (!response.ok) throw new Error(response.error);
        return response;
      },
      onSuccess: (response) => {
        const preview = response.data;
        if (
          Array.isArray(preview.chapters) &&
          typeof preview.total_chars === "number"
        ) {
          queryClient.setQueryData<OkResponse<ChaptersResult>>(
            queryKeys.chapters(project),
            {
              ok: true,
              data: {
                chapters: preview.chapters,
                total_chars: preview.total_chars,
                billable_chars: preview.billable_chars,
                count: preview.count,
                preview_only: true,
              },
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
      mutationFn: async (
        params: Parameters<StoryIntakeGateway["startIngestion"]>[1],
      ) => {
        const response = await gateway.startIngestion(project, params);
        if (!response.ok) throw new Error(response.error);
        return response;
      },
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
