// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type {
  AssetErrorResponse,
  AssetTaskResponse,
} from "@/modules/asset_world/application/ports";
import type {
  PropGateway,
  PropPayload,
} from "@/modules/asset_world/application/prop-gateway";

export function createPropQueryHooks(gateway: PropGateway) {
  function useProps(project: string) {
    return useQuery({
      queryKey: queryKeys.props(project),
      queryFn: ({ signal }) => gateway.listProps(project, signal),
      enabled: Boolean(project),
    });
  }

  function useCreateProp(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: PropPayload) => gateway.createProp(project, input),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.props(project) }),
    });
  }

  function useUpdateProp(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: Partial<PropPayload>) =>
        gateway.updateProp(project, name, input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.props(project) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.prop(project, name),
        });
      },
    });
  }

  function useDeleteProp(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (name: string) => gateway.deleteProp(project, name),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.props(project) }),
    });
  }

  function useGeneratePropReferenceAsync(project: string, name: string) {
    return useMutation<
      AssetTaskResponse | AssetErrorResponse,
      Error,
      { model?: string } | void
    >({
      mutationFn: (input) => gateway.scheduleReference(project, name, input),
    });
  }

  function useUploadPropReference(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) =>
        gateway.uploadReference(project, name, file),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.props(project) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.prop(project, name),
        });
      },
    });
  }

  function useBatchGeneratePropReferences(project: string) {
    const queryClient = useQueryClient();
    return useMutation<
      AssetTaskResponse | AssetErrorResponse,
      Error,
      { model?: string } | void
    >({
      mutationFn: (input) => gateway.scheduleBatchReferences(project, input),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) }),
    });
  }

  return {
    useBatchGeneratePropReferences,
    useCreateProp,
    useDeleteProp,
    useGeneratePropReferenceAsync,
    useProps,
    useUpdateProp,
    useUploadPropReference,
  };
}
