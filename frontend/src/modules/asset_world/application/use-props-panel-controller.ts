// Copyright (c) 2026 AI anime
import { useMemo, useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { queryKeys } from "@/lib/query-keys";
import type { ImageSourceQueryHooks } from "@/modules/asset_world/application/image-source-query-hooks";
import type { PropPayload } from "@/modules/asset_world/application/prop-gateway";
import type { PropQueryHooks } from "@/modules/asset_world/application/prop-query-hooks";
import { isErrorDataResponse } from "@/modules/asset_world/application/response";
import {
  filterAssets,
  sortAssets,
  type AssetSortKey,
} from "@/modules/asset_world/domain/asset-collection";
import type { AssetReferenceIndex } from "@/modules/asset_world/domain/character";
import type { PropAsset } from "@/modules/asset_world/domain/prop";

export interface PropsPanelControllerDependencies {
  useAssetFocus(
    focusId: string | null | undefined,
    ready: boolean,
  ): RefObject<HTMLDivElement | null>;
  useAssetReferenceIndex(project: string): AssetReferenceIndex;
}

export interface PropsPanelControllerOptions {
  focusId?: string | null;
  project: string;
}

export function createUsePropsPanelController(
  propQueries: PropQueryHooks,
  imageSourceQueries: ImageSourceQueryHooks,
  dependencies: PropsPanelControllerDependencies,
) {
  return function usePropsPanelController({
    focusId,
    project,
  }: PropsPanelControllerOptions) {
    const { t } = useTranslation();
    const propsQuery = propQueries.useProps(project);
    const createProp = propQueries.useCreateProp(project);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<PropAsset | null>(null);
    const [editing, setEditing] = useState<PropAsset | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortKey, setSortKey] = useState<AssetSortKey>("name");
    const updateProp = propQueries.useUpdateProp(
      project,
      editing?.name ?? "",
    );
    const deleteProp = propQueries.useDeleteProp(project);
    const batchGenerate = propQueries.useBatchGeneratePropReferences(project);
    const referenceIndex = dependencies.useAssetReferenceIndex(project);
    const imageSourceQuery =
      imageSourceQueries.useAssetImageSourceSelection(project, "prop");
    const imageSourceSelection =
      imageSourceQuery.data?.data.image_source_selection ?? "";
    const batchTask = useTaskController({
      key: { taskType: "batch_prop_ref", project, episode: 0 },
      invalidateKeys: [queryKeys.props(project)],
    });

    const allItems = propsQuery.data?.data ?? [];
    const items = useMemo(() => {
      const filtered = filterAssets(allItems, searchQuery, (prop) => [
        prop.name,
        prop.prop_type,
        prop.description,
        prop.visual_prompt,
        prop.owner,
        ...(prop.aliases ?? []),
      ]);
      return sortAssets(
        filtered,
        sortKey,
        (prop) => prop.name,
        (prop) => referenceIndex.countFor("prop", prop.name),
      );
    }, [allItems, referenceIndex, searchQuery, sortKey]);
    const gridRef = dependencies.useAssetFocus(
      focusId,
      !propsQuery.isLoading && items.length > 0,
    );
    const showBatchTask =
      batchTask.started ||
      batchTask.stream.status !== "idle" ||
      batchTask.logs.length > 0;
    const lastBatchLog = batchTask.logs[batchTask.logs.length - 1];
    const batchLogs =
      lastBatchLog === batchTask.stream.currentTask
        ? batchTask.logs.slice(0, -1)
        : batchTask.logs;

    const handleSave = async (data: PropPayload) => {
      const payload = { ...data, name: data.name.trim() };
      const response = editing
        ? await updateProp.mutateAsync(payload)
        : await createProp.mutateAsync(payload);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      setDialogOpen(false);
      setEditing(null);
    };

    const handleBatchGenerate = async () => {
      const response = await batchGenerate.mutateAsync({
        model:
          imageSourceQuery.data?.data.image_source_selection ?? "",
      });
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      if (response.scope) {
        batchTask.start({ scope: response.scope });
      } else {
        batchTask.start();
      }
      toast.success(response.message);
    };

    const confirmDelete = async () => {
      if (!deleteTarget) return;
      const response = await deleteProp.mutateAsync(deleteTarget.name);
      if (isErrorDataResponse(response)) {
        toast.error(response.error);
        return;
      }
      setDeleteTarget(null);
      toast.success(t("assets.props.deleted"));
    };

    const openNewProp = () => {
      setEditing(null);
      setDialogOpen(true);
    };

    const openEditProp = (prop: PropAsset) => {
      setEditing(prop);
      setDialogOpen(true);
    };

    const handleDialogOpenChange = (open: boolean) => {
      setDialogOpen(open);
      if (!open) setEditing(null);
    };

    const refresh = async () => {
      const result = await propsQuery.refetch();
      if (result.isError) {
        toast.error(t("common.error"));
        return false;
      }
      return true;
    };

    return {
      allItems,
      batchCurrentTask: batchTask.stream.currentTask,
      batchGeneratePending: batchGenerate.isPending,
      batchLogs,
      batchProgress: batchTask.stream.progress,
      batchStopping: batchTask.stopping,
      deleteDialog: {
        confirm: confirmDelete,
        name: deleteTarget?.name ?? "",
        onOpenChange: (open: boolean) => {
          if (!open && !deleteProp.isPending) setDeleteTarget(null);
        },
        open: Boolean(deleteTarget),
        pending: deleteProp.isPending,
      },
      deleteProp: setDeleteTarget,
      dialog: {
        initial: editing,
        onOpenChange: handleDialogOpenChange,
        onSubmit: handleSave,
        open: dialogOpen,
        project,
        references: editing
          ? referenceIndex.referencesFor("prop", editing.name)
          : [],
        saving: createProp.isPending || updateProp.isPending,
      },
      gridRef,
      handleBatchGenerate,
      imageSourceSelection,
      isLoading: propsQuery.isLoading,
      isRefetching: propsQuery.isRefetching,
      items,
      openEditProp,
      openNewProp,
      project,
      referenceCountForProp: (prop: PropAsset) =>
        referenceIndex.countFor("prop", prop.name),
      refresh,
      searchQuery,
      setSearchQuery,
      setSortKey,
      showBatchTask,
      sortKey,
      stopBatch: batchTask.stop,
    };
  };
}

export type PropsPanelController = ReturnType<
  ReturnType<typeof createUsePropsPanelController>
>;
