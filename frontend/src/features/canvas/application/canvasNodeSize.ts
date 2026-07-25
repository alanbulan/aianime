// Copyright (c) 2026 AI anime
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodes';

export interface CanvasNodeSizeUpdateOptions {
  lockManualSize?: boolean;
  data?: Partial<CanvasNodeData>;
}

export interface CanvasNodeSizeUpdateResult {
  nodes: CanvasNode[];
  changed: boolean;
}

export function updateCanvasNodeSize(
  nodes: CanvasNode[],
  nodeId: string,
  size: { width: number; height: number },
  options?: CanvasNodeSizeUpdateOptions,
): CanvasNodeSizeUpdateResult {
  const nextWidth = Math.max(1, Math.round(size.width));
  const nextHeight = Math.max(1, Math.round(size.height));
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }

    const currentWidth =
      (typeof node.width === 'number' ? node.width : null)
      ?? (typeof node.style?.width === 'number' ? node.style.width : null);
    const currentHeight =
      (typeof node.height === 'number' ? node.height : null)
      ?? (typeof node.style?.height === 'number' ? node.style.height : null);
    const manualSizePatch =
      options?.lockManualSize === false
        ? { isSizeManuallyAdjusted: false }
        : options?.lockManualSize === true
          ? { isSizeManuallyAdjusted: true }
          : {};
    const dataPatch = {
      ...(options?.data ?? {}),
      ...manualSizePatch,
    };
    const hasDataPatch = Object.keys(dataPatch).some((key) =>
      !Object.is(
        (node.data as Record<string, unknown>)[key],
        (dataPatch as Record<string, unknown>)[key],
      ),
    );
    if (currentWidth === nextWidth && currentHeight === nextHeight && !hasDataPatch) {
      return node;
    }

    changed = true;
    return {
      ...node,
      width: nextWidth,
      height: nextHeight,
      style: {
        ...(node.style ?? {}),
        width: nextWidth,
        height: nextHeight,
      },
      data: {
        ...node.data,
        ...dataPatch,
      } as CanvasNodeData,
    };
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}
