// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { ImageSourceQueryHooks } from "@/modules/asset_world/application/image-source-query-hooks";
import { isErrorDataResponse } from "@/modules/asset_world/application/response";
import type { ScenePayload } from "@/modules/asset_world/application/scene-gateway";
import type { SceneQueryHooks } from "@/modules/asset_world/application/scene-query-hooks";
import type { AssetReferenceIndex } from "@/modules/asset_world/domain/character";
import {
  filterAssets,
  sortAssets,
  type AssetSortKey,
} from "@/modules/asset_world/domain/asset-collection";
import {
  sceneGroupsFromAssets,
  type SceneAsset,
  type SceneGroup,
} from "@/modules/asset_world/domain/scene";
import {
  backendErrorResponseToastMessage,
  backendErrorToastMessage,
} from "@/shared/api/errors";

export interface ScenesPanelControllerDependencies {
  readStoredSceneGroupSelection(project: string): string | null;
  useAssetFocus(
    focusId: string | null | undefined,
    ready: boolean,
  ): RefObject<HTMLDivElement | null>;
  useAssetReferenceIndex(project: string): AssetReferenceIndex;
  writeStoredSceneGroupSelection(project: string, baseName: string): void;
}

export interface ScenesPanelControllerOptions {
  focusId?: string | null;
  project: string;
}

