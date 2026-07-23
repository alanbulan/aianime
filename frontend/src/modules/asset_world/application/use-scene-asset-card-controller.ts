// Copyright (c) 2026 AI anime
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PanoCaptureResult } from "@/features/viewer-kit/pano/panoManifest";
import type { ThreeDSceneSnapshot } from "@/features/viewer-kit/three-d/engine/viewerApp";
import { useTaskController } from "@/hooks/use-task-controller";
import { queryKeys } from "@/lib/query-keys";
import {
  sceneReferenceAssetScope,
  stageAssetScope,
} from "@/lib/task-scope";
import { isErrorDataResponse } from "@/modules/asset_world/application/response";
import type { SceneQueryHooks } from "@/modules/asset_world/application/scene-query-hooks";
import type {
  SceneAsset,
  ScenePanoSource,
  SceneStagePlySource,
} from "@/modules/asset_world/domain/scene";
import { backendErrorToastMessage } from "@/shared/api/errors";
import { resolveMediaUrl } from "@/lib/media-url";

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
}

export interface SceneAssetCardControllerDependencies {
  downloadBlob(blob: Blob, filename: string): void;
  openSceneFreezone(project: string, sceneName: string): Promise<void>;
  useGenerationCreditCost(kind: string, value: string): CreditCostQuery;
}

export interface SceneAssetCardControllerOptions {
  imageSourceSelection: string;
  onDelete(): void;
  onEdit(): void;
  project: string;
  referenceCount: number;
  scene: SceneAsset;
}

