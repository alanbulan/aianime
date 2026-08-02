// Copyright (c) 2026 AI anime
import { useCallback, useState } from "react";

import { commitFreezoneAsset as promoteToAsset } from "../assetTransferComposition";
import { commitDirectorRenderFromCanvasSource } from "../directorCommitComposition";
import type { PushResult, PushTarget } from "../domain/assetCommit";
import type { LibraryAsset } from "../domain/assetLibraryModel";
import type { CanvasCommitMediaType } from "../domain/canvasCommitSource";
import { assetToPushTarget } from "../domain/pushTarget";

export interface AssetLibraryPendingReplacement {
  assetId: string;
  nodeId: string;
  sourceUrl: string;
  label: string;
  directorControlBundle: Record<string, unknown> | null;
}

export interface AssetLibraryReplacementStorePort {
  activeDragMediaType: CanvasCommitMediaType | null;
  hoverAssetId: string | null;
  pendingReplacement: AssetLibraryPendingReplacement | null;
  readPendingReplacement: () => AssetLibraryPendingReplacement | null;
  clearPendingReplacement: () => void;
}

export type AssetLibraryReplacementHandler = (
  payload: { target: PushTarget; result: PushResult } | null,
  message: string,
) => void;

export interface AssetLibraryReplacementControllerOptions {
  project: string;
  store: AssetLibraryReplacementStorePort;
  onReplaced?: AssetLibraryReplacementHandler;
}

export function useAssetLibraryReplacementController({
  project,
  store,
  onReplaced,
}: AssetLibraryReplacementControllerOptions) {
  const {
    activeDragMediaType,
    hoverAssetId,
    pendingReplacement,
    readPendingReplacement,
    clearPendingReplacement,
  } = store;
  const [busyAssetId, setBusyAssetId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const cancelReplacement = useCallback(() => {
    clearPendingReplacement();
  }, [clearPendingReplacement]);

  const confirmReplacement = useCallback(
    (asset: LibraryAsset) => {
      const replacement = readPendingReplacement();
      if (!replacement || replacement.assetId !== asset.id) return;

      const target = assetToPushTarget(asset.source);
      if (!target) {
        const source = asset.source as Record<string, unknown>;
        console.warn(
          "[creative-canvas] unable to infer asset replacement target",
          asset.label,
          asset.source,
        );
        onReplaced?.(
          null,
          `无法识别「${asset.label}」的提交目标（kind=${String(source.kind)} / role=${String(source.role)}）`,
        );
        clearPendingReplacement();
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
          clearPendingReplacement();
        });
    },
    [clearPendingReplacement, onReplaced, project, readPendingReplacement],
  );

  return {
    activeDragMediaType,
    hoverAssetId,
    confirmingAssetId: pendingReplacement?.assetId ?? null,
    busyAssetId,
    reloadToken,
    confirmReplacement,
    cancelReplacement,
  };
}
