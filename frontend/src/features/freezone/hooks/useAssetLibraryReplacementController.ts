// Copyright (c) 2026 AI anime
import { useCallback, useState } from "react";

import { useAssetDropStore } from "@/features/canvas/assetDropStore";
import type { PushResult, PushTarget } from "@/features/freezone/domain/assetCommit";

import { commitDirectorRenderFromCanvasSource } from "../commit/directorRenderCommit";
import { promoteToAsset } from "../commit/promoteToAsset";
import { assetToPushTarget } from "../commit/pushTarget";
import type { LibraryAsset } from "../domain/assetLibraryModel";

export type AssetLibraryReplacementHandler = (
  payload: { target: PushTarget; result: PushResult } | null,
  message: string,
) => void;

export interface AssetLibraryReplacementControllerOptions {
  project: string;
  onReplaced?: AssetLibraryReplacementHandler;
}

export function useAssetLibraryReplacementController({
  project,
  onReplaced,
}: AssetLibraryReplacementControllerOptions) {
  const activeDrag = useAssetDropStore((state) => state.activeDrag);
  const hoverAssetId = useAssetDropStore((state) => state.hoverAssetId);
  const pendingReplace = useAssetDropStore((state) => state.pendingReplace);
  const clearPendingReplace = useAssetDropStore(
    (state) => state.clearPendingReplace,
  );
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const cancelReplacement = useCallback(() => {
    clearPendingReplace();
  }, [clearPendingReplace]);

  const confirmReplacement = useCallback(
    (asset: LibraryAsset) => {
      const replacement = useAssetDropStore.getState().pendingReplace;
      if (!replacement || replacement.assetId !== asset.id) return;

      const target = assetToPushTarget(asset.source);
      if (!target) {
        const source = asset.source as Record<string, unknown>;
        console.warn(
          "[freezone] 无法推断替换目标",
          asset.label,
          asset.source,
        );
        onReplaced?.(
          null,
          `无法识别「${asset.label}」的提交目标（kind=${String(source.kind)} / role=${String(source.role)}）`,
        );
        clearPendingReplace();
        return;
      }

      setBusyAssetId(asset.id);
      const commit =
        target.kind === "director_render"
          ? commitDirectorRenderFromCanvasSource(project, target, {
              sourceUrl: replacement.sourceUrl,
              bundle: replacement.directorControlBundle,
              sourceNodeId: replacement.nodeId,
              label: replacement.label,
            })
          : promoteToAsset(project, replacement.sourceUrl, target, {
              mark_stale: false,
            });
      const successMessage =
        target.kind === "director_render"
          ? `已提交到「${asset.label}」`
          : `已用画布节点替换「${asset.label}」`;

      void commit
        .then((result) => {
          setReloadToken((token) => token + 1);
          onReplaced?.({ target, result }, successMessage);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          onReplaced?.(null, `替换「${asset.label}」失败：${message}`);
        })
        .finally(() => {
          setBusyAssetId(null);
          clearPendingReplace();
        });
    },
    [clearPendingReplace, onReplaced, project],
  );

  return {
    activeDragMediaType: activeDrag?.mediaType ?? null,
    hoverAssetId,
    confirmingAssetId: pendingReplace?.assetId ?? null,
    busyAssetId,
    reloadToken,
    confirmReplacement,
    cancelReplacement,
  };
}
