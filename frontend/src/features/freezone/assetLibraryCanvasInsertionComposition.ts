// Copyright (c) 2026 AI anime
import { useCanvasStore } from "@/features/canvas/canvasStore";
import { hydrateAssetDragPayload } from "@/features/canvas/composition";

import { insertAssetLibraryAsset } from "./application/assetLibraryCanvasInsertion";
import type { LibraryAsset } from "./domain/assetLibraryModel";

export function addAssetToCanvas(asset: LibraryAsset, index: number): void {
  void insertAssetLibraryAsset({
    asset,
    index,
    canvas: useCanvasStore.getState(),
    hydratePayload: hydrateAssetDragPayload,
    onHydrationError: (error) => {
      console.warn(
        "[freezone] scene director world manifest unavailable during import",
        error,
      );
    },
  });
}
