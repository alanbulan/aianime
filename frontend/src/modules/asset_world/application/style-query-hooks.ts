// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type {
  AssetWorldGateway,
  CreateStyleInput,
  UpdateStyleInput,
} from "@/modules/asset_world/application/ports";

export function createStyleQueryHooks(gateway: AssetWorldGateway) {
  function stylesQueryOptions() {
    return {
      queryKey: queryKeys.styles(),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        gateway.listStyles(signal),
    };
  }

  function useStyles() {
    return useQuery(stylesQueryOptions());
  }

  function useStyleDetail(styleId: string | null) {
    return useQuery({
      queryKey: queryKeys.style(styleId ?? "__none__"),
      queryFn: ({ signal }) =>
        gateway.getStyle(styleId as string, signal),
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

  function useUpdateStyle() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: UpdateStyleInput) => gateway.updateStyle(input),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["styles"] }),
    });
  }

  function useDeleteStyle() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ styleId }: { styleId: string }) =>
        gateway.deleteStyle(styleId),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: ["styles"] }),
    });
  }

  function useAnalyzeStyle(project: string) {
    return useMutation({
      mutationFn: (file: File) => gateway.analyzeStyle(project, file),
    });
  }

  function useUploadStylePreview() {
    return useMutation({
      mutationFn: (input: { file: File; styleId: string }) =>
        gateway.uploadStylePreview(input),
    });
  }

  return {
    stylesQueryOptions,
    useAnalyzeStyle,
    useCreateStyle,
    useDeleteStyle,
    useStyleDetail,
    useStyles,
    useUpdateStyle,
    useUploadStylePreview,
  };
}

export type StyleQueryHooks = ReturnType<typeof createStyleQueryHooks>;
