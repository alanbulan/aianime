// Copyright (c) 2026 AI anime

export interface CanvasNodeSizeTarget {
  id: string;
  width?: number | null;
  height?: number | null;
  style?: {
    width?: unknown;
    height?: unknown;
  } | null;
  data: Record<string, unknown>;
}

export interface CanvasNodeSizeUpdateOptions {
  lockManualSize?: boolean;
  recordHistory?: boolean;
  data?: Record<string, unknown>;
}

export interface CanvasNodeSizeUpdateResult<TNode> {
  nodes: TNode[];
  changed: boolean;
}

export function updateCanvasNodeSize<
  TNode extends CanvasNodeSizeTarget,
>(
  nodes: TNode[],
  nodeId: string,
  size: { width: number; height: number },
  options?: CanvasNodeSizeUpdateOptions,
): CanvasNodeSizeUpdateResult<TNode> {
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
    const dataPatch: Record<string, unknown> = {
      ...(options?.data ?? {}),
      ...manualSizePatch,
    };
    const hasDataPatch = Object.keys(dataPatch).some((key) =>
      !Object.is(
        node.data[key],
        dataPatch[key],
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
      },
    } as TNode;
  });

  return {
    nodes: changed ? nextNodes : nodes,
    changed,
  };
}