export function createUseSceneAssetCardController(
  sceneQueries: SceneQueryHooks,
  dependencies: SceneAssetCardControllerDependencies,
) {
  return function useSceneAssetCardController({
    imageSourceSelection,
    onDelete,
    onEdit,
    project,
    referenceCount,
    scene,
  }: SceneAssetCardControllerOptions) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [stagePlySource, setStagePlySource] =
      useState<SceneStagePlySource | null>(null);
    const masterInputRef = useRef<HTMLInputElement>(null);
    const panoInputRef = useRef<HTMLInputElement>(null);
    const customInputRef = useRef<HTMLInputElement>(null);
    const [freezonePending, setFreezonePending] = useState(false);
    const [panoDialogOpen, setPanoDialogOpen] = useState(false);
    const [stageDialogOpen, setStageDialogOpen] = useState(false);
    const [stageViewerOpening, setStageViewerOpening] = useState(false);
    const panoManifest = sceneQueries.useScenePanoManifest(
      project,
      scene.name,
      panoDialogOpen,
    );
    const stageManifest = sceneQueries.useSceneDirectorStageManifest(
      project,
      scene.name,
      stageDialogOpen,
    );
    const sceneDirectorManifest = stageManifest.data?.ok
      ? stageManifest.data.data
      : null;
    const uploadMaster = sceneQueries.useUploadSceneMaster(project, scene.name);
    const uploadPano = sceneQueries.useUploadScenePano(project, scene.name);
    const uploadCustom = sceneQueries.useUploadSceneCustomPackage(
      project,
      scene.name,
    );
    const deleteMaster = sceneQueries.useDeleteSceneMaster(project, scene.name);
    const deletePano = sceneQueries.useDeleteScenePano(project, scene.name);
    const deleteCustom = sceneQueries.useDeleteSceneCustomPackage(
      project,
      scene.name,
    );
    const generateMaster = sceneQueries.useGenerateSceneMasterAsync(
      project,
      scene.name,
    );
    const generateReverse = sceneQueries.useGenerateSceneReverseAsync(
      project,
      scene.name,
    );
    const generatePano = sceneQueries.useGenerateScenePanoAsync(
      project,
      scene.name,
    );
    const generateStagePly = sceneQueries.useGenerateScene3gsPlyAsync(
      project,
      scene.name,
    );
    const saveDirectorWorld = sceneQueries.useSaveSceneDirectorWorld(
      project,
      scene.name,
    );
    const clearDirectorWorld = sceneQueries.useClearSceneDirectorWorld(
      project,
      scene.name,
    );
    const masterCost = dependencies.useGenerationCreditCost(
      "fixed_image",
      "scene_master",
    );
    const reverseCost = dependencies.useGenerationCreditCost(
      "fixed_image",
      "scene_reverse_master",
    );
    const panoCost = dependencies.useGenerationCreditCost(
      "fixed_image",
      "scene_pano",
    );

    const hasMaster = Boolean(resolveMediaUrl(scene.master_url));
    const panoStep = hasMaster ? "pano_from_master" : "pano_from_text";
    const masterTask = useTaskController({
      key: {
        taskType: "scene_reference_asset",
        project,
        episode: 0,
        scope: sceneReferenceAssetScope(scene.name, "master"),
      },
      invalidateKeys: [queryKeys.scenes(project)],
    });
    const panoTask = useTaskController({
      key: {
        taskType: "stage_asset",
        project,
        episode: 0,
        scope: stageAssetScope(scene.name, panoStep),
      },
      invalidateKeys: [queryKeys.scenes(project)],
    });
    const reverseTask = useTaskController({
      key: {
        taskType: "scene_reference_asset",
        project,
        episode: 0,
        scope: sceneReferenceAssetScope(scene.name, "reverse_master"),
      },
      invalidateKeys: [queryKeys.scenes(project)],
    });
    const stageSingleFaceTask = useTaskController({
      key: {
        taskType: "stage_asset",
        project,
        episode: 0,
        scope: stageAssetScope(scene.name, "single_face_sharp"),
      },
      invalidateKeys: [queryKeys.scenes(project)],
      onComplete: () => setStagePlySource(null),
      onError: () => setStagePlySource(null),
    });
    const stagePanoTask = useTaskController({
      key: {
        taskType: "stage_asset",
        project,
        episode: 0,
        scope: stageAssetScope(scene.name, "pano_sharp"),
      },
      invalidateKeys: [queryKeys.scenes(project)],
      onComplete: () => setStagePlySource(null),
      onError: () => setStagePlySource(null),
    });

    const uploadMasterFile = async (file: File | undefined) => {
      if (!file) return;
      const response = await uploadMaster.mutateAsync(file);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      toast.success("Scene master uploaded");
    };

    const uploadPanoFile = async (file: File | undefined) => {
      if (!file) return;
      const response = await uploadPano.mutateAsync(file);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      toast.success("360 uploaded");
    };

    const uploadCustomFile = async (file: File | undefined) => {
      if (!file) return;
      const response = await uploadCustom.mutateAsync(file);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      toast.success("Custom scene package uploaded");
    };

    const handleGenerateMaster = async () => {
      try {
        const response = await generateMaster.mutateAsync({
          model: imageSourceSelection,
        });
        if (isErrorDataResponse(response)) {
          toast.error(response.error);
          return;
        }
        masterTask.start({ scope: response.scope });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handleGeneratePano = async (source: ScenePanoSource) => {
      try {
        const response = await generatePano.mutateAsync({ source });
        if (isErrorDataResponse(response)) {
          toast.error(response.error);
          return;
        }
        panoTask.start({ scope: response.scope });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handleGenerateReverse = async () => {
      try {
        const response = await generateReverse.mutateAsync({
          model: imageSourceSelection,
        });
        if (isErrorDataResponse(response)) {
          toast.error(response.error);
          return;
        }
        reverseTask.start({ scope: response.scope });
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) });
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handleGenerateStagePly = async (source: SceneStagePlySource) => {
      setStagePlySource(source);
      try {
        const response = await generateStagePly.mutateAsync(source);
        if (isErrorDataResponse(response)) {
          setStagePlySource(null);
          toast.error(response.error);
          return;
        }
        if (source === "pano") {
          stagePanoTask.start({ scope: response.scope });
        } else {
          stageSingleFaceTask.start({ scope: response.scope });
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks(project) });
      } catch (error) {
        setStagePlySource(null);
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const handleDeleteMaster = async () => {
      const response = await deleteMaster.mutateAsync();
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      toast.success("Scene master deleted");
    };

    const handleDeletePano = async () => {
      const response = await deletePano.mutateAsync();
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      toast.success("360 deleted");
    };

    const handleDeleteCustom = async () => {
      const response = await deleteCustom.mutateAsync();
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      toast.success("Custom scene package deleted");
    };

    const handleOpenFreezone = async () => {
      setFreezonePending(true);
      try {
        await dependencies.openSceneFreezone(project, scene.name);
        toast.success(t("assets.scenes.freezoneOpened"));
      } catch {
        toast.error(t("assets.scenes.freezoneOpenFailed"));
      } finally {
        setFreezonePending(false);
      }
    };

    const handleOpenStageViewer = async () => {
      if (stageViewerOpening) return;
      setStageViewerOpening(true);
      try {
        const result = await stageManifest.refetch();
        if (result.error) {
          toast.error(backendErrorToastMessage(result.error, t));
          return;
        }
        setStageDialogOpen(true);
      } finally {
        setStageViewerOpening(false);
      }
    };

    const handlePanoCapture = (result: PanoCaptureResult) => {
      dependencies.downloadBlob(
        result.blob,
        `${scene.name}_360_${result.aspect.replace(":", "x")}.png`,
      );
      toast.success(t("assets.scenes.panoScreenshotDownloaded"));
    };

    const sourceForDirectorWorldSave = (activeSourceId?: string) => {
      if (!activeSourceId || !sceneDirectorManifest) return undefined;
      const sourceFromList = sceneDirectorManifest.sources?.find(
        (source) => source.id === activeSourceId,
      );
      if (sourceFromList) return sourceFromList;
      if (
        activeSourceId === `scene-pano:${scene.name}` &&
        sceneDirectorManifest.source.source_type === "pano360"
      ) {
        return {
          id: activeSourceId,
          source_type: "pano360",
          source_kind: "pano",
          label: "360",
          url:
            sceneDirectorManifest.source.pano_url ??
            sceneDirectorManifest.source.url,
          pano_url:
            sceneDirectorManifest.source.pano_url ??
            sceneDirectorManifest.source.url,
          pano_fs: sceneDirectorManifest.source.pano_fs,
          slot_kind: "scene_director_pano_360",
        };
      }
      const option = sceneDirectorManifest.source_options?.find(
        (item) =>
          activeSourceId === `scene-pano:${scene.name}` &&
          item.source_type === "pano360" &&
          item.slot_kind === "scene_director_pano_360",
      );
      if (!option) return undefined;
      return {
        id: activeSourceId,
        source_type: option.source_type ?? "sog",
        source_kind:
          option.kind === "active"
            ? sceneDirectorManifest.source.source_kind
            : option.kind,
        label: option.label,
        ply_url: option.ply_url,
        url: option.url ?? option.ply_url ?? option.pano_url,
        pano_url: option.pano_url,
        pano_fs: option.pano_fs,
        slot_kind: option.slot_kind,
        fs: option.fs,
      };
    };

    const handleSaveDirectorWorld = async (
      snapshot: ThreeDSceneSnapshot,
      activeSourceId?: string,
    ) => {
      const sourceId = String(activeSourceId ?? "").trim();
      const response = await saveDirectorWorld.mutateAsync({
        active_source_id: sourceId,
        snapshot,
        active_source: sourceForDirectorWorldSave(sourceId) as
          | Record<string, unknown>
          | undefined,
      });
      if (isErrorDataResponse(response)) throw new Error(response.error);
    };

    const handleClearDirectorWorld = async (activeSourceId?: string) => {
      const response = await clearDirectorWorld.mutateAsync(
        String(activeSourceId ?? ""),
      );
      if (isErrorDataResponse(response)) throw new Error(response.error);
    };

    return {
      customDeleting: deleteCustom.isPending,
      customInputRef,
      customUploading: uploadCustom.isPending,
      freezonePending,
      handleClearDirectorWorld,
      handleDeleteCustom,
      handleDeleteMaster,
      handleDeletePano,
      handleGenerateMaster,
      handleGeneratePano,
      handleGenerateReverse,
      handleGenerateStagePly,
      handleOpenFreezone,
      handleOpenStageViewer,
      handlePanoCapture,
      handleSaveDirectorWorld,
      masterCost: masterCost.data?.data.display ?? undefined,
      masterInputRef,
      masterPlyRunning:
        stagePlySource === "master" &&
        (generateStagePly.isPending || stageSingleFaceTask.started),
      masterRunning: generateMaster.isPending || masterTask.started,
      onDelete,
      onEdit,
      openPanoDialog: () => setPanoDialogOpen(true),
      openUploadCustom: () => customInputRef.current?.click(),
      openUploadMaster: () => masterInputRef.current?.click(),
      openUploadPano: () => panoInputRef.current?.click(),
      panoCost: panoCost.data?.data.display ?? undefined,
      panoDialogOpen,
      panoInputRef,
      panoManifest: panoManifest.data?.ok ? panoManifest.data.data : null,
      panoPlyRunning:
        stagePlySource === "pano" &&
        (generateStagePly.isPending || stagePanoTask.started),
      panoRunning: generatePano.isPending || panoTask.started,
      referenceCount,
      reverseCost: reverseCost.data?.data.display ?? undefined,
      reversePlyRunning:
        stagePlySource === "reverse" &&
        (generateStagePly.isPending || stageSingleFaceTask.started),
      reverseRunning: generateReverse.isPending || reverseTask.started,
      scene,
      sceneDirectorManifest,
      setPanoDialogOpen,
      setStageDialogOpen,
      stageBusy:
        generateStagePly.isPending ||
        stageSingleFaceTask.started ||
        stagePanoTask.started ||
        stageViewerOpening,
      stageDialogOpen,
      uploadCustomFile,
      uploadMasterFile,
      uploadPanoFile,
    };
  };
}

export type SceneAssetCardController = ReturnType<
  ReturnType<typeof createUseSceneAssetCardController>
>;
