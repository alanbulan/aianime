// Copyright (c) 2026 AI anime
import type {
  CanvasAsset,
  CanvasAssetDragPayload,
} from '@/modules/creative_canvas/public';

const HISTORY_ASSET_GRID_MAX_COLUMNS = 4;
const HISTORY_ASSET_GRID_GAP = 320;

export interface CanvasHistoryAssetPlacement {
  index: number;
  total: number;
}

export function createCanvasHistoryAssetPayload(
  asset: CanvasAsset,
): CanvasAssetDragPayload {
  return {
    kind: asset.kind,
    label: asset.label ?? '',
    prompt: asset.prompt ?? undefined,
    url: asset.url,
    coverUrl: asset.kind === 'model' ? asset.previewUrl : null,
    restoreAsGeneratedImage: true,
    model: asset.model ?? undefined,
    genMode: asset.genMode ?? undefined,
    source: {},
  };
}

export function resolveCanvasHistoryAssetPosition(
  origin: { x: number; y: number },
  placement?: CanvasHistoryAssetPlacement,
): { x: number; y: number } {
  if (!placement || placement.total <= 1) {
    return origin;
  }

  const columns = Math.min(HISTORY_ASSET_GRID_MAX_COLUMNS, placement.total);
  const rows = Math.ceil(placement.total / columns);
  const column = placement.index % columns;
  const row = Math.floor(placement.index / columns);
  return {
    x: origin.x
      + (column - (columns - 1) / 2) * HISTORY_ASSET_GRID_GAP,
    y: origin.y
      + (row - (rows - 1) / 2) * HISTORY_ASSET_GRID_GAP,
  };
}
