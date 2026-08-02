// Copyright (c) 2026 AI anime
import {
  CANVAS_ASSET_DRAG_MIME,
  parseCanvasAssetDragPayload,
  type CanvasAssetDragPayload,
} from "../domain/assetDrag";

/** Reads a Creative Canvas asset payload from the browser drag transfer. */
export function readCanvasAssetDragPayload(
  dataTransfer: DataTransfer,
): CanvasAssetDragPayload | null {
  return parseCanvasAssetDragPayload(
    dataTransfer.getData(CANVAS_ASSET_DRAG_MIME),
  );
}
