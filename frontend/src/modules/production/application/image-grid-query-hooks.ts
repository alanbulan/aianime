// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type {
  GridCutCommand,
  GridPromptQuery,
  GridSketchPreviewQuery,
  GridUploadCommand,
  ImageGridType,
} from "@/modules/production/domain/image-grid";

type GridUploadMutation = Omit<GridUploadCommand, "gridType"> & {
  file: File;
  gridType?: ImageGridType;
};

type GridPromptMutation = Omit<GridPromptQuery, "gridType"> & {
  gridType?: ImageGridType;
};

type GridCutMutation = Omit<GridCutCommand, "gridType"> & {
  gridType?: ImageGridType;
};

export function createImageGridQueryHooks(gateway: ProductionVideoGateway) {
  function useUploadGrid(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        file,
        gridType = "render",
        ...command
      }: GridUploadMutation) =>
        gateway.uploadGrid(project, episode, { ...command, gridType }, file),
      onSuccess: (response) => {
        if (!response.ok) return;
        queryClient.invalidateQueries({
          queryKey: queryKeys.grids(project, episode),
        });
      },
    });
  }

  function useSketchGridPreview(
    project: string,
    episode: number,
    command: GridSketchPreviewQuery & { enabled: boolean },
  ) {
    return useQuery({
      queryKey: queryKeys.sketchGridPreview(
        project,
        episode,
        command.gridIndex,
        command.rows,
        command.cols,
        command.beatNumbers,
      ),
      queryFn: ({ signal }) =>
        gateway.getSketchGridPreview(project, episode, command, signal),
      enabled:
        command.enabled &&
        !!project &&
        episode > 0 &&
        command.beatNumbers.length > 0,
    });
  }

  function useExportGridPrompt(project: string, episode: number) {
    return useMutation({
      mutationFn: ({ gridType = "render", ...query }: GridPromptMutation) =>
        gateway.exportGridPrompt(project, episode, { ...query, gridType }),
    });
  }

  function useCutGrid(project: string, episode: number) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ gridType = "sketch", ...command }: GridCutMutation) =>
        gateway.cutGrid(project, episode, { ...command, gridType }),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.grids(project, episode),
        });
      },
    });
  }

  return {
    useCutGrid,
    useExportGridPrompt,
    useSketchGridPreview,
    useUploadGrid,
  };
}