export function createUseScenesPanelController(
  sceneQueries: SceneQueryHooks,
  imageSourceQueries: ImageSourceQueryHooks,
  dependencies: ScenesPanelControllerDependencies,
) {
  return function useScenesPanelController({
    focusId,
    project,
  }: ScenesPanelControllerOptions) {
    const { t } = useTranslation();
    const scenesQuery = sceneQueries.useScenes(project);
    const createScene = sceneQueries.useCreateScene(project);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<SceneAsset | null>(null);
    const [editing, setEditing] = useState<SceneAsset | null>(null);
    const [draftSeed, setDraftSeed] =
      useState<Partial<ScenePayload> | null>(null);
    const [selectedBaseName, setSelectedBaseName] = useState<string | null>(
      () => dependencies.readStoredSceneGroupSelection(project),
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [sortKey, setSortKey] = useState<AssetSortKey>("name");
    const updateScene = sceneQueries.useUpdateScene(
      project,
      editing?.name ?? "",
    );
    const deleteScene = sceneQueries.useDeleteScene(project);
    const buildScenes = sceneQueries.useBuildScenes(project);
    const imageSourceQuery =
      imageSourceQueries.useAssetImageSourceSelection(project, "scene");
    const referenceIndex = dependencies.useAssetReferenceIndex(project);

    const allItems = scenesQuery.data?.data ?? [];
    const allSceneGroups = useMemo(
      () => sceneGroupsFromAssets(allItems),
      [allItems],
    );

    useEffect(() => {
      setSelectedBaseName(
        dependencies.readStoredSceneGroupSelection(project),
      );
    }, [project]);

    const selectGroup = useCallback(
      (baseName: string) => {
        setSelectedBaseName(baseName);
        dependencies.writeStoredSceneGroupSelection(project, baseName);
      },
      [project],
    );

    const sceneGroups = useMemo(() => {
      const filtered = filterAssets(
        allSceneGroups,
        searchQuery,
        (group) => [
          group.baseName,
          ...group.scenes.flatMap((scene) => [
            scene.name,
            scene.scene_type,
            scene.environment_prompt,
            scene.description,
            ...(scene.aliases ?? []),
          ]),
        ],
      );
      return sortAssets(
        filtered,
        sortKey,
        (group) => group.baseName,
        (group) =>
          group.scenes.reduce(
            (sum, scene) =>
              sum + referenceIndex.countFor("scene", scene.name),
            0,
          ),
      );
    }, [allSceneGroups, referenceIndex, searchQuery, sortKey]);

    useEffect(() => {
      if (scenesQuery.isLoading) return;
      if (focusId) {
        const focusedGroup = allSceneGroups.find((group) =>
          group.scenes.some((scene) => scene.name === focusId),
        );
        if (focusedGroup && focusedGroup.baseName !== selectedBaseName) {
          selectGroup(focusedGroup.baseName);
          return;
        }
      }
      if (
        selectedBaseName &&
        sceneGroups.some((group) => group.baseName === selectedBaseName)
      ) {
        return;
      }
      setSelectedBaseName(sceneGroups[0]?.baseName ?? null);
    }, [
      allSceneGroups,
      focusId,
      sceneGroups,
      scenesQuery.isLoading,
      selectedBaseName,
      selectGroup,
    ]);

    const selectedGroup =
      sceneGroups.find((group) => group.baseName === selectedBaseName) ?? null;
    const selectedBaseScene =
      selectedGroup?.scenes.find(
        (scene) => scene.name === selectedGroup.baseName,
      ) ??
      selectedGroup?.scenes[0] ??
      null;
    const gridRef = dependencies.useAssetFocus(
      focusId,
      !scenesQuery.isLoading &&
        Boolean(selectedGroup?.scenes.some((scene) => scene.name === focusId)),
    );

    const handleSave = async (data: ScenePayload) => {
      const payload = { ...data, name: data.name.trim() };
      const response = editing
        ? await updateScene.mutateAsync(payload)
        : await createScene.mutateAsync(payload);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      setDialogOpen(false);
      setEditing(null);
      setDraftSeed(null);
    };

    const handleBuildScenes = async () => {
      try {
        const response = await buildScenes.mutateAsync();
        if (isErrorDataResponse(response)) {
          toast.error(backendErrorResponseToastMessage(response, t));
          return;
        }
        toast.success(response.message);
      } catch (error) {
        toast.error(backendErrorToastMessage(error, t));
      }
    };

    const confirmDelete = async () => {
      if (!deleteTarget) return;
      const response = await deleteScene.mutateAsync(deleteTarget.name);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      setDeleteTarget(null);
      toast.success(t("assets.scenes.deleted"));
    };

    const openNewScene = () => {
      setEditing(null);
      setDraftSeed(null);
      setDialogOpen(true);
    };

    const openNewPlate = () => {
      if (!selectedGroup) return;
      setEditing(null);
      setDraftSeed({
        base_scene_id: selectedGroup.baseName,
        variant_id: "",
        time_of_day: "",
        scene_type: selectedBaseScene?.scene_type ?? "interior",
        environment_prompt: "",
        variant_prompt: "",
        description: "",
      });
      setDialogOpen(true);
    };

    const openEditScene = (scene: SceneAsset) => {
      setEditing(scene);
      setDraftSeed(null);
      setDialogOpen(true);
    };

    const handleDialogOpenChange = (open: boolean) => {
      setDialogOpen(open);
      if (!open) {
        setEditing(null);
        setDraftSeed(null);
      }
    };

    const refresh = async () => {
      const result = await scenesQuery.refetch();
      if (result.isError) {
        toast.error(t("common.error"));
        return false;
      }
      return true;
    };

    const referencesForScene = (scene: SceneAsset) =>
      referenceIndex.referencesFor("scene", scene.name);
    const referenceCountForScene = (scene: SceneAsset) =>
      referenceIndex.countFor("scene", scene.name);
    const referenceCountForGroup = (group: SceneGroup) =>
      group.scenes.reduce(
        (sum, scene) => sum + referenceCountForScene(scene),
        0,
      );

    return {
      allItems,
      buildScenesPending: buildScenes.isPending,
      deleteDialog: {
        confirm: confirmDelete,
        name: deleteTarget?.name ?? "",
        onOpenChange: (open: boolean) => {
          if (!open && !deleteScene.isPending) setDeleteTarget(null);
        },
        open: Boolean(deleteTarget),
        pending: deleteScene.isPending,
      },
      deleteScene: setDeleteTarget,
      dialog: {
        coOccurrence: editing
          ? referenceIndex.coOccurrenceForScene(editing.name)
          : { identities: [], props: [] },
        draftSeed,
        initial: editing,
        onOpenChange: handleDialogOpenChange,
        onSubmit: handleSave,
        open: dialogOpen,
        project,
        references: editing ? referencesForScene(editing) : [],
        saving: createScene.isPending || updateScene.isPending,
      },
      gridRef,
      handleBuildScenes,
      imageSourceSelection:
        imageSourceQuery.data?.data.image_source_selection ?? "",
      isLoading: scenesQuery.isLoading,
      isRefetching: scenesQuery.isRefetching,
      openEditScene,
      openNewPlate,
      openNewScene,
      project,
      referenceCountForGroup,
      referenceCountForScene,
      refresh,
      sceneGroups,
      searchQuery,
      selectedBaseName,
      selectedGroup,
      selectGroup,
      setSearchQuery,
      setSortKey,
      sortKey,
    };
  };
}

export type ScenesPanelController = ReturnType<
  ReturnType<typeof createUseScenesPanelController>
>;
