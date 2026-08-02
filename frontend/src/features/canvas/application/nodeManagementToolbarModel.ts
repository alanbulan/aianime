// Copyright (c) 2026 AI anime
import {
  isAudioNode,
  isImageGenNode,
  isProtectedProjectionGroupNode,
  isVideoNode,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import { deriveNodeDropInfo } from "@/modules/creative_canvas/public";

export type NodeToolbarRemovalTarget = "node" | "projection";

export interface NodeManagementToolbarProjection {
  projectionKey: string | null;
  removalTarget: NodeToolbarRemovalTarget | null;
  canCommit: boolean;
}

export function projectNodeManagementToolbar(
  node: CanvasNode,
): NodeManagementToolbarProjection {
  const rawProjectionKey = isProtectedProjectionGroupNode(node)
    ? node.data.projection_key
    : null;
  const projectionKey =
    typeof rawProjectionKey === "string" ? rawProjectionKey.trim() : null;
  const canRemove =
    !isImageGenNode(node) && !isVideoNode(node) && !isAudioNode(node);

  return {
    projectionKey,
    removalTarget: canRemove
      ? projectionKey
        ? "projection"
        : "node"
      : null,
    canCommit: Boolean(deriveNodeDropInfo(node)?.sourceUrl),
  };
}
