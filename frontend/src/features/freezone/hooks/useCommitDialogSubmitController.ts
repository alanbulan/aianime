// Copyright (c) 2026 AI anime
import { useState } from "react";

import {
  modelSourceUrlFromNodeData,
  type CanvasCommitMediaType,
  commitDirectorRenderFromCanvasSource,
  commitFreezoneAsset as promoteToAsset,
  commitSceneDirectorWorldFromCanvasNode,
  hasDirectorWorldSceneState,
  isDirectorWorldSourceSlotTarget,
  nodeDataAfterCommittedSlot,
  renderCommitSuccessMessage,
  type PushResult,
  type PushTarget,
  type PushTargetKind,
} from "@/modules/creative_canvas/public";

export interface CommitDialogSubmitControllerOptions {
  project: string;
  sourceUrl: string;
  previewUrl?: string | null;
  mediaType: CanvasCommitMediaType;
  target: PushTarget | null;
  modelSlotKinds: readonly PushTargetKind[];
  noTargetYet: boolean;
  isGlobalSlot: boolean;
  markStale: boolean;
  directorControlBundle?: Record<string, unknown> | null;
  nodeData?: Record<string, unknown> | null;
  getNodeData?: () => Record<string, unknown> | null | undefined;
  setError: (error: string | null) => void;
  onClose: () => void;
  onSuccess: (
    message: string,
    result: PushResult,
    target: PushTarget,
    nodeDataPatch?: Record<string, unknown> | null,
  ) => void;
}

export function useCommitDialogSubmitController({
  project,
  sourceUrl,
  previewUrl,
  mediaType,
  target,
  modelSlotKinds,
  noTargetYet,
  isGlobalSlot,
  markStale,
  directorControlBundle,
  nodeData,
  getNodeData,
  setError,
  onClose,
  onSuccess,
}: CommitDialogSubmitControllerOptions) {
  const [submitting, setSubmitting] = useState(false);
  const ready =
    !submitting && Boolean(sourceUrl) && !noTargetYet && target !== null;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (!target) throw new Error("目标不完整");
      if (
        mediaType === "model" &&
        isDirectorWorldSourceSlotTarget(target) &&
        !modelSlotKinds.includes(target.kind)
      ) {
        throw new Error(
          "无来源没有可提交的 3D 世界素材；请切换到具体世界来源后再提交到主线槽位。",
        );
      }
      if (target.kind === "director_render") {
        const result = await commitDirectorRenderFromCanvasSource(
          project,
          target,
          {
            sourceUrl,
            previewUrl,
            bundle: directorControlBundle,
          },
        );
        onSuccess(renderCommitSuccessMessage(target, result), result, target);
        onClose();
        return;
      }
      if (target.kind === "scene_director_world") {
        const latestNodeData = getNodeData?.() ?? nodeData;
        if (!latestNodeData) {
          throw new Error("导演世界提交需要画布节点状态");
        }
        const result = await commitSceneDirectorWorldFromCanvasNode(
          project,
          target,
          latestNodeData,
        );
        onSuccess(renderCommitSuccessMessage(target, result), result, target);
        onClose();
        return;
      }

      const latestNodeData = getNodeData?.() ?? nodeData;
      const submitSourceUrl =
        mediaType === "model" && latestNodeData
          ? modelSourceUrlFromNodeData(latestNodeData) ?? sourceUrl
          : sourceUrl;
      const result = await promoteToAsset(project, submitSourceUrl, target, {
        mark_stale: markStale && isGlobalSlot,
      });
      let message = renderCommitSuccessMessage(target, result);
      let nodeDataPatch: Record<string, unknown> | null = null;
      const directorWorldManifestData =
        mediaType === "model" &&
        latestNodeData &&
        isDirectorWorldSourceSlotTarget(target)
          ? nodeDataAfterCommittedSlot(
              latestNodeData,
              target,
              result,
              project,
            )
          : null;
      if (latestNodeData && !isDirectorWorldSourceSlotTarget(target)) {
        nodeDataPatch = nodeDataAfterCommittedSlot(
          latestNodeData,
          target,
          result,
          project,
        );
      }
      if (
        directorWorldManifestData &&
        isDirectorWorldSourceSlotTarget(target)
      ) {
        nodeDataPatch = directorWorldManifestData;
        if (hasDirectorWorldSceneState(directorWorldManifestData)) {
          await commitSceneDirectorWorldFromCanvasNode(
            project,
            { kind: "scene_director_world", scene_id: target.scene_id },
            directorWorldManifestData,
            { pruneStale: false },
          );
          message += "；已同步导演世界状态";
        }
      }
      onSuccess(message, result, target, nodeDataPatch);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, ready, submit };
}
