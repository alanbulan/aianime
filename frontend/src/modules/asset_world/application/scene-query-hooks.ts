// Copyright (c) 2026 AI anime
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { PanoViewerManifest } from "@/features/viewer-kit/public";
import { queryKeys } from "@/lib/query-keys";
import type {
  AssetErrorResponse,
  AssetTaskResponse,
} from "@/modules/asset_world/application/ports";
import type {
  SceneDirectorWorldPayload,
  SceneGateway,
  ScenePayload,
} from "@/modules/asset_world/application/scene-gateway";
import type {
  ScenePanoSource,
  SceneStagePlySource,
} from "@/modules/asset_world/domain/scene";

export function createSceneQueryHooks(gateway: SceneGateway) {
  function useScenes(project: string) {
    return useQuery({
      queryKey: queryKeys.scenes(project),
      queryFn: ({ signal }) => gateway.listScenes(project, signal),
      enabled: Boolean(project),
    });
  }

  function useScenePlatePreview(
    project: string,
    sceneId: string,
    variantId: string,
    timeOfDay: string,
  ) {
    const trimmedSceneId = sceneId.trim();
    const trimmedVariantId = variantId.trim();
    const trimmedTimeOfDay = timeOfDay.trim();
    return useQuery({
      queryKey: queryKeys.scenePlatePreview(
        project,
        trimmedSceneId,
        trimmedVariantId,
        trimmedTimeOfDay,
      ),
      queryFn: ({ signal }) =>
        gateway.getPlatePreview(
          project,
          trimmedSceneId,
          trimmedVariantId,
          trimmedTimeOfDay,
          signal,
        ),
      enabled: Boolean(project && trimmedSceneId),
    });
  }

  function useScenePanoManifest(
    project: string,
    name: string,
    enabled = true,
  ) {
    return useQuery({
      queryKey: queryKeys.scenePanoManifest(project, name),
      queryFn: ({ signal }) => gateway.getPanoManifest(project, name, signal),
      enabled: enabled && Boolean(project && name),
    });
  }

  function useUpdateScenePanoCorrection(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (correction: PanoViewerManifest["correction"]) =>
        gateway.updatePanoCorrection(project, name, correction),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.scenePanoManifest(project, name),
        });
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key[0] === "projects" &&
              key[1] === project &&
              key.includes("pano-background-manifest")
            );
          },
        });
      },
    });
  }

  function useSceneDirectorStageManifest(
    project: string,
    name: string,
    enabled = true,
  ) {
    return useQuery({
      queryKey: queryKeys.sceneDirectorStageManifest(project, name),
      queryFn: ({ signal }) =>
        gateway.getDirectorStageManifest(project, name, signal),
      enabled: enabled && Boolean(project && name),
      staleTime: 0,
      refetchOnWindowFocus: true,
    });
  }

  function useSaveSceneDirectorWorld(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SceneDirectorWorldPayload) =>
        gateway.saveDirectorWorld(project, name, input),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.sceneDirectorStageManifest(project, name),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) });
      },
    });
  }

  function useClearSceneDirectorWorld(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (activeSourceId: string) =>
        gateway.clearDirectorWorld(project, name, activeSourceId),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.sceneDirectorStageManifest(project, name),
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) });
      },
    });
  }

  function useCreateScene(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: ScenePayload) => gateway.createScene(project, input),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  function useUpdateScene(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: Partial<ScenePayload>) =>
        gateway.updateScene(project, name, input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.scene(project, name),
        });
      },
    });
  }

  function useDeleteScene(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (name: string) => gateway.deleteScene(project, name),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  function useBuildScenes(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.buildScenes(project),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) }),
    });
  }

  function useUploadSceneMaster(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) => gateway.uploadMaster(project, name, file),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  function useGenerateSceneMasterAsync(project: string, name: string) {
    return useMutation<
      AssetTaskResponse | AssetErrorResponse,
      Error,
      { model?: string } | void
    >({
      mutationFn: (input) => gateway.scheduleMaster(project, name, input),
    });
  }

  function useDeleteSceneMaster(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.deleteMaster(project, name),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  function useGenerateSceneReverseAsync(project: string, name: string) {
    return useMutation<
      AssetTaskResponse | AssetErrorResponse,
      Error,
      { model?: string } | void
    >({
      mutationFn: (input) => gateway.scheduleReverse(project, name, input),
    });
  }

  function useUploadScenePano(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) => gateway.uploadPano(project, name, file),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  function useUploadSceneCustomPackage(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) =>
        gateway.uploadCustomPackage(project, name, file),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  function useDeleteSceneCustomPackage(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.deleteCustomPackage(project, name),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  function useGenerateScenePanoAsync(project: string, name: string) {
    return useMutation({
      mutationFn: ({ source, model }: { source: ScenePanoSource; model?: string }) =>
        gateway.schedulePano(project, name, source, model),
    });
  }

  function useGenerateScene3gsPlyAsync(project: string, name: string) {
    return useMutation({
      mutationFn: (source: SceneStagePlySource) =>
        gateway.scheduleStagePly(project, name, source),
    });
  }

  function useDeleteScenePano(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.deletePano(project, name),
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes(project) }),
    });
  }

  return {
    useBuildScenes,
    useClearSceneDirectorWorld,
    useCreateScene,
    useDeleteScene,
    useDeleteSceneCustomPackage,
    useDeleteSceneMaster,
    useDeleteScenePano,
    useGenerateScene3gsPlyAsync,
    useGenerateSceneMasterAsync,
    useGenerateScenePanoAsync,
    useGenerateSceneReverseAsync,
    useSaveSceneDirectorWorld,
    useSceneDirectorStageManifest,
    useScenePanoManifest,
    useScenePlatePreview,
    useScenes,
    useUpdateScene,
    useUpdateScenePanoCorrection,
    useUploadSceneCustomPackage,
    useUploadSceneMaster,
    useUploadScenePano,
  };
}

export type SceneQueryHooks = ReturnType<typeof createSceneQueryHooks>;
