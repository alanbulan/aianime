// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AssetImageSourceGateway } from "@/modules/asset_world/application/ports";
import type { AssetImageSourceKind } from "@/modules/asset_world/domain/character";

const characterImageSelectionQueryKey = (project: string) =>
  ["projects", project, "character-image-selection"] as const;

const assetImageSourceSelectionQueryKey = (
  project: string,
  kind: AssetImageSourceKind,
) => ["projects", project, "image-source-selection", kind] as const;

export function createImageSourceQueryHooks(
  gateway: AssetImageSourceGateway,
) {
  function useAssetImageSourceSelection(
    project: string,
    kind: AssetImageSourceKind,
  ) {
    return useQuery({
      queryKey: assetImageSourceSelectionQueryKey(project, kind),
      queryFn: ({ signal }) =>
        gateway.getAssetImageSourceSelection(project, kind, signal),
      enabled: Boolean(project && kind),
    });
  }

  function useCharacterImageSelection(project: string) {
    return useQuery({
      queryKey: characterImageSelectionQueryKey(project),
      queryFn: ({ signal }) =>
        gateway.getCharacterImageSelection(project, signal),
      enabled: Boolean(project),
    });
  }

  function useUpdateAssetImageSourceSelection(
    project: string,
    kind: AssetImageSourceKind,
  ) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (imageSourceSelection: string) =>
        gateway.updateAssetImageSourceSelection(
          project,
          kind,
          imageSourceSelection,
        ),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: assetImageSourceSelectionQueryKey(project, kind),
        });
        if (kind === "character") {
          queryClient.invalidateQueries({
            queryKey: characterImageSelectionQueryKey(project),
          });
        }
      },
    });
  }

  return {
    useAssetImageSourceSelection,
    useCharacterImageSelection,
    useUpdateAssetImageSourceSelection,
  };
}

export type ImageSourceQueryHooks = ReturnType<
  typeof createImageSourceQueryHooks
>;
