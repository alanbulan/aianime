// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ProductionVideoGateway } from "@/modules/production/application/ports";
import type {
  UpdateRenderSettingsCommand,
  UpdateSketchSettingsCommand,
} from "@/modules/production/domain/image-settings";

export function createImageSettingsQueryHooks(
  gateway: ProductionVideoGateway,
) {
  function useRenderSettings(project: string) {
    return useQuery({
      queryKey: queryKeys.renderSettings(project),
      queryFn: ({ signal }) => gateway.getRenderSettings(project, signal),
      enabled: !!project,
    });
  }

  function useUpdateRenderSettings(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (command: UpdateRenderSettingsCommand) =>
        gateway.updateRenderSettings(project, command),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.renderSettings(project),
        });
      },
    });
  }

  function useSketchSettings(project: string) {
    return useQuery({
      queryKey: queryKeys.sketchSettings(project),
      queryFn: ({ signal }) => gateway.getSketchSettings(project, signal),
      enabled: !!project,
    });
  }

  function useUpdateSketchSettings(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (command: UpdateSketchSettingsCommand) =>
        gateway.updateSketchSettings(project, command),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.sketchSettings(project),
        });
      },
    });
  }

  return {
    useRenderSettings,
    useUpdateRenderSettings,
    useSketchSettings,
    useUpdateSketchSettings,
  };
}
