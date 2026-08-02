// Copyright (c) 2026 AI anime
import type { DirectorWorldSourceDescriptor } from "@/modules/asset_world/public";
import {
  isThreeDAsset,
  type LibraryAsset,
} from "@/modules/creative_canvas/domain/assetLibraryModel";
import type { CanvasAssetDragPayload } from "@/modules/creative_canvas/domain/assetDrag";

export interface AssetLibraryCanvasPlacementState {
  canvasViewportSize: { width: number; height: number };
  currentViewport: { x: number; y: number; zoom: number };
  nodes: Array<{
    position: { x: number; y: number };
    measured?: { width?: number; height?: number };
  }>;
}

export interface AssetLibraryCanvasInsertionPort
  extends AssetLibraryCanvasPlacementState {
  spawnAsset: (
    payload: CanvasAssetDragPayload,
    position: { x: number; y: number },
  ) => string;
  requestFocusNode: (nodeId: string) => void;
}

export function assetToDragPayload(
  asset: LibraryAsset,
): CanvasAssetDragPayload | null {
  const sourceMeta = { ...asset.source } as Record<string, unknown>;
  const mainline = asset.mainlineContext?.length
    ? asset.mainlineContext
    : undefined;
  if (isThreeDAsset(asset)) {
    const relPath = typeof asset.source.rel_path === "string"
      ? asset.source.rel_path
      : "";
    const modelSources = Array.isArray(sourceMeta.director_world_sources)
      ? (sourceMeta.director_world_sources as DirectorWorldSourceDescriptor[])
      : undefined;
    const activeSourceId = typeof sourceMeta.active_source_id === "string"
      ? sourceMeta.active_source_id
      : undefined;
    const activeSource =
      modelSources?.find(
        (source) => source.id && source.id === activeSourceId,
      ) ??
      modelSources?.find((source) => source.current) ??
      modelSources?.[0];
    return {
      kind: "model",
      label: asset.label,
      url: asset.url,
      coverUrl: asset.coverUrl ?? null,
      modelSources,
      activeSourceId,
      plyUrl:
        activeSource?.ply_url ??
        (activeSource?.source_type === "sog" ? activeSource.url : undefined) ??
        (modelSources ? null : asset.url),
      panoUrl:
        activeSource?.pano_url ??
        (activeSource?.source_type === "pano360" ? activeSource.url : undefined) ??
        null,
      sourceFileName: relPath.split("/").pop() || asset.label,
      source: sourceMeta,
      mainlineContext: mainline,
    };
  }
  if (asset.mediaType === "video") {
    return {
      kind: "video",
      label: asset.label,
      url: asset.url,
      aspectRatio: asset.aspectRatio,
      source: sourceMeta,
      mainlineContext: mainline,
    };
  }
  if (asset.mediaType === "audio") {
    return {
      kind: "audio",
      label: asset.label,
      url: asset.url,
      source: sourceMeta,
      mainlineContext: mainline,
    };
  }
  if (asset.mediaType === "text" || asset.mediaType === "file") return null;
  return {
    kind: "image",
    label: asset.label,
    url: asset.url,
    aspectRatio: asset.aspectRatio,
    source: sourceMeta,
    mainlineContext: mainline,
  };
}

export function viewportCenteredPosition(
  state: AssetLibraryCanvasPlacementState,
  index: number,
  nodeWidth: number,
  nodeHeight = 360,
): { x: number; y: number } {
  const { width: viewportWidth, height: viewportHeight } = state.canvasViewportSize;
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    const fallbackCol = index % 2;
    const fallbackRow = Math.floor(index / 2);
    return {
      x: -720 + fallbackCol * (nodeWidth + 28),
      y: 120 + fallbackRow * 260,
    };
  }
  const zoom = Math.max(0.01, state.currentViewport.zoom || 1);
  const centerX = -state.currentViewport.x / zoom + viewportWidth / (2 * zoom);
  const centerY = -state.currentViewport.y / zoom + viewportHeight / (2 * zoom);
  const column = index % 4;
  const row = Math.floor(index / 4) % 4;
  const baseX = centerX - nodeWidth / 2 + (column - 1.5) * 24;
  const baseY = centerY - nodeHeight / 2 + (row - 1.5) * 24;
  const collides = (x: number, y: number): boolean => {
    const margin = 8;
    return state.nodes.some((node) => {
      const width = node.measured?.width ?? nodeWidth;
      const height = node.measured?.height ?? 200;
      return (
        x < node.position.x + width + margin &&
        x + nodeWidth + margin > node.position.x &&
        y < node.position.y + height + margin &&
        y + nodeHeight + margin > node.position.y
      );
    });
  };
  if (!collides(baseX, baseY)) return { x: baseX, y: baseY };

  const stepX = Math.max(nodeWidth + 16, 120);
  const stepY = Math.max(Math.round(nodeHeight * 0.35), 60);
  for (let ring = 1; ring <= 10; ring += 1) {
    const ringOffsets = [
      [ring, 0], [-ring, 0], [0, ring], [0, -ring],
      [ring, 1], [ring, -1], [-ring, 1], [-ring, -1],
      [1, ring], [-1, ring], [1, -ring], [-1, -ring],
      [ring, ring], [-ring, -ring], [ring, -ring], [-ring, ring],
    ];
    for (const [offsetX, offsetY] of ringOffsets) {
      const x = baseX + offsetX * stepX;
      const y = baseY + offsetY * stepY;
      if (!collides(x, y)) return { x, y };
    }
  }
  return { x: baseX, y: baseY };
}

export async function insertAssetLibraryAsset({
  asset,
  index,
  nodeWidth,
  canvas,
  hydratePayload,
  onHydrationError,
}: {
  asset: LibraryAsset;
  index: number;
  nodeWidth: number;
  canvas: AssetLibraryCanvasInsertionPort;
  hydratePayload: (
    payload: CanvasAssetDragPayload,
  ) => Promise<CanvasAssetDragPayload>;
  onHydrationError?: (error: unknown) => void;
}): Promise<string | null> {
  const payload = assetToDragPayload(asset);
  if (!payload) return null;
  const position = viewportCenteredPosition(canvas, index, nodeWidth);
  let hydratedPayload = payload;
  try {
    hydratedPayload = await hydratePayload(payload);
  } catch (error) {
    onHydrationError?.(error);
  }
  const nodeId = canvas.spawnAsset(hydratedPayload, position);
  canvas.requestFocusNode(nodeId);
  return nodeId;
}
