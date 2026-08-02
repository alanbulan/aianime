// Copyright (c) 2026 AI anime
import { useCanvasStore } from "@/features/canvas/canvasStore";
import { hydrateAssetDragPayload } from "@/features/canvas/composition";
import { spawnAssetNode } from "@/features/canvas/domain/assetDrag";
import { DEFAULT_NODE_WIDTH } from "@/features/canvas/domain/canvasNodes";
import {
  insertAssetLibraryAsset,
  type LibraryAsset,
} from "@/modules/creative_canvas/public";

export function addAssetToCanvas(asset: LibraryAsset, index: number): void {
  const canvasState = useCanvasStore.getState();
  void insertAssetLibraryAsset({
    asset,
    index,
    nodeWidth: DEFAULT_NODE_WIDTH,
    canvas: {
      canvasViewportSize: canvasState.canvasViewportSize,
      currentViewport: canvasState.currentViewport,
      nodes: canvasState.nodes,
      spawnAsset: (payload, position) =>
        spawnAssetNode(canvasState, payload, position),
      requestFocusNode: canvasState.requestFocusNode,
    },
    hydratePayload: hydrateAssetDragPayload,
    onHydrationError: (error) => {
      console.warn(
        "[freezone] scene director world manifest unavailable during import",
        error,
      );
    },
  });
}
