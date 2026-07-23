// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type {
  AssetWorldGateway,
  CreateStyleInput,
} from "@/modules/asset_world/application/ports";

export function createStyleQueryHooks(gateway: AssetWorldGateway) {
  function stylesQueryOptions(project?: string) {
    return {
      queryKey: queryKeys.styles(project),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        gateway.listStyles(project, signal),
    };
  }

  function useStyles(project?: string) {
    return useQuery(stylesQueryOptions(project));
  }

  function useStyleDetail(project: string, styleId: string | null) {
    return useQuery({
      queryKey: queryKeys.style(styleId ?? "__none__"),
      queryFn: ({ signal }) =>
        gateway.getStyle(project, styleId as string, signal),
      enabled: Boolean(styleId),
    });
  }

  function useCreateStyle() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: CreateStyleInput) => gateway.createStyle(input),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["styles"] }),
    });
  }

  function useDeleteStyle() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        styleId,
        project,
      }: {
        styleId: string;
        project?: string;
      }) => gateway.deleteStyle(styleId, project),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["styles"] }),
    });
  }

  function useAnalyzeStyle(project: string) {
    return useMutation({
      mutationFn: (file: File) => gateway.analyzeStyle(project, file),
    });
  }

  function useUploadStylePreview(project: string) {
    return useMutation({
      mutationFn: (input: { file: File; styleId: string }) =>
        gateway.uploadStylePreview(project, input),
    });
  }

  return {
    stylesQueryOptions,
    useAnalyzeStyle,
    useCreateStyle,
    useDeleteStyle,
    useStyleDetail,
    useStyles,
    useUploadStylePreview,
  };
}

export type StyleQueryHooks = ReturnType<typeof createStyleQueryHooks>;
